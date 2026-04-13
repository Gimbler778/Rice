import { Router } from "express";
import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { account } from "@/db/schema";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import { fetchAllJiraIssues, resolveJiraResource } from "@/lib/jira";
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

type BitbucketWorkspace = {
  slug?: string;
};

type BitbucketRepository = {
  fullName: string;
  slug: string;
  workspace: string;
  htmlUrl: string | null;
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
    projectKey: string | null;
    projectName: string | null;
    issueType: string | null;
    status: string | null;
    assignee: string | null;
    parentKey: string | null;
    labels: string[];
    linkedIssueKeys: string[];
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

function buildBitbucketBasicAuthHeader() {
  const credentials = `${env.BITBUCKET_CLIENT_ID}:${env.BITBUCKET_CLIENT_SECRET}`;
  return `Basic ${Buffer.from(credentials).toString("base64")}`;
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
        projectKey: issue.projectKey,
        projectName: issue.projectName,
        issueType: issue.issueType,
        status: issue.status,
        assignee: issue.assignee,
        parentKey: issue.parentKey,
        labels: issue.labels,
        linkedIssueKeys: issue.linkedIssueKeys,
      },
    };
  });
}

async function fetchBitbucketEntries(accountEntry: ConnectedAccount): Promise<DashboardEntry[]> {
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

  repositories = repositories.slice(0, 3);
  const entries: DashboardEntry[] = [];

  const fetchRepositoryCommits = async (token: string, repository: BitbucketRepository) => {
    const commitsResponse = await fetch(
      `https://api.bitbucket.org/2.0/repositories/${repository.workspace}/${repository.slug}/commits?pagelen=3`,
      {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
      },
    );

    if (!commitsResponse.ok) {
      const errorText = await commitsResponse.text();
      throw new BitbucketApiError(
        commitsResponse.status,
        `Unable to fetch Bitbucket commits (${commitsResponse.status}): ${errorText || commitsResponse.statusText}`,
      );
    }

    return commitsResponse.json() as Promise<{
      values?: Array<{
        hash?: string;
        date?: string;
        message?: string;
        links?: {
          html?: {
            href?: string;
          };
        };
      }>;
    }>;
  };

  for (const repository of repositories) {
    let commitsPayload: {
      values?: Array<{
        hash?: string;
        date?: string;
        message?: string;
        links?: {
          html?: {
            href?: string;
          };
        };
      }>;
    };

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

    for (const commit of commitsPayload.values ?? []) {
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
      });
    }
  }

  return entries;
}

router.get("/integrations/status", async (req, res) => {
  const { userId, error: sessionError } = await resolveSessionUserId(req.headers);

  if (sessionError) {
    logger.error({ err: sessionError }, "Failed to resolve auth session");
    return sendError(
      res,
      RESPONSE_CODE.INTERNAL_SERVER_ERROR,
      "Failed to resolve auth session",
    );
  }

  if (!userId) {
    return sendError(res, RESPONSE_CODE.UNAUTHORIZED, "Unauthorized");
  }

  const { data: linkedAccounts, error: accountError } = await fetchConnectedAccounts(userId);

  if (accountError) {
    logger.error(
      { err: accountError, userId },
      "Failed to fetch linked accounts",
    );
    return sendError(
      res,
      RESPONSE_CODE.INTERNAL_SERVER_ERROR,
      "Failed to fetch linked account status",
    );
  }

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
  const { userId, error: sessionError } = await resolveSessionUserId(req.headers);

  if (sessionError) {
    logger.error({ err: sessionError }, "Failed to resolve auth session");
    return sendError(
      res,
      RESPONSE_CODE.INTERNAL_SERVER_ERROR,
      "Failed to resolve auth session",
    );
  }

  if (!userId) {
    return sendError(res, RESPONSE_CODE.UNAUTHORIZED, "Unauthorized");
  }

  const { data: linkedAccounts, error: accountError } = await fetchConnectedAccounts(userId);
  if (accountError) {
    logger.error(
      { err: accountError, userId },
      "Failed to fetch linked accounts",
    );
    return sendError(
      res,
      RESPONSE_CODE.INTERNAL_SERVER_ERROR,
      "Failed to fetch linked account data",
    );
  }

  const { connectedProviders, atlassianConnected, bitbucketConnected } =
    getConnectionStatus(linkedAccounts);
  const atlassianToken = linkedAccounts.find(
    (entry) => entry.providerId === "atlassian",
  )?.accessToken;
  const directBitbucketAccount = linkedAccounts.find(
    (entry) => entry.providerId === "bitbucket",
  );

  const partialFailures: string[] = [];
  let entries: DashboardEntry[] = [];

  if (atlassianToken) {
    const { data, error } = await tryCatch(fetchJiraEntries(atlassianToken));
    if (error) {
      logger.warn({ err: error, userId }, "Failed to fetch Jira entries");
      partialFailures.push("jira");
    } else {
      entries = [...entries, ...data];
    }
  }

  if (directBitbucketAccount) {
    const { data, error } = await tryCatch(
      fetchBitbucketEntries(directBitbucketAccount),
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
