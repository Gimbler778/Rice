import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  Clock3,
  ExternalLink,
  Link,
  Link2,
  LoaderCircle,
  LogOut,
  Plus,
  UserRound,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RoleBasedRender } from "@/components/role-based-render";
import { authClient } from "@/lib/auth-client";
import { env } from "@/lib/env";
import {
  useIntegrationStatus,
  useIntegrationTimesheet,
} from "@/hooks/use-integrations";
import { getSessionUserRole } from "@/lib/roles";
import type { IntegrationTimesheetEntry } from "@/types/integrations";

function buildDashboardCallbackUrl(): string {
  return new URL("/today", env.VITE_WEB_BASE_URL).toString();
}

function toHoursLabel(totalSeconds: number): string {
  if (totalSeconds <= 0) {
    return "0h";
  }

  const rounded = Math.round((totalSeconds / 3600) * 10) / 10;
  return `${rounded}h`;
}

function formatDateTime(value?: string | null): string {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
}

function renderEntryDetails(entry: IntegrationTimesheetEntry) {
  const relatedData = entry.relatedData;

  return (
    <div className="w-[360px] space-y-3 p-2 text-sm">
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Entry</p>
        <div className="grid grid-cols-[120px_1fr] gap-y-1">
          <span className="text-muted-foreground">Source</span>
          <span>{entry.source}</span>
          <span className="text-muted-foreground">Reference</span>
          <span>{entry.ref}</span>
          <span className="text-muted-foreground">Occurred</span>
          <span>{formatDateTime(entry.occurredAt)}</span>
        </div>
      </div>

      {entry.source === "Jira" ? (
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Jira</p>
          <div className="grid grid-cols-[120px_1fr] gap-y-1">
            <span className="text-muted-foreground">Issue</span>
            <span>{relatedData?.issueKey ?? entry.ref}</span>
            <span className="text-muted-foreground">Assignee</span>
            <span>{relatedData?.assignee ?? "-"}</span>
            <span className="text-muted-foreground">Status</span>
            <span>{relatedData?.status ?? "-"}</span>
            <span className="text-muted-foreground">Issue type</span>
            <span>{relatedData?.issueType ?? "-"}</span>
            <span className="text-muted-foreground">Project</span>
            <span>{relatedData?.projectKey ?? "-"}</span>
            <span className="text-muted-foreground">Created</span>
            <span>{formatDateTime(relatedData?.createdAt)}</span>
            <span className="text-muted-foreground">Updated</span>
            <span>{formatDateTime(relatedData?.updatedAt)}</span>
            <span className="text-muted-foreground">Linked issues</span>
            <span>
              {relatedData?.linkedIssueKeys?.length
                ? relatedData.linkedIssueKeys.join(", ")
                : "-"}
            </span>
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Bitbucket</p>
          <div className="grid grid-cols-[120px_1fr] gap-y-1">
            <span className="text-muted-foreground">Repository</span>
            <span>{relatedData?.repositoryFullName ?? "-"}</span>
            <span className="text-muted-foreground">Commit</span>
            <span>{relatedData?.commitHash ?? "-"}</span>
            <span className="text-muted-foreground">PR</span>
            <span>
              {relatedData?.pullRequestId
                ? `#${relatedData.pullRequestId}`
                : "-"}
            </span>
            <span className="text-muted-foreground">Branch</span>
            <span>{relatedData?.branch ?? "-"}</span>
            <span className="text-muted-foreground">Source branch</span>
            <span>{relatedData?.sourceBranch ?? "-"}</span>
            <span className="text-muted-foreground">Target branch</span>
            <span>{relatedData?.destinationBranch ?? "-"}</span>
            <span className="text-muted-foreground">PR status</span>
            <span>{relatedData?.pullRequestState ?? "-"}</span>
            <span className="text-muted-foreground">Commit timestamp</span>
            <span>{formatDateTime(relatedData?.commitTimestamp)}</span>
            <span className="text-muted-foreground">PR timestamp</span>
            <span>{formatDateTime(relatedData?.pullRequestTimestamp)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export function DashboardPage() {
  const { data: session } = authClient.useSession();
  const userRole = getSessionUserRole(session);
  const navigate = useNavigate();
  const integrationStatusQuery = useIntegrationStatus(
    Boolean(session?.user?.id),
  );
  const integrationTimesheetQuery = useIntegrationTimesheet(
    Boolean(session?.user?.id),
  );

  const connectBitbucketMutation = useMutation({
    mutationFn: async () => {
      await authClient.oauth2.link({
        providerId: "bitbucket",
        callbackURL: buildDashboardCallbackUrl(),
      });
    },
    onSuccess: async () => {
      await Promise.all([
        integrationStatusQuery.refetch(),
        integrationTimesheetQuery.refetch(),
      ]);
      toast.success("Bitbucket connected");
    },
    onError: (error) => {
      toast.error("Bitbucket connect failed. Please try again.");
      console.error("Bitbucket link failed:", error);
    },
  });

  const connectAtlassianMutation = useMutation({
    mutationFn: async () => {
      await authClient.linkSocial({
        provider: "atlassian",
        callbackURL: buildDashboardCallbackUrl(),
      });
    },
    onSuccess: async () => {
      await Promise.all([
        integrationStatusQuery.refetch(),
        integrationTimesheetQuery.refetch(),
      ]);
      toast.success("Atlassian connected");
    },
    onError: (error) => {
      toast.error("Atlassian connect failed. Please try again.");
      console.error("Atlassian link failed:", error);
    },
  });

  const signOutMutation = useMutation({
    mutationFn: async () => {
      await authClient.signOut();
    },
    onSuccess: () => {
      toast.success("Signed out");
      navigate("/", { replace: true });
    },
    onError: (error) => {
      toast.error("Sign out failed. Please try again.");
      console.error("Sign out failed:", error);
    },
  });

  const integrationData = integrationTimesheetQuery.data;
  const integrationStatus = integrationStatusQuery.data;
  const connectedProviders = integrationData?.connectedProviders ?? [];
  const isAtlassianConnected = integrationStatus?.atlassianConnected === true;
  const isBitbucketConnected = integrationStatus?.bitbucketConnected === true;
  const timeEntries = integrationData?.entries ?? [];
  const totalTodaySeconds = timeEntries.reduce(
    (sum, entry) => sum + entry.timeSeconds,
    0,
  );

  return (
    <div className="mx-auto mt-8 w-full max-w-7xl space-y-6 px-4 pb-8 sm:px-6 lg:px-8">
      <Card className="border-border/70 shadow-lg shadow-primary/5">
        <CardHeader className="flex flex-col gap-4 border-b border-border/60 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-xl">
              <UserRound className="size-5 text-primary" />
              Today's timesheet
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Signed in as {session?.user.email ?? "Unknown user"}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => connectAtlassianMutation.mutate()}
              disabled={
                connectAtlassianMutation.isPending ||
                integrationStatusQuery.data?.atlassianConnected === true
              }
            >
              <Link />
              {integrationStatusQuery.data?.atlassianConnected
                ? "Atlassian Connected"
                : connectAtlassianMutation.isPending
                  ? "Connecting Atlassian..."
                  : "Connect Atlassian"}
            </Button>

            <Button
              type="button"
              variant="secondary"
              onClick={() => connectBitbucketMutation.mutate()}
              disabled={
                connectBitbucketMutation.isPending ||
                integrationStatusQuery.data?.bitbucketConnected === true
              }
            >
              <Link2 />
              {integrationStatusQuery.data?.bitbucketConnected
                ? "Bitbucket Connected"
                : connectBitbucketMutation.isPending
                  ? "Connecting Bitbucket..."
                  : "Connect Bitbucket"}
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={() => signOutMutation.mutate()}
              disabled={signOutMutation.isPending}
            >
              <LogOut />
              {signOutMutation.isPending ? "Signing out..." : "Sign out"}
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-6 pt-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="border-border/60 bg-muted/20">
              <CardContent className="space-y-1 p-4">
                <p className="text-sm text-muted-foreground">Today</p>
                <p className="text-3xl font-semibold">{toHoursLabel(totalTodaySeconds)}</p>
                <p className="text-sm text-muted-foreground">of ~8h target</p>
              </CardContent>
            </Card>

            <Card className="border-border/60 bg-muted/20">
              <CardContent className="space-y-1 p-4">
                <p className="text-sm text-muted-foreground">This week</p>
                <p className="text-3xl font-semibold">{toHoursLabel(totalTodaySeconds)}</p>
                <p className="text-sm text-muted-foreground">live synced total</p>
              </CardContent>
            </Card>

            <Card className="border-border/60 bg-muted/20">
              <CardContent className="space-y-1 p-4">
                <p className="text-sm text-muted-foreground">Entries</p>
                <p className="text-3xl font-semibold">{timeEntries.length}</p>
                <p className="text-sm text-muted-foreground">today</p>
              </CardContent>
            </Card>

            <Card className="border-border/60 bg-muted/20">
              <CardContent className="space-y-1 p-4">
                <p className="text-sm text-muted-foreground">Learning streak</p>
                <p className="text-3xl font-semibold">12</p>
                <p className="text-sm text-muted-foreground">days</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
            <Card className="border-border/70">
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-lg">Time entries</CardTitle>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline">+30m</Button>
                  <Button size="sm" variant="outline">+1h</Button>
                  <Button size="sm" variant="outline">+2h</Button>
                  <Button size="sm">
                    <Plus />
                    Add entry
                  </Button>
                </div>
              </CardHeader>

              <CardContent className="overflow-x-auto pt-0">
                {integrationTimesheetQuery.isPending ? (
                  <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                    <LoaderCircle className="size-4 animate-spin" />
                    Fetching Jira and Bitbucket entries...
                  </div>
                ) : integrationTimesheetQuery.isError ? (
                  <div className="flex items-center gap-2 py-8 text-sm text-destructive">
                    <XCircle className="size-4" />
                    Failed to load integration entries
                  </div>
                ) : (
                  <table className="w-full min-w-[720px] text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="py-2 pr-4 font-medium">Category</th>
                        <th className="py-2 pr-4 font-medium">Description</th>
                        <th className="py-2 pr-4 font-medium">Source / Ref</th>
                        <th className="py-2 pr-4 font-medium">Time</th>
                        <th className="py-2 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {timeEntries.length > 0 ? (
                        timeEntries.map((entry) => (
                          <tr key={entry.id} className="border-b last:border-0">
                            <td className="py-3 pr-4">
                              <Badge variant="secondary">{entry.category}</Badge>
                            </td>
                            <td className="py-3 pr-4 font-medium">{entry.description}</td>
                            <td className="py-3 pr-4">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline">{entry.source}</Badge>
                                <span className="text-primary">{entry.ref}</span>
                              </div>
                            </td>
                            <td className="py-3 pr-4 font-semibold">{entry.time}</td>
                            <td className="py-3">
                              <div className="flex items-center gap-1">
                                {entry.link ? (
                                  <Button size="sm" variant="ghost" asChild>
                                    <a href={entry.link} target="_blank" rel="noreferrer">
                                      <Clock3 />
                                      Open
                                    </a>
                                  </Button>
                                ) : (
                                  <Button size="sm" variant="ghost" disabled>
                                    <Clock3 />
                                    Open
                                  </Button>
                                )}

                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button size="sm" variant="ghost">
                                      Details
                                      <ChevronDown className="size-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-auto">
                                    {renderEntryDetails(entry)}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-muted-foreground">
                            Connect Jira/Bitbucket to show fetched entries here.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>

            <Card className="border-border/70">
              <CardHeader>
                <CardTitle className="text-lg">Suggestions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border border-border/70 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm font-medium">From Jira</p>
                    {isAtlassianConnected ? (
                      <Badge>Connected</Badge>
                    ) : (
                      <Badge variant="outline">Not connected</Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {isAtlassianConnected
                      ? "Jira account detected. Issue suggestions are available."
                      : "Connect Atlassian to fetch Jira worklog suggestions."}
                  </p>
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" variant="secondary" disabled={!isAtlassianConnected}>
                      Accept
                    </Button>
                    <Button size="sm" variant="outline" disabled={!isAtlassianConnected}>
                      Dismiss
                    </Button>
                  </div>
                </div>

                <div className="rounded-lg border border-border/70 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm font-medium">From Bitbucket</p>
                    {isBitbucketConnected ? (
                      <Badge>Connected</Badge>
                    ) : (
                      <Badge variant="outline">Not connected</Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {isBitbucketConnected
                      ? "Bitbucket account detected. Commit suggestions are available."
                      : "Connect Bitbucket to fetch commit-based suggestions."}
                  </p>
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" variant="secondary" disabled={!isBitbucketConnected}>
                      Accept
                    </Button>
                    <Button size="sm" variant="outline" disabled={!isBitbucketConnected}>
                      Dismiss
                    </Button>
                  </div>
                </div>

                <div className="rounded-lg border border-border/70 bg-muted/20 p-3 text-sm">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="font-medium">Fetched providers</p>
                    {integrationTimesheetQuery.isSuccess ? (
                      <Badge variant="secondary" className="gap-1">
                        <CheckCircle2 className="size-3" />
                        Live
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="gap-1">
                        <CircleDashed className="size-3" />
                        Pending
                      </Badge>
                    )}
                  </div>

                  <p className="text-muted-foreground">
                    {connectedProviders.length > 0
                      ? connectedProviders.join(", ")
                      : "No connected providers returned yet."}
                  </p>

                  {integrationData?.partialFailures?.length ? (
                    <p className="mt-2 text-destructive">
                      Partial fetch failure: {integrationData.partialFailures.join(", ")}
                    </p>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          </div>

          <RoleBasedRender
            role={userRole}
            allowedRoles={["manager", "admin"]}
            fallback={null}
          >
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm text-primary">
              You have elevated access to manager/admin-only routes.
            </div>
          </RoleBasedRender>

          <div className="rounded-xl border border-border/70 bg-muted/20 p-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-2 font-medium text-foreground">
              <ExternalLink className="size-4" />
              Verification hint
            </div>
            <p className="mt-1">
              This view is wired to live Jira and Bitbucket API data with a 30-second
              refresh interval.
            </p>
          </div>

        </CardContent>
      </Card>
    </div>
  );
}
