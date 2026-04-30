import { ApiClient } from "@/lib/api-client";
import type { WeeklySubmission } from "@/types/weekly-submission";

export interface WeeklySubmissionResponse {
  success: boolean;
  code: number;
  message: string;
  data?: WeeklySubmission | any;
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
  approve: async (weekStartDate: string, approverComment?: string): Promise<WeeklySubmission> => {
    const response = await ApiClient.patch<WeeklySubmissionResponse>(
      `/api/timesheets/week/${weekStartDate}/approve`,
      { weekStartDate, approverComment }
    );
    return response.data as WeeklySubmission;
  },

  /**
   * Dismiss a week submission (admin or manager only)
   */
  dismiss: async (weekStartDate: string, dismissComment?: string): Promise<WeeklySubmission> => {
    const response = await ApiClient.patch<WeeklySubmissionResponse>(
      `/api/timesheets/week/${weekStartDate}/dismiss`,
      { weekStartDate, dismissComment }
    );
    return response.data as WeeklySubmission;
  },
};
