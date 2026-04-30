export type WeeklySubmissionStatus = "draft" | "submitted" | "approved" | "dismissed";

export interface WeeklySubmission {
  id: string;
  userId: string;
  weekStartDate: string;
  status: WeeklySubmissionStatus;
  submittedAt: string | null;
  approvedBy: string | null;
  approverRole: "admin" | "manager" | null;
  approverComment: string | null;
  dismissedBy: string | null;
  dismissComment: string | null;
  createdAt: string;
  updatedAt: string;
}
