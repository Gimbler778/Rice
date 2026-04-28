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
  ChevronLeft,
  ChevronRight,
  Clock,
  Globe,
  PencilLine,
  Plus,
  Save,
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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import {
  getLocalIsoDateFromTimestamp,
  mapIntegrationCategory,
} from "@/lib/integration-timesheet";
import type { IntegrationTimesheetEntry } from "@/types/integrations";
import { Slider } from "@/components/ui/slider";

const START_HOUR = 7;
const END_HOUR = 23;
const VISIBLE_HOURS = END_HOUR - START_HOUR;

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

const TIME_OPTIONS = Array.from(
  { length: (END_HOUR - START_HOUR) * 2 + 1 },
  (_, index) => START_HOUR + index * 0.5,
);

const ZOOM_PRESETS = [
  { intervalMinutes: 60, hourHeight: 48 },
  { intervalMinutes: 50, hourHeight: 56 },
  { intervalMinutes: 40, hourHeight: 64 },
  { intervalMinutes: 30, hourHeight: 72 },
  { intervalMinutes: 20, hourHeight: 88 },
  { intervalMinutes: 10, hourHeight: 104 },
] as const;

const ENTRY_COLORS: Partial<Record<EntryCategory, { bg: string; hover: string }>> = {
  development: { bg: "bg-chart-1/15", hover: "hover:bg-chart-1/25" },
  code_review: { bg: "bg-chart-4/15", hover: "hover:bg-chart-4/25" },
  testing: { bg: "bg-chart-2/15", hover: "hover:bg-chart-2/25" },
  documentation: { bg: "bg-chart-3/15", hover: "hover:bg-chart-3/25" },
  meetings: { bg: "bg-muted", hover: "hover:bg-muted/80" },
  admin: { bg: "bg-muted", hover: "hover:bg-muted/80" },
  support: { bg: "bg-destructive/15", hover: "hover:bg-destructive/25" },
  learning: { bg: "bg-primary/15", hover: "hover:bg-primary/25" },
  org_sessions: { bg: "bg-secondary/20", hover: "hover:bg-secondary/30" },
  events: { bg: "bg-chart-5/15", hover: "hover:bg-chart-5/25" },
  manual_other: { bg: "bg-muted/60", hover: "hover:bg-muted/80" },
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
  const displayHour =
    hourValue > 12 ? hourValue - 12 : hourValue === 0 ? 12 : hourValue;
  return `${displayHour}:${String(minuteValue).padStart(2, "0")} ${ampm}`;
}

function formatHourLabel(hour: number) {
  const hourValue = Math.floor(hour);
  const ampm = hourValue < 12 ? "AM" : "PM";
  const displayHour =
    hourValue > 12 ? hourValue - 12 : hourValue === 0 ? 12 : hourValue;
  return `${displayHour} ${ampm}`;
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

function buildTimeSlots(intervalMinutes: number) {
  const slots: number[] = [];
  const totalMinutes = VISIBLE_HOURS * 60;

  for (let minutes = 0; minutes <= totalMinutes; minutes += intervalMinutes) {
    slots.push(START_HOUR + minutes / 60);
  }

  if (slots[slots.length - 1] !== END_HOUR) {
    slots.push(END_HOUR);
  }

  return slots;
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
      hover: "hover:bg-muted/80",
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

type TimelineBlock = {
  id: string;
  startHour: number;
  durationHours: number;
  category: EntryCategory;
  description: string;
  jiraIssueKey?: string;
  kind: "planned" | "synced";
  onClick?: () => void;
};

type PositionedTimelineBlock = TimelineBlock & {
  lane: number;
  laneCount: number;
};

function layoutTimelineBlocks(blocks: TimelineBlock[], hourHeight: number) {
  const sortedBlocks = blocks.slice().sort((left, right) => {
    const startDelta = left.startHour - right.startHour;
    if (startDelta !== 0) {
      return startDelta;
    }

    return right.durationHours - left.durationHours;
  });

  const laneEnds: number[] = [];
  const positionedBlocks: PositionedTimelineBlock[] = [];

  for (const block of sortedBlocks) {
    const blockTop = (block.startHour - START_HOUR) * hourHeight;
    const blockEnd = blockTop + Math.max(block.durationHours * hourHeight, 28);
    let lane = laneEnds.findIndex((laneEnd) => laneEnd <= blockTop);

    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(blockEnd);
    } else {
      laneEnds[lane] = blockEnd;
    }

    positionedBlocks.push({ ...block, lane, laneCount: 0 });
  }

  const laneCount = Math.max(1, laneEnds.length);
  return positionedBlocks.map((block) => ({ ...block, laneCount }));
}

function TimelineBlockCard({
  block,
  hourHeight,
}: {
  block: PositionedTimelineBlock;
  hourHeight: number;
}) {
  const top = (block.startHour - START_HOUR) * hourHeight;
  const height = Math.max(block.durationHours * hourHeight, 40);
  const laneWidth = `calc((100% - ${(block.laneCount - 1) * 6}px) / ${block.laneCount})`;
  const left = `calc(${block.lane} * (${laneWidth} + 6px))`;
  const color = entryColor(block.category);
  const BlockTag = block.onClick ? "button" : "div";

  return (
    <BlockTag
      type={block.onClick ? "button" : undefined}
      onClick={block.onClick}
      className={cn(
        "absolute rounded-md overflow-hidden select-none text-left transition-colors",
        color.bg,
        block.onClick && cn("cursor-pointer", color.hover),
      )}
      style={{ top, height, left, width: laneWidth }}
    >
      <div className="flex h-full flex-col justify-between gap-1 px-2.5 py-1.5">
        <div className="min-w-0">
          <p className="text-xs font-medium leading-tight line-clamp-2 text-foreground">
            {block.description}
          </p>
          <p className="text-[11px] leading-tight truncate text-muted-foreground">
            {CATEGORY_LABELS[block.category]}
            {block.jiraIssueKey ? ` · ${block.jiraIssueKey}` : ""}
          </p>
        </div>
        <p className="text-[11px] font-mono text-muted-foreground">
          {formatHour(block.startHour)} – {formatHour(block.startHour + block.durationHours)}
        </p>
      </div>
    </BlockTag>
  );
}

function CurrentTimeIndicator({ hourHeight }: { hourHeight: number }) {
  const now = new Date();
  const currentHour = now.getHours() + now.getMinutes() / 60;
  const top = (currentHour - START_HOUR) * hourHeight;

  if (currentHour < START_HOUR || currentHour > END_HOUR) {
    return null;
  }

  return (
    <div
      className="absolute left-0 right-0 z-20 flex items-center pointer-events-none"
      style={{ top }}
    >
      <div className="size-2 rounded-full bg-primary/90 -ml-1 shrink-0" />
      <div className="h-px flex-1 bg-primary/70" />
    </div>
  );
}

function DayColumn({
  date,
  plannedEntries,
  syncedEntries,
  intervalMinutes,
  hourHeight,
  selected,
  onSelect,
  onEditEntry,
  onAddEntry,
}: {
  date: Date;
  plannedEntries: TimesheetEntry[];
  syncedEntries: CalendarBlock[];
  intervalMinutes: number;
  hourHeight: number;
  selected: boolean;
  onSelect: () => void;
  onEditEntry: (entry: TimesheetEntry) => void;
  onAddEntry: () => void;
}) {
  const isCurrentDay = isSameDay(date, new Date());
  const plannedTotal = entryHours(plannedEntries);
  const syncedTotal = syncedHours(syncedEntries);
  const timeSlots = useMemo(
    () => buildTimeSlots(intervalMinutes),
    [intervalMinutes],
  );
  const dayHeight = VISIBLE_HOURS * hourHeight;
  const timelineBlocks = useMemo(
    () =>
      layoutTimelineBlocks(
        [
          ...plannedEntries.map((entry) => ({
            id: entry.id,
            startHour: entry.startHour ?? 9,
            durationHours: entry.hours,
            category: entry.category,
            description: entry.description,
            jiraIssueKey: entry.jiraIssueKey,
            kind: "planned" as const,
            onClick: () => onEditEntry(entry),
          })),
          ...syncedEntries.map((entry) => ({
            id: entry.id,
            startHour: entry.startHour,
            durationHours: entry.durationHours,
            category: entry.category,
            description: entry.description,
            jiraIssueKey: entry.jiraIssueKey,
            kind: "synced" as const,
          })),
        ],
        hourHeight,
      ),
    [hourHeight, onEditEntry, plannedEntries, syncedEntries],
  );

  return (
    <div
      className={cn(
        "flex min-w-0 flex-1 flex-col",
        isCurrentDay && "bg-primary/5",
        selected && !isCurrentDay && "bg-accent/40",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className="sticky top-0 z-10 flex h-20 flex-col items-center justify-center gap-0.5 bg-inherit transition-colors"
      >
        <div className="flex items-center gap-1.5">
          {isCurrentDay && <span className="size-1.5 rounded-full bg-primary" />}
          <span
            className={cn(
              "text-[11px] font-medium uppercase tracking-wider",
              isCurrentDay ? "text-primary" : "text-muted-foreground",
            )}
          >
            {format(date, "EEE")}
          </span>
        </div>
        <span
          className={cn(
            "text-lg font-semibold leading-none",
            isCurrentDay ? "text-primary" : "text-foreground",
          )}
        >
          {format(date, "d")}
        </span>
        <span className="text-[11px] text-muted-foreground">
          {formatDuration(plannedTotal + syncedTotal)}
        </span>
      </button>

      <div
        className="relative cursor-default"
        style={{ height: dayHeight }}
      >
        {timeSlots.map((slot, index) => {
          const minuteValue = Math.round((slot - Math.floor(slot)) * 60);
          const isHourMark = minuteValue === 0;

          if (!isHourMark) {
            return null;
          }

          return (
            <div
              key={`slot-${slot}-${index}`}
              className="absolute inset-x-0 h-px bg-border/40"
              style={{ top: (slot - START_HOUR) * hourHeight }}
            />
          );
        })}
        {timelineBlocks.length === 0 ? (
          <button
            type="button"
            onClick={onAddEntry}
            className="absolute inset-x-2 inset-y-3 rounded-md text-[11px] text-muted-foreground/70 hover:bg-muted/40 transition-colors flex items-start justify-center pt-3"
          >
            + Add work
          </button>
        ) : (
          timelineBlocks.map((block) => (
            <TimelineBlockCard
              key={block.kind + block.id}
              block={block}
              hourHeight={hourHeight}
            />
          ))
        )}
        {isCurrentDay && <CurrentTimeIndicator hourHeight={hourHeight} />}
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
  onSave: (
    payload:
      | TimesheetEntryInput
      | { id: string; data: TimesheetEntryUpdateInput },
  ) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [category, setCategory] = useState<EntryCategory>("development");
  const [description, setDescription] = useState("");
  const [jiraIssueKey, setJiraIssueKey] = useState("");
  const [hours, setHours] = useState(presetHours);
  const [startHour, setStartHour] = useState(9);

  useEffect(() => {
    if (!open) {
      return;
    }

    setCategory(entry?.category ?? "development");
    setDescription(entry?.description ?? "");
    setJiraIssueKey(entry?.jiraIssueKey ?? "");
    setHours(entry?.hours ?? presetHours);
    setStartHour(entry?.startHour ?? 9);
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
          startHour,
        },
      });
    } else {
      await onSave({
        date,
        category,
        description,
        jiraIssueKey: jiraIssueKey.trim() || undefined,
        hours,
        startHour,
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
            {entry
              ? "Update the selected activity."
              : `Create a new manual activity for ${format(parseISO(date), "EEE, d MMM yyyy")}.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="text-xs text-muted-foreground">
            Day:{" "}
            <span className="font-medium text-foreground">
              {format(parseISO(date), "EEE, d MMM yyyy")}
            </span>
          </div>

          <Textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="What did you work on?"
            className="min-h-24"
          />

          <Select
            value={category}
            onValueChange={(value) => setCategory(value as EntryCategory)}
          >
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

          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium">Start time</label>
              <Select
                value={String(startHour)}
                onValueChange={(value) => setStartHour(Number(value))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select time" />
                </SelectTrigger>
                <SelectContent>
                  {TIME_OPTIONS.map((option) => (
                    <SelectItem key={option} value={String(option)}>
                      {formatHour(option)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium">End time</label>
              <div className="flex h-10 items-center rounded-md border border-input bg-muted/30 px-3 text-sm text-muted-foreground">
                {formatHour(startHour + hours)}
              </div>
            </div>
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
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
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
  const [zoomLevel, setZoomLevel] = useState(0);

  const selectedDate = useMemo(
    () => parseSelectedDate(searchParams.get("date")),
    [searchParams],
  );
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
  const weekDays = useMemo(
    () => eachDayOfInterval({ start: weekStart, end: weekEnd }),
    [weekStart, weekEnd],
  );
  const { intervalMinutes, hourHeight } = ZOOM_PRESETS[zoomLevel];
  const timeSlots = useMemo(
    () => buildTimeSlots(intervalMinutes),
    [intervalMinutes],
  );
  const calendarHeight = VISIBLE_HOURS * hourHeight;
  const weekStartKey = toIsoDate(weekStart);
  const weekEndKey = toIsoDate(weekEnd);
  const weekLabel = `${format(weekStart, "MMM d")} – ${format(weekEnd, "MMM d, yyyy")}`;

  const weekEntriesQuery = useQuery({
    queryKey: ["calendar-week", weekStartKey, weekEndKey],
    queryFn: () =>
      fetchTimesheetEntries({ from: weekStartKey, to: weekEndKey }),
    enabled: isAuthenticated,
  });

  const weekManualEntries = weekEntriesQuery.data?.entries ?? [];
  const weekSyncedEntries = useMemo(
    () =>
      (integrationTimesheetQuery.data?.entries ?? [])
        .map(mapIntegrationBlock)
        .filter(
          (entry) => entry.date >= weekStartKey && entry.date <= weekEndKey,
        ),
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
      await queryClient.invalidateQueries({
        queryKey: ["calendar-week", weekStartKey, weekEndKey],
      });
      toast.success("Activity added");
    },
    onError: () => toast.error("Could not add activity"),
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: TimesheetEntryUpdateInput;
    }) => updateTimesheetEntry(id, data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["calendar-week", weekStartKey, weekEndKey],
      });
      toast.success("Activity updated");
    },
    onError: () => toast.error("Could not update activity"),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteTimesheetEntry,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["calendar-week", weekStartKey, weekEndKey],
      });
      toast.success("Activity deleted");
    },
    onError: () => toast.error("Could not delete activity"),
  });

  const openCreateDialog = (date = selectedDateKey, presetHours = 1) => {
    setEditorState({ open: true, entry: null, date, presetHours });
  };

  const openEditDialog = (entry: TimesheetEntry) => {
    setEditorState({
      open: true,
      entry,
      date: entry.date,
      presetHours: entry.hours,
    });
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

  const handleSave = async (
    payload:
      | TimesheetEntryInput
      | { id: string; data: TimesheetEntryUpdateInput },
  ) => {
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
    <div className="flex h-full flex-col gap-6 overflow-y-auto p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {weekLabel}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center">
            <Button variant="ghost" size="icon" onClick={handlePreviousWeek}>
              <ChevronLeft className="size-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={handleThisWeek}>
              Today
            </Button>
            <Button variant="ghost" size="icon" onClick={handleNextWeek}>
              <ChevronRight className="size-4" />
            </Button>
          </div>
          <div className="flex items-center gap-2 px-2">
            <span className="text-xs text-muted-foreground">Zoom</span>
            <Slider
              min={0}
              max={ZOOM_PRESETS.length - 1}
              step={1}
              value={[zoomLevel]}
              onValueChange={(value) => setZoomLevel(value[0])}
              className="h-7 w-24"
            />
          </div>
          <Button
            size="sm"
            onClick={() => openCreateDialog(selectedDateKey, 1)}
          >
            <Plus className="mr-1.5 size-4" />
            Add activity
          </Button>
        </div>
      </div>

      <div className="space-y-6">
        <Card className="overflow-hidden border-border/60 shadow-sm">
          <CardContent className="p-0">
            {integrationTimesheetQuery.isPending ||
            weekEntriesQuery.isPending ? (
              <div className="grid min-h-[720px] place-items-center text-sm text-muted-foreground">
                <Spinner />
              </div>
            ) : integrationTimesheetQuery.isError ||
              weekEntriesQuery.isError ? (
              <div className="grid min-h-[720px] place-items-center bg-destructive/5 text-sm text-destructive">
                Could not load calendar data.
              </div>
            ) : (
              <div className="flex w-full">
                <div className="sticky left-0 z-10 w-16 shrink-0 bg-background">
                  <div className="h-20" />
                  <div
                    className="relative"
                    style={{ height: calendarHeight }}
                  >
                    {timeSlots
                      .filter((slot) => {
                        const minuteValue = Math.round(
                          (slot - Math.floor(slot)) * 60,
                        );
                        return (
                          minuteValue === 0 &&
                          slot > START_HOUR &&
                          slot < END_HOUR
                        );
                      })
                      .map((slot) => (
                        <span
                          key={`label-${slot}`}
                          className="absolute right-3 -translate-y-1/2 bg-background px-1 text-[10px] font-medium tabular-nums text-muted-foreground"
                          style={{ top: (slot - START_HOUR) * hourHeight }}
                        >
                          {formatHourLabel(slot)}
                        </span>
                      ))}
                  </div>
                </div>

                <div className="flex min-w-0 flex-1 divide-x divide-border/40">
                  {weekDays.map((day) => {
                    const dayKey = toIsoDate(day);
                    const isSelected = isSameDay(day, selectedDate);
                    const plannedEntries =
                      manualEntriesByDate.get(dayKey) ?? [];
                    const syncedEntries =
                      syncedEntriesByDate.get(dayKey) ?? [];

                    return (
                      <DayColumn
                        key={dayKey}
                        date={day}
                        plannedEntries={plannedEntries}
                        syncedEntries={syncedEntries}
                        intervalMinutes={intervalMinutes}
                        hourHeight={hourHeight}
                        selected={isSelected}
                        onSelect={() => handleSelectDay(day)}
                        onEditEntry={openEditDialog}
                        onAddEntry={() => openCreateDialog(dayKey, 1)}
                      />
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-0.5">
                <CardTitle className="text-base">
                  {format(selectedDate, "EEEE, d MMM")}
                </CardTitle>
                <CardDescription>
                  {formatDuration(selectedTotalHours)} total ·{" "}
                  {formatDuration(selectedPlannedHours)} planned ·{" "}
                  {formatDuration(selectedSyncedHours)} synced
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => openCreateDialog(selectedDateKey, 1)}
              >
                <Plus className="mr-1.5 size-4" />
                Add
              </Button>
            </div>
          </CardHeader>

          <CardContent className="space-y-6 pt-2">
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">Planned work</h3>
                <div className="flex gap-1">
                  {[0.5, 1, 2].map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => handleAddQuick(value)}
                      className="rounded-full px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted"
                    >
                      +{value === 0.5 ? "30m" : `${value}h`}
                    </button>
                  ))}
                </div>
              </div>

              {selectedManualEntries.length === 0 ? (
                <p className="rounded-md bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground">
                  No planned work yet for this day.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {selectedManualEntries.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => openEditDialog(entry)}
                      className="group flex w-full items-start justify-between gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-muted/60"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-[11px] font-medium",
                              CATEGORY_BADGE_CLASSES[entry.category],
                            )}
                          >
                            {CATEGORY_LABELS[entry.category]}
                          </span>
                          <span className="text-sm font-medium">
                            {entry.description}
                          </span>
                        </div>
                        {entry.jiraIssueKey && (
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {entry.jiraIssueKey}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <PencilLine className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
                        {formatDuration(entry.hours)}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </section>

            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <Clock className="size-4 text-muted-foreground" />
                <h3 className="text-sm font-medium">Synced activity</h3>
              </div>

              {selectedSyncedEntries.length === 0 ? (
                <p className="rounded-md bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground">
                  No synced Jira or Bitbucket activity for this day.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {selectedSyncedEntries
                    .slice()
                    .sort(
                      (left, right) =>
                        left.occurredAt.getTime() - right.occurredAt.getTime(),
                    )
                    .map((entry) => (
                      <div
                        key={entry.id}
                        className="flex items-start justify-between gap-3 rounded-md px-3 py-2.5"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium capitalize text-muted-foreground">
                              {entry.source.toLowerCase()}
                            </span>
                            <span className="text-sm font-medium">
                              {entry.description}
                            </span>
                          </div>
                          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Globe className="size-3" />
                            <span>{formatHour(entry.startHour)}</span>
                            <span>·</span>
                            <span>{CATEGORY_LABELS[entry.category]}</span>
                          </div>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {formatDuration(entry.durationHours)}
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </section>
          </CardContent>
        </Card>
      </div>

      <EntryDialog
        open={editorState.open}
        entry={editorState.entry}
        date={editorState.date}
        presetHours={editorState.presetHours}
        onOpenChange={(open) =>
          setEditorState((current) => ({
            ...current,
            open,
            entry: open ? current.entry : null,
          }))
        }
        onSave={handleSave}
        onDelete={handleDelete}
      />
    </div>
  );
}
