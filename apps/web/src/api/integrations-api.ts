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

export async function testIntegrations() {
  const response = await api.get<
    ApiSuccessResponse<{
      userId: string;
      testResults: Array<{
        providerName: string;
        isConnected: boolean;
        expiresAt?: string;
        tests: Array<{
          name: string;
          passed: boolean;
          error?: string;
          data?: unknown;
        }>;
      }>;
      allTestsPassed: boolean;
      testedAt: string;
    }>
  >("/api/integrations/test");
  return response.data;
}
