type JiraAccessibleResource = {
  id?: string;
  url?: string;
  scopes?: string[];
};

type JiraIssueFieldUser = {
  displayName?: string;
} | null;

type JiraIssueFieldLink = {
  inwardIssue?: {
    key?: string;
  };
  outwardIssue?: {
    key?: string;
  };
};

export type JiraIssueRecord = {
  id: string;
  key: string;
  self: string | null;
  summary: string;
  timeSpentSeconds: number;
  updated: string;
  created: string | null;
  projectKey: string | null;
  projectName: string | null;
  issueType: string | null;
  status: string | null;
  assignee: string | null;
  parentKey: string | null;
  labels: string[];
  linkedIssueKeys: string[];
};

type JiraSearchResponse = {
  issues?: Array<{
    id?: string;
    key?: string;
    self?: string;
    fields?: {
      summary?: string;
      timespent?: number | null;
      updated?: string;
      created?: string;
      project?: {
        key?: string;
        name?: string;
      };
      issuetype?: {
        name?: string;
      };
      status?: {
        name?: string;
      };
      assignee?: JiraIssueFieldUser;
      parent?: {
        key?: string;
      };
      labels?: string[];
      issuelinks?: JiraIssueFieldLink[];
    };
  }>;
  isLast?: boolean;
  nextPageToken?: string;
};

export class AtlassianApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "AtlassianApiError";
    this.status = status;
  }
}

export function isAtlassianUnauthorizedError(error: unknown) {
  return error instanceof AtlassianApiError && error.status === 401;
}

function uniqueStrings(values: Array<string | undefined | null>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

export async function resolveJiraResources(accessToken: string) {
  const resourcesResponse = await fetch(
    "https://api.atlassian.com/oauth/token/accessible-resources",
    {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!resourcesResponse.ok) {
    const errorText = await resourcesResponse.text();
    throw new AtlassianApiError(
      resourcesResponse.status,
      `Unable to resolve Atlassian resources (${resourcesResponse.status}): ${errorText || resourcesResponse.statusText}`,
    );
  }

  const resources = (await resourcesResponse.json()) as JiraAccessibleResource[];
  return resources
    .filter(
      (resource) =>
        (resource.scopes ?? []).some((scope) => scope.startsWith("read:jira")) ||
        Boolean(resource.url?.includes("atlassian.net")),
    )
    .flatMap((resource) =>
      resource.id
        ? [
          {
            cloudId: resource.id,
            jiraSiteUrl: resource.url ?? null,
          },
        ]
        : [],
    );
}

export async function fetchAllJiraIssues(accessToken: string, cloudId: string) {
  const issueTable = new Map<string, JiraIssueRecord>();
  const pageSize = 100;
  const boundedJql = "updated >= -90d ORDER BY updated DESC";
  let nextPageToken: string | undefined;

  while (true) {
    const response = await fetch(
      `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/search/jql`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          // Atlassian rejects unbounded queries on this endpoint, so always scope by recency.
          jql: boundedJql,
          maxResults: pageSize,
          fields: [
            "summary",
            "timespent",
            "updated",
            "created",
            "project",
            "issuetype",
            "status",
            "assignee",
            "parent",
            "labels",
            "issuelinks",
          ],
          ...(nextPageToken ? { nextPageToken } : {}),
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new AtlassianApiError(
        response.status,
        `Unable to fetch Jira issues (${response.status}): ${errorText || response.statusText}`,
      );
    }

    const payload = (await response.json()) as JiraSearchResponse;

    for (const issue of payload.issues ?? []) {
      const linkedIssueKeys = uniqueStrings(
        (issue.fields?.issuelinks ?? []).flatMap((link) => [
          link.inwardIssue?.key,
          link.outwardIssue?.key,
        ]),
      );

      const record: JiraIssueRecord = {
        id: issue.id ?? issue.key ?? crypto.randomUUID(),
        key: issue.key ?? "",
        self: issue.self ?? null,
        summary: issue.fields?.summary ?? "Untitled issue",
        timeSpentSeconds: issue.fields?.timespent ?? 0,
        updated: issue.fields?.updated ?? new Date().toISOString(),
        created: issue.fields?.created ?? null,
        projectKey: issue.fields?.project?.key ?? null,
        projectName: issue.fields?.project?.name ?? null,
        issueType: issue.fields?.issuetype?.name ?? null,
        status: issue.fields?.status?.name ?? null,
        assignee: issue.fields?.assignee?.displayName ?? null,
        parentKey: issue.fields?.parent?.key ?? null,
        labels: issue.fields?.labels ?? [],
        linkedIssueKeys,
      };

      issueTable.set(record.id, record);
    }

    if (payload.isLast || !payload.nextPageToken) {
      break;
    }

    nextPageToken = payload.nextPageToken;
  }

  return {
    issues: Array.from(issueTable.values()),
    issueCount: issueTable.size,
  };
}
