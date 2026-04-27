import { Router } from "express";
import { and, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { account } from "@/db/schema";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import {
  fetchAllJiraIssues,
  isAtlassianUnauthorizedError,
  resolveJiraResource,
} from "@/lib/jira";
import logger from "@/lib/logger";
import { RESPONSE_CODE, sendError, sendSuccess } from "@/lib/response";
import { tryCatch } from "@/lib/try-catch";

const router = Router();

type ConnectedAccount = {
  providerId: string;
  accessToken: string | null;
  refreshToken: string | null;
  accessTokenExpiresAt: Date | null;
};

type RequestAccountsResult =
  | {
      ok: true;
      userId: string;
      linkedAccounts: ConnectedAccount[];
    }
  | {
      ok: false;
      code: number;
      message: string;
    };

type BitbucketWorkspace = {
  slug?: string;
};

type BitbucketRepository = {
  fullName: string;
  slug: string;
  workspace: string;
  htmlUrl: string | null;
};

type DateWindow = {
  fromMs: number;
  toMs: number;
};

type DashboardEntry = {
  id: string;
  category: string;
  description: string;
  ref: string;
  source: "Jira" | "Bitbucket";
  timeSeconds: number;
  time: string;
  link: string | null;
  occurredAt: string;
  relatedData?: {
    issueKey?: string | null;
    projectKey: string | null;
    projectName: string | null;
    issueType: string | null;
    status: string | null;
    assignee: string | null;
    parentKey: string | null;
    labels: string[];
    linkedIssueKeys: string[];
    createdAt?: string | null;
    updatedAt?: string | null;
    repositoryFullName?: string | null;
    repositorySlug?: string | null;
    workspace?: string | null;
    commitHash?: string | null;
    commitMessage?: string | null;
    commitTimestamp?: string | null;
    pullRequestId?: number | null;
    pullRequestTitle?: string | null;
    pullRequestState?: string | null;
    pullRequestUrl?: string | null;
    pullRequestTimestamp?: string | null;
    sourceBranch?: string | null;
    destinationBranch?: string | null;
    branch?: string | null;
  };
};

class BitbucketApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "BitbucketApiError";
    this.status = status;
  }
}

function isBitbucketUnauthorizedError(error: unknown) {
  return error instanceof BitbucketApiError && error.status === 401;
}

function toWebHeaders(
  headers: Record<string, string | string[] | undefined>,
): Headers {
  const webHeaders = new Headers();

  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === "string") {
      webHeaders.set(key, value);
      continue;
    }

    if (Array.isArray(value)) {
      webHeaders.set(key, value.join(", "));
    }
  }

  return webHeaders;
}

async function resolveSessionUserId(reqHeaders: Record<string, string | string[] | undefined>) {
  const { data: session, error: sessionError } = await tryCatch(
    auth.api.getSession({ headers: toWebHeaders(reqHeaders) }),
  );

  if (sessionError) {
    return {
      userId: null,
      error: sessionError,
    };
  }

  return {
    userId: session?.user?.id ?? null,
    error: null,
  };
}

async function fetchConnectedAccounts(userId: string) {
  return tryCatch(
    db
      .select({
        providerId: account.providerId,
        accessToken: account.accessToken,
        refreshToken: account.refreshToken,
        accessTokenExpiresAt: account.accessTokenExpiresAt,
      })
      .from(account)
      .where(eq(account.userId, userId)),
  );
}

async function resolveRequestAccounts(
  reqHeaders: Record<string, string | string[] | undefined>,
): Promise<RequestAccountsResult> {
  const { userId, error: sessionError } = await resolveSessionUserId(reqHeaders);

  if (sessionError) {
    logger.error({ err: sessionError }, "Failed to resolve auth session");
    return {
      ok: false,
      code: RESPONSE_CODE.INTERNAL_SERVER_ERROR,
      message: "Failed to resolve auth session",
    };
  }

  if (!userId) {
    return {
      ok: false,
      code: RESPONSE_CODE.UNAUTHORIZED,
      message: "Unauthorized",
    };
  }

  const { data: linkedAccounts, error: accountError } = await fetchConnectedAccounts(userId);

  if (accountError) {
    logger.error(
      { err: accountError, userId },
      "Failed to fetch linked accounts",
    );
    return {
      ok: false,
      code: RESPONSE_CODE.INTERNAL_SERVER_ERROR,
      message: "Failed to fetch linked account data",
    };
  }

  return {
    ok: true,
    userId,
    linkedAccounts,
  };
}

function getConnectedProviders(linkedAccounts: ConnectedAccount[]) {
  return Array.from(new Set(linkedAccounts.map((entry) => entry.providerId)));
}

function getConnectionStatus(linkedAccounts: ConnectedAccount[]) {
  const connectedProviders = getConnectedProviders(linkedAccounts);
  const atlassianConnected = connectedProviders.includes("atlassian");
  const bitbucketConnected = connectedProviders.includes("bitbucket");

  return {
    connectedProviders,
    atlassianConnected,
    bitbucketConnected,
  };
}

function formatDuration(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);

  if (hours > 0 && minutes > 0) {
    return `${hours}h ${minutes}m`;
  }

  if (hours > 0) {
    return `${hours}h`;
  }

  if (minutes > 0) {
    return `${minutes}m`;
  }

  return "0m";
}

function parseDateWindow(
  from?: unknown,
  to?: unknown,
): DateWindow | null {
  const fromValue = typeof from === "string" ? Date.parse(from) : Number.NaN;
  const toValue = typeof to === "string" ? Date.parse(to) : Number.NaN;

  if (Number.isNaN(fromValue) || Number.isNaN(toValue) || fromValue >= toValue) {
    return null;
  }

  return {
    fromMs: fromValue,
    toMs: toValue,
  };
}

function isTimestampInWindow(timestamp: string | undefined, window: DateWindow | null) {
  if (!window || !timestamp) {
    return true;
  }

  const { fromMs, toMs } = window;
  const timestampMs = Date.parse(timestamp);

  if (Number.isNaN(timestampMs)) {
    return false;
  }

  return timestampMs >= fromMs && timestampMs < toMs;
}

function isOlderThanWindow(timestamp: string | undefined, window: DateWindow | null) {
  if (!window || !timestamp) {
    return false;
  }

  const { fromMs } = window;
  const timestampMs = Date.parse(timestamp);

  return !Number.isNaN(timestampMs) && timestampMs < fromMs;
}

function buildBitbucketBasicAuthHeader() {
  const credentials = `${env.BITBUCKET_CLIENT_ID}:${env.BITBUCKET_CLIENT_SECRET}`;
  return `Basic ${Buffer.from(credentials).toString("base64")}`;
}

function computeAccessTokenExpiresAt(expiresInSeconds?: number) {
  if (!expiresInSeconds || expiresInSeconds <= 0) {
    return null;
  }

  return new Date(Date.now() + expiresInSeconds * 1000);
}

async function refreshAtlassianAccessToken(refreshToken: string) {
  const tokenResponse = await fetch("https://auth.atlassian.com/oauth/token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      grant_type: "refresh_token",
      client_id: env.ATLASSIAN_CLIENT_ID,
      client_secret: env.ATLASSIAN_CLIENT_SECRET,
      refresh_token: refreshToken,
    }),
  });

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    throw new Error(
      `Unable to refresh Atlassian access token (${tokenResponse.status}): ${errorText || tokenResponse.statusText}`,
    );
  }

  const tokenPayload = (await tokenResponse.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };

  if (!tokenPayload.access_token) {
    throw new Error("Atlassian refresh response did not include an access token");
  }

  return {
    accessToken: tokenPayload.access_token,
    refreshToken: tokenPayload.refresh_token ?? refreshToken,
    accessTokenExpiresAt: computeAccessTokenExpiresAt(tokenPayload.expires_in),
  };
}

async function persistRefreshedAccountTokens(
  userId: string,
  providerId: string,
  refreshedTokens: {
    accessToken: string;
    refreshToken?: string | null;
    accessTokenExpiresAt?: Date | null;
  },
) {
  await db
    .update(account)
    .set({
      accessToken: refreshedTokens.accessToken,
      refreshToken: refreshedTokens.refreshToken ?? null,
      accessTokenExpiresAt: refreshedTokens.accessTokenExpiresAt ?? null,
    })
    .where(and(eq(account.userId, userId), eq(account.providerId, providerId)));
}

async function fetchAtlassianEntriesWithRefresh(
  userId: string,
  atlassianAccount: ConnectedAccount | undefined,
) {
  if (!atlassianAccount?.accessToken) {
    return {
      entries: [] as DashboardEntry[],
      failed: false,
    };
  }

  let atlassianAccessToken = atlassianAccount.accessToken;

  if (
    atlassianAccount.accessTokenExpiresAt &&
    atlassianAccount.accessTokenExpiresAt.getTime() <= Date.now() &&
    atlassianAccount.refreshToken
  ) {
    const { data: refreshedTokens, error: refreshError } = await tryCatch(
      refreshAtlassianAccessToken(atlassianAccount.refreshToken),
    );

    if (refreshError) {
      logger.warn(
        { err: refreshError, userId },
        "Failed to refresh Atlassian access token",
      );
    } else {
      atlassianAccessToken = refreshedTokens.accessToken;

      const { error: persistError } = await tryCatch(
        persistRefreshedAccountTokens(userId, "atlassian", refreshedTokens),
      );

      if (persistError) {
        logger.warn(
          { err: persistError, userId },
          "Failed to persist refreshed Atlassian tokens",
        );
      }
    }
  }

  const runJiraFetch = async () => fetchJiraEntries(atlassianAccessToken);
  let jiraResult = await tryCatch(runJiraFetch());

  if (
    jiraResult.error &&
    atlassianAccount.refreshToken &&
    isAtlassianUnauthorizedError(jiraResult.error)
  ) {
    const { data: refreshedTokens, error: refreshError } = await tryCatch(
      refreshAtlassianAccessToken(atlassianAccount.refreshToken),
    );

    if (!refreshError) {
      atlassianAccessToken = refreshedTokens.accessToken;

      const { error: persistError } = await tryCatch(
        persistRefreshedAccountTokens(userId, "atlassian", refreshedTokens),
      );

      if (persistError) {
        logger.warn(
          { err: persistError, userId },
          "Failed to persist refreshed Atlassian tokens",
        );
      }

      jiraResult = await tryCatch(runJiraFetch());
    } else {
      logger.warn(
        { err: refreshError, userId },
        "Failed to refresh Atlassian token after unauthorized Jira response",
      );
    }
  }

  if (jiraResult.error) {
    logger.warn({ err: jiraResult.error, userId }, "Failed to fetch Jira entries");
    return {
      entries: [] as DashboardEntry[],
      failed: true,
    };
  }

  return {
    entries: jiraResult.data,
    failed: false,
  };
}

async function fetchBitbucketPaginatedValues<T>(url: string, accessToken: string) {
  const values: T[] = [];
  let nextUrl: string | null = url;

  while (nextUrl) {
    const response = await fetch(nextUrl, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new BitbucketApiError(
        response.status,
        `Unable to fetch Bitbucket data (${response.status}): ${errorText || response.statusText}`,
      );
    }

    const payload = (await response.json()) as {
      values?: T[];
      next?: string;
    };

    values.push(...(payload.values ?? []));
    nextUrl = payload.next ?? null;
  }

  return values;
}

async function fetchBitbucketPaginatedPage<T>(url: string, accessToken: string) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new BitbucketApiError(
      response.status,
      `Unable to fetch Bitbucket data (${response.status}): ${errorText || response.statusText}`,
    );
  }

  const payload = (await response.json()) as {
    values?: T[];
    next?: string;
  };

  return {
    values: payload.values ?? [],
    nextUrl: payload.next ?? null,
  };
}

async function fetchBitbucketWorkspaces(accessToken: string) {
  const memberships = await fetchBitbucketPaginatedValues<{
    workspace?: BitbucketWorkspace;
  }>("https://api.bitbucket.org/2.0/user/workspaces?pagelen=100", accessToken);

  return memberships
    .map((membership) => membership.workspace?.slug)
    .filter((slug): slug is string => Boolean(slug));
}

async function fetchBitbucketRepositories(accessToken: string) {
  const workspaceSlugs = await fetchBitbucketWorkspaces(accessToken);
  const repositoriesByFullName = new Map<string, BitbucketRepository>();

  for (const workspaceSlug of workspaceSlugs) {
    const permissions = await fetchBitbucketPaginatedValues<{
      repository?: {
        full_name?: string;
        slug?: string;
        links?: {
          html?: {
            href?: string;
          };
        };
      };
    }>(
      `https://api.bitbucket.org/2.0/workspaces/${workspaceSlug}/permissions/repositories?pagelen=100`,
      accessToken,
    );

    for (const permission of permissions) {
      const repository = permission.repository;
      const fullName = repository?.full_name ?? (repository?.slug ? `${workspaceSlug}/${repository.slug}` : null);

      if (!fullName || !repository?.slug || repositoriesByFullName.has(fullName)) {
        continue;
      }

      repositoriesByFullName.set(fullName, {
        fullName,
        slug: repository.slug,
        workspace: workspaceSlug,
        htmlUrl: repository.links?.html?.href ?? null,
      });
    }
  }

  if (!repositoriesByFullName.size) {
    for (const workspaceSlug of workspaceSlugs) {
      const workspaceRepositories = await fetchBitbucketPaginatedValues<{
        full_name?: string;
        slug?: string;
        links?: {
          html?: {
            href?: string;
          };
        };
      }>(`https://api.bitbucket.org/2.0/repositories/${workspaceSlug}?pagelen=100`, accessToken);

      for (const repository of workspaceRepositories) {
        const fullName = repository.full_name ?? (repository.slug ? `${workspaceSlug}/${repository.slug}` : null);

        if (!fullName || !repository.slug || repositoriesByFullName.has(fullName)) {
          continue;
        }

        repositoriesByFullName.set(fullName, {
          fullName,
          slug: repository.slug,
          workspace: workspaceSlug,
          htmlUrl: repository.links?.html?.href ?? null,
        });
      }
    }
  }

  return Array.from(repositoriesByFullName.values());
}

async function refreshBitbucketAccessToken(refreshToken: string) {
  const tokenResponse = await fetch(
    "https://bitbucket.org/site/oauth2/access_token",
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: buildBitbucketBasicAuthHeader(),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    },
  );

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    throw new Error(
      `Unable to refresh Bitbucket access token (${tokenResponse.status}): ${errorText || tokenResponse.statusText}`,
    );
  }

  const tokenPayload = (await tokenResponse.json()) as {
    access_token?: string;
  };

  if (!tokenPayload.access_token) {
    throw new Error("Bitbucket refresh response did not include an access token");
  }

  return tokenPayload.access_token;
}

async function fetchJiraEntries(accessToken: string): Promise<DashboardEntry[]> {
  const { cloudId, jiraSiteUrl } = await resolveJiraResource(accessToken);

  if (!cloudId) {
    return [];
  }

  const { issues } = await fetchAllJiraIssues(accessToken, cloudId);

  return issues.map((issue) => {
    const timeSeconds = issue.timeSpentSeconds;
    return {
      id: `jira-${issue.id}`,
      category: "Development",
      description: `${issue.key || "Jira"} - ${issue.summary}`,
      ref: issue.key || "N/A",
      source: "Jira",
      timeSeconds,
      time: formatDuration(timeSeconds),
      link: jiraSiteUrl && issue.key ? `${jiraSiteUrl}/browse/${issue.key}` : issue.self,
      occurredAt: issue.updated,
      relatedData: {
        issueKey: issue.key,
        projectKey: issue.projectKey,
        projectName: issue.projectName,
        issueType: issue.issueType,
        status: issue.status,
        assignee: issue.assignee,
        parentKey: issue.parentKey,
        labels: issue.labels,
        linkedIssueKeys: issue.linkedIssueKeys,
        createdAt: issue.created,
        updatedAt: issue.updated,
        repositoryFullName: null,
        repositorySlug: null,
        workspace: null,
        commitHash: null,
        commitMessage: null,
        commitTimestamp: null,
        pullRequestId: null,
        pullRequestTitle: null,
        pullRequestState: null,
        pullRequestUrl: null,
        pullRequestTimestamp: null,
        sourceBranch: null,
        destinationBranch: null,
        branch: null,
      },
    };
  });
}

async function fetchBitbucketEntries(
  accountEntry: ConnectedAccount,
  dateWindow: DateWindow | null,
): Promise<DashboardEntry[]> {
  let accessToken = accountEntry.accessToken;

  if (
    accountEntry.accessTokenExpiresAt &&
    accountEntry.accessTokenExpiresAt.getTime() <= Date.now() &&
    accountEntry.refreshToken
  ) {
    accessToken = await refreshBitbucketAccessToken(accountEntry.refreshToken);
  }

  if (!accessToken) {
    return [];
  }

  let repositories: BitbucketRepository[] = [];

  try {
    repositories = await fetchBitbucketRepositories(accessToken);
  } catch (error) {
    if (!accountEntry.refreshToken || !isBitbucketUnauthorizedError(error)) {
      throw error;
    }

    accessToken = await refreshBitbucketAccessToken(accountEntry.refreshToken);
    repositories = await fetchBitbucketRepositories(accessToken);
  }

  if (!repositories.length && accountEntry.refreshToken && accessToken === accountEntry.accessToken) {
    accessToken = await refreshBitbucketAccessToken(accountEntry.refreshToken);
    repositories = await fetchBitbucketRepositories(accessToken);
  }

  const entries: DashboardEntry[] = [];

  const fetchRepositoryCommits = async (token: string, repository: BitbucketRepository) => {
    const commits: Array<{
      hash?: string;
      date?: string;
      message?: string;
      links?: {
        html?: {
          href?: string;
        };
      };
    }> = [];

    let nextUrl: string | null =
      `https://api.bitbucket.org/2.0/repositories/${repository.workspace}/${repository.slug}/commits?pagelen=100`;

    while (nextUrl) {
      const pageResult: {
        values: Array<{
          hash?: string;
          date?: string;
          message?: string;
          links?: {
            html?: {
              href?: string;
            };
          };
        }>;
        nextUrl: string | null;
      } = await fetchBitbucketPaginatedPage<{
        hash?: string;
        date?: string;
        message?: string;
        links?: {
          html?: {
            href?: string;
          };
        };
      }>(nextUrl, token);

      let reachedBeforeWindow = false;

      for (const commit of pageResult.values) {
        if (!isTimestampInWindow(commit.date, dateWindow)) {
          if (isOlderThanWindow(commit.date, dateWindow)) {
            reachedBeforeWindow = true;
          }

          continue;
        }

        commits.push(commit);
      }

      if (reachedBeforeWindow) {
        break;
      }

      nextUrl = pageResult.nextUrl;
    }

    return commits;
  };

  const fetchRepositoryPullRequests = async (token: string, repository: BitbucketRepository) => {
    const pullRequests: Array<{
      id?: number;
      title?: string;
      state?: string;
      created_on?: string;
      updated_on?: string;
      source?: {
        branch?: {
          name?: string;
        };
      };
      destination?: {
        branch?: {
          name?: string;
        };
      };
      links?: {
        html?: {
          href?: string;
        };
      };
    }> = [];

    let nextUrl: string | null =
      `https://api.bitbucket.org/2.0/repositories/${repository.workspace}/${repository.slug}/pullrequests?sort=-updated_on&pagelen=100`;

    while (nextUrl) {
      const pageResult: {
        values: Array<{
          id?: number;
          title?: string;
          state?: string;
          created_on?: string;
          updated_on?: string;
          source?: {
            branch?: {
              name?: string;
            };
          };
          destination?: {
            branch?: {
              name?: string;
            };
          };
          links?: {
            html?: {
              href?: string;
            };
          };
        }>;
        nextUrl: string | null;
      } = await fetchBitbucketPaginatedPage<{
        id?: number;
        title?: string;
        state?: string;
        created_on?: string;
        updated_on?: string;
        source?: {
          branch?: {
            name?: string;
          };
        };
        destination?: {
          branch?: {
            name?: string;
          };
        };
        links?: {
          html?: {
            href?: string;
          };
        };
      }>(nextUrl, token);

      let reachedBeforeWindow = false;

      for (const pullRequest of pageResult.values) {
        const occurredAt = pullRequest.updated_on ?? pullRequest.created_on ?? null;

        if (!isTimestampInWindow(occurredAt ?? undefined, dateWindow)) {
          if (isOlderThanWindow(occurredAt ?? undefined, dateWindow)) {
            reachedBeforeWindow = true;
          }

          continue;
        }

        pullRequests.push(pullRequest);
      }

      if (reachedBeforeWindow) {
        break;
      }

      nextUrl = pageResult.nextUrl;
    }

    return pullRequests;
  };

  for (const repository of repositories) {
    let commitsPayload: Array<{
      hash?: string;
      date?: string;
      message?: string;
      links?: {
        html?: {
          href?: string;
        };
      };
    }>;

    try {
      commitsPayload = await fetchRepositoryCommits(accessToken, repository);
    } catch (error) {
      if (!accountEntry.refreshToken || !isBitbucketUnauthorizedError(error)) {
        continue;
      }

      accessToken = await refreshBitbucketAccessToken(accountEntry.refreshToken);

      try {
        commitsPayload = await fetchRepositoryCommits(accessToken, repository);
      } catch {
        continue;
      }
    }

    for (const commit of commitsPayload) {
      const shortHash = commit.hash?.slice(0, 7) ?? "commit";
      const timeSeconds = 30 * 60;

      entries.push({
        id: `bitbucket-${commit.hash ?? crypto.randomUUID()}`,
        category: "Development",
        description: `${repository.fullName} - ${shortHash} - ${(commit.message ?? "No message").split("\n")[0]}`,
        ref: shortHash,
        source: "Bitbucket",
        timeSeconds,
        time: formatDuration(timeSeconds),
        link: commit.links?.html?.href ?? repository.htmlUrl,
        occurredAt: commit.date ?? new Date().toISOString(),
        relatedData: {
          issueKey: null,
          projectKey: null,
          projectName: null,
          issueType: null,
          status: null,
          assignee: null,
          parentKey: null,
          labels: [],
          linkedIssueKeys: [],
          createdAt: null,
          updatedAt: commit.date ?? null,
          repositoryFullName: repository.fullName,
          repositorySlug: repository.slug,
          workspace: repository.workspace,
          commitHash: shortHash,
          commitMessage: (commit.message ?? "No message").split("\n")[0],
          commitTimestamp: commit.date ?? null,
          pullRequestId: null,
          pullRequestTitle: null,
          pullRequestState: null,
          pullRequestUrl: null,
          pullRequestTimestamp: null,
          sourceBranch: null,
          destinationBranch: null,
          branch: null,
        },
      });
    }

    let pullRequestsPayload: Array<{
      id?: number;
      title?: string;
      state?: string;
      created_on?: string;
      updated_on?: string;
      source?: {
        branch?: {
          name?: string;
        };
      };
      destination?: {
        branch?: {
          name?: string;
        };
      };
      links?: {
        html?: {
          href?: string;
        };
      };
    }>;

    try {
      pullRequestsPayload = await fetchRepositoryPullRequests(accessToken, repository);
    } catch (error) {
      if (!accountEntry.refreshToken || !isBitbucketUnauthorizedError(error)) {
        continue;
      }

      accessToken = await refreshBitbucketAccessToken(accountEntry.refreshToken);

      try {
        pullRequestsPayload = await fetchRepositoryPullRequests(accessToken, repository);
      } catch {
        continue;
      }
    }

    for (const pullRequest of pullRequestsPayload) {
      const prId = pullRequest.id ?? 0;
      const sourceBranch = pullRequest.source?.branch?.name ?? null;
      const destinationBranch = pullRequest.destination?.branch?.name ?? null;
      const occurredAt = pullRequest.updated_on ?? pullRequest.created_on ?? new Date().toISOString();
      const timeSeconds = 45 * 60;

      entries.push({
        id: `bitbucket-pr-${repository.workspace}-${repository.slug}-${prId || crypto.randomUUID()}`,
        category: "Code Review",
        description: `${repository.fullName} - PR #${prId} - ${pullRequest.title ?? "Untitled pull request"}`,
        ref: prId ? `PR-${prId}` : "PR",
        source: "Bitbucket",
        timeSeconds,
        time: formatDuration(timeSeconds),
        link: pullRequest.links?.html?.href ?? repository.htmlUrl,
        occurredAt,
        relatedData: {
          issueKey: null,
          projectKey: null,
          projectName: null,
          issueType: null,
          status: null,
          assignee: null,
          parentKey: null,
          labels: [],
          linkedIssueKeys: [],
          createdAt: pullRequest.created_on ?? null,
          updatedAt: pullRequest.updated_on ?? null,
          repositoryFullName: repository.fullName,
          repositorySlug: repository.slug,
          workspace: repository.workspace,
          commitHash: null,
          commitMessage: null,
          commitTimestamp: null,
          pullRequestId: prId || null,
          pullRequestTitle: pullRequest.title ?? null,
          pullRequestState: pullRequest.state ?? null,
          pullRequestUrl: pullRequest.links?.html?.href ?? null,
          pullRequestTimestamp: occurredAt,
          sourceBranch,
          destinationBranch,
          branch: sourceBranch ?? destinationBranch,
        },
      });
    }
  }

  return entries;
}

router.get("/integrations/status", async (req, res) => {
  const requestAccounts = await resolveRequestAccounts(req.headers);

  if (!requestAccounts.ok) {
    return sendError(
      res,
      requestAccounts.code,
      requestAccounts.message,
    );
  }

  const { linkedAccounts } = requestAccounts;

  const { connectedProviders, atlassianConnected, bitbucketConnected } =
    getConnectionStatus(linkedAccounts);

  return sendSuccess(
    res,
    RESPONSE_CODE.OK,
    "Integration status fetched successfully",
    {
      connectedProviders,
      atlassianConnected,
      bitbucketConnected,
    },
  );
});

router.get("/integrations/timesheet", async (req, res) => {
  const requestAccounts = await resolveRequestAccounts(req.headers);

  if (!requestAccounts.ok) {
    return sendError(
      res,
      requestAccounts.code,
      requestAccounts.message,
    );
  }

  const { userId, linkedAccounts } = requestAccounts;

  const { connectedProviders, atlassianConnected, bitbucketConnected } =
    getConnectionStatus(linkedAccounts);
  const atlassianAccount = linkedAccounts.find(
    (entry) => entry.providerId === "atlassian",
  );
  const directBitbucketAccount = linkedAccounts.find(
    (entry) => entry.providerId === "bitbucket",
  );

  const partialFailures: string[] = [];
  let entries: DashboardEntry[] = [];
  const dateWindow = parseDateWindow(req.query.from, req.query.to);

  const jiraResult = await fetchAtlassianEntriesWithRefresh(userId, atlassianAccount);
  if (jiraResult.failed) {
    partialFailures.push("jira");
  } else {
    entries = [...entries, ...jiraResult.entries];
  }

  if (directBitbucketAccount) {
    const { data, error } = await tryCatch(
      fetchBitbucketEntries(directBitbucketAccount, dateWindow),
    );
    if (error) {
      logger.warn({ err: error, userId }, "Failed to fetch Bitbucket entries");
      partialFailures.push("bitbucket");
    } else {
      entries = [...entries, ...data];
    }
  }

  entries.sort((a, b) => {
    return new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime();
  });

  return sendSuccess(
    res,
    RESPONSE_CODE.OK,
    "Timesheet entries fetched successfully",
    {
      connectedProviders,
      atlassianConnected,
      bitbucketConnected,
      entries,
      fetchedAt: new Date().toISOString(),
      partialFailures,
    },
  );
});

export default router;
