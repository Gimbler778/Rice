export const queryKeys = {
  integrations: {
    status: () => ["integration-status"] as const,
    timesheet: (date?: string) => ["integration-timesheet", date ?? null] as const,
  },
} as const;
