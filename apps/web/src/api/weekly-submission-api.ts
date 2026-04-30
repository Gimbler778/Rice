import { ApiClient } from "@/lib/api-client";
import type { WeeklySubmission } from "@/types/weekly-submission";

export interface WeeklySubmissionResponse {
  success: boolean;
  code: number;
  message: string;
  data?: WeeklySubmission | any;
}

export interface WeeklySubmissionListResponse {
  success: boolean;
  code: number;
  message: string;
  data?: {
    count: number;
    rows: Array<WeeklySubmission & {
      userName?: string | null;
      userEmail?: string | null;
    }>;
  };
}

export const weeklySubmissionApi = {
  /**
   * Save a week as draft
   */
  saveDraft: async (weekStartDate: string): Promise<WeeklySubmission> => {
    const response = await ApiClient.post<WeeklySubmissionResponse>(
      "/api/timesheets/week/draft",
      { weekStartDate }
    );
    return response.data as WeeklySubmission;
  },

  /**
   * Submit a week (only allowed on Friday or later)
   */
  submit: async (weekStartDate: string): Promise<WeeklySubmission> => {
    const response = await ApiClient.post<WeeklySubmissionResponse>(
      "/api/timesheets/week/submit",
      { weekStartDate }
    );
    return response.data as WeeklySubmission;
  },

  /**
   * Get the current status of a week submission
   */
  getStatus: async (weekStartDate: string): Promise<WeeklySubmission | any> => {
    const response = await ApiClient.get<WeeklySubmissionResponse>(
      `/api/timesheets/week/${weekStartDate}`
    );
    return response.data as WeeklySubmission;
  },

  /**
   * Approve a week submission (admin only)
   */
  approve: async (weekStartDate: string, userId: string, approverComment?: string): Promise<WeeklySubmission> => {
    const response = await ApiClient.patch<WeeklySubmissionResponse>(
      `/api/timesheets/week/${weekStartDate}/approve`,
      { weekStartDate, userId, approverComment }
    );
    return response.data as WeeklySubmission;
  },

  /**
   * Dismiss a week submission (admin or manager only)
   */
  dismiss: async (weekStartDate: string, userId: string, dismissComment?: string): Promise<WeeklySubmission> => {
    const response = await ApiClient.patch<WeeklySubmissionResponse>(
      `/api/timesheets/week/${weekStartDate}/dismiss`,
      { weekStartDate, userId, dismissComment }
    );
    return response.data as WeeklySubmission;
  },
  /**
   * List submissions for managers/admins
   */
  listSubmitted: async (status = "submitted", from?: string, to?: string) => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (from) params.set("from", from);
    if (to) params.set("to", to);

    const response = await ApiClient.get<WeeklySubmissionListResponse>(`/api/timesheets/submissions?${params.toString()}`);
    return response;
  },
};
