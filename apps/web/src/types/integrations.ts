export interface IntegrationStatusResponse {
  connectedProviders: string[];
  atlassianConnected: boolean;
  bitbucketConnected: boolean;
}

export interface ApiSuccessResponse<T> {
  success: true;
  code: number;
  message: string;
  data: T;
}

export interface IntegrationTimesheetEntry {
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
}

export interface IntegrationTimesheetResponse extends IntegrationStatusResponse {
  entries: IntegrationTimesheetEntry[];
  fetchedAt: string;
  partialFailures: string[];
}
