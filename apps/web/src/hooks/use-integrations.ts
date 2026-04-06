import { useQuery } from "@tanstack/react-query";

import { fetchIntegrationStatus } from "@/api/integrations-api";
import { queryKeys } from "@/lib/query-keys";

export function useIntegrationStatus(enabled = true) {
  return useQuery({
    queryKey: queryKeys.integrations.status(),
    queryFn: fetchIntegrationStatus,
    enabled,
  });
}
