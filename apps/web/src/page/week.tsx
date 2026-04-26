import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format, startOfWeek, addDays, isToday, isFuture } from "date-fns";
import {
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  Lock,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  type TimesheetDay,
  type EntryCategory,
  CATEGORY_LABELS,
} from "@/types/timesheet";
import { authClient } from "@/lib/auth-client";
import { useIntegrationTimesheet } from "@/hooks/use-integrations";
import {
  buildWeekDaysFromEntries,
  buildWeeklySummaryFromEntries,
  mapIntegrationEntryToTimesheetEntry,
} from "@/lib/integration-timesheet";

// Category colour map for the summary bar fills

const CATEGORY_BAR_COLORS: Partial<Record<EntryCategory, string>> = {
  development: "bg-teal-500",
  code_review: "bg-purple-500",
  meetings: "bg-zinc-400",
  testing: "bg-blue-400",
  documentation: "bg-amber-400",
  support: "bg-red-400",
  admin: "bg-zinc-500",
  learning: "bg-green-500",
};

// Day card — one column in the 5-day grid

interface DayCardProps {
  day: TimesheetDay;
  onClick: () => void;
}

function DayCard({ day, onClick }: DayCardProps) {
  const date = new Date(day.date + "T12:00:00"); // noon to avoid TZ shift
  const isCurrentDay = isToday(date);
  const isFutureDay = isFuture(date) && !isCurrentDay;
  const isEmpty = day.totalHours === 0;
  const isIncomplete = !isEmpty && day.totalHours < day.targetHours;
  const isComplete = day.totalHours >= day.targetHours;

  // Progress bar fill width capped at 100%
  const fillPct = Math.min((day.totalHours / day.targetHours) * 100, 100);

  return (
    <button
      onClick={!isFutureDay ? onClick : undefined}
      disabled={isFutureDay}
      className={cn(
        "text-left rounded-lg border p-3 transition-all w-full",
        "hover:border-border/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500",
        isCurrentDay && "border-teal-500 ring-1 ring-teal-500/30",
        isIncomplete && !isCurrentDay && "border-amber-400 dark:border-amber-600",
        isFutureDay && "opacity-40 cursor-default",
        !isCurrentDay && !isIncomplete && !isFutureDay && "border-border"
      )}
    >
      {/* Day name */}
      <p
        className={cn(
          "text-xs mb-0.5",
          isCurrentDay
            ? "text-teal-600 dark:text-teal-400 font-semibold"
            : "text-muted-foreground"
        )}
      >
        {isCurrentDay ? "Today" : format(date, "EEE")}
      </p>

      {/* Date */}
      <p className="text-sm font-semibold text-foreground mb-2">
        {format(date, "d MMM")}
      </p>

      {/* Hours */}
      <p
        className={cn(
          "text-xl font-semibold mb-1",
          isEmpty && "text-muted-foreground",
          isIncomplete && "text-amber-600 dark:text-amber-400",
          isComplete && "text-teal-600 dark:text-teal-400"
        )}
      >
        {isEmpty ? "—" : `${day.totalHours}h`}
      </p>

      {/* Progress bar */}
      <div className="h-1 rounded-full bg-muted overflow-hidden mb-1.5">
        {!isEmpty && (
          <div
            className={cn(
              "h-full rounded-full transition-all",
              isComplete ? "bg-teal-500" : "bg-amber-400"
            )}
            style={{ width: `${fillPct}%` }}
          />
        )}
      </div>

      {/* Entry count / status label */}
      <p
        className={cn(
          "text-xs",
          isIncomplete ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"
        )}
      >
        {isEmpty
          ? "No entries"
          : isIncomplete
          ? "Incomplete"
          : `${day.entries.length} entries`}
      </p>
    </button>
  );
}

// Weekly summary bars

interface WeeklySummaryProps {
  summary: Array<{ category: EntryCategory; hours: number }>;
  isLoading: boolean;
}

function WeeklySummary({ summary, isLoading }: WeeklySummaryProps) {
  const totalHours = summary.reduce((sum, s) => sum + s.hours, 0);
  const maxHours = summary.length > 0 ? Math.max(...summary.map((s) => s.hours)) : 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Weekly summary</CardTitle>
          {/* TODO: GET /api/exports/csv?week=:isoWeek */}
          <Button variant="outline" size="sm" className="h-7 text-xs">
            Export CSV
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{totalHours}h total</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-2.5">
        {isLoading && (
          <p className="text-xs text-muted-foreground">Fetching Jira and Bitbucket weekly data...</p>
        )}
        {!isLoading && summary.length === 0 && (
          <p className="text-xs text-muted-foreground">No synced entries for this week yet.</p>
        )}
        {summary.map(({ category, hours }) => (
          <div key={category} className="flex items-center gap-3">
            {/* Category label */}
            <span className="text-xs text-muted-foreground w-28 shrink-0">
              {CATEGORY_LABELS[category]}
            </span>
            {/* Bar */}
            <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full",
                  CATEGORY_BAR_COLORS[category] ?? "bg-zinc-400"
                )}
                style={{ width: `${(hours / (maxHours || 1)) * 100}%` }}
              />
            </div>
            {/* Value */}
            <span className="text-xs text-muted-foreground w-8 text-right font-mono">
              {hours}h
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// Submit week dialog

interface SubmitDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isSubmitting: boolean;
  incompleteDays: string[];
}

function SubmitDialog({
  open,
  onClose,
  onConfirm,
  isSubmitting,
  incompleteDays,
}: SubmitDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Submit this week?</DialogTitle>
          <DialogDescription>
            Once submitted, your entries will be locked and sent to your manager
            for review. You won't be able to edit them after approval.
          </DialogDescription>
        </DialogHeader>

        {/* Warning if incomplete days exist */}
        {incompleteDays.length > 0 && (
          <div className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 p-3 text-sm text-amber-800 dark:text-amber-300">
            <AlertTriangle className="size-4 shrink-0 mt-0.5" />
            <span>
              {incompleteDays.join(", ")} still have incomplete entries. You can
              still submit, but consider filling them first.
            </span>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={isSubmitting}
            className="bg-teal-600 hover:bg-teal-700 text-white"
          >
            {isSubmitting ? (
              "Submitting…"
            ) : (
              <>
                <Send className="size-3.5 mr-1.5" />
                Submit week
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Week Page — main export

export function WeekPage() {
  // State

  const navigate = useNavigate();
  const { data: session } = authClient.useSession();
  const integrationTimesheetQuery = useIntegrationTimesheet(Boolean(session?.user?.id));

  // Week offset from current week (0 = this week, -1 = last week, etc.)
  const [weekOffset, setWeekOffset] = useState(0);

  // Submit dialog
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  // Derived values
  // Week label: "Mar 23 – Mar 29, 2026"
  const weekStart = startOfWeek(addDays(new Date(), weekOffset * 7), { weekStartsOn: 1 });
  const weekEnd = addDays(weekStart, 4); // Mon–Fri
  const weekLabel = `${format(weekStart, "MMM d")} – ${format(weekEnd, "MMM d, yyyy")}`;
  const weekNumber = format(weekStart, "w");

  const mappedEntries = useMemo(
    () =>
      (integrationTimesheetQuery.data?.entries ?? []).map(
        mapIntegrationEntryToTimesheetEntry,
      ),
    [integrationTimesheetQuery.data?.entries],
  );

  const weekDays = useMemo(
    () => buildWeekDaysFromEntries(mappedEntries, weekStart),
    [mappedEntries, weekStart],
  );

  const weeklySummary = useMemo(
    () => buildWeeklySummaryFromEntries(mappedEntries, weekStart),
    [mappedEntries, weekStart],
  );

  // Incomplete days (have some hours but under target)
  const incompleteDays = weekDays
    .filter((d) => d.totalHours > 0 && d.totalHours < d.targetHours)
    .map((d) => format(new Date(d.date + "T12:00:00"), "EEE d MMM"));

  const firstIncompleteDay = weekDays.find(
    (day) => day.totalHours > 0 && day.totalHours < day.targetHours,
  );

  // Days with zero hours (excluding future days)
  const emptyPastDays = weekDays.filter((d) => {
    const date = new Date(d.date + "T12:00:00");
    return d.totalHours === 0 && !isFuture(date) && !isToday(date);
  });

  // Handlers

  /** Navigate to today page for a specific date */
  const handleDayClick = (day: TimesheetDay) => {
    navigate(`/today?date=${day.date}`);
  };

  /** Submit week — calls PATCH /api/timesheets/submit-week */
  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 1000)); // mock delay
      setIsSubmitted(true);
      setSubmitDialogOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Render

  return (
    <div className="flex flex-col h-full">
      {/* Page header */}
      <div className="border-b px-6 py-4 flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          {/* Week navigation */}
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => setWeekOffset((prev) => prev - 1)}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <div>
            <h1 className="text-sm font-semibold">My week</h1>
            <p className="text-xs text-muted-foreground">
              {weekLabel} · Week {weekNumber}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => setWeekOffset((prev) => prev + 1)}
            disabled={weekOffset >= 0} // can't navigate to future weeks
          >
            <ChevronRight className="size-4" />
          </Button>
          {/* Jump to current week */}
          {weekOffset !== 0 && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setWeekOffset(0)}
            >
              This week
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isSubmitted ? (
            /* Submitted state — locked badge */
            <div className="flex items-center gap-1.5 text-xs text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-800 px-3 py-1.5 rounded-md">
              <Lock className="size-3.5" />
              Week submitted
            </div>
          ) : (
            <Button
              size="sm"
              className="h-7 text-xs bg-teal-600 hover:bg-teal-700 text-white"
              onClick={() => setSubmitDialogOpen(true)}
            >
              <Send className="size-3.5 mr-1.5" />
              Submit week
            </Button>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-4">

        {integrationTimesheetQuery.isPending && (
          <div className="rounded-md border border-border bg-muted/30 px-4 py-2.5 text-sm text-muted-foreground">
            Fetching synced Jira and Bitbucket entries...
          </div>
        )}

        {integrationTimesheetQuery.isError && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-2.5 text-sm text-destructive">
            Failed to fetch integration data. Try reconnecting Atlassian/Bitbucket from the dashboard.
          </div>
        )}

        {/* Approved banner — shown after manager approves */}
        {/* TODO: show when weekDays[0].status === "approved" */}
        {isSubmitted && (
          <div className="flex items-center gap-2 rounded-md border border-teal-300 bg-teal-50 dark:bg-teal-950/30 dark:border-teal-700 px-4 py-2.5 text-sm text-teal-800 dark:text-teal-300">
            <CheckCircle2 className="size-4 shrink-0" />
            This week has been submitted. Awaiting manager review.
          </div>
        )}

        {/* Incomplete day warning banner */}
        {incompleteDays.length > 0 && !isSubmitted && (
          <div className="flex items-center justify-between gap-3 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 px-4 py-2.5">
            <div className="flex items-center gap-2 text-sm text-amber-800 dark:text-amber-300">
              <AlertTriangle className="size-4 shrink-0" />
              {incompleteDays[0]} has incomplete entries. Fill in before submitting.
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs border-amber-300 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/30 shrink-0"
              onClick={() =>
                navigate(
                  firstIncompleteDay ? `/today?date=${firstIncompleteDay.date}` : "/today",
                )
              }
            >
              Fill {firstIncompleteDay ? format(new Date(firstIncompleteDay.date + "T12:00:00"), "EEE") : "day"}
            </Button>
          </div>
        )}

        {/* Empty past day warning (no entries at all) */}
        {emptyPastDays.length > 0 && !isSubmitted && (
          <div className="flex items-center gap-2 rounded-md border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/30 px-4 py-2.5 text-sm text-muted-foreground">
            <AlertTriangle className="size-4 shrink-0" />
            {emptyPastDays.length} past{" "}
            {emptyPastDays.length === 1 ? "day has" : "days have"} no entries logged.
          </div>
        )}

        {/* 5-day grid */}
        <div className="grid grid-cols-5 gap-3">
          {weekDays.map((day) => (
            <DayCard
              key={day.date}
              day={day}
              onClick={() => handleDayClick(day)}
            />
          ))}
        </div>

        {/* Weekly summary */}
        <WeeklySummary
          summary={weeklySummary}
          isLoading={integrationTimesheetQuery.isPending}
        />

        {/* Bottom submit CTA */}
        {!isSubmitted && (
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm">
              Save draft
            </Button>
            <Button
              size="sm"
              className="bg-teal-600 hover:bg-teal-700 text-white"
              onClick={() => setSubmitDialogOpen(true)}
            >
              <Send className="size-3.5 mr-1.5" />
              Submit week
            </Button>
          </div>
        )}
      </div>

      {/* Submit dialog */}
      <SubmitDialog
        open={submitDialogOpen}
        onClose={() => setSubmitDialogOpen(false)}
        onConfirm={handleSubmit}
        isSubmitting={isSubmitting}
        incompleteDays={incompleteDays}
      />
    </div>
  );
}
