import { useEffect, useMemo, useRef, useState } from "react";
import { addDays, format, startOfWeek } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import {
  Plus,
  Trash2,
  Pencil,
  Check,
  X,
  ChevronLeft,
  ChevronRight,
  Clock,
  BookOpen,
  GitPullRequest,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  type TimesheetEntry,
  type EntryCategory,
  type EntrySource,
  type LearningEntry,
  type Suggestion,
  type CrossCheckPrompt,
  CATEGORY_LABELS,
  CATEGORY_BADGE_CLASSES,
} from "@/types/timesheet";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { tryCatch } from "@/lib/try-catch";
import {
  copyYesterdayTimesheetEntries,
  createTimesheetEntry,
  deleteTimesheetEntry,
  fetchTimesheetByDate,
  fetchTimesheetEntries,
  updateTimesheetEntry,
} from "@/api/timesheets-api";
import { fetchLearning, upsertLearning } from "@/api/learning-api";
import type { LearningUpsertInput } from "@/api/learning-api";
import { useIntegrationTimesheet } from "@/hooks/use-integrations";
import {
  getLocalIsoDateFromTimestamp,
  mapIntegrationEntryToSuggestion,
} from "@/lib/integration-timesheet";

function normalizeComparisonText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeJiraKey(value?: string) {
  return value?.trim().toUpperCase() ?? "";
}

function formatEntrySourceShort(source?: EntrySource) {
  if (!source) {
    return "Link";
  }

  return source === "jira" ? "Jira" : "BB";
}

function findDuplicateEntryForSuggestion(
  entries: TimesheetEntry[],
  suggestion: Suggestion,
) {
  const normalizedSuggestionTitle = normalizeComparisonText(suggestion.title);
  const normalizedSuggestionJiraKey = normalizeJiraKey(suggestion.jiraIssueKey);

  return entries.find((entry) => {
    if (entry.id === suggestion.id) {
      return true;
    }

    const normalizedEntryJiraKey = normalizeJiraKey(entry.jiraIssueKey);
    const normalizedEntryDescription = normalizeComparisonText(entry.description);

    if (
      normalizedSuggestionJiraKey &&
      normalizedEntryJiraKey &&
      normalizedEntryJiraKey === normalizedSuggestionJiraKey &&
      normalizedEntryDescription === normalizedSuggestionTitle
    ) {
      return true;
    }

    if (!normalizedSuggestionJiraKey) {
      return (
        normalizedEntryDescription === normalizedSuggestionTitle &&
        entry.category === suggestion.suggestedCategory
      );
    }

    return false;
  });
}

// Metric card — top row summary numbers

interface MetricCardProps {
  label: string;
  value: string | number;
  sub: string;
  valueClassName?: string;
}

function MetricCard({ label, value, sub, valueClassName }: MetricCardProps) {
  return (
    <div className="bg-muted/50 rounded-lg p-3">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className={cn("text-xl font-medium", valueClassName)}>{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
    </div>
  );
}

// Category badge

function CategoryBadge({ category }: { category: EntryCategory }) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
        CATEGORY_BADGE_CLASSES[category]
      )}
    >
      {CATEGORY_LABELS[category]}
    </span>
  );
}

// Entry row — single row in the entry table

interface EntryRowProps {
  entry: TimesheetEntry;
  onDelete: (id: string) => void;
  onUpdate: (id: string, updates: Partial<TimesheetEntry>) => void;
}

function EntryRow({ entry, onDelete, onUpdate }: EntryRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  // Local edit state — only committed on save
  const [editValues, setEditValues] = useState({
    description: entry.description,
    hours: entry.hours,
    timeRemaining: entry.timeRemaining ?? 0,
    category: entry.category,
    jiraIssueKey: entry.jiraIssueKey ?? "",
    source: entry.source ?? "",
    sourceLink: entry.sourceLink ?? "",
  });

  const handleSave = () => {
    if (editValues.sourceLink.trim()) {
      try {
        new URL(editValues.sourceLink.trim());
      } catch {
        toast.error("Enter a valid source link URL.");
        return;
      }
    }

    // Persisting is handled by the parent onUpdate callback.
    onUpdate(entry.id, {
      description: editValues.description,
      hours: editValues.hours,
      timeRemaining: editValues.timeRemaining,
      category: editValues.category,
      jiraIssueKey: editValues.jiraIssueKey || undefined,
      source: (editValues.source || undefined) as EntrySource | undefined,
      sourceLink: editValues.sourceLink || undefined,
    });
    setIsEditing(false);
  };

  const handleCancel = () => {
    // Reset to original values
    setEditValues({
      description: entry.description,
      hours: entry.hours,
      timeRemaining: entry.timeRemaining ?? 0,
      category: entry.category,
      jiraIssueKey: entry.jiraIssueKey ?? "",
      source: entry.source ?? "",
      sourceLink: entry.sourceLink ?? "",
    });
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <tr className="border-b bg-muted/30">
        {/* Category select */}
        <td className="px-3 py-2">
          <Select
            value={editValues.category}
            onValueChange={(val) =>
              setEditValues((prev) => ({ ...prev, category: val as EntryCategory }))
            }
          >
            <SelectTrigger className="h-8 text-xs w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(CATEGORY_LABELS) as EntryCategory[]).map((cat) => (
                <SelectItem key={cat} value={cat} className="text-xs">
                  {CATEGORY_LABELS[cat]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </td>
        {/* Description input */}
        <td className="px-3 py-2">
          <Input
            className="h-8 text-xs"
            value={editValues.description}
            onChange={(e) =>
              setEditValues((prev) => ({ ...prev, description: e.target.value }))
            }
            placeholder="What did you work on?"
          />
        </td>
        {/* Jira/BB link */}
        <td className="px-3 py-2 min-w-72">
          <div className="flex items-center gap-2">
            <Select
              value={editValues.source || "none"}
              onValueChange={(value) =>
                setEditValues((prev) => ({
                  ...prev,
                  source: value === "none" ? "" : (value as EntrySource),
                }))
              }
            >
              <SelectTrigger className="h-8 text-xs w-28">
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none" className="text-xs">
                  None
                </SelectItem>
                <SelectItem value="jira" className="text-xs">
                  Jira
                </SelectItem>
                <SelectItem value="bitbucket" className="text-xs">
                  Bitbucket
                </SelectItem>
              </SelectContent>
            </Select>
            <Input
              className="h-8 text-xs min-w-0 flex-1"
              value={editValues.sourceLink}
              onChange={(e) =>
                setEditValues((prev) => ({ ...prev, sourceLink: e.target.value }))
              }
              placeholder="https://..."
            />
          </div>
        </td>
        {/* Hours input */}
        <td className="px-3 py-2">
          <Input
            type="number"
            step="0.5"
            min="0"
            max="24"
            className="h-8 text-xs w-16 text-center"
            value={editValues.hours}
            onChange={(e) =>
              setEditValues((prev) => ({ ...prev, hours: parseFloat(e.target.value) || 0 }))
            }
          />
        </td>
        {/* Time Remaining input */}
        <td className="px-3 py-2">
          <Input
            type="number"
            step="0.5"
            min="0"
            max="100"
            className="h-8 text-xs w-16 text-center"
            value={editValues.timeRemaining}
            onChange={(e) =>
              setEditValues((prev) => ({ ...prev, timeRemaining: parseFloat(e.target.value) || 0 }))
            }
          />
        </td>
        {/* Save / cancel */}
        <td className="px-3 py-2">
          <div className="flex items-center gap-1">
            <Button size="icon" variant="ghost" className="size-7" onClick={handleSave}>
              <Check className="size-3 text-teal-600" />
            </Button>
            <Button size="icon" variant="ghost" className="size-7" onClick={handleCancel}>
              <X className="size-3 text-muted-foreground" />
            </Button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr
      className="border-b hover:bg-muted/30 transition-colors"
      onDoubleClick={() => setIsEditing(true)}
    >
      {/* Category */}
      <td className="px-3 py-2.5">
        <CategoryBadge category={entry.category} />
      </td>
      {/* Description */}
      <td className="px-3 py-2.5 text-sm text-foreground max-w-xs truncate">
        {entry.description}
      </td>
      {/* Jira/BB link */}
      <td className="px-3 py-2.5 max-w-xs truncate">
        {entry.sourceLink ? (
          <a
            href={entry.sourceLink}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
            title={entry.sourceLink}
          >
            {formatEntrySourceShort(entry.source)}
          </a>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </td>
      {/* Hours */}
      <td className="px-3 py-2.5 text-center">
        <span className="text-sm font-mono font-medium">{entry.hours}h</span>
      </td>
      {/* Time Remaining */}
      <td className="px-3 py-2.5 text-center">
        <span className="text-sm font-mono font-medium">{entry.timeRemaining ?? 0}h</span>
      </td>
      {/* Actions */}
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            onClick={() => setIsEditing(true)}
          >
            <Pencil className="size-3" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-7 hover:text-destructive"
            onClick={() => onDelete(entry.id)}
          >
            <Trash2 className="size-3" />
          </Button>
        </div>
      </td>
    </tr>
  );
}

// Add entry row — inline form for new entries

interface AddEntryRowProps {
  onAdd: (entry: Omit<TimesheetEntry, "id" | "date" | "status">) => void;
  onCancel: () => void;
}

function AddEntryRow({ onAdd, onCancel }: AddEntryRowProps) {
  const [values, setValues] = useState({
    category: "development" as EntryCategory,
    description: "",
    source: "" as "" | EntrySource,
    sourceLink: "",
    hours: 1,
    timeRemaining: 0,
    startHour: 9,
  });

  const handleAdd = () => {
    if (!values.description.trim()) return;

    if (values.sourceLink.trim()) {
      try {
        new URL(values.sourceLink.trim());
      } catch {
        toast.error("Enter a valid source link URL.");
        return;
      }
    }

    // Persisting is handled by the parent onAdd callback.
    onAdd({
      category: values.category,
      description: values.description,
      source: values.source || undefined,
      sourceLink: values.sourceLink || undefined,
      hours: values.hours,
      timeRemaining: values.timeRemaining,
      startHour: values.startHour,
    });
  };

  return (
    <tr className="border-b bg-teal-50/50 dark:bg-teal-950/20">
      <td className="px-3 py-2">
        <Select
          value={values.category}
          onValueChange={(val) =>
            setValues((prev) => ({ ...prev, category: val as EntryCategory }))
          }
        >
          <SelectTrigger className="h-8 text-xs w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(CATEGORY_LABELS) as EntryCategory[]).map((cat) => (
              <SelectItem key={cat} value={cat} className="text-xs">
                {CATEGORY_LABELS[cat]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>
      <td className="px-3 py-2">
        <Input
          autoFocus
          className="h-8 text-xs"
          placeholder="What did you work on?"
          value={values.description}
          onChange={(e) => setValues((prev) => ({ ...prev, description: e.target.value }))}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
        />
      </td>
      <td className="px-3 py-2 min-w-72">
        <div className="flex items-center gap-2">
          <Select
            value={values.source || "none"}
            onValueChange={(value) =>
              setValues((prev) => ({
                ...prev,
                source: value === "none" ? "" : (value as EntrySource),
              }))
            }
          >
            <SelectTrigger className="h-8 text-xs w-28">
              <SelectValue placeholder="None" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none" className="text-xs">
                None
              </SelectItem>
              <SelectItem value="jira" className="text-xs">
                Jira
              </SelectItem>
              <SelectItem value="bitbucket" className="text-xs">
                Bitbucket
              </SelectItem>
            </SelectContent>
          </Select>
          <Input
            className="h-8 text-xs min-w-0 flex-1"
            placeholder="https://..."
            value={values.sourceLink}
            onChange={(e) => setValues((prev) => ({ ...prev, sourceLink: e.target.value }))}
          />
        </div>
      </td>
      <td className="px-3 py-2">
        <Input
          type="number"
          step="0.5"
          min="0"
          max="24"
          className="h-8 text-xs w-16 text-center"
          value={values.hours}
          onChange={(e) =>
            setValues((prev) => ({ ...prev, hours: parseFloat(e.target.value) || 0 }))
          }
        />
      </td>
      <td className="px-3 py-2">
        <Input
          type="number"
          step="0.5"
          min="0"
          max="100"
          className="h-8 text-xs w-16 text-center"
          value={values.timeRemaining}
          onChange={(e) =>
            setValues((prev) => ({ ...prev, timeRemaining: parseFloat(e.target.value) || 0 }))
          }
        />
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" className="size-7" onClick={handleAdd}>
            <Check className="size-3 text-teal-600" />
          </Button>
          <Button size="icon" variant="ghost" className="size-7" onClick={onCancel}>
            <X className="size-3 text-muted-foreground" />
          </Button>
        </div>
      </td>
    </tr>
  );
}

// Entry table — the main timesheet table

interface EntryTableProps {
  entries: TimesheetEntry[];
  onDelete: (id: string) => void;
  onUpdate: (id: string, updates: Partial<TimesheetEntry>) => void;
  onAdd: (entry: Omit<TimesheetEntry, "id" | "date" | "status">) => void;
}

function EntryTable({ entries, onDelete, onUpdate, onAdd }: EntryTableProps) {
  const [showAddRow, setShowAddRow] = useState(false);

  const totalHours = entries.reduce((sum, e) => sum + e.hours, 0);
  const totalTimeRemaining = entries.reduce((sum, e) => sum + (e.timeRemaining ?? 0), 0);

  const handleQuickAdd = (_hours: number) => {
    // Opens add row pre-filled with the quick-add hours
    setShowAddRow(true);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-sm font-medium">Time entries</CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Quick-add pill buttons */}
            <span className="text-xs text-muted-foreground">Quick add:</span>
            {[0.5, 1, 2].map((h) => (
              <button
                key={h}
                onClick={() => handleQuickAdd(h)}
                className="text-xs px-2.5 py-1 rounded-full border border-border hover:bg-muted transition-colors"
              >
                +{h === 0.5 ? "30m" : `${h}h`}
              </button>
            ))}
            <Button
              size="sm"
              className="h-7 text-xs bg-teal-600 hover:bg-teal-700 text-white"
              onClick={() => setShowAddRow(true)}
            >
              <Plus className="size-3 mr-1" />
              Add entry
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground w-40">
                  Category
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                  Description
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground w-48">
                  Source
                </th>
                <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground w-16">
                  Time Worked
                </th>
                <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground w-16">
                  Time Remaining
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground w-20">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 && !showAddRow && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-sm text-muted-foreground">
                    No entries yet — add your first entry or accept a suggestion.
                  </td>
                </tr>
              )}
              {entries.map((entry) => (
                <EntryRow
                  key={entry.id}
                  entry={entry}
                  onDelete={onDelete}
                  onUpdate={onUpdate}
                />
              ))}
              {showAddRow && (
                <AddEntryRow
                  onAdd={(entry) => {
                    onAdd(entry);
                    setShowAddRow(false);
                  }}
                  onCancel={() => setShowAddRow(false)}
                />
              )}
              {/* Total row */}
              {entries.length > 0 && (
                <tr className="bg-muted/30 border-t">
                  <td colSpan={3} className="px-3 py-2 text-xs font-medium text-muted-foreground">
                    Total
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span
                      className={cn(
                        "text-sm font-semibold font-mono",
                        totalHours >= 8 ? "text-teal-600" : "text-foreground"
                      )}
                    >
                      {totalHours}h
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className="text-sm font-semibold font-mono text-foreground">
                      {totalTimeRemaining}h
                    </span>
                  </td>
                  <td />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// Suggestions panel — right column

interface SuggestionsPanelProps {
  suggestions: Suggestion[];
  crossChecks: CrossCheckPrompt[];
  alreadyInTimesheetSuggestionIds: Set<string>;
  onAccept: (suggestion: Suggestion) => void;
  onDismissSuggestion: (id: string) => void;
  onDismissCrossCheck: (id: string) => void;
}

function SuggestionsPanel({
  suggestions,
  crossChecks,
  alreadyInTimesheetSuggestionIds,
  onAccept,
  onDismissSuggestion,
  onDismissCrossCheck,
}: SuggestionsPanelProps) {
  const jiraSectionRef = useRef<HTMLDivElement | null>(null);
  const bitbucketSectionRef = useRef<HTMLDivElement | null>(null);
  const jiraSuggestions = suggestions.filter((s) => s.source === "jira");
  const bbSuggestions = suggestions.filter((s) => s.source === "bitbucket");
  const newCount = suggestions.length;

  const scrollToSection = (source: Suggestion["source"]) => {
    const targetRef = source === "jira" ? jiraSectionRef : bitbucketSectionRef;
    targetRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="flex max-h-[calc(100vh-12rem)] flex-col gap-3 overflow-y-auto pr-1">
      {/* Panel header */}
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-500/10 px-2.5 py-1 text-xs font-semibold text-teal-700 ring-1 ring-teal-500/20 dark:bg-teal-400/10 dark:text-teal-200 dark:ring-teal-400/20">
          Suggestions
        </span>
        {newCount > 0 && (
          <Badge className="text-[10px] px-1.5 py-0 bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200 border-0">
            {newCount} new
          </Badge>
        )}
      </div>

      {/* Cross-check warning banners */}
      {crossChecks.map((cc) => (
        <div
          key={cc.id}
          className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 p-2.5"
        >
          <div className="flex gap-1.5 mb-2">
            <AlertTriangle className="size-3.5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
              {cc.message}
            </p>
          </div>
          <div className="flex gap-1.5">
            <button
              type="button"
              className="text-[11px] px-2.5 py-1 rounded-full bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200 font-medium hover:bg-teal-200 dark:hover:bg-teal-800 transition-colors"
              onClick={() => scrollToSection(cc.source)}
            >
              Go to {cc.source === "jira" ? "Jira" : "Bitbucket"}
            </button>
            <button
              type="button"
              className="text-[11px] px-2.5 py-1 rounded-full border border-border text-muted-foreground hover:bg-muted transition-colors"
              onClick={() => onDismissCrossCheck(cc.id)}
            >
              Dismiss
            </button>
          </div>
        </div>
      ))}

      {/* JIRA suggestions */}
      {jiraSuggestions.length > 0 && (
        <>
          <div ref={jiraSectionRef} className="flex items-center gap-1.5 mt-1 scroll-mt-2">
            <Clock className="size-3 text-muted-foreground" />
            <span className="text-[11px] font-medium text-muted-foreground">From JIRA</span>
          </div>
          {jiraSuggestions.map((sug) => (
            <SuggestionCard
              key={sug.id}
              suggestion={sug}
              showAlreadyInTimesheet={alreadyInTimesheetSuggestionIds.has(sug.id)}
              onAccept={onAccept}
              onDismiss={onDismissSuggestion}
            />
          ))}
        </>
      )}

      {/* Bitbucket suggestions */}
      {bbSuggestions.length > 0 && (
        <>
          <div ref={bitbucketSectionRef} className="flex items-center gap-1.5 mt-1 scroll-mt-2">
            <GitPullRequest className="size-3 text-muted-foreground" />
            <span className="text-[11px] font-medium text-muted-foreground">From Bitbucket</span>
          </div>
          {bbSuggestions.map((sug) => (
            <SuggestionCard
              key={sug.id}
              suggestion={sug}
              showAlreadyInTimesheet={alreadyInTimesheetSuggestionIds.has(sug.id)}
              onAccept={onAccept}
              onDismiss={onDismissSuggestion}
            />
          ))}
        </>
      )}

      {/* Empty state */}
      {suggestions.length === 0 && crossChecks.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-4">
          No suggestions for today.
        </p>
      )}
    </div>
  );
}

// Individual suggestion card
function SuggestionCard({
  suggestion,
  showAlreadyInTimesheet,
  onAccept,
  onDismiss,
}: {
  suggestion: Suggestion;
  showAlreadyInTimesheet: boolean;
  onAccept: (s: Suggestion) => void;
  onDismiss: (id: string) => void;
}) {
  return (
    <div className="rounded-md border border-border bg-card p-2.5 hover:border-border/80 transition-colors">
      <div className="flex items-start justify-between gap-1 mb-1">
        <p className="text-xs font-medium text-foreground leading-snug line-clamp-2">
          {suggestion.title}
        </p>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {showAlreadyInTimesheet && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              Already in timesheet
            </Badge>
          )}
          {suggestion.status && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {suggestion.status}
            </Badge>
          )}
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground mb-2">{suggestion.subtitle}</p>
      <div className="flex gap-1.5">
        <button
          // TODO: POST /api/suggestions/accept with { suggestionId: suggestion.id }
          className="text-[11px] px-2.5 py-1 rounded-full bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200 font-medium hover:bg-teal-200 dark:hover:bg-teal-800 transition-colors"
          onClick={() => onAccept(suggestion)}
        >
          Accept
        </button>
        <button
          // TODO: POST /api/suggestions/dismiss with { suggestionId: suggestion.id }
          className="text-[11px] px-2.5 py-1 rounded-full border border-border text-muted-foreground hover:bg-muted transition-colors"
          onClick={() => onDismiss(suggestion.id)}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

// Learning of the day widget

interface LearningWidgetProps {
  learning: LearningEntry;
  onChange: (updates: Partial<LearningEntry>) => void;
  streak: number;
}

function LearningWidget({ learning, onChange, streak }: LearningWidgetProps) {
  const tags = ["tech", "product", "process"] as const;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm font-medium flex items-center gap-1.5">
              <BookOpen className="size-3.5 text-teal-600" />
              Learning of the day
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              What did you learn today?
            </p>
          </div>
          {/* Streak counter */}
          <div className="flex items-center gap-1.5 bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 px-2.5 py-1 rounded-full">
            <span className="text-sm font-semibold">{streak}</span>
            <span className="text-xs font-medium">day streak</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {/* Title input */}
        <Input
          placeholder="e.g. Optimistic updates with TanStack Query mutations..."
          value={learning.title}
          onChange={(e) => onChange({ title: e.target.value })}
          // TODO: debounce onChange and PUT /api/learning/:date
          className="text-sm"
        />
        {/* Notes textarea */}
        <Textarea
          placeholder="Additional notes (optional)..."
          value={learning.notes ?? ""}
          onChange={(e) => onChange({ notes: e.target.value })}
          className="text-sm resize-none"
          rows={2}
        />
        {/* Tag chips */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">Tag:</span>
          {tags.map((tag) => (
            <button
              key={tag}
              onClick={() => onChange({ tag: learning.tag === tag ? undefined : tag })}
              className={cn(
                "text-xs px-2.5 py-0.5 rounded-full border transition-colors capitalize",
                learning.tag === tag
                  ? "bg-teal-100 border-teal-300 text-teal-800 dark:bg-teal-900 dark:border-teal-700 dark:text-teal-200"
                  : "border-border text-muted-foreground hover:bg-muted"
              )}
            >
              {tag}
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// Today Page — main export

export function TodayPage() {
  // State

  const { data: session } = authClient.useSession();
  const isAuthenticated = Boolean(session?.user?.id);
  const [searchParams, setSearchParams] = useSearchParams();

  const requestedDate = searchParams.get("date");
  const selectedDate = useMemo(() => {
    if (!requestedDate) {
      return new Date();
    }

    const parsedDate = new Date(`${requestedDate}T12:00:00`);
    return Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate;
  }, [requestedDate]);

  const dateStr = format(selectedDate, "yyyy-MM-dd");
  const integrationTimesheetQuery = useIntegrationTimesheet(isAuthenticated, dateStr);
  const selectedWeekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
  const selectedWeekStartStr = format(selectedWeekStart, "yyyy-MM-dd");
  const selectedWeekEndStr = format(addDays(selectedWeekStart, 4), "yyyy-MM-dd");

  const learningQuery = useQuery({
    queryKey: ["learning", dateStr],
    queryFn: () => fetchLearning(dateStr),
    enabled: isAuthenticated,
  });

  const timesheetDateQuery = useQuery({
    queryKey: ["timesheet-date", dateStr],
    queryFn: () => fetchTimesheetByDate(dateStr),
    enabled: isAuthenticated,
  });

  const weekEntriesQuery = useQuery({
    queryKey: ["timesheet-week", selectedWeekStartStr, selectedWeekEndStr],
    queryFn: () =>
      fetchTimesheetEntries({
        from: selectedWeekStartStr,
        to: selectedWeekEndStr,
      }),
    enabled: isAuthenticated,
  });

  const integrationEntries = integrationTimesheetQuery.data?.entries ?? [];
  const fetchedEntriesForDate = timesheetDateQuery.data?.entries ?? [];

  const fetchedSuggestionsForDate = useMemo(
    () =>
      integrationEntries
        .filter((entry) => getLocalIsoDateFromTimestamp(entry.occurredAt) === dateStr)
        .sort((a, b) => {
          const occurredAtA = new Date(a.occurredAt).getTime();
          const occurredAtB = new Date(b.occurredAt).getTime();
          const safeA = Number.isNaN(occurredAtA) ? 0 : occurredAtA;
          const safeB = Number.isNaN(occurredAtB) ? 0 : occurredAtB;
          return safeB - safeA;
        })
        .map(mapIntegrationEntryToSuggestion),
    [integrationEntries, dateStr],
  );

  const [entries, setEntries] = useState<TimesheetEntry[]>([]);
  const [hiddenSuggestionIds, setHiddenSuggestionIds] = useState<string[]>([]);
  const [dismissedCrossCheckIds, setDismissedCrossCheckIds] = useState<string[]>([]);

  const [learning, setLearning] = useState<LearningEntry>(() => ({
    id: `learning-${dateStr}`,
    date: dateStr,
    title: "",
    notes: "",
  }));
  const [streak, setStreak] = useState(0);

  // Debounce timer ref for learning autosave
  const learningDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Always holds the latest learning value so the unmount cleanup can access it
  const latestLearningRef = useRef(learning);
  useEffect(() => {
    latestLearningRef.current = learning;
  });

  // Autosave indicator — "idle" | "saving" | "saved"
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("saved");

  useEffect(() => {
    setEntries(fetchedEntriesForDate);
  }, [fetchedEntriesForDate]);

  useEffect(() => {
    setHiddenSuggestionIds([]);
    setDismissedCrossCheckIds([]);
    setLearning({
      id: `learning-${dateStr}`,
      date: dateStr,
      title: "",
      notes: "",
    });
    setStreak(0);
  }, [dateStr]);

  // Flush any pending learning save immediately when the component unmounts
  // (guards against navigating away before the 800ms debounce fires)
  useEffect(() => {
    return () => {
      if (learningDebounceRef.current) {
        clearTimeout(learningDebounceRef.current);
        learningDebounceRef.current = null;
        const curr = latestLearningRef.current;
        void upsertLearning(curr.date, {
          title: curr.title,
          notes: curr.notes ?? undefined,
          tag: curr.tag ?? null,
        });
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!learningQuery.data) return;
    const { entry, streak: fetchedStreak } = learningQuery.data;
    if (entry) {
      setLearning({
        id: entry.id,
        date: entry.date,
        title: entry.title,
        notes: entry.notes ?? "",
        tag: entry.tag ?? undefined,
      });
    }
    setStreak(fetchedStreak);
  }, [learningQuery.data]);

  // Derived values

  const suggestions = useMemo(
    () =>
      fetchedSuggestionsForDate.filter(
        (suggestion) =>
          !hiddenSuggestionIds.includes(suggestion.id)
          && !findDuplicateEntryForSuggestion(entries, suggestion),
      ),
    [fetchedSuggestionsForDate, hiddenSuggestionIds, entries],
  );

  const alreadyInTimesheetSuggestionIds = useMemo(() => {
    const ids = new Set<string>();

    for (const suggestion of suggestions) {
      const duplicateEntry = findDuplicateEntryForSuggestion(entries, suggestion);

      if (!duplicateEntry) {
        continue;
      }

      // Avoid noisy labels when both lists come directly from the same integration entry id.
      if (duplicateEntry.id !== suggestion.id) {
        ids.add(suggestion.id);
      }
    }

    return ids;
  }, [suggestions, entries]);

  const crossChecks = useMemo<CrossCheckPrompt[]>(() => {
    const prompts: CrossCheckPrompt[] = [];

    const hasBitbucketSuggestion = suggestions.some(
      (suggestion) => suggestion.source === "bitbucket",
    );
    const hasCodeReviewEntry = entries.some((entry) => entry.category === "code_review");

    if (hasBitbucketSuggestion && !hasCodeReviewEntry) {
      prompts.push({
        id: "bitbucket-code-review",
        message: "Bitbucket activity detected, but no Code Review entry is logged yet.",
        suggestedCategory: "code_review",
        source: "bitbucket",
      });
    }

    const hasJiraSuggestion = suggestions.some((suggestion) => suggestion.source === "jira");
    const hasDevelopmentEntry = entries.some((entry) => entry.category === "development");

    if (hasJiraSuggestion && !hasDevelopmentEntry) {
      prompts.push({
        id: "jira-development",
        message: "Jira issue updates detected, but no Development entry is logged yet.",
        suggestedCategory: "development",
        source: "jira",
      });
    }

    return prompts.filter((prompt) => !dismissedCrossCheckIds.includes(prompt.id));
  }, [suggestions, entries, dismissedCrossCheckIds]);

  const totalHours = entries.reduce((sum, e) => sum + e.hours, 0);
  const weekEntries = weekEntriesQuery.data?.entries ?? [];

  const weekTotalHours = weekEntries.reduce((sum, entry) => sum + entry.hours, 0);
  const weekLoggedDays = new Set(weekEntries.map((entry) => entry.date)).size;

  // Handlers

  const handleNavigateDay = (dayOffset: number) => {
    const nextDate = addDays(selectedDate, dayOffset);
    setSearchParams({ date: format(nextDate, "yyyy-MM-dd") });
  };

  const refetchTimesheetQueries = async () => {
    await Promise.all([timesheetDateQuery.refetch(), weekEntriesQuery.refetch()]);
  };

  const handleDelete = async (id: string) => {
    const previousEntries = entries;
    setEntries((prev) => prev.filter((entry) => entry.id !== id));
    setSaveState("saving");

    const { error } = await tryCatch(deleteTimesheetEntry(id));

    if (error) {
      setEntries(previousEntries);
      setSaveState("saved");
      toast.error("Could not delete entry.");
      return;
    }

    await refetchTimesheetQueries();
    setSaveState("saved");
  };

  const handleUpdate = async (id: string, updates: Partial<TimesheetEntry>) => {
    const previousEntries = entries;
    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, ...updates } : e))
    );

    setSaveState("saving");

    const { error } = await tryCatch(
      updateTimesheetEntry(id, {
        category: updates.category,
        description: updates.description,
        hours: updates.hours,
        timeRemaining: updates.timeRemaining,
        jiraIssueKey:
          updates.jiraIssueKey === undefined ? undefined : (updates.jiraIssueKey ?? null),
        source: updates.source === undefined ? undefined : (updates.source ?? null),
        sourceLink:
          updates.sourceLink === undefined ? undefined : (updates.sourceLink ?? null),
        status: updates.status,
      }),
    );

    if (error) {
      setEntries(previousEntries);
      setSaveState("saved");
      toast.error("Could not update entry.");
      return;
    }

    await refetchTimesheetQueries();
    setSaveState("saved");
  };

  const handleAdd = async (entry: Omit<TimesheetEntry, "id" | "date" | "status">) => {
    setSaveState("saving");

    const { data: createdEntry, error } = await tryCatch(
      createTimesheetEntry({
        date: dateStr,
        category: entry.category,
        description: entry.description,
        jiraIssueKey: entry.jiraIssueKey,
        source: entry.source,
        sourceLink: entry.sourceLink,
        hours: entry.hours,
        timeRemaining: entry.timeRemaining,
        status: "in-progress",
      }),
    );

    if (error) {
      setSaveState("saved");
      toast.error("Could not add entry.");
      return;
    }

    setEntries((prev) => [...prev, createdEntry]);
    await refetchTimesheetQueries();
    setSaveState("saved");
  };

  const handleCopyYesterday = async () => {
    setSaveState("saving");

    const { data, error } = await tryCatch(copyYesterdayTimesheetEntries(dateStr));

    if (error) {
      setSaveState("saved");
      toast.error("Could not copy yesterday's entries.");
      return;
    }

    await refetchTimesheetQueries();
    setSaveState("saved");

    if (data.copiedCount > 0) {
      toast.success(`${data.copiedCount} entries copied from yesterday.`);
      return;
    }

    toast.info("No new entries were copied from yesterday.");
  };

  /** Accept a suggestion — adds it as a new entry. TODO: POST /api/suggestions/accept */
  const handleAcceptSuggestion = (sug: Suggestion) => {
    const duplicateEntry = findDuplicateEntryForSuggestion(entries, sug);

    if (duplicateEntry) {
      void handleUpdate(duplicateEntry.id, {
        category: sug.suggestedCategory,
        description: sug.title,
        jiraIssueKey: sug.jiraIssueKey,
        source: sug.source,
        sourceLink: sug.sourceLink,
        hours: sug.estimatedHours ?? duplicateEntry.hours,
        timeRemaining: sug.timeRemaining ?? duplicateEntry.timeRemaining,
      });
    } else {
      void handleAdd({
        category: sug.suggestedCategory,
        description: sug.title,
        jiraIssueKey: sug.jiraIssueKey,
        source: sug.source,
        sourceLink: sug.sourceLink,
        hours: sug.estimatedHours ?? 1,
        timeRemaining: sug.timeRemaining ?? 0,
      });
    }

    setHiddenSuggestionIds((prev) =>
      prev.includes(sug.id) ? prev : [...prev, sug.id],
    );
  };

  /** Dismiss a suggestion. TODO: POST /api/suggestions/dismiss */
  const handleDismissSuggestion = (id: string) => {
    setHiddenSuggestionIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  };

  /** Dismiss a cross-check prompt. TODO: POST /api/suggestions/dismiss */
  const handleDismissCrossCheck = (id: string) => {
    setDismissedCrossCheckIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  };

  const handleLearningChange = (updates: Partial<LearningEntry>) => {
    const next = { ...learning, ...updates };
    setLearning(next);

    // Cancel any pending debounce
    if (learningDebounceRef.current) clearTimeout(learningDebounceRef.current);

    setSaveState("saving");
    learningDebounceRef.current = setTimeout(async () => {
      const payload: LearningUpsertInput = {
        title: next.title,
        notes: next.notes ?? undefined,
        tag: next.tag ?? null,
      };
      const { data, error } = await tryCatch(upsertLearning(dateStr, payload));
      if (!error && data) {
        setStreak(data.streak);
      }
      setSaveState("saved");
    }, 800);
  };

  // Render

  return (
    <div className="flex flex-col h-full">
      {/* Page header */}
      <div className="border-b px-6 py-4 flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          {/* Date navigation */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={() => handleNavigateDay(-1)}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <div>
              <h1 className="text-sm font-semibold">Today's timesheet</h1>
              <p className="text-xs text-muted-foreground">
                {format(selectedDate, "EEEE, d MMMM yyyy")}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={() => handleNavigateDay(1)}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Autosave indicator */}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <div
              className={cn(
                "size-1.5 rounded-full transition-colors",
                saveState === "saving" && "bg-amber-500 animate-pulse",
                saveState === "saved" && "bg-teal-500",
                saveState === "idle" && "bg-muted-foreground"
              )}
            />
            {saveState === "saving" ? "Saving…" : "Draft saved"}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={handleCopyYesterday}
            disabled={saveState === "saving"}
          >
            Copy yesterday
          </Button>
          {/* TODO: PATCH /api/timesheets/submit-week */}
          <Button size="sm" className="h-7 text-xs bg-teal-600 hover:bg-teal-700 text-white">
            Submit week
          </Button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-6 py-4 flex gap-5">
          {/* Left column — metrics + table + learning */}
          <div className="flex-1 min-w-0 flex flex-col gap-4">
            {integrationTimesheetQuery.isPending && (
              <div className="rounded-md border border-border bg-muted/30 px-4 py-2.5 text-sm text-muted-foreground">
                Fetching synced Jira and Bitbucket entries...
              </div>
            )}

            {timesheetDateQuery.isPending && (
              <div className="rounded-md border border-border bg-muted/30 px-4 py-2.5 text-sm text-muted-foreground">
                Loading saved timesheet entries...
              </div>
            )}

            {integrationTimesheetQuery.isError && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-2.5 text-sm text-destructive">
                Failed to fetch integration data. Try reconnecting Atlassian/Bitbucket from the dashboard.
              </div>
            )}

            {/* Metric cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <MetricCard
                label="Today"
                value={`${totalHours}h`}
                sub="of ~8h target"
                valueClassName={totalHours >= 8 ? "text-teal-600" : undefined}
              />
              <MetricCard
                label="This week"
                value={`${weekTotalHours}h`}
                sub={`${weekLoggedDays} ${weekLoggedDays === 1 ? "day" : "days"} logged`}
              />
              <MetricCard label="Entries" value={entries.length} sub="today" />
              {/* TODO: replace 12 with real streak from learning API */}
              <MetricCard
                label="Learning streak"
                value={streak}
                sub={`${streak === 1 ? "day" : "days"}`}
                valueClassName="text-amber-600"
              />
            </div>

            {/* Entry table */}
            <EntryTable
              entries={entries}
              onDelete={handleDelete}
              onUpdate={handleUpdate}
              onAdd={handleAdd}
            />

            {/* Learning widget */}
            <LearningWidget
              learning={learning}
              onChange={handleLearningChange}
              streak={streak}
            />
          </div>

          {/* Right column — suggestions panel */}
          <div className="sticky top-4 w-56 shrink-0 xl:w-64">
            <SuggestionsPanel
              suggestions={suggestions}
              crossChecks={crossChecks}
              alreadyInTimesheetSuggestionIds={alreadyInTimesheetSuggestionIds}
              onAccept={handleAcceptSuggestion}
              onDismissSuggestion={handleDismissSuggestion}
              onDismissCrossCheck={handleDismissCrossCheck}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
