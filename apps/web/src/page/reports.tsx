import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  ChevronDown,
  Circle,
  Download,
  PieChart,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { fetchTimesheetEntries } from "@/api/timesheets-api";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { CATEGORY_LABELS, type EntryCategory, type TimesheetEntry } from "@/types/timesheet";
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
  development: "#0f766e",
  code_review: "#8b5cf6",
  testing: "#2563eb",
  documentation: "#d97706",
  meetings: "#52525b",
  admin: "#71717a",
  org_sessions: "#db2777",
  events: "#ea580c",
  support: "#dc2626",
  learning: "#16a34a",
  manual_other: "#64748b",
};

const PLANNED_COLOR = "#0f766e";
const DEV_COLOR = "#0f766e";

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
    <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
      <div className="flex items-center justify-center">
        <svg viewBox="0 0 220 220" className="size-[220px]">
          <circle cx="110" cy="110" r={radius} fill="none" stroke="currentColor" strokeOpacity="0.08" strokeWidth="30" />
          {segments.length === 0 ? (
            <circle cx="110" cy="110" r={radius} fill="none" stroke={PLANNED_COLOR} strokeWidth="30" strokeDasharray={`${circumference} ${circumference}`} strokeDashoffset={0} />
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
                  strokeWidth="30"
                  strokeDasharray={`${dashLength} ${circumference - dashLength}`}
                  strokeDashoffset={offset}
                  strokeLinecap="round"
                  transform="rotate(-90 110 110)"
                />
              );
            })
          )}
          <circle cx="110" cy="110" r="49" fill="hsl(var(--card))" />
          <text x="110" y="103" textAnchor="middle" className="fill-foreground text-[18px] font-semibold">
            {formatHours(total)}
          </text>
          <text x="110" y="124" textAnchor="middle" className="fill-muted-foreground text-[10px] uppercase tracking-[0.2em]">
            logged
          </text>
        </svg>
      </div>
      <div className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-2">
          {segments.map((segment) => (
            <div key={segment.category} className="flex items-center gap-3 rounded-lg border border-border/60 px-3 py-2">
              <span className="size-3 rounded-full" style={{ backgroundColor: CATEGORY_COLORS[segment.category] }} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{getCategoryLabel(segment.category)}</p>
                <p className="text-xs text-muted-foreground">
                  {formatHours(segment.hours)} · {Math.round(segment.size * 100)}%
                </p>
              </div>
            </div>
          ))}
          {segments.length === 0 && (
            <p className="text-sm text-muted-foreground">No entries in this period yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function StackedWorkBar({ plannedHours, unplannedHours }: { plannedHours: number; unplannedHours: number; }) {
  const total = plannedHours + unplannedHours;
  const plannedPct = total === 0 ? 0 : (plannedHours / total) * 100;
  const unplannedPct = total === 0 ? 0 : (unplannedHours / total) * 100;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Planned vs unplanned</span>
        <span className="font-medium">{formatHours(total)}</span>
      </div>
      <div className="h-6 overflow-hidden rounded-full bg-muted">
        <div className="flex h-full w-full">
          <div className="h-full bg-teal-600" style={{ width: `${plannedPct}%` }} />
          <div className="h-full bg-slate-400" style={{ width: `${unplannedPct}%` }} />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex items-center gap-3 rounded-lg border border-border/60 px-3 py-2">
          <Circle className="size-3 fill-teal-600 text-teal-600" />
          <div>
            <p className="text-sm font-medium">Planned</p>
            <p className="text-xs text-muted-foreground">Work tied to a Jira issue</p>
          </div>
          <span className="ml-auto text-sm font-semibold">{formatHours(plannedHours)}</span>
        </div>
        <div className="flex items-center gap-3 rounded-lg border border-border/60 px-3 py-2">
          <Circle className="size-3 fill-slate-400 text-slate-400" />
          <div>
            <p className="text-sm font-medium">Unplanned</p>
            <p className="text-xs text-muted-foreground">Ad hoc or overhead work</p>
          </div>
          <span className="ml-auto text-sm font-semibold">{formatHours(unplannedHours)}</span>
        </div>
      </div>
    </div>
  );
}

function AreaTrendChart({ entries, from, to }: { entries: TimesheetEntry[]; from: string; to: string; }) {
  const days = eachDayOfInterval({
    start: new Date(`${from}T12:00:00`),
    end: new Date(`${to}T12:00:00`),
  });

  const points = days.map((day, index) => {
    const dayKey = toIsoDate(day);
    const total = entries
      .filter((entry) => entry.date === dayKey && ["development", "testing"].includes(entry.category))
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
    <div className="space-y-4">
      <div className="overflow-hidden rounded-xl border border-border/60 bg-card">
        <svg viewBox={`0 0 ${chartWidth} ${chartHeight + 20}`} className="h-64 w-full">
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
                <line x1={x} x2={x} y1={chartHeight} y2={y} stroke="currentColor" strokeOpacity="0.06" />
                <circle cx={x} cy={y} r="4" fill={DEV_COLOR} />
                <text x={x} y={chartHeight + 14} textAnchor="middle" className="fill-muted-foreground text-[10px]">
                  {point.label}
                </text>
              </g>
            );
          })}
          <polygon points={areaPoints} fill={DEV_COLOR} fillOpacity="0.18" />
          <polyline points={svgPoints} fill="none" stroke={DEV_COLOR} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-2"><span className="size-2 rounded-full bg-teal-600" /> Development</span>
        <span className="inline-flex items-center gap-2"><span className="size-2 rounded-full bg-blue-600" /> Testing</span>
        <span className="text-xs">Daily development + testing hours</span>
      </div>
    </div>
  );
}

function WeeklyStackedDistribution({ entries, from, to }: { entries: TimesheetEntry[]; from: string; to: string; }) {
  const weeks = aggregateWeeklyCategoryHours(entries, from, to);
  const maxHours = Math.max(1, ...weeks.map((week) => week.totalHours));

  return (
    <div className="space-y-4">
      {weeks.length === 0 ? (
        <p className="text-sm text-muted-foreground">No weekly data yet for this period.</p>
      ) : (
        <div className="space-y-4">
          {weeks.map((week) => {
            const visibleCategories = CATEGORY_ORDER
              .map((category) => ({ category, hours: week.categoryHours[category] ?? 0 }))
              .filter((item) => item.hours > 0);

            return (
              <div key={week.weekStart} className="space-y-2 rounded-xl border border-border/60 p-3">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <div>
                    <p className="font-medium">{week.label}</p>
                    <p className="text-xs text-muted-foreground">{formatHours(week.totalHours)} total</p>
                  </div>
                  <p className="text-xs text-muted-foreground">Week of {format(new Date(`${week.weekStart}T12:00:00`), "d MMM")}</p>
                </div>
                <div className="h-4 overflow-hidden rounded-full bg-muted">
                  <div className="flex h-full w-full">
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
                </div>
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  {visibleCategories.map((segment) => (
                    <span key={segment.category} className="inline-flex items-center gap-1.5 rounded-full border border-border/60 px-2 py-1">
                      <span className="size-2 rounded-full" style={{ backgroundColor: CATEGORY_COLORS[segment.category] }} />
                      {getCategoryLabel(segment.category)} · {formatHours(segment.hours)}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
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

  const periodLabel = period.charAt(0).toUpperCase() + period.slice(1);

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
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 pb-8 sm:px-6 lg:px-8">
      <div className="relative overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-br from-background via-background to-teal-50/60 p-6 shadow-sm dark:to-teal-950/20">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(15,118,110,0.12),transparent_35%),radial-gradient(circle_at_bottom_left,rgba(37,99,235,0.08),transparent_30%)]" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/70 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
              <BarChart3 className="size-3.5" />
              Reports
            </div>
            <h1 className="text-3xl font-semibold tracking-tight">Reports dashboard</h1>
            <p className="max-w-2xl text-sm text-muted-foreground">
              {scope === "team"
                ? "Team-wide reporting view. The current backend still serves the signed-in user's timesheet data, so this page uses the same aggregation model for now."
                : "Track category mix, planned vs unplanned work, and daily effort across the selected period."}
            </p>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              {range.label}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/60 bg-background/80 p-2 shadow-sm backdrop-blur">
            {PERIODS.map((item) => (
              <Button
                key={item}
                type="button"
                size="sm"
                variant={period === item ? "default" : "ghost"}
                onClick={() => setPeriod(item)}
                className={cn("capitalize", period === item && "bg-teal-600 text-white hover:bg-teal-700")}
              >
                {item}
              </Button>
            ))}
            <Button type="button" size="sm" variant="outline" onClick={handleExportCsv}>
              <Download className="mr-1.5 size-4" />
              Export CSV
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="border-border/70 shadow-sm">
          <CardHeader className="flex-row items-center justify-between border-b border-border/60">
            <div>
              <CardTitle className="text-sm font-medium text-muted-foreground">Total hours logged</CardTitle>
              <CardDescription>Across the selected period</CardDescription>
            </div>
            <Wallet className="size-5 text-teal-600" />
          </CardHeader>
          <CardContent className="pt-4">
            <div className="text-3xl font-semibold tracking-tight">{formatHours(totalHours)}</div>
            <p className="mt-1 text-sm text-muted-foreground">{entries.length} entries logged</p>
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-sm">
          <CardHeader className="flex-row items-center justify-between border-b border-border/60">
            <div>
              <CardTitle className="text-sm font-medium text-muted-foreground">Completeness</CardTitle>
              <CardDescription>Logged vs expected workdays</CardDescription>
            </div>
            <TrendingUp className="size-5 text-blue-600" />
          </CardHeader>
          <CardContent className="pt-4">
            <div className="text-3xl font-semibold tracking-tight">{Math.round(completeness)}%</div>
            <p className="mt-1 text-sm text-muted-foreground">{formatHours(totalHours)} of {formatHours(targetHours)}</p>
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-sm">
          <CardHeader className="flex-row items-center justify-between border-b border-border/60">
            <div>
              <CardTitle className="text-sm font-medium text-muted-foreground">Planned work</CardTitle>
              <CardDescription>Entries tied to Jira issues</CardDescription>
            </div>
            <PieChart className="size-5 text-purple-600" />
          </CardHeader>
          <CardContent className="pt-4">
            <div className="text-3xl font-semibold tracking-tight">{formatHours(plannedHours)}</div>
            <p className="mt-1 text-sm text-muted-foreground">{totalHours === 0 ? 0 : Math.round((plannedHours / totalHours) * 100)}% of total</p>
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-sm">
          <CardHeader className="flex-row items-center justify-between border-b border-border/60">
            <div>
              <CardTitle className="text-sm font-medium text-muted-foreground">Unplanned work</CardTitle>
              <CardDescription>Ad hoc work and overhead</CardDescription>
            </div>
            <ChevronDown className="size-5 text-slate-600" />
          </CardHeader>
          <CardContent className="pt-4">
            <div className="text-3xl font-semibold tracking-tight">{formatHours(unplannedHours)}</div>
            <p className="mt-1 text-sm text-muted-foreground">Period: {periodLabel.toLowerCase()}</p>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <Card className="border-border/70 shadow-sm">
          <CardContent className="grid min-h-[220px] place-items-center py-10">
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <Spinner />
              Loading report data...
            </div>
          </CardContent>
        </Card>
      ) : isError ? (
        <Card className="border-destructive/30 shadow-sm">
          <CardContent className="py-10 text-sm text-destructive">
            Could not load the report data. Please refresh and try again.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="border-border/70 shadow-sm">
            <CardHeader className="border-b border-border/60">
              <CardTitle>Category distribution</CardTitle>
              
            </CardHeader>
            <CardContent className="pt-5">
              <PieDonutChart summary={summary} />
            </CardContent>
          </Card>

          <Card className="border-border/70 shadow-sm">
            <CardHeader className="border-b border-border/60">
              <CardTitle>Planned vs unplanned</CardTitle>
              
            </CardHeader>
            <CardContent className="pt-5">
              <StackedWorkBar plannedHours={plannedHours} unplannedHours={unplannedHours} />
            </CardContent>
          </Card>

          <Card className="border-border/70 shadow-sm lg:col-span-2">
            <CardHeader className="border-b border-border/60">
              <CardTitle>Development + testing trend</CardTitle>
              <CardDescription>Area chart of daily development and testing time</CardDescription>
            </CardHeader>
            <CardContent className="pt-5">
              <AreaTrendChart entries={entries} from={range.from} to={range.to} />
            </CardContent>
          </Card>

          <Card className="border-border/70 shadow-sm lg:col-span-2">
            <CardHeader className="border-b border-border/60">
              <CardTitle>Weekly category mix</CardTitle>
              <CardDescription>Stacked bars show how categories are distributed week by week</CardDescription>
            </CardHeader>
            <CardContent className="pt-5">
              <WeeklyStackedDistribution entries={entries} from={range.from} to={range.to} />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

export function ReportsPage() {
  return <ReportsContent scope="individual" />;
}

export function TeamReportsPage() {
  return <ReportsContent scope="team" />;
}
