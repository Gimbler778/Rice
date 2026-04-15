export const queryKeys = {
  integrations: {
    status: () => ["integration-status"] as const,
    timesheet: () => ["integration-timesheet"] as const,
  },
} as const;
