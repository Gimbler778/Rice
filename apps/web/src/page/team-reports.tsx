import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Users, AlertCircle, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth-client";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import {
  fetchTeams,
  fetchTeamReport,
  type AtlassianTeam,
  type TeamMemberAggregate,
} from "@/api/teams-api";

// ── Constants ──────────────────────────────────────────────────────

const PERIODS = ["day", "week", "month", "quarter"] as const;
type TeamReportPeriod = (typeof PERIODS)[number];

const PERIOD_LABELS: Record<TeamReportPeriod, string> = {
  day: "Today",
  week: "This week",
  month: "This month",
  quarter: "This quarter",
};

// Status colors for the donut chart and bars
const STATUS_COLORS: Record<string, string> = {
  "To Do": "var(--chart-3)",
  "In Progress": "var(--chart-1)",
  "In Review": "var(--chart-4)",
  Done: "var(--chart-2)",
  Closed: "var(--muted-foreground)",
  Unknown: "var(--muted-foreground)",
};


function getStatusColor(status: string): string {
  return STATUS_COLORS[status] ?? "var(--primary)";
}

const CATEGORY_LABELS: Record<string, string> = {
  development: "Development",
  code_review: "Code Review",
  testing: "Testing",
  documentation: "Documentation",
  meetings: "Meetings",
  admin: "Admin",
  org_sessions: "Org Sessions",
  events: "Events",
  support: "Support",
  learning: "Learning",
  manual_other: "Other",
};

const CATEGORY_COLORS: Record<string, string> = {
  development: "var(--chart-1)",
  code_review: "var(--chart-2)",
  testing: "var(--chart-3)",
  documentation: "var(--chart-4)",
  meetings: "var(--chart-5)",
  admin: "var(--muted-foreground)",
  org_sessions: "var(--primary)",
  events: "var(--secondary)",
  support: "var(--destructive)",
  learning: "var(--accent)",
  manual_other: "var(--muted-foreground)",
};

function getCategoryColor(cat: string): string {
  return CATEGORY_COLORS[cat] ?? "var(--primary)";
}

function formatCategoryLabel(cat: string): string {
  return CATEGORY_LABELS[cat] ?? cat;
}

function formatProjectLabel(project: string): string {
  if (project === "Unknown") return "Other workspaces";
  return project;
}

// ── Utility ────────────────────────────────────────────────────────

function formatDuration(totalSeconds: number): string {
  if (totalSeconds <= 0) return "0h";
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  if (minutes > 0) return `${minutes}m`;
  return "0m";
}

function sortedEntries(record: Record<string, number>): [string, number][] {
  return Object.entries(record).sort(([, a], [, b]) => b - a);
}

function createCsv(rows: string[][]): string {
  return rows
    .map((row) =>
      row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(","),
    )
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

// ── Chart Components ───────────────────────────────────────────────

function DonutChart({
  data,
  colorFn,
  centerLabel,
  centerSub,
  valueFormatter = (v) => String(v),
  labelFormatter = (l) => l,
}: {
  data: Record<string, number>;
  colorFn: (key: string) => string;
  centerLabel: string;
  centerSub: string;
  valueFormatter?: (value: number) => string;
  labelFormatter?: (label: string) => string;
}) {
  const entries = sortedEntries(data);
  const total = entries.reduce((sum, [, value]) => sum + value, 0);

  const radius = 72;
  const circumference = 2 * Math.PI * radius;
  let cursor = 0;

  const segments = entries.map(([key, value]) => {
    const size = total === 0 ? 0 : value / total;
    const start = cursor;
    cursor += size;
    return { key, value, size, start, end: cursor };
  });

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
              stroke="var(--primary)"
              strokeOpacity="0.2"
              strokeWidth="28"
            />
          ) : (
            segments.map((segment) => {
              const dashLength = segment.size * circumference;
              const offset = circumference * (1 - segment.start);
              return (
                <circle
                  key={segment.key}
                  cx="110"
                  cy="110"
                  r={radius}
                  fill="none"
                  stroke={colorFn(segment.key)}
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
            {centerLabel}
          </text>
          <text
            x="110"
            y="125"
            textAnchor="middle"
            className="fill-muted-foreground text-[10px] uppercase tracking-[0.2em]"
          >
            {centerSub}
          </text>
        </svg>
      </div>
      <div className="space-y-1">
        {segments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No data in this period yet.
          </p>
        ) : (
          segments.map((segment) => (
            <div
              key={segment.key}
              className="flex items-center gap-3 rounded-md px-2 py-1.5"
            >
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: colorFn(segment.key) }}
              />
              <p className="flex-1 truncate text-sm" title={segment.key}>
                {labelFormatter(segment.key)}
              </p>
              <p className="text-xs tabular-nums text-muted-foreground">
                {valueFormatter(segment.value)}
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

function HorizontalBarChart({
  data,
  colorFn,
  labelSuffix = "",
  valueFormatter,
  labelFormatter = (l) => l,
}: {
  data: Record<string, number>;
  colorFn: (key: string) => string;
  labelSuffix?: string;
  valueFormatter?: (value: number) => string;
  labelFormatter?: (label: string) => string;
}) {
  const entries = sortedEntries(data);
  const maxValue = Math.max(1, ...entries.map(([, v]) => v));

  if (entries.length === 0) {
    return (
      <p className="rounded-md bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground">
        No data available.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {entries.map(([key, value]) => (
        <div key={key} className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm font-medium truncate" title={key}>
              {labelFormatter(key)}
            </p>
            <p className="text-xs tabular-nums text-muted-foreground shrink-0">
              {valueFormatter
                ? valueFormatter(value)
                : `${value}${labelSuffix}`}
            </p>
          </div>
          <div className="flex h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full transition-all duration-500 ease-out"
              style={{
                width: `${(value / maxValue) * 100}%`,
                backgroundColor: colorFn(key),
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function MemberTable({ members }: { members: TeamMemberAggregate[] }) {
  const sorted = [...members].sort((a, b) => b.totalIssues - a.totalIssues);

  if (sorted.length === 0) {
    return (
      <p className="rounded-md bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground">
        No team members found.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[600px] text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="py-2 pr-4 font-medium">Member</th>
            <th className="py-2 pr-4 font-medium text-right">Issues</th>
            <th className="py-2 pr-4 font-medium text-right">Time logged</th>
            <th className="py-2 font-medium">Top status</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((member) => {
            const topStatus = sortedEntries(member.issuesByStatus)[0];
            return (
              <tr key={member.accountId} className="border-b last:border-0">
                <td className="py-3 pr-4">
                  <div className="flex items-center gap-2.5">
                    <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                      {member.displayName
                        ? member.displayName
                            .split(" ")
                            .map((n) => n[0])
                            .join("")
                            .toUpperCase()
                            .slice(0, 2)
                        : "?"}
                    </div>
                    <span className="font-medium truncate">
                      {member.displayName ?? member.accountId.slice(0, 12)}
                    </span>
                  </div>
                </td>
                <td className="py-3 pr-4 text-right font-semibold tabular-nums">
                  {member.totalIssues}
                </td>
                <td className="py-3 pr-4 text-right tabular-nums text-muted-foreground">
                  {formatDuration(member.totalTimeSpentSeconds)}
                </td>
                <td className="py-3">
                  {topStatus ? (
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium"
                      style={{
                        backgroundColor: `color-mix(in srgb, ${getStatusColor(topStatus[0])} 15%, transparent)`,
                        color: getStatusColor(topStatus[0]),
                      }}
                    >
                      {topStatus[0]} ({topStatus[1]})
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">-</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
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

// ── Team Selector ──────────────────────────────────────────────────

function TeamSelector({
  teams,
  selectedTeamId,
  onSelect,
}: {
  teams: AtlassianTeam[];
  selectedTeamId: string | null;
  onSelect: (teamId: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const selectedTeam = teams.find((t) => t.teamId === selectedTeamId);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center gap-2 rounded-lg border border-border/70 bg-background px-3 py-2",
          "text-sm font-medium shadow-sm transition-colors hover:bg-accent/50",
          "min-w-[200px] justify-between",
        )}
      >
        <div className="flex items-center gap-2 truncate">
          <Users className="size-4 text-primary shrink-0" />
          <span className="truncate">
            {selectedTeam?.displayName ?? "Select a team"}
          </span>
        </div>
        <ChevronDown
          className={cn(
            "size-4 text-muted-foreground transition-transform",
            isOpen && "rotate-180",
          )}
        />
      </button>
      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute left-0 top-full z-50 mt-1 max-h-60 w-full min-w-[240px] overflow-y-auto rounded-lg border border-border/70 bg-background shadow-lg">
            {teams.map((team) => (
              <button
                key={team.teamId}
                type="button"
                onClick={() => {
                  onSelect(team.teamId);
                  setIsOpen(false);
                }}
                className={cn(
                  "flex w-full items-start gap-2 px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent/50",
                  selectedTeamId === team.teamId && "bg-primary/5 text-primary",
                )}
              >
                <Users className="mt-0.5 size-4 shrink-0" />
                <div className="min-w-0">
                  <p className="truncate font-medium">{team.displayName}</p>
                  {team.description && (
                    <p className="truncate text-xs text-muted-foreground">
                      {team.description}
                    </p>
                  )}
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────

export function TeamReportsPage() {
  const { data: session } = authClient.useSession();
  const [period, setPeriod] = useState<TeamReportPeriod>("week");
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);

  // Fetch teams list
  const teamsQuery = useQuery({
    queryKey: queryKeys.integrations.teams(),
    queryFn: fetchTeams,
    enabled: Boolean(session?.user?.id),
  });

  const teams = teamsQuery.data?.teams ?? [];

  // Auto-select first team when teams load
  const activeTeamId = selectedTeamId ?? teams[0]?.teamId ?? null;

  // Fetch team report
  const reportQuery = useQuery({
    queryKey: queryKeys.integrations.teamReport(activeTeamId ?? "", period),
    queryFn: () => fetchTeamReport(activeTeamId!, period),
    enabled: Boolean(session?.user?.id) && Boolean(activeTeamId),
  });

  const report = reportQuery.data;
  const activeTeam = teams.find((t) => t.teamId === activeTeamId);

  const handleExportCsv = () => {
    if (!report) return;

    const rows: string[][] = [
      ["Team Report"],
      ["Team", activeTeam?.displayName ?? "Unknown"],
      ["Period", PERIOD_LABELS[period]],
      ["Total Issues Updated", String(report.totalIssues)],
      ["Total Time Logged", formatDuration(report.totalTimeSpentSeconds)],
      ["Members", String(report.memberCount)],
      [],
      ["Time by Category"],
      ["Category", "Time"],
      ...sortedEntries(report.timeByCategory).map(([k, v]) => [
        formatCategoryLabel(k),
        formatDuration(v),
      ]),
      [],
      ["Time by Type"],
      ["Type", "Time"],
      ...sortedEntries(report.timeByType).map(([k, v]) => [
        k,
        formatDuration(v),
      ]),
      [],
      ["Time by Project"],
      ["Project", "Time"],
      ...sortedEntries(report.timeByProject).map(([k, v]) => [
        k,
        formatDuration(v),
      ]),
      [],
      ["Members Breakdown"],
      ["Name", "Issues Updated", "Time Logged"],
      ...report.members.map((m) => [
        m.displayName ?? m.accountId,
        String(m.totalIssues),
        formatDuration(m.totalTimeSpentSeconds),
      ]),
    ];

    downloadCsv(`team-report-${period}.csv`, createCsv(rows));
  };

  // ── Loading / Error states ───────────────────────────────────────

  if (teamsQuery.isLoading) {
    return (
      <div className="mx-auto flex h-full w-full max-w-7xl flex-col items-center justify-center gap-3 p-6">
        <Spinner />
        <p className="text-sm text-muted-foreground">
          Loading teams from Atlassian...
        </p>
      </div>
    );
  }

  if (teamsQuery.isError) {
    return (
      <div className="mx-auto flex h-full w-full max-w-7xl flex-col gap-6 p-6">
        <h1 className="text-2xl font-semibold tracking-tight">Team reports</h1>
        <Card className="border-destructive/30 shadow-sm">
          <CardContent className="flex items-center gap-3 py-10 text-sm text-destructive">
            <AlertCircle className="size-5 shrink-0" />
            <div>
              <p className="font-medium">Failed to load teams</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Make sure Atlassian is connected and ATLASSIAN_ORG_ID is
                configured in the server environment.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (teams.length === 0) {
    return (
      <div className="mx-auto flex h-full w-full max-w-7xl flex-col gap-6 p-6">
        <h1 className="text-2xl font-semibold tracking-tight">Team reports</h1>
        <Card className="border-border/60 shadow-sm">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-sm text-muted-foreground">
            <Users className="size-10 text-muted-foreground/40" />
            <p className="font-medium">No teams found</p>
            <p className="max-w-md text-center text-xs">
              No teams were found in your Atlassian organization. Create teams
              in Atlassian or check that the organization ID is correct.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Main render ──────────────────────────────────────────────────

  return (
    <div className="mx-auto flex h-full w-full max-w-7xl flex-col gap-6 overflow-y-auto p-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Team reports
          </h1>
          <p className="text-sm text-muted-foreground">
            {activeTeam
              ? `${activeTeam.displayName} · ${PERIOD_LABELS[period]}`
              : "Select a team to view reports"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <TeamSelector
            teams={teams}
            selectedTeamId={activeTeamId}
            onSelect={(id) => setSelectedTeamId(id)}
          />

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
            disabled={!report}
          >
            <Download className="mr-1.5 size-4" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Content */}
      {!activeTeamId ? (
        <Card className="border-border/60 shadow-sm">
          <CardContent className="grid min-h-[220px] place-items-center py-10">
            <p className="text-sm text-muted-foreground">
              Select a team to view the report.
            </p>
          </CardContent>
        </Card>
      ) : reportQuery.isLoading ? (
        <Card className="border-border/60 shadow-sm">
          <CardContent className="grid min-h-[220px] place-items-center py-10">
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <Spinner />
              Loading team report data...
            </div>
          </CardContent>
        </Card>
      ) : reportQuery.isError ? (
        <Card className="border-destructive/30 shadow-sm">
          <CardContent className="py-10 text-center text-sm text-destructive">
            Could not load the team report. Please refresh and try again.
          </CardContent>
        </Card>
      ) : report ? (
        <>
          {/* Stat cards */}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Team members"
              value={String(report.memberCount)}
              sub={`in ${activeTeam?.displayName ?? "team"}`}
            />
            <StatCard
              label="Total issues"
              value={String(report.totalIssues)}
              sub={`${PERIOD_LABELS[period].toLowerCase()}`}
            />
            <StatCard
              label="Time logged"
              value={formatDuration(report.totalTimeSpentSeconds)}
              sub={`across ${report.memberCount} members`}
            />
            <StatCard
              label="Avg per member"
              value={
                report.memberCount > 0
                  ? formatDuration(
                      Math.round(
                        report.totalTimeSpentSeconds / report.memberCount,
                      ),
                    )
                  : "0h"
              }
              sub="time logged"
            />
          </div>

          {/* Charts */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="border-border/60 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Time by category</CardTitle>
                <CardDescription>
                  Breakdown of logged hours by activity
                </CardDescription>
              </CardHeader>
              <CardContent>
                <DonutChart
                  data={report.timeByCategory}
                  colorFn={getCategoryColor}
                  centerLabel={formatDuration(report.totalTimeSpentSeconds)}
                  centerSub="total"
                  valueFormatter={formatDuration}
                  labelFormatter={formatCategoryLabel}
                />
              </CardContent>
            </Card>

            <Card className="border-border/60 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Time by project</CardTitle>
                <CardDescription>Time logged per project</CardDescription>
              </CardHeader>
              <CardContent>
                <HorizontalBarChart
                  data={report.timeByProject}
                  colorFn={() => "var(--primary)"}
                  valueFormatter={formatDuration}
                  labelFormatter={formatProjectLabel}
                />
              </CardContent>
            </Card>

            <Card className="border-border/60 shadow-sm lg:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Team members</CardTitle>
                <CardDescription>
                  Individual contribution breakdown for{" "}
                  {PERIOD_LABELS[period].toLowerCase()}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <MemberTable members={report.members} />
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}
