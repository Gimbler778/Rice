import { api } from "@/lib/api-client";
import type { LearningEntry } from "@/types/timesheet";
import type { ApiSuccessResponse } from "@/types/integrations";

export type LearningTag = "tech" | "product" | "process";

export type LearningUpsertInput = {
  title: string;
  notes?: string;
  tag?: LearningTag | null;
};

export type LearningResponse = {
  entry: LearningEntry | null;
  streak: number;
};

export async function fetchLearning(date: string): Promise<LearningResponse> {
  const response = await api.get<ApiSuccessResponse<LearningResponse>>(
    `/api/learning/${date}`,
  );
  return response.data;
}

export async function upsertLearning(
  date: string,
  payload: LearningUpsertInput,
): Promise<LearningResponse> {
  const response = await api.put<
    ApiSuccessResponse<LearningResponse>,
    LearningUpsertInput
  >(`/api/learning/${date}`, payload);
  return response.data;
}
