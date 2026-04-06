import { useQuery } from "@tanstack/react-query";

import { fetchIntegrationStatus } from "@/api/integrations-api";

export function useIntegrationStatus(enabled = true) {
  return useQuery({
    queryKey: ["integration-status"],
    queryFn: fetchIntegrationStatus,
    enabled,
  });
}
