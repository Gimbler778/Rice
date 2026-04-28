import { QueryClient, type DefaultOptions } from "@tanstack/react-query";

const queryConfig: DefaultOptions = {
  queries: {
    refetchOnWindowFocus: false,
    retry: (failureCount, error: any) => {
      // Don't retry 401/403 auth errors or 404 not found
      if (
        error?.response?.status === 401 ||
        error?.response?.status === 403 ||
        error?.response?.status === 404
      ) {
        return false;
      }
      // Retry network errors and 5xx up to 2 times
      return failureCount < 2;
    },
    retryDelay: (attemptIndex) =>
      Math.min(1000 * Math.pow(2, attemptIndex), 10000), // Exponential backoff: 1s, 2s, 4s, capped at 10s
    staleTime: 5 * 60 * 1000, // 5 minutes
  },
};

export const queryClient = new QueryClient({
  defaultOptions: queryConfig,
});
