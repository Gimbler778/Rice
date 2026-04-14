import { api } from "@/lib/api-client";
import type {
  ApiSuccessResponse,
  IntegrationStatusResponse,
  IntegrationTimesheetResponse,
} from "@/types/integrations";

export async function fetchIntegrationStatus() {
  const response = await api.get<ApiSuccessResponse<IntegrationStatusResponse>>(
    "/api/integrations/status",
  );
  return response.data;
}

export async function fetchIntegrationTimesheet() {
  const response = await api.get<ApiSuccessResponse<IntegrationTimesheetResponse>>(
    "/api/integrations/timesheet",
  );
  return response.data;
}
