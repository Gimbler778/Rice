// Enums
/** All valid work categories. "manual_other" is for free-text custom entries. */
export type EntryCategory =
  | "development"
  | "code_review"
  | "testing"
  | "documentation"
  | "meetings"
  | "admin"
  | "org_sessions"
  | "events"
  | "support"
  | "learning"
  | "manual_other";

/** Status of a timesheet day or weekly submission. */
export type TimesheetStatus = "draft" | "submitted" | "approved";

/** Status of an individual log entry (used in logs history page). */
export type EntryStatus = "accepted" | "in-progress" | "on-hold";

/** Source system for an entry reference. */
export type EntrySource = "jira" | "bitbucket";

// Core entity types

/** A single timesheet entry (one row in the entry table). */
export interface TimesheetEntry {
  id: string;
  date: string; // ISO date string "YYYY-MM-DD"
  category: EntryCategory;
  description: string;
  jiraIssueKey?: string; // e.g. "RICE-42"
  source?: EntrySource;
  sourceLink?: string;
  hours: number; // decimal, e.g. 2.5
  status: EntryStatus;
}

/** Represents a single day's timesheet state. */
export interface TimesheetDay {
  date: string; // ISO date string "YYYY-MM-DD"
  entries: TimesheetEntry[];
  totalHours: number;
  status: TimesheetStatus;
  targetHours: number; // typically 8
}

/** Learning of the day entry. */
export interface LearningEntry {
  id: string;
  date: string;
  title: string;
  notes?: string;
  tag?: "tech" | "product" | "process";
  linkedEntryIds?: string[];
}

/** A suggestion card from JIRA or Bitbucket. */
export interface Suggestion {
  id: string;
  source: EntrySource;
  title: string;
  subtitle: string; // e.g. "Transitioned · 2h ago" or "rice-frontend · last commit 1h ago"
  status?: string; // e.g. "In progress", "In review"
  estimatedHours?: number;
  suggestedCategory: EntryCategory;
  jiraIssueKey?: string;
  sourceLink?: string;
}

/** Cross-check prompt banner shown in the suggestions panel. */
export interface CrossCheckPrompt {
  id: string;
  message: string;
  suggestedCategory: EntryCategory;
  source: EntrySource;
}

// Category display helpers

export const CATEGORY_LABELS: Record<EntryCategory, string> = {
  development: "Development",
  code_review: "Code review",
  testing: "Testing",
  documentation: "Documentation",
  meetings: "Meetings",
  admin: "Admin",
  org_sessions: "Org sessions",
  events: "Events",
  support: "Support",
  learning: "Learning",
  manual_other: "Other",
};

/** Tailwind classes for each category badge. */
export const CATEGORY_BADGE_CLASSES: Record<EntryCategory, string> = {
  development: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200",
  code_review: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  testing: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  documentation: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  meetings: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  admin: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  org_sessions: "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200",
  events: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  support: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  learning: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  manual_other: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
};


/** Today's date as ISO string (used to seed mock data). */
const TODAY = new Date().toISOString().split("T")[0];

/**
 * MOCK: Today's timesheet entries.
 * Replace with: useQuery({ queryKey: ['entries', date], queryFn: () => fetch(`/api/timesheets/${date}`) })
 */
export const mockTodayEntries: TimesheetEntry[] = [
  {
    id: "entry-1",
    date: TODAY,
    category: "development",
    description: "Timesheet entry table component",
    jiraIssueKey: "RICE-42",
    hours: 2.5,
    status: "in-progress",
  },
  {
    id: "entry-2",
    date: TODAY,
    category: "code_review",
    description: "PR review — auth middleware",
    jiraIssueKey: "RICE-38",
    hours: 1.0,
    status: "in-progress",
  },
  {
    id: "entry-3",
    date: TODAY,
    category: "meetings",
    description: "Daily standup",
    hours: 0.5,
    status: "in-progress",
  },
  {
    id: "entry-4",
    date: TODAY,
    category: "testing",
    description: "Unit tests — entry CRUD hooks",
    jiraIssueKey: "RICE-44",
    hours: 1.5,
    status: "in-progress",
  },
  {
    id: "entry-5",
    date: TODAY,
    category: "documentation",
    description: "API contract notes for frontend",
    hours: 1.0,
    status: "in-progress",
  },
];

/**
 * MOCK: Today's learning entry.
 * Replace with: useQuery({ queryKey: ['learning', date], queryFn: () => fetch(`/api/learning/${date}`) })
 */
export const mockLearning: LearningEntry = {
  id: "learn-1",
  date: TODAY,
  title: "",
  notes: "",
  tag: undefined,
};

/**
 * MOCK: Suggestions from JIRA and Bitbucket for today.
 * Replace with: useQuery({ queryKey: ['suggestions', date], queryFn: () => fetch(`/api/suggestions?date=${date}`) })
 */
export const mockSuggestions: Suggestion[] = [
  {
    id: "sug-1",
    source: "jira",
    title: "RICE-45 · Week view calendar grid",
    subtitle: "Transitioned · 2h ago · Est. 4h",
    status: "In progress",
    estimatedHours: 4,
    suggestedCategory: "development",
    jiraIssueKey: "RICE-45",
  },
  {
    id: "sug-2",
    source: "jira",
    title: "RICE-46 · Autosave debounce logic",
    subtitle: "Commented · 4h ago",
    status: "In review",
    suggestedCategory: "development",
    jiraIssueKey: "RICE-46",
  },
  {
    id: "sug-3",
    source: "bitbucket",
    title: "feat/entry-table · 3 commits",
    subtitle: "rice-frontend · last commit 1h ago",
    suggestedCategory: "development",
  },
  {
    id: "sug-4",
    source: "bitbucket",
    title: "PR #31 · Auth middleware",
    subtitle: "Reviewed + approved · 3h ago",
    suggestedCategory: "code_review",
  },
];

/**
 * MOCK: Cross-check prompts (mismatch warnings).
 * Replace with: derived from suggestions API response
 */
export const mockCrossChecks: CrossCheckPrompt[] = [
  {
    id: "cc-1",
    message: "You reviewed 2 PRs today but have no Code Review entry logged.",
    suggestedCategory: "code_review",
    source: "bitbucket",
  },
];

// Week mock data

/** Generates mock week days for the My Week view. */
export function getMockWeekDays(): TimesheetDay[] {
  const today = new Date();
  // Get Monday of current week
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));

  return Array.from({ length: 5 }, (_, i) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    const dateStr = date.toISOString().split("T")[0];
    const isToday = dateStr === TODAY;
    const isFuture = date > today;

    // Simulate some days being complete, one incomplete, future days empty
    const hoursMap = [8.0, 7.5, 3.0, 9.0, isToday ? 6.5 : 0];
    const hours = isFuture ? 0 : hoursMap[i];
    const entryCountMap = [5, 4, 2, 6, isToday ? 5 : 0];

    return {
      date: dateStr,
      totalHours: hours,
      targetHours: 8,
      status: hours >= 8 ? "submitted" : hours > 0 ? "draft" : "draft",
      entries: Array.from({ length: isFuture ? 0 : entryCountMap[i] }, (_, j) => ({
        id: `${dateStr}-entry-${j}`,
        date: dateStr,
        category: (["development", "code_review", "meetings", "testing", "documentation"] as EntryCategory[])[j % 5],
        description: "Mock entry",
        hours: hours / (entryCountMap[i] || 1),
        status: "in-progress" as EntryStatus,
      })),
    };
  });
}

/**
 * MOCK: Weekly category summary.
 * Replace with: derived from GET /api/reports/individual?week=:isoWeek
 */
export const mockWeeklySummary = [
  { category: "development" as EntryCategory, hours: 18.5 },
  { category: "code_review" as EntryCategory, hours: 6.0 },
  { category: "meetings" as EntryCategory, hours: 3.5 },
  { category: "testing" as EntryCategory, hours: 3.0 },
  { category: "documentation" as EntryCategory, hours: 3.0 },
];
