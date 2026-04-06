import { api } from "@/lib/api-client";
import type { IntegrationStatusResponse } from "@/types/integrations";

export function fetchIntegrationStatus() {
  return api.get<IntegrationStatusResponse>("/api/integrations/status");
}
