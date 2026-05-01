import { Router } from "express";
import { and, eq, gte, inArray, lte } from "drizzle-orm";

import { db } from "@/db/client";
import { account, adminTeam, adminTeamMember, timesheetEntry, user } from "@/db/schema";
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
  timeRemainingSeconds: number;
  time: string;
  timeRemaining: string;
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

class BitbucketOAuthError extends Error {
  readonly status: number;
  readonly oauthError: string | null;
  readonly oauthErrorDescription: string | null;
  readonly responseText: string;

  constructor(
    status: number,
    message: string,
    options: {
      oauthError?: string | null;
      oauthErrorDescription?: string | null;
      responseText: string;
    },
  ) {
    super(message);
    this.name = "BitbucketOAuthError";
    this.status = status;
    this.oauthError = options.oauthError ?? null;
    this.oauthErrorDescription = options.oauthErrorDescription ?? null;
    this.responseText = options.responseText;
  }
}

function isBitbucketUnauthorizedError(error: unknown) {
  return error instanceof BitbucketApiError && error.status === 401;
}

function isBitbucketInvalidRefreshTokenError(error: unknown) {
  if (error instanceof BitbucketOAuthError) {
    const description = error.oauthErrorDescription ?? "";
    return error.status === 400 && /invalid\s*refresh_token/i.test(description);
  }

  if (error instanceof Error) {
    return /Invalid\s*refresh_token/i.test(error.message);
  }

  return false;
}

async function resolveSessionUserId(req: any) {
  try {
    const session = await auth.api.getSession({
      headers: req.headers,
    });

    return {
      userId: session?.user?.id ?? null,
      error: null,
    };
  } catch (error) {
    return {
      userId: null,
      error,
    };
  }
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
  req: any,
): Promise<RequestAccountsResult> {
  const { userId, error: sessionError } = await resolveSessionUserId(req);

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
  return Array.from(
    new Set(
      linkedAccounts
        .filter((entry) => Boolean(entry.accessToken || entry.refreshToken))
        .map((entry) => entry.providerId),
    ),
  );
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

async function clearAccountTokens(userId: string, providerId: string) {
  await db
    .update(account)
    .set({
      accessToken: null,
      refreshToken: null,
      accessTokenExpiresAt: null,
      refreshTokenExpiresAt: null,
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

  if (result.error && isBitbucketInvalidRefreshTokenError(result.error)) {
    logger.info({ userId }, "Bitbucket refresh token invalid; clearing stored credentials");
    const { error: clearError } = await tryCatch(clearAccountTokens(userId, "bitbucket"));
    if (clearError) {
      logger.warn({ err: clearError, userId }, "Failed to clear Bitbucket credentials after invalid refresh token");
    }

    bitbucketAccount.accessToken = null;
    bitbucketAccount.refreshToken = null;
    bitbucketAccount.accessTokenExpiresAt = null;

    return {
      entries: [] as DashboardEntry[],
      failed: false,
    };
  }

  if (
    result.error &&
    bitbucketAccount.refreshToken &&
    isBitbucketUnauthorizedError(result.error)
  ) {
    const { data: refreshedAccessToken, error: refreshError } = await tryCatch(
      refreshBitbucketAccessToken(bitbucketAccount.refreshToken),
    );

    if (refreshError && isBitbucketInvalidRefreshTokenError(refreshError)) {
      logger.info({ userId }, "Bitbucket refresh token invalid; clearing stored credentials");
      const { error: clearError } = await tryCatch(clearAccountTokens(userId, "bitbucket"));
      if (clearError) {
        logger.warn(
          { err: clearError, userId },
          "Failed to clear Bitbucket credentials after invalid refresh token",
        );
      }

      bitbucketAccount.accessToken = null;
      bitbucketAccount.refreshToken = null;
      bitbucketAccount.accessTokenExpiresAt = null;

      return {
        entries: [] as DashboardEntry[],
        failed: false,
      };
    }

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
    let oauthError: string | null = null;
    let oauthErrorDescription: string | null = null;

    try {
      const payload = JSON.parse(errorText) as {
        error?: string;
        error_description?: string;
      };
      oauthError = payload.error ?? null;
      oauthErrorDescription = payload.error_description ?? null;
    } catch {
      // ignore JSON parse errors
    }

    throw new BitbucketOAuthError(
      tokenResponse.status,
      `Unable to refresh Bitbucket access token (${tokenResponse.status}): ${errorText || tokenResponse.statusText}`,
      {
        oauthError,
        oauthErrorDescription,
        responseText: errorText,
      },
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
        const timeRemainingSeconds = issue.timeEstimateSeconds || 7200; // 2 hours default demo value if not assigned
        const source: "Jira" = "Jira";
        entries.push({
          id: `jira-${cloudId}-${issue.id}`,
          category: "Development",
          description: `${issue.key || "Jira"} - ${issue.summary}`,
          ref: issue.key || "N/A",
          source,
          timeSeconds,
          timeRemainingSeconds,
          time: formatDuration(timeSeconds),
          timeRemaining: formatDuration(timeRemainingSeconds),
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
      const timeRemainingSeconds = 7200; // 2 hours default demo value

      entries.push({
        id: `bitbucket-${commit.hash ?? crypto.randomUUID()}`,
        category: "Development",
        description: `${repository.fullName} - ${shortHash} - ${(commit.message ?? "No message").split("\n")[0]}`,
        ref: shortHash,
        source: "Bitbucket",
        timeSeconds,
        timeRemainingSeconds,
        time: formatDuration(timeSeconds),
        timeRemaining: formatDuration(timeRemainingSeconds),
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
      const timeRemainingSeconds = 7200; // 2 hours default demo value

      entries.push({
        id: `bitbucket-pr-${repository.workspace}-${repository.slug}-${prId || crypto.randomUUID()}`,
        category: "Code Review",
        description: `${repository.fullName} - PR #${prId} - ${pullRequest.title ?? "Untitled pull request"}`,
        ref: prId ? `PR-${prId}` : "PR",
        source: "Bitbucket",
        timeSeconds,
        timeRemainingSeconds,
        time: formatDuration(timeSeconds),
        timeRemaining: formatDuration(timeRemainingSeconds),
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

router.get("/status", async (req, res) => {
  const requestAccounts = await resolveRequestAccounts(req);

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

router.get("/timesheet", async (req, res) => {
  const requestAccounts = await resolveRequestAccounts(req);

  if (!requestAccounts.ok) {
    return sendError(
      res,
      requestAccounts.code,
      requestAccounts.message,
    );
  }

  const { userId, linkedAccounts } = requestAccounts;
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

  const { connectedProviders, atlassianConnected, bitbucketConnected } =
    getConnectionStatus(linkedAccounts);

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
  timeByCategory: Record<string, number>;
  timeByType: Record<string, number>;
  timeByProject: Record<string, number>;
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
  timeByCategory: Record<string, number>;
  timeByType: Record<string, number>;
  timeByProject: Record<string, number>;
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

function isBitbucketEntry(row: { source: string | null; sourceLink?: string | null }) {
  if (row.source === "bitbucket") {
    return true;
  }

  return Boolean(row.sourceLink && /bitbucket\.org/i.test(row.sourceLink));
}

function padIsoPart(value: number) {
  return String(value).padStart(2, "0");
}

function toLocalDateString(date: Date) {
  return [
    date.getFullYear(),
    padIsoPart(date.getMonth() + 1),
    padIsoPart(date.getDate()),
  ].join("-");
}

function getLocalStartOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function getLocalStartOfWeek(date: Date) {
  const start = getLocalStartOfDay(date);
  const day = start.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + offset);
  return start;
}

function getLocalStartOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function getLocalStartOfQuarter(date: Date) {
  const quarterStartMonth = Math.floor(date.getMonth() / 3) * 3;
  return new Date(date.getFullYear(), quarterStartMonth, 1);
}

const BITBUCKET_TYPE_LABEL = "Bitbucket items (PRs/Commits/Merges)";


router.get("/teams", async (req, res) => {
  const requestAccounts = await resolveRequestAccounts(req);

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

/** team report aggregation **/
router.get("/team-report/:teamId", async (req, res) => {
  const { teamId } = req.params; // we use teamId as cloudId
  const requestAccounts = await resolveRequestAccounts(req);

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
  const issueMetadata = new Map<string, { status: string; type: string; project: string }>();

  // Build a date-bounded JQL and DB range that match the selected reporting period.
  const periodQuery = req.query.period as string | undefined;
  const today = new Date();
  let timesheetFromDate = getLocalStartOfWeek(today);
  let jqlDateClause = `updated >= "${toLocalDateString(timesheetFromDate)}"`;

  if (periodQuery === "month") {
    timesheetFromDate = getLocalStartOfMonth(today);
    jqlDateClause = `updated >= "${toLocalDateString(timesheetFromDate)}"`;
  } else if (periodQuery === "quarter") {
    timesheetFromDate = getLocalStartOfQuarter(today);
    jqlDateClause = `updated >= "${toLocalDateString(timesheetFromDate)}"`;
  } else if (periodQuery === "day") {
    timesheetFromDate = getLocalStartOfDay(today);
    jqlDateClause = `updated >= "${toLocalDateString(timesheetFromDate)}"`;
  }
  const fromDateString = toLocalDateString(timesheetFromDate);
  const toDateString = toLocalDateString(today);

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
            timeByCategory: {},
            timeByType: {},
            timeByProject: {},
          };
          memberAggregates.set(assigneeAccountId, aggregate);
        }

        aggregate.totalIssues += 1;
        // totalTimeSpentSeconds will be calculated solely from timesheet entries

        const status = issue.fields?.status?.name ?? "Unknown";
        aggregate.issuesByStatus[status] = (aggregate.issuesByStatus[status] ?? 0) + 1;

        const issueType = issue.fields?.issuetype?.name ?? "Unknown";
        aggregate.issuesByType[issueType] = (aggregate.issuesByType[issueType] ?? 0) + 1;

        const project = issue.fields?.project?.name ?? issue.fields?.project?.key ?? "Unknown";
        aggregate.issuesByProject[project] = (aggregate.issuesByProject[project] ?? 0) + 1;

        if (issue.key) {
          issueMetadata.set(issue.key, { status, type: issueType, project });
        }
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

  // ── Resolve requesting user's role and team-member scope ──────────
  // Fetch the current user's role to decide whether to filter by team membership.
  const { data: requestingUser } = await tryCatch(
    db
      .select({ role: user.role })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1)
      .then((rows) => rows[0] ?? null),
  );

  // Managers can only view their own team's members.
  // Admins and auditors see everyone.
  let allowedUserIds: string[] | null = null; // null = no restriction

  if (requestingUser?.role === "manager") {
    // Find the team where this manager is the assigned manager
    const { data: managerTeam } = await tryCatch(
      db
        .select({ id: adminTeam.id })
        .from(adminTeam)
        .where(eq(adminTeam.managerId, userId))
        .limit(1)
        .then((rows) => rows[0] ?? null),
    );

    if (managerTeam) {
      const { data: teamMemberRows } = await tryCatch(
        db
          .select({ userId: adminTeamMember.userId })
          .from(adminTeamMember)
          .where(eq(adminTeamMember.teamId, managerTeam.id)),
      );
      allowedUserIds = (teamMemberRows ?? []).map((r) => r.userId);
    } else {
      // Manager has no configured team — show nothing
      allowedUserIds = [];
    }

    // Filter out any already-aggregated Jira member data that isn't in the allowed list.
    // We need the internal DB user IDs, so we get them after mapping below.
  }

  // 4. Map Jira account IDs to internal DB users to fetch their timesheets
  const { data: mappedAccounts } = await tryCatch(
    db
      .select({ userId: account.userId, accountId: account.accountId })
      .from(account)
      .where(
        allowedUserIds !== null && allowedUserIds.length > 0
          ? and(eq(account.providerId, "atlassian"), inArray(account.userId, allowedUserIds))
          : allowedUserIds !== null
            ? and(eq(account.providerId, "atlassian"), eq(account.userId, "")) // empty set
            : eq(account.providerId, "atlassian"),
      )
  );

  // If manager-scoped, remove any Jira-aggregated members whose accountId is not in the
  // mapped set (i.e., not one of the allowed DB users).
  if (allowedUserIds !== null) {
    const allowedAccountIds = new Set((mappedAccounts ?? []).map((a) => a.accountId));
    for (const [accountId] of memberAggregates) {
      if (!allowedAccountIds.has(accountId)) {
        memberAggregates.delete(accountId);
      }
    }
  }

  // After aggregating Jira issues, fetch timesheet entries per member and add time
  // Also fetch all timesheets for mapped accounts in this period to ensure we include members with 0 issues
  const tsWhereClause =
    allowedUserIds !== null && allowedUserIds.length > 0
      ? and(
          gte(timesheetEntry.date, fromDateString),
          lte(timesheetEntry.date, toDateString),
          inArray(timesheetEntry.userId, allowedUserIds),
        )
      : allowedUserIds !== null
        ? and(
            gte(timesheetEntry.date, fromDateString),
            lte(timesheetEntry.date, toDateString),
            eq(timesheetEntry.userId, ""), // empty set — returns nothing
          )
        : and(gte(timesheetEntry.date, fromDateString), lte(timesheetEntry.date, toDateString));

  const { data: tsRows, error: tsError } = await tryCatch(
    db
      .select({
        userId: timesheetEntry.userId,
        hours: timesheetEntry.hours,
        category: timesheetEntry.category,
        jiraIssueKey: timesheetEntry.jiraIssueKey,
        source: timesheetEntry.source,
        description: timesheetEntry.description,
        atlassianName: timesheetEntry.atlassianName,
      })
      .from(timesheetEntry)
      .where(tsWhereClause)
  );

  if (!tsError && tsRows) {
    for (const row of tsRows) {
      const mapped = mappedAccounts?.find(a => a.userId === row.userId);
      const accountId = mapped?.accountId ?? row.userId;

      let aggregate = memberAggregates.get(accountId);
      if (!aggregate) {
        if (!mapped) continue; // Only report on users who linked Atlassian

        aggregate = {
          accountId: accountId,
          displayName: row.atlassianName ?? null,
          totalIssues: 0,
          totalTimeSpentSeconds: 0,
          issuesByStatus: {},
          issuesByType: {},
          issuesByProject: {},
          timeByCategory: {},
          timeByType: {},
          timeByProject: {},
        };
        memberAggregates.set(accountId, aggregate);
      } else if (row.atlassianName) {
        aggregate.displayName = row.atlassianName;
      }

      const seconds = Math.round((row.hours ?? 0) * 3600);
      if (seconds <= 0) continue;

      aggregate.totalTimeSpentSeconds += seconds;

      const cat = row.category ?? "Unknown";
      aggregate.timeByCategory[cat] = (aggregate.timeByCategory[cat] ?? 0) + seconds;

      const issueKey = row.jiraIssueKey;
      if (issueKey && issueMetadata.has(issueKey)) {
        const meta = issueMetadata.get(issueKey)!;
        aggregate.timeByType[meta.type] = (aggregate.timeByType[meta.type] ?? 0) + seconds;
        aggregate.timeByProject[meta.project] = (aggregate.timeByProject[meta.project] ?? 0) + seconds;
      } else if (issueKey) {
        aggregate.timeByType["Unknown"] = (aggregate.timeByType["Unknown"] ?? 0) + seconds;
        aggregate.timeByProject["Unknown"] = (aggregate.timeByProject["Unknown"] ?? 0) + seconds;
      } else {
        const isBitbucket = isBitbucketEntry(row);
        let sourceLabel = "Unknown";
        if (row.source) {
          sourceLabel = row.source.charAt(0).toUpperCase() + row.source.slice(1);
        } else if (isBitbucket) {
          sourceLabel = "Bitbucket";
        }

        const typeLabel = isBitbucket ? BITBUCKET_TYPE_LABEL : "Unknown";

        aggregate.timeByType[typeLabel] = (aggregate.timeByType[typeLabel] ?? 0) + seconds;
        aggregate.timeByProject[sourceLabel] = (aggregate.timeByProject[sourceLabel] ?? 0) + seconds;
      }
    }
  }

  // 4. Aggregate team-level totals
  const membersList = Array.from(memberAggregates.values());
  const teamTotalIssues = membersList.reduce((sum, m) => sum + m.totalIssues, 0);
  const teamTotalTime = membersList.reduce((sum, m) => sum + m.totalTimeSpentSeconds, 0);

  const teamIssuesByStatus: Record<string, number> = {};
  const teamIssuesByType: Record<string, number> = {};
  const teamIssuesByProject: Record<string, number> = {};
  const teamTimeByCategory: Record<string, number> = {};
  const teamTimeByType: Record<string, number> = {};
  const teamTimeByProject: Record<string, number> = {};

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

    for (const [cat, secs] of Object.entries(member.timeByCategory)) {
      teamTimeByCategory[cat] = (teamTimeByCategory[cat] ?? 0) + secs;
    }
    for (const [type, secs] of Object.entries(member.timeByType)) {
      teamTimeByType[type] = (teamTimeByType[type] ?? 0) + secs;
    }
    for (const [project, secs] of Object.entries(member.timeByProject)) {
      teamTimeByProject[project] = (teamTimeByProject[project] ?? 0) + secs;
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
    timeByCategory: teamTimeByCategory,
    timeByType: teamTimeByType,
    timeByProject: teamTimeByProject,
    members: membersList,
  });
});

export default router;

