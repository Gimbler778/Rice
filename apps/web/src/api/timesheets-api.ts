import { api } from "@/lib/api-client";
import type { EntryCategory, EntryStatus, TimesheetEntry } from "@/types/timesheet";
import type { ApiSuccessResponse } from "@/types/integrations";

type TimesheetByDateResponse = {
  date: string;
  entries: TimesheetEntry[];
};

type TimesheetEntriesResponse = {
  count: number;
  entries: TimesheetEntry[];
};

type CopyYesterdayResponse = {
  targetDate: string;
  copiedCount: number;
  entries: TimesheetEntry[];
};

export type TimesheetEntryInput = {
  date: string;
  category: EntryCategory;
  description: string;
  jiraIssueKey?: string;
  hours: number;
  status?: EntryStatus;
};

export type TimesheetEntryUpdateInput = Partial<
  Omit<TimesheetEntryInput, "date"> & { jiraIssueKey: string | null }
>;

export type TimesheetEntriesFilters = {
  from?: string;
  to?: string;
  category?: EntryCategory;
  status?: EntryStatus;
};

export async function fetchTimesheetByDate(date: string) {
  const response = await api.get<ApiSuccessResponse<TimesheetByDateResponse>>(
    `/api/timesheets/date/${date}`,
  );
  return response.data;
}

export async function fetchTimesheetEntries(filters: TimesheetEntriesFilters = {}) {
  const response = await api.get<ApiSuccessResponse<TimesheetEntriesResponse>>(
    "/api/timesheets/entries",
    { params: filters },
  );
  return response.data;
}

export async function createTimesheetEntry(payload: TimesheetEntryInput) {
  const response = await api.post<ApiSuccessResponse<TimesheetEntry>, TimesheetEntryInput>(
    "/api/timesheets/entries",
    payload,
  );
  return response.data;
}

export async function updateTimesheetEntry(
  id: string,
  payload: TimesheetEntryUpdateInput,
) {
  const response = await api.patch<
    ApiSuccessResponse<TimesheetEntry>,
    TimesheetEntryUpdateInput
  >(`/api/timesheets/entries/${id}`, payload);
  return response.data;
}

export async function deleteTimesheetEntry(id: string) {
  const response = await api.delete<ApiSuccessResponse<{ id: string }>>(
    `/api/timesheets/entries/${id}`,
  );
  return response.data;
}

export async function copyYesterdayTimesheetEntries(date?: string) {
  const response = await api.post<ApiSuccessResponse<CopyYesterdayResponse>, { date?: string }>(
    "/api/timesheets/copy-yesterday",
    { date },
  );
  return response.data;
}
