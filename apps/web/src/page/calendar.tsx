import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addDays,
  addWeeks,
  eachDayOfInterval,
  format,
  isSameDay,
  parseISO,
  startOfWeek,
  subWeeks,
} from "date-fns";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Globe,
  PencilLine,
  Plus,
  Save,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import {
  createTimesheetEntry,
  deleteTimesheetEntry,
  fetchTimesheetEntries,
  updateTimesheetEntry,
  type TimesheetEntryInput,
  type TimesheetEntryUpdateInput,
} from "@/api/timesheets-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { useIntegrationTimesheet } from "@/hooks/use-integrations";
import {
  CATEGORY_BADGE_CLASSES,
  CATEGORY_LABELS,
  type EntryCategory,
  type TimesheetEntry,
} from "@/types/timesheet";
import { getLocalIsoDateFromTimestamp, mapIntegrationCategory } from "@/lib/integration-timesheet";
import type { IntegrationTimesheetEntry } from "@/types/integrations";

const START_HOUR = 7;
const END_HOUR = 22;
const HOUR_HEIGHT = 64;
const HOURS = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, index) => START_HOUR + index);

const CATEGORY_OPTIONS: EntryCategory[] = [
  "development",
  "code_review",
  "testing",
  "documentation",
  "meetings",
  "admin",
  "support",
  "learning",
  "org_sessions",
  "events",
  "manual_other",
];

const ENTRY_COLORS: Partial<Record<EntryCategory, { bg: string; border: string; text: string }>> = {
  development: { bg: "bg-teal-50 dark:bg-teal-950/40", border: "border-l-teal-500", text: "text-teal-800 dark:text-teal-200" },
  code_review: { bg: "bg-purple-50 dark:bg-purple-950/40", border: "border-l-purple-500", text: "text-purple-800 dark:text-purple-200" },
  testing: { bg: "bg-blue-50 dark:bg-blue-950/40", border: "border-l-blue-400", text: "text-blue-800 dark:text-blue-200" },
  documentation: { bg: "bg-amber-50 dark:bg-amber-950/40", border: "border-l-amber-400", text: "text-amber-800 dark:text-amber-200" },
  meetings: { bg: "bg-zinc-100 dark:bg-zinc-800/60", border: "border-l-zinc-400", text: "text-zinc-700 dark:text-zinc-300" },
  admin: { bg: "bg-zinc-100 dark:bg-zinc-800/60", border: "border-l-zinc-500", text: "text-zinc-700 dark:text-zinc-300" },
  support: { bg: "bg-red-50 dark:bg-red-950/40", border: "border-l-red-400", text: "text-red-800 dark:text-red-200" },
  learning: { bg: "bg-green-50 dark:bg-green-950/40", border: "border-l-green-400", text: "text-green-800 dark:text-green-200" },
  org_sessions: { bg: "bg-pink-50 dark:bg-pink-950/40", border: "border-l-pink-400", text: "text-pink-800 dark:text-pink-200" },
  events: { bg: "bg-orange-50 dark:bg-orange-950/40", border: "border-l-orange-400", text: "text-orange-800 dark:text-orange-200" },
  manual_other: { bg: "bg-zinc-50 dark:bg-zinc-900/40", border: "border-l-zinc-300", text: "text-zinc-600 dark:text-zinc-400" },
};

type CalendarBlock = ReturnType<typeof mapIntegrationBlock>;

type EditorState = {
  open: boolean;
  entry: TimesheetEntry | null;
  date: string;
  presetHours: number;
};

function formatHour(hour: number) {
  const hourValue = Math.floor(hour);
  const minuteValue = Math.round((hour - hourValue) * 60);
  const ampm = hourValue < 12 ? "AM" : "PM";
  const displayHour = hourValue > 12 ? hourValue - 12 : hourValue === 0 ? 12 : hourValue;
  return `${displayHour}:${String(minuteValue).padStart(2, "0")} ${ampm}`;
}

function formatDuration(hours: number) {
  const wholeHours = Math.floor(hours);
  const minuteValue = Math.round((hours - wholeHours) * 60);

  if (wholeHours === 0) {
    return `${minuteValue}m`;
  }

  if (minuteValue === 0) {
    return `${wholeHours}h`;
  }

  return `${wholeHours}:${String(minuteValue).padStart(2, "0")}`;
}

function toIsoDate(date: Date) {
  return format(date, "yyyy-MM-dd");
}

function parseSelectedDate(value: string | null) {
  if (!value) {
    return new Date();
  }

  const parsed = parseISO(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function entryColor(category: EntryCategory) {
  return (
    ENTRY_COLORS[category] ?? {
      bg: "bg-muted",
      border: "border-l-muted-foreground",
      text: "text-foreground",
    }
  );
}

function getWeekStart(date: Date) {
  return startOfWeek(date, { weekStartsOn: 1 });
}

function getWeekEnd(date: Date) {
  return addDays(getWeekStart(date), 6);
}

function mapIntegrationBlock(entry: IntegrationTimesheetEntry) {
  const occurredAt = new Date(entry.occurredAt);
  const startHour = occurredAt.getHours() + occurredAt.getMinutes() / 60;
  const durationHours = Math.max(0.25, entry.timeSeconds / 3600);
  const date = getLocalIsoDateFromTimestamp(entry.occurredAt);

  return {
    id: entry.id,
    date,
    category: mapIntegrationCategory(entry.category),
    description: entry.description,
    jiraIssueKey: entry.relatedData?.issueKey ?? entry.ref,
    source: entry.source,
    startHour,
    durationHours,
    occurredAt,
  };
}

function entryHours(entries: TimesheetEntry[]) {
  return entries.reduce((sum, entry) => sum + entry.hours, 0);
}

function syncedHours(entries: CalendarBlock[]) {
  return entries.reduce((sum, entry) => sum + entry.durationHours, 0);
}

function PlannedBlock({ entry, onClick }: { entry: TimesheetEntry; onClick: () => void }) {
  const color = entryColor(entry.category);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full rounded px-2 py-0.5 text-left text-[11px] font-medium truncate border-l-2 transition-all",
        color.bg,
        color.border,
        color.text,
        "hover:brightness-95 dark:hover:brightness-110",
      )}
    >
      {entry.description}
      <span className="ml-1.5 font-mono opacity-60">{formatDuration(entry.hours)}</span>
    </button>
  );
}

function SyncedBlock({ entry }: { entry: CalendarBlock }) {
  const top = (entry.startHour - START_HOUR) * HOUR_HEIGHT;
  const height = Math.max(entry.durationHours * HOUR_HEIGHT, 24);
  const color = entryColor(entry.category);

  return (
    <div
      className={cn(
        "absolute left-0.5 right-0.5 rounded-sm border-l-2 overflow-hidden select-none",
        "hover:brightness-95 dark:hover:brightness-110 transition-all",
        color.bg,
        color.border,
      )}
      style={{ top, height }}
    >
      <div className="px-1.5 py-0.5 h-full flex flex-col justify-between gap-1">
        <div className="min-w-0">
          <p className={cn("text-[11px] font-medium leading-tight truncate", color.text)}>{entry.description}</p>
          <p className={cn("text-[10px] leading-tight truncate opacity-70", color.text)}>
            {CATEGORY_LABELS[entry.category]}
            {entry.jiraIssueKey ? ` · ${entry.jiraIssueKey}` : ""}
          </p>
        </div>
        <p className={cn("text-[10px] font-mono opacity-60", color.text)}>
          {formatHour(entry.startHour)} - {formatHour(entry.startHour + entry.durationHours)}
        </p>
      </div>
    </div>
  );
}

function CurrentTimeIndicator() {
  const now = new Date();
  const currentHour = now.getHours() + now.getMinutes() / 60;
  const top = (currentHour - START_HOUR) * HOUR_HEIGHT;

  if (currentHour < START_HOUR || currentHour > END_HOUR) {
    return null;
  }

  return (
    <div className="absolute left-0 right-0 z-20 flex items-center pointer-events-none" style={{ top }}>
      <div className="size-2 rounded-full bg-teal-500 -ml-1 shrink-0" />
      <div className="h-px flex-1 bg-teal-500" />
    </div>
  );
}

function DayColumn({
  date,
  plannedEntries,
  syncedEntries,
  selected,
  onSelect,
  onEditEntry,
  onAddEntry,
}: {
  date: Date;
  plannedEntries: TimesheetEntry[];
  syncedEntries: CalendarBlock[];
  selected: boolean;
  onSelect: () => void;
  onEditEntry: (entry: TimesheetEntry) => void;
  onAddEntry: () => void;
}) {
  const isCurrentDay = isSameDay(date, new Date());
  const plannedTotal = entryHours(plannedEntries);
  const syncedTotal = syncedHours(syncedEntries);

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          "sticky top-0 z-10 border-b border-r bg-background px-2 py-2 text-center transition-colors",
          selected && "bg-teal-50/70 dark:bg-teal-950/20",
          isCurrentDay && "ring-1 ring-teal-500/20",
        )}
      >
        <p className={cn("text-xs font-medium", isCurrentDay ? "text-teal-600 dark:text-teal-400" : "text-foreground")}>
          {format(date, "EEE, MMM d")}
        </p>
        <p className="text-[11px] text-muted-foreground">
          Planned {formatDuration(plannedTotal)} · Synced {formatDuration(syncedTotal)}
        </p>
      </button>

      <div className="border-b border-r px-1 py-1 flex flex-col gap-1" style={{ height: 56 }}>
        {plannedEntries.length > 0 ? (
          plannedEntries.map((entry) => <PlannedBlock key={entry.id} entry={entry} onClick={() => onEditEntry(entry)} />)
        ) : (
          <button
            type="button"
            onClick={onAddEntry}
            className="h-full rounded border border-dashed border-border/60 text-[11px] text-muted-foreground hover:bg-muted/40 transition-colors"
          >
            Add planned work
          </button>
        )}
      </div>

      <div className={cn("relative border-r cursor-default", isCurrentDay && "bg-teal-50/20 dark:bg-teal-950/10")} style={{ height: HOURS.length * HOUR_HEIGHT }}>
        {HOURS.map((hour, index) => (
          <div key={hour} className="absolute left-0 right-0 border-t border-border/40" style={{ top: index * HOUR_HEIGHT }} />
        ))}
        {HOURS.map((hour, index) => (
          <div key={`half-${hour}`} className="absolute left-0 right-0 border-t border-dashed border-border/20" style={{ top: index * HOUR_HEIGHT + HOUR_HEIGHT / 2 }} />
        ))}
        {syncedEntries.map((entry) => (
          <SyncedBlock key={entry.id} entry={entry} />
        ))}
        {isCurrentDay && <CurrentTimeIndicator />}
      </div>
    </div>
  );
}

function EntryDialog({
  open,
  entry,
  date,
  presetHours,
  onOpenChange,
  onSave,
  onDelete,
}: {
  open: boolean;
  entry: TimesheetEntry | null;
  date: string;
  presetHours: number;
  onOpenChange: (open: boolean) => void;
  onSave: (payload: TimesheetEntryInput | { id: string; data: TimesheetEntryUpdateInput }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [category, setCategory] = useState<EntryCategory>("development");
  const [description, setDescription] = useState("");
  const [jiraIssueKey, setJiraIssueKey] = useState("");
  const [hours, setHours] = useState(presetHours);

  useEffect(() => {
    if (!open) {
      return;
    }

    setCategory(entry?.category ?? "development");
    setDescription(entry?.description ?? "");
    setJiraIssueKey(entry?.jiraIssueKey ?? "");
    setHours(entry?.hours ?? presetHours);
  }, [entry, open, presetHours]);

  const handleSave = async () => {
    if (!description.trim()) {
      return;
    }

    if (entry) {
      await onSave({
        id: entry.id,
        data: {
          category,
          description,
          jiraIssueKey: jiraIssueKey.trim() || undefined,
          hours,
        },
      });
    } else {
      await onSave({
        date,
        category,
        description,
        jiraIssueKey: jiraIssueKey.trim() || undefined,
        hours,
        status: "in-progress",
      });
    }

    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{entry ? "Edit activity" : "Add activity"}</DialogTitle>
          <DialogDescription>
            {entry ? "Update the selected activity." : `Create a new manual activity for ${format(parseISO(date), "EEE, d MMM yyyy")}.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="text-xs text-muted-foreground">
            Day: <span className="font-medium text-foreground">{format(parseISO(date), "EEE, d MMM yyyy")}</span>
          </div>

          <Textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="What did you work on?"
            className="min-h-24"
          />

          <Select value={category} onValueChange={(value) => setCategory(value as EntryCategory)}>
            <SelectTrigger>
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              {CATEGORY_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {CATEGORY_LABELS[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            value={jiraIssueKey}
            onChange={(event) => setJiraIssueKey(event.target.value)}
            placeholder="Jira issue or Bitbucket ref"
          />

          <div className="flex items-center gap-2">
            <Input
              type="number"
              min="0"
              step="0.5"
              value={hours}
              onChange={(event) => setHours(Number(event.target.value) || 0)}
              className="w-24"
            />
            <span className="text-xs text-muted-foreground">hours</span>
          </div>
        </div>

        <DialogFooter>
          {entry && (
            <Button
              type="button"
              variant="ghost"
              className="mr-auto text-muted-foreground hover:text-destructive"
              onClick={() => onDelete(entry.id)}
            >
              <Trash2 className="mr-1.5 size-4" />
              Delete
            </Button>
          )}
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave}>
            <Save className="mr-1.5 size-4" />
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CalendarPage() {
  const queryClient = useQueryClient();
  const { data: session } = authClient.useSession();
  const isAuthenticated = Boolean(session?.user?.id);
  const integrationTimesheetQuery = useIntegrationTimesheet(isAuthenticated);
  const [searchParams, setSearchParams] = useSearchParams();

  const selectedDate = useMemo(() => parseSelectedDate(searchParams.get("date")), [searchParams]);
  const [weekStart, setWeekStart] = useState(() => getWeekStart(selectedDate));
  const [editorState, setEditorState] = useState<EditorState>({
    open: false,
    entry: null,
    date: toIsoDate(selectedDate),
    presetHours: 1,
  });

  useEffect(() => {
    setWeekStart(getWeekStart(selectedDate));
    setEditorState((current) => ({
      ...current,
      date: toIsoDate(selectedDate),
    }));
  }, [selectedDate]);

  const weekEnd = useMemo(() => getWeekEnd(weekStart), [weekStart]);
  const weekDays = useMemo(() => eachDayOfInterval({ start: weekStart, end: weekEnd }), [weekStart, weekEnd]);
  const weekStartKey = toIsoDate(weekStart);
  const weekEndKey = toIsoDate(weekEnd);
  const weekLabel = `${format(weekStart, "MMM d")} – ${format(weekEnd, "MMM d, yyyy")}`;

  const weekEntriesQuery = useQuery({
    queryKey: ["calendar-week", weekStartKey, weekEndKey],
    queryFn: () => fetchTimesheetEntries({ from: weekStartKey, to: weekEndKey }),
    enabled: isAuthenticated,
  });

  const weekManualEntries = weekEntriesQuery.data?.entries ?? [];
  const weekSyncedEntries = useMemo(
    () => (integrationTimesheetQuery.data?.entries ?? []).map(mapIntegrationBlock).filter((entry) => entry.date >= weekStartKey && entry.date <= weekEndKey),
    [integrationTimesheetQuery.data?.entries, weekStartKey, weekEndKey],
  );

  const manualEntriesByDate = useMemo(() => {
    const map = new Map<string, TimesheetEntry[]>();

    for (const entry of weekManualEntries) {
      const existing = map.get(entry.date) ?? [];
      existing.push(entry);
      map.set(entry.date, existing);
    }

    return map;
  }, [weekManualEntries]);

  const syncedEntriesByDate = useMemo(() => {
    const map = new Map<string, CalendarBlock[]>();

    for (const entry of weekSyncedEntries) {
      const existing = map.get(entry.date) ?? [];
      existing.push(entry);
      map.set(entry.date, existing);
    }

    return map;
  }, [weekSyncedEntries]);

  const selectedDateKey = toIsoDate(selectedDate);
  const selectedManualEntries = manualEntriesByDate.get(selectedDateKey) ?? [];
  const selectedSyncedEntries = syncedEntriesByDate.get(selectedDateKey) ?? [];
  const selectedPlannedHours = entryHours(selectedManualEntries);
  const selectedSyncedHours = syncedHours(selectedSyncedEntries);
  const selectedTotalHours = selectedPlannedHours + selectedSyncedHours;

  const createMutation = useMutation({
    mutationFn: createTimesheetEntry,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["calendar-week", weekStartKey, weekEndKey] });
      toast.success("Activity added");
    },
    onError: () => toast.error("Could not add activity"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: TimesheetEntryUpdateInput }) => updateTimesheetEntry(id, data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["calendar-week", weekStartKey, weekEndKey] });
      toast.success("Activity updated");
    },
    onError: () => toast.error("Could not update activity"),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteTimesheetEntry,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["calendar-week", weekStartKey, weekEndKey] });
      toast.success("Activity deleted");
    },
    onError: () => toast.error("Could not delete activity"),
  });

  const openCreateDialog = (date = selectedDateKey, presetHours = 1) => {
    setEditorState({ open: true, entry: null, date, presetHours });
  };

  const openEditDialog = (entry: TimesheetEntry) => {
    setEditorState({ open: true, entry, date: entry.date, presetHours: entry.hours });
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("date", entry.date);
      return next;
    });
  };

  const handlePreviousWeek = () => {
    const nextWeekStart = subWeeks(weekStart, 1);
    setWeekStart(nextWeekStart);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("date", toIsoDate(nextWeekStart));
      return next;
    });
  };

  const handleNextWeek = () => {
    const nextWeekStart = addWeeks(weekStart, 1);
    setWeekStart(nextWeekStart);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("date", toIsoDate(nextWeekStart));
      return next;
    });
  };

  const handleThisWeek = () => {
    const thisWeekStart = getWeekStart(new Date());
    setWeekStart(thisWeekStart);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("date", toIsoDate(new Date()));
      return next;
    });
  };

  const handleSelectDay = (date: Date) => {
    const dateKey = toIsoDate(date);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("date", dateKey);
      return next;
    });
  };

  const handleSave = async (payload: TimesheetEntryInput | { id: string; data: TimesheetEntryUpdateInput }) => {
    if ("id" in payload) {
      await updateMutation.mutateAsync({ id: payload.id, data: payload.data });
      return;
    }

    await createMutation.mutateAsync(payload);
  };

  const handleDelete = async (id: string) => {
    await deleteMutation.mutateAsync(id);
    setEditorState((current) => ({ ...current, open: false, entry: null }));
  };

  const handleAddQuick = (hours: number) => {
    openCreateDialog(selectedDateKey, hours);
  };

  return (
    <div className="flex h-full flex-col gap-5 overflow-hidden p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/70 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
            <CalendarDays className="size-3.5" />
            Calendar view
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">Weekly activity calendar</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Review Jira and Bitbucket activity time-wise across the week, then add or edit your manual planned work for any selected day.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/60 bg-background/80 p-2 shadow-sm backdrop-blur">
          <Button variant="outline" size="sm" onClick={handlePreviousWeek}>
            <ChevronLeft className="size-4" />
          </Button>
          <div className="min-w-40 px-2 text-center text-sm font-medium">{weekLabel}</div>
          <Button variant="outline" size="sm" onClick={handleNextWeek}>
            <ChevronRight className="size-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={handleThisWeek}>
            This week
          </Button>
          <Button size="sm" onClick={() => openCreateDialog(selectedDateKey, 1)}>
            <Plus className="mr-1.5 size-4" />
            Add activity
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        <Card className="border-border/70 shadow-sm">
          <CardHeader className="border-b border-border/60 pb-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="size-4 text-teal-600" />
              Time-blocking calendar
            </CardTitle>
            <CardDescription>
              Planned work appears in the top row. Jira and Bitbucket activity is placed by timestamp in the hourly grid below.
            </CardDescription>
          </CardHeader>

          <CardContent className="p-0">
            {integrationTimesheetQuery.isPending || weekEntriesQuery.isPending ? (
              <div className="grid min-h-[720px] place-items-center text-sm text-muted-foreground">
                <Spinner />
              </div>
            ) : integrationTimesheetQuery.isError || weekEntriesQuery.isError ? (
              <div className="grid min-h-[720px] place-items-center rounded-xl border border-destructive/30 bg-destructive/5 text-sm text-destructive">
                Could not load calendar data.
              </div>
            ) : (
              <div className="overflow-hidden">
                <div className="flex w-full">
                  <div className="sticky left-0 z-10 w-16 shrink-0 bg-background">
                    <div className="h-[calc(2.5rem+1px)] border-b border-r" />
                    <div className="flex h-14 items-center justify-end border-b border-r pr-2">
                      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Planned</span>
                    </div>
                    {HOURS.map((hour) => (
                      <div key={hour} className="relative border-r" style={{ height: HOUR_HEIGHT }}>
                        <span className="absolute -top-2 right-2 text-[10px] font-mono tabular-nums text-muted-foreground">
                          {hour === 12 ? "12 PM" : hour < 12 ? `${hour} AM` : `${hour - 12} PM`}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="flex min-w-0 flex-1">
                    {weekDays.map((day) => {
                      const dayKey = toIsoDate(day);
                      const isSelected = isSameDay(day, selectedDate);
                      const plannedEntries = manualEntriesByDate.get(dayKey) ?? [];
                      const syncedEntries = syncedEntriesByDate.get(dayKey) ?? [];

                      return (
                        <DayColumn
                          key={dayKey}
                          date={day}
                          plannedEntries={plannedEntries}
                          syncedEntries={syncedEntries}
                          selected={isSelected}
                          onSelect={() => handleSelectDay(day)}
                          onEditEntry={openEditDialog}
                          onAddEntry={() => openCreateDialog(dayKey, 1)}
                        />
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4 grid-cols-1">
          <Card className="border-border/70 shadow-sm">
            <CardHeader className="border-b border-border/60 pb-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base">Selected day</CardTitle>
                  <CardDescription>{format(selectedDate, "EEE, d MMM yyyy")}</CardDescription>
                </div>
                <Button size="sm" onClick={() => openCreateDialog(selectedDateKey, 1)}>
                  <Plus className="mr-1.5 size-4" />
                  Add
                </Button>
              </div>
            </CardHeader>

            <CardContent className="space-y-4 pt-4">
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-2xl border border-border/60 bg-muted/20 p-3">
                  <p className="text-xs text-muted-foreground">Planned</p>
                  <p className="text-2xl font-semibold tracking-tight">{formatDuration(selectedPlannedHours)}</p>
                </div>
                <div className="rounded-2xl border border-border/60 bg-muted/20 p-3">
                  <p className="text-xs text-muted-foreground">Synced</p>
                  <p className="text-2xl font-semibold tracking-tight">{formatDuration(selectedSyncedHours)}</p>
                </div>
                <div className="rounded-2xl border border-border/60 bg-muted/20 p-3">
                  <p className="text-xs text-muted-foreground">Total</p>
                  <p className="text-2xl font-semibold tracking-tight">{formatDuration(selectedTotalHours)}</p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium">Planned work</h3>
                  <div className="flex gap-1">
                    <button type="button" onClick={() => handleAddQuick(0.5)} className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted">
                      +30m
                    </button>
                    <button type="button" onClick={() => handleAddQuick(1)} className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted">
                      +1h
                    </button>
                    <button type="button" onClick={() => handleAddQuick(2)} className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted">
                      +2h
                    </button>
                  </div>
                </div>

                {selectedManualEntries.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border/70 bg-background/80 p-4 text-sm text-muted-foreground">
                    No planned work yet for this day.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {selectedManualEntries.map((entry) => (
                      <button
                        key={entry.id}
                        type="button"
                        onClick={() => openEditDialog(entry)}
                        className="w-full rounded-2xl border border-border/70 bg-background p-3 text-left shadow-sm transition-colors hover:border-teal-400"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", CATEGORY_BADGE_CLASSES[entry.category])}>
                                {CATEGORY_LABELS[entry.category]}
                              </span>
                              <span className="text-sm font-medium">{entry.description}</span>
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">{entry.jiraIssueKey ?? "No reference"}</p>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <PencilLine className="size-3.5" />
                            {formatDuration(entry.hours)}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Clock className="size-4 text-teal-600" />
                  <h3 className="text-sm font-medium">Synced activity timeline</h3>
                </div>

                {selectedSyncedEntries.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border/70 bg-background/80 p-4 text-sm text-muted-foreground">
                    No synced Jira or Bitbucket activity for this day.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {selectedSyncedEntries
                      .slice()
                      .sort((left, right) => left.occurredAt.getTime() - right.occurredAt.getTime())
                      .map((entry) => (
                        <div key={entry.id} className="rounded-2xl border border-border/70 bg-background p-3 shadow-sm">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-medium capitalize text-muted-foreground">
                                  {entry.source.toLowerCase()}
                                </span>
                                <span className="text-sm font-medium">{entry.description}</span>
                              </div>
                              <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                                <Globe className="size-3.5" />
                                <span>{formatHour(entry.startHour)}</span>
                                <span>·</span>
                                <span>{CATEGORY_LABELS[entry.category]}</span>
                              </div>
                            </div>
                            <span className="text-xs text-muted-foreground">{formatDuration(entry.durationHours)}</span>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <EntryDialog
        open={editorState.open}
        entry={editorState.entry}
        date={editorState.date}
        presetHours={editorState.presetHours}
        onOpenChange={(open) => setEditorState((current) => ({ ...current, open, entry: open ? current.entry : null }))}
        onSave={handleSave}
        onDelete={handleDelete}
      />
    </div>
  );
}
