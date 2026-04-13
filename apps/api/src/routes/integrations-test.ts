/**
 * Test endpoint for verifying Bitbucket & Atlassian OAuth data accessibility
 * Provides detailed diagnostics for integration health checks
 */

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

interface TestResult {
  providerName: string;
  isConnected: boolean;
  expiresAt?: string;
  tests: {
    name: string;
    passed: boolean;
    error?: string;
    data?: unknown;
  }[];
}

type BitbucketWorkspace = {
  slug?: string;
};

type BitbucketRepository = {
  fullName: string;
  slug: string;
  workspace: string;
};

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

async function testAtlassianIntegration(
  atlassianAccount: { accessToken: string | null; refreshToken: string | null; accessTokenExpiresAt: Date | null },
): Promise<TestResult> {
  const result: TestResult = {
    providerName: "Atlassian",
    isConnected: !!atlassianAccount.accessToken,
    expiresAt: atlassianAccount.accessTokenExpiresAt?.toISOString(),
    tests: [],
  };

  if (!atlassianAccount.accessToken) {
    result.tests.push({
      name: "Access token present",
      passed: false,
      error: "No access token found",
    });
    return result;
  }

  // Test 1: Accessible Resources
  const { data: resources, error: resourcesError } = await tryCatch(
    fetch("https://api.atlassian.com/oauth/token/accessible-resources", {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${atlassianAccount.accessToken}`,
      },
    }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`)))),
  );

  if (resourcesError) {
    result.tests.push({
      name: "Accessible resources",
      passed: false,
      error: `${resourcesError.message}`,
    });
    return result;
  }

  result.tests.push({
    name: "Accessible resources",
    passed: true,
    data: resources,
  });

  const { cloudId } = await resolveJiraResource(atlassianAccount.accessToken);

  if (!cloudId) {
    result.tests.push({
      name: "Jira cloud ID found",
      passed: false,
      error: "No Jira resource found in accessible resources",
    });
    return result;
  }

  const { data: issueTable, error: issuesError } = await tryCatch(
    fetchAllJiraIssues(atlassianAccount.accessToken, cloudId),
  );

  if (issuesError) {
    result.tests.push({
      name: "Fetch Jira issues",
      passed: false,
      error: `${issuesError.message}`,
    });
  } else {
    result.tests.push({
      name: "Fetch Jira issues",
      passed: true,
      data: {
        totalIssues: issueTable.issueCount,
        sampleIssues: issueTable.issues
          .slice(0, 2)
          .map((issue) => ({
            key: issue.key,
            summary: issue.summary,
            projectKey: issue.projectKey,
            issueType: issue.issueType,
            status: issue.status,
            assignee: issue.assignee,
            linkedIssueKeys: issue.linkedIssueKeys,
          })),
      },
    });
  }

  return result;
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
      throw new Error(`Unable to fetch Bitbucket data (${response.status}): ${await response.text()}`);
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

async function fetchBitbucketRepositories(accessToken: string) {
  const memberships = await fetchBitbucketPaginatedValues<{
    workspace?: BitbucketWorkspace;
  }>("https://api.bitbucket.org/2.0/user/workspaces?pagelen=100", accessToken);

  const workspaceSlugs = memberships
    .map((membership) => membership.workspace?.slug)
    .filter((slug): slug is string => Boolean(slug));

  const repositoriesByFullName = new Map<string, BitbucketRepository>();

  for (const workspaceSlug of workspaceSlugs) {
    const permissions = await fetchBitbucketPaginatedValues<{
      repository?: {
        full_name?: string;
        slug?: string;
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
      });
    }
  }

  if (!repositoriesByFullName.size) {
    for (const workspaceSlug of workspaceSlugs) {
      const workspaceRepositories = await fetchBitbucketPaginatedValues<{
        full_name?: string;
        slug?: string;
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
        });
      }
    }
  }

  return Array.from(repositoriesByFullName.values());
}

async function refreshBitbucketAccessToken(refreshToken: string) {
  const tokenResponse = await fetch("https://bitbucket.org/site/oauth2/access_token", {
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
  });

  if (!tokenResponse.ok) {
    throw new Error(
      `Token refresh failed (${tokenResponse.status}): ${await tokenResponse.text()}`,
    );
  }

  const payload = (await tokenResponse.json()) as { access_token?: string };
  if (!payload.access_token) {
    throw new Error("No access token in refresh response");
  }

  return payload.access_token;
}

async function testBitbucketIntegration(
  bitbucketAccount: { accessToken: string | null; refreshToken: string | null; accessTokenExpiresAt: Date | null },
): Promise<TestResult> {
  const result: TestResult = {
    providerName: "Bitbucket",
    isConnected: !!bitbucketAccount.accessToken,
    expiresAt: bitbucketAccount.accessTokenExpiresAt?.toISOString(),
    tests: [],
  };

  if (!bitbucketAccount.accessToken) {
    result.tests.push({
      name: "Access token present",
      passed: false,
      error: "No access token found",
    });
    return result;
  }

  let accessToken = bitbucketAccount.accessToken;

  // Check if token needs refresh
  if (
    bitbucketAccount.accessTokenExpiresAt &&
    bitbucketAccount.accessTokenExpiresAt.getTime() <= Date.now() &&
    bitbucketAccount.refreshToken
  ) {
    const { data: refreshedToken, error: refreshError } = await tryCatch(
      refreshBitbucketAccessToken(bitbucketAccount.refreshToken),
    );

    if (refreshError) {
      result.tests.push({
        name: "Token refresh",
        passed: false,
        error: `${refreshError.message}`,
      });
      return result;
    }

    accessToken = refreshedToken;
    result.tests.push({
      name: "Token refresh",
      passed: true,
    });
  } else {
    result.tests.push({
      name: "Token freshness",
      passed: !bitbucketAccount.accessTokenExpiresAt || bitbucketAccount.accessTokenExpiresAt.getTime() > Date.now(),
    });
  }

  // Test 1: User Profile
  const { data: profile, error: profileError } = await tryCatch(
    fetch("https://api.bitbucket.org/2.0/user", {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`)))),
  );

  if (profileError) {
    result.tests.push({
      name: "Fetch user profile",
      passed: false,
      error: `${profileError.message}`,
    });
  } else {
    result.tests.push({
      name: "Fetch user profile",
      passed: true,
      data: {
        username: (profile as { username?: string }).username,
        displayName: (profile as { display_name?: string }).display_name,
      },
    });
  }

  // Test 2: Repositories
  const { data: repos, error: reposError } = await tryCatch(
    fetchBitbucketRepositories(accessToken),
  );

  if (reposError) {
    result.tests.push({
      name: "Fetch repositories",
      passed: false,
      error: `${reposError.message}`,
    });
  } else {
    const repoCount = repos.length;
    result.tests.push({
      name: "Fetch repositories",
      passed: true,
      data: {
        totalRepos: repoCount,
        repos: repos.slice(0, 3).map((r) => ({ fullName: r.fullName, slug: r.slug })),
      },
    });

    // Test 3 & 4: Commits and PRs for each repo
    const firstRepo = repos.at(0);

    if (firstRepo) {
      // Test commits
      const { data: commits, error: commitsError } = await tryCatch(
        fetch(`https://api.bitbucket.org/2.0/repositories/${firstRepo.workspace}/${firstRepo.slug}/commits?pagelen=3`, {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
        }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`)))),
      );

      if (commitsError) {
        result.tests.push({
          name: `Fetch commits from ${firstRepo.fullName}`,
          passed: false,
          error: `${commitsError.message}`,
        });
      } else {
        const commitCount = ((commits as { values?: unknown[] }).values ?? []).length;
        result.tests.push({
          name: `Fetch commits from ${firstRepo.fullName}`,
          passed: true,
          data: {
            totalCommits: commitCount,
            commits: ((commits as { values?: Array<{ hash?: string; message?: string }> }).values ?? [])
              .slice(0, 2)
              .map((c) => ({ hash: c.hash?.slice(0, 7), message: (c.message ?? "").split("\n")[0] })),
          },
        });
      }

      // Test PRs
      const { data: prs, error: prsError } = await tryCatch(
        fetch(`https://api.bitbucket.org/2.0/repositories/${firstRepo.workspace}/${firstRepo.slug}/pullrequests?state=OPEN,MERGED&pagelen=3`, {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
        }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`)))),
      );

      if (prsError) {
        result.tests.push({
          name: `Fetch PRs from ${firstRepo.fullName}`,
          passed: false,
          error: `${prsError.message}`,
        });
      } else {
        const prCount = ((prs as { values?: unknown[] }).values ?? []).length;
        result.tests.push({
          name: `Fetch PRs from ${firstRepo.fullName}`,
          passed: true,
          data: {
            totalPRs: prCount,
            prs: ((prs as { values?: Array<{ id?: number; title?: string; state?: string }> }).values ?? [])
              .slice(0, 2)
              .map((p) => ({ id: p.id, title: p.title, state: p.state })),
          },
        });
      }
    }
  }

  return result;
}

router.get("/integrations/test", async (req, res) => {
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

  const { data: linkedAccounts, error: accountError } = await tryCatch(
    db
      .select()
      .from(account)
      .where(eq(account.userId, userId)),
  );

  if (accountError) {
    logger.error({ err: accountError, userId }, "Failed to fetch linked accounts");
    return sendError(
      res,
      RESPONSE_CODE.INTERNAL_SERVER_ERROR,
      "Failed to fetch linked accounts",
    );
  }

  const testResults: TestResult[] = [];

  for (const acc of linkedAccounts) {
    if (acc.providerId === "atlassian") {
      const result = await testAtlassianIntegration({
        accessToken: acc.accessToken,
        refreshToken: acc.refreshToken,
        accessTokenExpiresAt: acc.accessTokenExpiresAt,
      });
      testResults.push(result);
    } else if (acc.providerId === "bitbucket") {
      const result = await testBitbucketIntegration({
        accessToken: acc.accessToken,
        refreshToken: acc.refreshToken,
        accessTokenExpiresAt: acc.accessTokenExpiresAt,
      });
      testResults.push(result);
    }
  }

  const allTestsPassed = testResults.every((result) =>
    result.tests.every((test) => test.passed),
  );

  return sendSuccess(
    res,
    RESPONSE_CODE.OK,
    allTestsPassed ? "All integration tests passed" : "Some integration tests failed",
    {
      userId,
      testResults,
      allTestsPassed,
      testedAt: new Date().toISOString(),
    },
  );
});

export default router;
