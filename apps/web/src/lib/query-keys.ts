export const queryKeys = {
  integrations: {
    status: () => ["integration-status"] as const,
    timesheet: (date?: string) => ["integration-timesheet", date ?? null] as const,
    teams: () => ["integration-teams"] as const,
    teamReport: (teamId: string, period?: string) =>
      ["integration-team-report", teamId, period ?? "week"] as const,
  },
  notifications: {
    all: () => ["notifications"] as const,
  },
} as const;
