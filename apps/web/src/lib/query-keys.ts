export const queryKeys = {
  demo: () => ["demo-data"] as const,
  integrations: {
    status: () => ["integration-status"] as const,
  },
} as const;
