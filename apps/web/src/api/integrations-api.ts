import { api } from "@/lib/api-client";
import type {
  ApiSuccessResponse,
  IntegrationStatusResponse,
  IntegrationTimesheetResponse,
} from "@/types/integrations";

function buildDayWindow(date: string) {
  const start = new Date(`${date}T00:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  return {
    from: start.toISOString(),
    to: end.toISOString(),
  };
}

export async function fetchIntegrationStatus() {
  const response = await api.get<ApiSuccessResponse<IntegrationStatusResponse>>(
    "/api/integrations/status",
  );
  return response.data;
}

export async function fetchIntegrationTimesheet(date?: string) {
  const response = await api.get<ApiSuccessResponse<IntegrationTimesheetResponse>>(
    "/api/integrations/timesheet",
    {
      params: date ? buildDayWindow(date) : undefined,
    },
  );
  return response.data;
}
