import { useMemo, useState } from "react";
import { Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { authClient } from "@/lib/auth-client";
import { useIntegrationTimesheet } from "@/hooks/use-integrations";
import { mapIntegrationEntryToTimesheetEntry } from "@/lib/integration-timesheet";
import { CATEGORY_LABELS, type EntryCategory, type EntryStatus } from "@/types/timesheet";

type LogEntry = {
  id: string;
  date: string;
  description: string;
  category: EntryCategory;
  hours: number;
  status: EntryStatus;
};

const PAGE_SIZE = 10;

const ALL_CATEGORIES: EntryCategory[] = [
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

function formatDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toDisplayDate(value: string): string {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function statusBadgeClass(status: EntryStatus): string {
  if (status === "accepted") {
    return "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300";
  }
  if (status === "in-progress") {
    return "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300";
  }
  return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300";
}

function categoryBadgeClass(category: EntryCategory): string {
  if (category === "development") return "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300";
  if (category === "code_review") return "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300";
  if (category === "testing") return "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300";
  if (category === "documentation") return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300";
  if (category === "meetings") return "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
  return "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
}

export function LogsPage() {
  const { data: session } = authClient.useSession();
  const integrationTimesheetQuery = useIntegrationTimesheet(Boolean(session?.user?.id));

  const today = useMemo(() => new Date(), []);
  const defaultTo = formatDateInput(today);
  const defaultFrom = formatDateInput(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 30));

  const [fromDate, setFromDate] = useState(defaultFrom);
  const [toDate, setToDate] = useState(defaultTo);
  const [category, setCategory] = useState<"all" | EntryCategory>("all");
  const [status, setStatus] = useState<"all" | EntryStatus>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());

  const allEntries = useMemo<LogEntry[]>(
    () => (integrationTimesheetQuery.data?.entries ?? []).map(mapIntegrationEntryToTimesheetEntry),
    [integrationTimesheetQuery.data?.entries],
  );

  const isLoading = integrationTimesheetQuery.isPending;

  const filteredEntries = useMemo(() => {
    return allEntries
      .filter((entry) => !removedIds.has(entry.id))
      .filter((entry) => {
        const matchFrom = !fromDate || entry.date >= fromDate;
        const matchTo = !toDate || entry.date <= toDate;
        const matchCategory = category === "all" || entry.category === category;
        const matchStatus = status === "all" || entry.status === status;
        const searchValue = search.trim().toLowerCase();
        const matchSearch =
          searchValue.length === 0 ||
          entry.description.toLowerCase().includes(searchValue) ||
          CATEGORY_LABELS[entry.category].toLowerCase().includes(searchValue) ||
          entry.status.toLowerCase().includes(searchValue) ||
          entry.date.includes(searchValue);

        return matchFrom && matchTo && matchCategory && matchStatus && matchSearch;
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [allEntries, removedIds, fromDate, toDate, category, status, search]);

  const totalPages = Math.max(1, Math.ceil(filteredEntries.length / PAGE_SIZE));

  const currentPageRows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredEntries.slice(start, start + PAGE_SIZE);
  }, [filteredEntries, page]);

  const startSrNo = (page - 1) * PAGE_SIZE;

  const handleRemove = (entry: LogEntry) => {
    if (entry.status === "accepted") {
      return;
    }
    setRemovedIds((prev) => {
      const next = new Set(prev);
      next.add(entry.id);
      return next;
    });
  };

  const handleFilterChange = () => {
    setPage(1);
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[1240px] flex-col gap-5 px-5 py-7 sm:px-8 lg:px-10">
      <Card className="border-[0.5px] shadow-none">
        <CardHeader>
          <CardTitle className="text-xl font-medium">Logs history</CardTitle>
          <p className="text-sm text-muted-foreground">
            All past timesheet entries across days.
          </p>
        </CardHeader>

        <CardContent className="flex flex-col gap-5">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <label className="flex flex-col gap-1.5 text-sm md:col-span-4">
              <span className="text-muted-foreground">Search</span>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    handleFilterChange();
                  }}
                  placeholder="Search by description, category, status, or date"
                  className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm"
                />
              </div>
            </label>

            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">From date</span>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => {
                  setFromDate(e.target.value);
                  handleFilterChange();
                }}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              />
            </label>

            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">To date</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => {
                  setToDate(e.target.value);
                  handleFilterChange();
                }}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              />
            </label>

            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">Category</span>
              <select
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value as "all" | EntryCategory);
                  handleFilterChange();
                }}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="all">All categories</option>
                {ALL_CATEGORIES.map((item) => (
                  <option key={item} value={item}>
                    {CATEGORY_LABELS[item]}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">Status</span>
              <select
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value as "all" | EntryStatus);
                  handleFilterChange();
                }}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="all">All statuses</option>
                <option value="accepted">Accepted</option>
                <option value="in-progress">In progress</option>
                <option value="on-hold">On hold</option>
              </select>
            </label>
          </div>

          <div className="overflow-x-auto rounded-md border-[0.5px] border-border">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-[0.5px] border-border bg-muted/30 text-left text-muted-foreground">
                  <th className="px-3 py-2.5 font-medium">Sr no.</th>
                  <th className="px-3 py-2.5 font-medium">Assigned date</th>
                  <th className="px-3 py-2.5 font-medium">Description</th>
                  <th className="px-3 py-2.5 font-medium">Category</th>
                  <th className="px-3 py-2.5 font-medium">Time</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-3 py-2.5 font-medium">Remove</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                      Loading entries...
                    </td>
                  </tr>
                ) : currentPageRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                      No entries found for the selected filters.
                    </td>
                  </tr>
                ) : (
                  currentPageRows.map((entry, idx) => {
                    const isLocked = entry.status === "accepted";

                    return (
                      <tr key={entry.id} className="border-t border-[0.5px] border-border align-top">
                        <td className="px-3 py-2.5 text-muted-foreground">{startSrNo + idx + 1}</td>
                        <td className="px-3 py-2.5">{toDisplayDate(entry.date)}</td>
                        <td className="px-3 py-2.5">{entry.description}</td>
                        <td className="px-3 py-2.5">
                          <Badge className={categoryBadgeClass(entry.category)}>
                            {CATEGORY_LABELS[entry.category]}
                          </Badge>
                        </td>
                        <td className="px-3 py-2.5">{entry.hours}h</td>
                        <td className="px-3 py-2.5">
                          <Badge className={statusBadgeClass(entry.status)}>
                            {entry.status}
                          </Badge>
                        </td>
                        <td className="px-3 py-2.5">
                          <Button
                            size="icon"
                            variant="ghost"
                            disabled={isLocked}
                            onClick={() => handleRemove(entry)}
                            aria-label={`Remove entry ${entry.id}`}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-[0.5px] border-border pt-3">
            <p className="text-sm text-muted-foreground">
              Showing {(page - 1) * PAGE_SIZE + (currentPageRows.length ? 1 : 0)}-
              {(page - 1) * PAGE_SIZE + currentPageRows.length} of {filteredEntries.length}
            </p>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
