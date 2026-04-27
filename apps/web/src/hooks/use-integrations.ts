import { useQuery } from "@tanstack/react-query";

import {
  fetchIntegrationStatus,
  fetchIntegrationTimesheet,
} from "@/api/integrations-api";
import { queryKeys } from "@/lib/query-keys";

export function useIntegrationStatus(enabled = true) {
  return useQuery({
    queryKey: queryKeys.integrations.status(),
    queryFn: fetchIntegrationStatus,
    enabled,
  });
}

export function useIntegrationTimesheet(enabled = true, date?: string) {
  return useQuery({
    queryKey: queryKeys.integrations.timesheet(date),
    queryFn: () => fetchIntegrationTimesheet(date),
    enabled,
    refetchInterval: 30_000,
  });
}
