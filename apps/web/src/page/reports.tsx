import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { fetchTimesheetEntries } from "@/api/timesheets-api";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import {
  CATEGORY_LABELS,
  type EntryCategory,
  type TimesheetEntry,
} from "@/types/timesheet";
import {
  addDays,
  eachDayOfInterval,
  format,
  isSameDay,
  isWeekend,
  startOfMonth,
  startOfQuarter,
  startOfWeek,
} from "date-fns";

const PERIODS = ["week", "month", "quarter"] as const;
type ReportPeriod = (typeof PERIODS)[number];

type ReportsScope = "individual" | "team";

type CategoryAggregate = {
  category: EntryCategory;
  hours: number;
};

type PeriodRange = {
  from: string;
  to: string;
  label: string;
};

const CATEGORY_ORDER: EntryCategory[] = [
  "development",
  "code_review",
  "testing",
  "documentation",
  "meetings",
  "admin",
  "org_sessions",
  "events",
  "support",
  "learning",
  "manual_other",
];

const CATEGORY_COLORS: Record<EntryCategory, string> = {
  development: "var(--chart-1)",
  code_review: "var(--chart-4)",
  testing: "var(--chart-2)",
  documentation: "var(--chart-3)",
  meetings: "var(--muted-foreground)",
  admin: "var(--muted-foreground)",
  org_sessions: "var(--secondary)",
  events: "var(--chart-5)",
  support: "var(--destructive)",
  learning: "var(--primary)",
  manual_other: "var(--muted-foreground)",
};

const PRIMARY_COLOR = "var(--primary)";
const TESTING_COLOR = "var(--chart-2)";

function toIsoDate(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

function getPeriodRange(period: ReportPeriod, baseDate = new Date()): PeriodRange {
  const end = baseDate;
  let start: Date;

  switch (period) {
    case "month":
      start = startOfMonth(end);
      break;
    case "quarter":
      start = startOfQuarter(end);
      break;
    case "week":
    default:
      start = startOfWeek(end, { weekStartsOn: 1 });
      break;
  }

  return {
    from: toIsoDate(start),
    to: toIsoDate(end),
    label: `${format(start, "d MMM")} - ${format(end, "d MMM")}`,
  };
}

function formatHours(hours: number): string {
  return `${hours.toFixed(1).replace(/\.0$/, "")}h`;
}

function createCsv(rows: string[][]): string {
  return rows
    .map((row) => row.map((cell) => `"${cell.replaceAll("\"", "\"\"")}"`).join(","))
    .join("\n");
}

function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function countTargetHours(from: string, to: string): number {
  const days = eachDayOfInterval({
    start: new Date(`${from}T12:00:00`),
    end: new Date(`${to}T12:00:00`),
  });

  return days.filter((day) => !isWeekend(day)).length * 8;
}

function sumHours(entries: TimesheetEntry[]): number {
  return entries.reduce((sum, entry) => sum + entry.hours, 0);
}

function aggregateByCategory(entries: TimesheetEntry[]): CategoryAggregate[] {
  return CATEGORY_ORDER.map((category) => ({
    category,
    hours: entries
      .filter((entry) => entry.category === category)
      .reduce((sum, entry) => sum + entry.hours, 0),
  })).filter((entry) => entry.hours > 0);
}

function getCategoryLabel(category: EntryCategory): string {
  return CATEGORY_LABELS[category] ?? category;
}

function getWeekLabel(date: Date): string {
  return `${format(date, "d MMM")} - ${format(addDays(date, 6), "d MMM")}`;
}

function aggregateWeeklyCategoryHours(entries: TimesheetEntry[], from: string, to: string) {
  const weeks = eachDayOfInterval({
    start: startOfWeek(new Date(`${from}T12:00:00`), { weekStartsOn: 1 }),
    end: new Date(`${to}T12:00:00`),
  }).filter((day, index, all) => {
    const weekStart = startOfWeek(day, { weekStartsOn: 1 });
    return index === all.findIndex((candidate) => isSameDay(candidate, weekStart));
  });

  return weeks.map((weekStart) => {
    const weekEnd = addDays(weekStart, 6);
    const weekEntries = entries.filter((entry) => {
      const entryDate = new Date(`${entry.date}T12:00:00`);
      return entryDate >= weekStart && entryDate <= weekEnd;
    });

    const categoryHours = CATEGORY_ORDER.reduce<Record<EntryCategory, number>>((acc, category) => {
      acc[category] = weekEntries
        .filter((entry) => entry.category === category)
        .reduce((sum, entry) => sum + entry.hours, 0);
      return acc;
    }, {} as Record<EntryCategory, number>);

    return {
      label: getWeekLabel(weekStart),
      weekStart: toIsoDate(weekStart),
      totalHours: sumHours(weekEntries),
      categoryHours,
    };
  }).filter((week) => week.totalHours > 0);
}

function getPieSegments(summary: CategoryAggregate[]) {
  const total = summary.reduce((sum, item) => sum + item.hours, 0);
  let cursor = 0;

  return summary.map((item) => {
    const size = total === 0 ? 0 : item.hours / total;
    const start = cursor;
    cursor += size;
    return {
      ...item,
      size,
      start,
      end: cursor,
    };
  });
}

function PieDonutChart({ summary }: { summary: CategoryAggregate[] }) {
  const total = summary.reduce((sum, item) => sum + item.hours, 0);
  const segments = getPieSegments(summary);
  const radius = 72;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="grid gap-6 lg:grid-cols-[220px_1fr] lg:items-center">
      <div className="flex items-center justify-center">
        <svg viewBox="0 0 220 220" className="size-[200px]">
          <circle
            cx="110"
            cy="110"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeOpacity="0.08"
            strokeWidth="28"
          />
          {segments.length === 0 ? (
            <circle
              cx="110"
              cy="110"
              r={radius}
              fill="none"
              stroke={PRIMARY_COLOR}
              strokeOpacity="0.2"
              strokeWidth="28"
            />
          ) : (
            segments.map((segment) => {
              const dashLength = segment.size * circumference;
              const offset = circumference * (1 - segment.start);
              return (
                <circle
                  key={segment.category}
                  cx="110"
                  cy="110"
                  r={radius}
                  fill="none"
                  stroke={CATEGORY_COLORS[segment.category]}
                  strokeWidth="28"
                  strokeDasharray={`${dashLength} ${circumference - dashLength}`}
                  strokeDashoffset={offset}
                  strokeLinecap="butt"
                  transform="rotate(-90 110 110)"
                />
              );
            })
          )}
          <text
            x="110"
            y="105"
            textAnchor="middle"
            className="fill-foreground text-[20px] font-semibold"
          >
            {formatHours(total)}
          </text>
          <text
            x="110"
            y="125"
            textAnchor="middle"
            className="fill-muted-foreground text-[10px] uppercase tracking-[0.2em]"
          >
            logged
          </text>
        </svg>
      </div>
      <div className="space-y-1">
        {segments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No entries in this period yet.
          </p>
        ) : (
          segments.map((segment) => (
            <div
              key={segment.category}
              className="flex items-center gap-3 rounded-md px-2 py-1.5"
            >
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: CATEGORY_COLORS[segment.category] }}
              />
              <p className="flex-1 truncate text-sm">
                {getCategoryLabel(segment.category)}
              </p>
              <p className="text-xs tabular-nums text-muted-foreground">
                {formatHours(segment.hours)}
              </p>
              <p className="w-10 text-right text-xs tabular-nums text-muted-foreground">
                {Math.round(segment.size * 100)}%
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function StackedWorkBar({
  plannedHours,
  unplannedHours,
}: {
  plannedHours: number;
  unplannedHours: number;
}) {
  const total = plannedHours + unplannedHours;
  const plannedPct = total === 0 ? 0 : (plannedHours / total) * 100;
  const unplannedPct = total === 0 ? 0 : (unplannedHours / total) * 100;

  return (
    <div className="space-y-5">
      <div className="flex items-baseline justify-between">
        <span className="text-3xl font-semibold tracking-tight">
          {formatHours(total)}
        </span>
        <span className="text-xs text-muted-foreground">total logged</span>
      </div>
      <div className="flex h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-primary" style={{ width: `${plannedPct}%` }} />
        <div
          className="h-full bg-muted-foreground/40"
          style={{ width: `${unplannedPct}%` }}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex items-center gap-3">
          <span className="size-2.5 shrink-0 rounded-full bg-primary" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Planned</p>
            <p className="text-xs text-muted-foreground">
              Tied to a Jira issue
            </p>
          </div>
          <span className="text-sm font-semibold tabular-nums">
            {formatHours(plannedHours)}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="size-2.5 shrink-0 rounded-full bg-muted-foreground/40" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Unplanned</p>
            <p className="text-xs text-muted-foreground">
              Ad hoc or overhead work
            </p>
          </div>
          <span className="text-sm font-semibold tabular-nums">
            {formatHours(unplannedHours)}
          </span>
        </div>
      </div>
    </div>
  );
}

function AreaTrendChart({
  entries,
  from,
  to,
}: {
  entries: TimesheetEntry[];
  from: string;
  to: string;
}) {
  const days = eachDayOfInterval({
    start: new Date(`${from}T12:00:00`),
    end: new Date(`${to}T12:00:00`),
  });

  const points = days.map((day, index) => {
    const dayKey = toIsoDate(day);
    const total = entries
      .filter(
        (entry) =>
          entry.date === dayKey &&
          ["development", "testing"].includes(entry.category),
      )
      .reduce((sum, entry) => sum + entry.hours, 0);

    return {
      day,
      label: format(day, "EEE"),
      total,
      x: days.length <= 1 ? 0 : (index / (days.length - 1)) * 100,
    };
  });

  const maxValue = Math.max(1, ...points.map((point) => point.total));
  const chartHeight = 180;
  const chartWidth = 560;

  const svgPoints = points
    .map((point) => {
      const x = (point.x / 100) * chartWidth;
      const y = chartHeight - (point.total / maxValue) * chartHeight;
      return `${x},${y}`;
    })
    .join(" ");

  const areaPoints = `0,${chartHeight} ${svgPoints} ${chartWidth},${chartHeight}`;

  return (
    <div className="space-y-3">
      <svg
        viewBox={`0 0 ${chartWidth} ${chartHeight + 20}`}
        className="h-56 w-full"
      >
        {[0.25, 0.5, 0.75, 1].map((tick) => (
          <line
            key={tick}
            x1="0"
            x2={chartWidth}
            y1={chartHeight - tick * chartHeight}
            y2={chartHeight - tick * chartHeight}
            stroke="currentColor"
            strokeOpacity="0.08"
          />
        ))}
        {points.map((point, index) => {
          const x = (point.x / 100) * chartWidth;
          const y = chartHeight - (point.total / maxValue) * chartHeight;
          return (
            <g key={`${point.label}-${index}`}>
              <circle cx={x} cy={y} r="3" fill={PRIMARY_COLOR} />
              <text
                x={x}
                y={chartHeight + 14}
                textAnchor="middle"
                className="fill-muted-foreground text-[10px]"
              >
                {point.label}
              </text>
            </g>
          );
        })}
        <polygon points={areaPoints} fill={PRIMARY_COLOR} fillOpacity="0.12" />
        <polyline
          points={svgPoints}
          fill="none"
          stroke={PRIMARY_COLOR}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <span
            className="size-2 rounded-full"
            style={{ backgroundColor: PRIMARY_COLOR }}
          />
          Development
        </span>
        <span className="inline-flex items-center gap-2">
          <span
            className="size-2 rounded-full"
            style={{ backgroundColor: TESTING_COLOR }}
          />
          Testing
        </span>
      </div>
    </div>
  );
}

function WeeklyStackedDistribution({
  entries,
  from,
  to,
}: {
  entries: TimesheetEntry[];
  from: string;
  to: string;
}) {
  const weeks = aggregateWeeklyCategoryHours(entries, from, to);
  const maxHours = Math.max(1, ...weeks.map((week) => week.totalHours));

  if (weeks.length === 0) {
    return (
      <p className="rounded-md bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground">
        No weekly data yet for this period.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {weeks.map((week) => {
        const visibleCategories = CATEGORY_ORDER.map((category) => ({
          category,
          hours: week.categoryHours[category] ?? 0,
        })).filter((item) => item.hours > 0);

        return (
          <div key={week.weekStart} className="space-y-2">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm font-medium">{week.label}</p>
              <p className="text-xs tabular-nums text-muted-foreground">
                {formatHours(week.totalHours)}
              </p>
            </div>
            <div className="flex h-2 overflow-hidden rounded-full bg-muted">
              {visibleCategories.map((segment) => (
                <div
                  key={segment.category}
                  className="h-full"
                  style={{
                    width: `${(segment.hours / maxHours) * 100}%`,
                    backgroundColor: CATEGORY_COLORS[segment.category],
                  }}
                  title={`${getCategoryLabel(segment.category)}: ${formatHours(segment.hours)}`}
                />
              ))}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {visibleCategories.map((segment) => (
                <span
                  key={segment.category}
                  className="inline-flex items-center gap-1.5"
                >
                  <span
                    className="size-2 rounded-full"
                    style={{
                      backgroundColor: CATEGORY_COLORS[segment.category],
                    }}
                  />
                  {getCategoryLabel(segment.category)} ·{" "}
                  {formatHours(segment.hours)}
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ReportsContent({ scope = "individual" }: { scope?: ReportsScope }) {
  const { data: session } = authClient.useSession();
  const [period, setPeriod] = useState<ReportPeriod>("week");
  const range = useMemo(() => getPeriodRange(period), [period]);

  const { data: entries = [], isLoading, isError } = useQuery({
    queryKey: ["reports", scope, period, range.from, range.to, session?.user?.id],
    enabled: Boolean(session?.user?.id),
    queryFn: async () => {
      const response = await fetchTimesheetEntries({ from: range.from, to: range.to });
      return response.entries;
    },
  });

  const summary = useMemo(() => aggregateByCategory(entries), [entries]);
  const totalHours = useMemo(() => sumHours(entries), [entries]);
  const targetHours = useMemo(() => countTargetHours(range.from, range.to), [range.from, range.to]);
  const completeness = targetHours === 0 ? 0 : (totalHours / targetHours) * 100;
  const plannedHours = useMemo(
    () => entries.filter((entry) => Boolean(entry.jiraIssueKey)).reduce((sum, entry) => sum + entry.hours, 0),
    [entries],
  );
  const unplannedHours = totalHours - plannedHours;

  const handleExportCsv = () => {
    const categoryRows = summary.map((item) => {
      const percentage = totalHours === 0 ? 0 : Math.round((item.hours / totalHours) * 100);
      return [
        getCategoryLabel(item.category),
        item.hours.toFixed(2),
        `${percentage}%`,
      ];
    });

    const weeklyRows = aggregateWeeklyCategoryHours(entries, range.from, range.to).map((week) => [
      week.label,
      week.totalHours.toFixed(2),
      ...CATEGORY_ORDER.map((category) => (week.categoryHours[category] ?? 0).toFixed(2)),
    ]);

    const rows: string[][] = [
      ["Metric", "Value"],
      ["Scope", scope],
      ["Range", `${range.from} to ${range.to}`],
      ["Total Hours", totalHours.toFixed(2)],
      ["Planned Hours", plannedHours.toFixed(2)],
      ["Unplanned Hours", unplannedHours.toFixed(2)],
      ["Completeness", `${Math.round(completeness)}%`],
      [],
      ["Category", "Hours", "Percentage"],
      ...categoryRows,
      [],
      ["Week", "Total Hours", ...CATEGORY_ORDER.map(getCategoryLabel)],
      ...weeklyRows,
    ];

    downloadCsv(`reports-${scope}-${period}.csv`, createCsv(rows));
  };

  return (
    <div className="mx-auto flex h-full w-full max-w-7xl flex-col gap-6 overflow-y-auto p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {scope === "team" ? "Team reports" : "Reports"}
          </h1>
          <p className="text-sm text-muted-foreground">{range.label}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-md bg-muted/60 p-0.5">
            {PERIODS.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setPeriod(item)}
                className={cn(
                  "rounded-sm px-3 py-1 text-xs font-medium capitalize transition-colors",
                  period === item
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {item}
              </button>
            ))}
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleExportCsv}
          >
            <Download className="mr-1.5 size-4" />
            Export CSV
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total hours"
          value={formatHours(totalHours)}
          sub={`${entries.length} ${entries.length === 1 ? "entry" : "entries"}`}
        />
        <StatCard
          label="Completeness"
          value={`${Math.round(completeness)}%`}
          sub={`${formatHours(totalHours)} of ${formatHours(targetHours)}`}
        />
        <StatCard
          label="Planned"
          value={formatHours(plannedHours)}
          sub={
            totalHours === 0
              ? "0% of total"
              : `${Math.round((plannedHours / totalHours) * 100)}% of total`
          }
        />
        <StatCard
          label="Unplanned"
          value={formatHours(unplannedHours)}
          sub={
            totalHours === 0
              ? "0% of total"
              : `${Math.round((unplannedHours / totalHours) * 100)}% of total`
          }
        />
      </div>

      {isLoading ? (
        <Card className="border-border/60 shadow-sm">
          <CardContent className="grid min-h-[220px] place-items-center py-10">
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <Spinner />
              Loading report data...
            </div>
          </CardContent>
        </Card>
      ) : isError ? (
        <Card className="border-destructive/30 shadow-sm">
          <CardContent className="py-10 text-center text-sm text-destructive">
            Could not load the report data. Please refresh and try again.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="border-border/60 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Category distribution</CardTitle>
              <CardDescription>Hours logged by category</CardDescription>
            </CardHeader>
            <CardContent>
              <PieDonutChart summary={summary} />
            </CardContent>
          </Card>

          <Card className="border-border/60 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Planned vs unplanned</CardTitle>
              <CardDescription>Jira-tied work compared to ad hoc</CardDescription>
            </CardHeader>
            <CardContent>
              <StackedWorkBar
                plannedHours={plannedHours}
                unplannedHours={unplannedHours}
              />
            </CardContent>
          </Card>

          <Card className="border-border/60 shadow-sm lg:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                Development + testing trend
              </CardTitle>
              <CardDescription>
                Daily development and testing hours across the period
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AreaTrendChart
                entries={entries}
                from={range.from}
                to={range.to}
              />
            </CardContent>
          </Card>

          <Card className="border-border/60 shadow-sm lg:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Weekly category mix</CardTitle>
              <CardDescription>
                How categories are distributed week by week
              </CardDescription>
            </CardHeader>
            <CardContent>
              <WeeklyStackedDistribution
                entries={entries}
                from={range.from}
                to={range.to}
              />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <Card className="border-border/60 shadow-sm">
      <CardContent className="space-y-1 py-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="text-2xl font-semibold tracking-tight tabular-nums">
          {value}
        </p>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  );
}

export function ReportsPage() {
  return <ReportsContent scope="individual" />;
}

export function TeamReportsPage() {
  return <ReportsContent scope="team" />;
}
