export const queryKeys = {
  integrations: {
    status: () => ["integration-status"] as const,
    timesheet: () => ["integration-timesheet"] as const,
    test: () => ["integration-test"] as const,
  },
} as const;
