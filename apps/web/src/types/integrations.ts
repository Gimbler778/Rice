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
}

export interface IntegrationTimesheetResponse extends IntegrationStatusResponse {
  entries: IntegrationTimesheetEntry[];
  fetchedAt: string;
  partialFailures: string[];
}
