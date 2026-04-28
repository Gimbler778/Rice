import { addDays, format, formatDistanceToNow } from "date-fns";

import type { IntegrationTimesheetEntry } from "@/types/integrations";
import {
  CATEGORY_LABELS,
  type EntryCategory,
  type Suggestion,
  type TimesheetDay,
  type TimesheetEntry,
} from "@/types/timesheet";

const categoryAliases: Record<string, EntryCategory> = {
  development: "development",
  code_review: "code_review",
  testing: "testing",
  documentation: "documentation",
  meetings: "meetings",
  admin: "admin",
  org_sessions: "org_sessions",
  events: "events",
  support: "support",
  learning: "learning",
  manual_other: "manual_other",
};

const sourceMap: Record<IntegrationTimesheetEntry["source"], Suggestion["source"]> = {
  Jira: "jira",
  Bitbucket: "bitbucket",
};

function toOneDecimal(value: number) {
  return Math.round(value * 10) / 10;
}

function toHoursWithDefault(timeSeconds: number, defaultHours = 1) {
  if (timeSeconds <= 0) {
    return defaultHours;
  }

  return toOneDecimal(timeSeconds / 3600);
}

function normalizeCategoryValue(category: string) {
  return category.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function isLikelyJiraKey(value: string | null | undefined) {
  if (!value) {
    return false;
  }

  return /^[A-Z][A-Z0-9]+-\d+$/.test(value);
}

function toRelativeTime(timestamp: string) {
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) {
    return "recently";
  }

  return formatDistanceToNow(parsed, { addSuffix: true });
}

export function getLocalIsoDateFromTimestamp(timestamp: string) {
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) {
    const [fallbackDate] = timestamp.split("T");
    return fallbackDate ?? "";
  }

  return format(parsed, "yyyy-MM-dd");
}

export function mapIntegrationCategory(category: string): EntryCategory {
  const normalized = normalizeCategoryValue(category);
  const aliased = categoryAliases[normalized];

  if (aliased) {
    return aliased;
  }

  if (normalized.includes("review")) {
    return "code_review";
  }

  if (normalized.includes("meet")) {
    return "meetings";
  }

  if (normalized.includes("test") || normalized.includes("qa")) {
    return "testing";
  }

  if (normalized.includes("doc")) {
    return "documentation";
  }

  if (normalized.includes("learn")) {
    return "learning";
  }

  if (normalized.includes("support")) {
    return "support";
  }

  return "manual_other";
}

export function mapIntegrationEntryToTimesheetEntry(
  entry: IntegrationTimesheetEntry,
): TimesheetEntry {
  const jiraIssueKey =
    entry.source === "Jira" && isLikelyJiraKey(entry.relatedData?.issueKey ?? entry.ref)
      ? entry.relatedData?.issueKey ?? entry.ref
      : undefined;

  return {
    id: entry.id,
    date: getLocalIsoDateFromTimestamp(entry.occurredAt),
    category: mapIntegrationCategory(entry.category),
    description: entry.description,
    jiraIssueKey,
    source: sourceMap[entry.source],
    sourceLink: entry.link ?? undefined,
    hours: toHoursWithDefault(entry.timeSeconds),
    status: "in-progress",
  };
}

export function mapIntegrationEntryToSuggestion(
  entry: IntegrationTimesheetEntry,
): Suggestion {
  const jiraIssueKey = isLikelyJiraKey(entry.relatedData?.issueKey ?? entry.ref)
    ? entry.relatedData?.issueKey ?? entry.ref
    : undefined;

  const status =
    entry.source === "Jira"
      ? entry.relatedData?.status ?? undefined
      : entry.relatedData?.pullRequestState ?? undefined;

  const context =
    entry.source === "Jira"
      ? entry.relatedData?.projectKey ?? "Jira activity"
      : entry.relatedData?.repositoryFullName ?? "Bitbucket activity";

  const estimatedHours = toHoursWithDefault(entry.timeSeconds);

  return {
    id: entry.id,
    source: sourceMap[entry.source],
    title: entry.description,
    subtitle: `${context} · ${toRelativeTime(entry.occurredAt)}`,
    status,
    estimatedHours,
    suggestedCategory: mapIntegrationCategory(entry.category),
    jiraIssueKey,
    sourceLink: entry.link ?? undefined,
  };
}

export function buildWeekDaysFromEntries(
  entries: TimesheetEntry[],
  weekStart: Date,
): TimesheetDay[] {
  return Array.from({ length: 5 }, (_, index) => {
    const date = addDays(weekStart, index);
    const dateStr = format(date, "yyyy-MM-dd");
    const dayEntries = entries.filter((entry) => entry.date === dateStr);
    const totalHours = toOneDecimal(dayEntries.reduce((sum, entry) => sum + entry.hours, 0));

    return {
      date: dateStr,
      entries: dayEntries,
      totalHours,
      status: totalHours >= 8 ? "submitted" : "draft",
      targetHours: 8,
    };
  });
}

export function buildWeeklySummaryFromEntries(
  entries: TimesheetEntry[],
  weekStart: Date,
) {
  const weekDates = new Set(
    Array.from({ length: 5 }, (_, index) => format(addDays(weekStart, index), "yyyy-MM-dd")),
  );

  const totals = entries.reduce(
    (map, entry) => {
      if (!weekDates.has(entry.date)) {
        return map;
      }

      map.set(entry.category, (map.get(entry.category) ?? 0) + entry.hours);
      return map;
    },
    new Map<EntryCategory, number>(),
  );

  return (Object.keys(CATEGORY_LABELS) as EntryCategory[])
    .map((category) => ({
      category,
      hours: toOneDecimal(totals.get(category) ?? 0),
    }))
    .filter((item) => item.hours > 0);
}
