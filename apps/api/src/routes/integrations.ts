import { Router } from "express";
import { and, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { account } from "@/db/schema";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import {
  fetchAllJiraIssues,
  isAtlassianUnauthorizedError,
  resolveJiraResources,
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

async function fetchBitbucketEntriesWithRefresh(
  userId: string,
  bitbucketAccount: ConnectedAccount | undefined,
  dateWindow: DateWindow | null,
) {
  if (!bitbucketAccount?.accessToken) {
    return {
      entries: [] as DashboardEntry[],
      failed: false,
    };
  }

  const runBitbucketFetch = async () =>
    fetchBitbucketEntries(bitbucketAccount, dateWindow);

  let result = await tryCatch(runBitbucketFetch());

  if (
    result.error &&
    bitbucketAccount.refreshToken &&
    isBitbucketUnauthorizedError(result.error)
  ) {
    const { data: refreshedAccessToken, error: refreshError } = await tryCatch(
      refreshBitbucketAccessToken(bitbucketAccount.refreshToken),
    );

    if (!refreshError) {
      // Create an updated account with the new access token and retry
      const updatedAccount: ConnectedAccount = {
        ...bitbucketAccount,
        accessToken: refreshedAccessToken,
      };

      // Note: Bitbucket refresh only returns the access token, not expiry info.
      // We update the token in-memory for this request but don't persist.
      // The database will still have the old token until next Bitbucket re-connection.
      result = await tryCatch(fetchBitbucketEntries(updatedAccount, dateWindow));
    } else {
      logger.warn(
        { err: refreshError, userId },
        "Failed to refresh Bitbucket token after unauthorized response",
      );
    }
  }

  if (result.error) {
    logger.warn({ err: result.error, userId }, "Failed to fetch Bitbucket entries");
    return {
      entries: [] as DashboardEntry[],
      failed: true,
    };
  }

  return {
    entries: result.data ?? [],
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
  const jiraResources = await resolveJiraResources(accessToken);

  if (!jiraResources.length) {
    return [];
  }

  const entries: DashboardEntry[] = [];

  for (const { cloudId, jiraSiteUrl } of jiraResources) {
    try {
      const { issues } = await fetchAllJiraIssues(accessToken, cloudId);

      for (const issue of issues) {
        const timeSeconds = issue.timeSpentSeconds;
        const source: "Jira" = "Jira";
        entries.push({
          id: `jira-${cloudId}-${issue.id}`,
          category: "Development",
          description: `${issue.key || "Jira"} - ${issue.summary}`,
          ref: issue.key || "N/A",
          source,
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
        });
      }
    } catch (error) {
      logger.warn(
        { err: error, cloudId, jiraSiteUrl },
        "Failed to fetch Jira entries for one Atlassian resource",
      );
    }
  }

  return entries;
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
    const bitbucketResult = await fetchBitbucketEntriesWithRefresh(
      userId,
      directBitbucketAccount,
      dateWindow,
    );
    if (bitbucketResult.failed) {
      partialFailures.push("bitbucket");
    } else {
      entries = [...entries, ...bitbucketResult.entries];
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

// Team Reports

import {
  fetchAllAtlassianTeams,
  fetchTeamMembers,
  type TeamWithMembers,
} from "@/lib/teams";

type TeamMemberIssueAggregate = {
  accountId: string;
  displayName: string | null;
  totalIssues: number;
  totalTimeSpentSeconds: number;
  issuesByStatus: Record<string, number>;
  issuesByType: Record<string, number>;
  issuesByProject: Record<string, number>;
};

type TeamReportData = {
  teamId: string;
  displayName: string;
  description: string;
  memberCount: number;
  totalIssues: number;
  totalTimeSpentSeconds: number;
  issuesByStatus: Record<string, number>;
  issuesByType: Record<string, number>;
  issuesByProject: Record<string, number>;
  members: TeamMemberIssueAggregate[];
};

function aggregateIssuesByField<T extends string>(
  issues: Array<{ [K in T]?: string | null }>,
  field: T,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const issue of issues) {
    const value = (issue as Record<string, unknown>)[field];
    const key = typeof value === "string" && value ? value : "Unknown";
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}


router.get("/integrations/teams", async (req, res) => {
  const requestAccounts = await resolveRequestAccounts(req.headers);

  if (!requestAccounts.ok) {
    return sendError(res, requestAccounts.code, requestAccounts.message);
  }

  const { userId, linkedAccounts } = requestAccounts;
  const atlassianAccount = linkedAccounts.find(
    (entry) => entry.providerId === "atlassian",
  );

  if (!atlassianAccount?.accessToken) {
    return sendError(
      res,
      RESPONSE_CODE.BAD_REQUEST,
      "No Atlassian account connected. Please connect Atlassian first.",
    );
  }

  let accessToken = atlassianAccount.accessToken;

  // Refresh token if expired
  if (
    atlassianAccount.accessTokenExpiresAt &&
    atlassianAccount.accessTokenExpiresAt.getTime() <= Date.now() &&
    atlassianAccount.refreshToken
  ) {
    const { data: refreshedTokens, error: refreshError } = await tryCatch(
      refreshAtlassianAccessToken(atlassianAccount.refreshToken),
    );

    if (!refreshError) {
      accessToken = refreshedTokens.accessToken;
      await tryCatch(
        persistRefreshedAccountTokens(userId, "atlassian", refreshedTokens),
      );
    }
  }

  const { data: jiraResources, error: resourceError } = await tryCatch(
    resolveJiraResources(accessToken),
  );

  if (resourceError) {
    logger.error({ err: resourceError, userId }, "Failed to fetch Jira resources");
    return sendError(res, RESPONSE_CODE.INTERNAL_SERVER_ERROR, "Failed to fetch Jira sites as teams");
  }

  const teams = (jiraResources || []).map((resource) => {
    let siteName = "Jira Site";
    try {
      if (resource.jiraSiteUrl) {
        siteName = new URL(resource.jiraSiteUrl).hostname;
      }
    } catch {
      // ignore
    }

    return {
      teamId: resource.cloudId,
      displayName: siteName,
      description: resource.jiraSiteUrl || "Jira Site",
      state: "ACTIVE",
      teamType: "OPEN",
      organizationId: "site",
    };
  });

  return sendSuccess(res, RESPONSE_CODE.OK, "Teams fetched successfully", {
    teams,
    orgId: "site",
  });
});

/**
 * GET /integrations/team-report/:teamId
 * Returns aggregated Jira issue data for all members of a specific team.
 * The data is aggregated by status, issue type, and project.
 */
router.get("/integrations/team-report/:teamId", async (req, res) => {
  const { teamId } = req.params; // we use teamId as cloudId
  const requestAccounts = await resolveRequestAccounts(req.headers);

  if (!requestAccounts.ok) {
    return sendError(res, requestAccounts.code, requestAccounts.message);
  }

  const { userId, linkedAccounts } = requestAccounts;
  const atlassianAccount = linkedAccounts.find(
    (entry) => entry.providerId === "atlassian",
  );

  if (!atlassianAccount?.accessToken) {
    return sendError(
      res,
      RESPONSE_CODE.BAD_REQUEST,
      "No Atlassian account connected.",
    );
  }

  let accessToken = atlassianAccount.accessToken;

  // Refresh token if expired
  if (
    atlassianAccount.accessTokenExpiresAt &&
    atlassianAccount.accessTokenExpiresAt.getTime() <= Date.now() &&
    atlassianAccount.refreshToken
  ) {
    const { data: refreshedTokens, error: refreshError } = await tryCatch(
      refreshAtlassianAccessToken(atlassianAccount.refreshToken),
    );

    if (!refreshError) {
      accessToken = refreshedTokens.accessToken;
      await tryCatch(
        persistRefreshedAccountTokens(userId, "atlassian", refreshedTokens),
      );
    }
  }

  const memberAggregates = new Map<string, TeamMemberIssueAggregate>();

  // Build a date-bounded JQL that filters by recency
  const periodQuery = req.query.period as string | undefined;
  let jqlDateClause = "updated >= -7d"; // default to last 7 days
  if (periodQuery === "month") {
    jqlDateClause = "updated >= -30d";
  } else if (periodQuery === "quarter") {
    jqlDateClause = "updated >= -90d";
  } else if (periodQuery === "day") {
    jqlDateClause = "updated >= -1d";
  }

  try {
    const jql = `${jqlDateClause} ORDER BY updated DESC`;

    let nextPageToken: string | undefined;

    while (true) {
      const response = await fetch(
        `https://api.atlassian.com/ex/jira/${teamId}/rest/api/3/search/jql`,
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            jql,
            maxResults: 100,
            fields: [
              "summary",
              "timespent",
              "updated",
              "created",
              "project",
              "issuetype",
              "status",
              "assignee",
              "labels",
            ],
            ...(nextPageToken ? { nextPageToken } : {}),
          }),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        logger.warn(
          { cloudId: teamId, status: response.status, errorText },
          "Failed to fetch Jira issues for site report",
        );
        break;
      }

      const payload = (await response.json()) as {
        issues?: Array<{
          id?: string;
          key?: string;
          fields?: {
            summary?: string;
            timespent?: number | null;
            updated?: string;
            created?: string;
            project?: { key?: string; name?: string };
            issuetype?: { name?: string };
            status?: { name?: string };
            assignee?: { accountId?: string; displayName?: string } | null;
            labels?: string[];
          };
        }>;
        isLast?: boolean;
        nextPageToken?: string;
      };

      for (const issue of payload.issues ?? []) {
        const assigneeAccountId = issue.fields?.assignee?.accountId;
        // Group by user, only include issues that have an assignee
        if (!assigneeAccountId) {
          continue;
        }

        let aggregate = memberAggregates.get(assigneeAccountId);
        if (!aggregate) {
          aggregate = {
            accountId: assigneeAccountId,
            displayName: issue.fields?.assignee?.displayName ?? null,
            totalIssues: 0,
            totalTimeSpentSeconds: 0,
            issuesByStatus: {},
            issuesByType: {},
            issuesByProject: {},
          };
          memberAggregates.set(assigneeAccountId, aggregate);
        }

        aggregate.totalIssues += 1;
        aggregate.totalTimeSpentSeconds += issue.fields?.timespent ?? 0;

        const status = issue.fields?.status?.name ?? "Unknown";
        aggregate.issuesByStatus[status] = (aggregate.issuesByStatus[status] ?? 0) + 1;

        const issueType = issue.fields?.issuetype?.name ?? "Unknown";
        aggregate.issuesByType[issueType] = (aggregate.issuesByType[issueType] ?? 0) + 1;

        const project = issue.fields?.project?.name ?? issue.fields?.project?.key ?? "Unknown";
        aggregate.issuesByProject[project] = (aggregate.issuesByProject[project] ?? 0) + 1;
      }

      if (payload.isLast || !payload.nextPageToken) {
        break;
      }

      nextPageToken = payload.nextPageToken;
    }
  } catch (error) {
    logger.warn(
      { err: error, cloudId: teamId },
      "Failed to fetch Jira issues for team report via site url",
    );
  }

  // 4. Aggregate team-level totals
  const membersList = Array.from(memberAggregates.values());
  const teamTotalIssues = membersList.reduce((sum, m) => sum + m.totalIssues, 0);
  const teamTotalTime = membersList.reduce((sum, m) => sum + m.totalTimeSpentSeconds, 0);

  const teamIssuesByStatus: Record<string, number> = {};
  const teamIssuesByType: Record<string, number> = {};
  const teamIssuesByProject: Record<string, number> = {};

  for (const member of membersList) {
    for (const [status, count] of Object.entries(member.issuesByStatus)) {
      teamIssuesByStatus[status] = (teamIssuesByStatus[status] ?? 0) + count;
    }
    for (const [type, count] of Object.entries(member.issuesByType)) {
      teamIssuesByType[type] = (teamIssuesByType[type] ?? 0) + count;
    }
    for (const [project, count] of Object.entries(member.issuesByProject)) {
      teamIssuesByProject[project] = (teamIssuesByProject[project] ?? 0) + count;
    }
  }

  return sendSuccess(res, RESPONSE_CODE.OK, "Team report generated successfully", {
    teamId,
    memberCount: membersList.length,
    totalIssues: teamTotalIssues,
    totalTimeSpentSeconds: teamTotalTime,
    issuesByStatus: teamIssuesByStatus,
    issuesByType: teamIssuesByType,
    issuesByProject: teamIssuesByProject,
    members: membersList,
  });
});

export default router;

