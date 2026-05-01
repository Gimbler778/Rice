import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronRight, LoaderCircle, XCircle } from "lucide-react";
import { toast } from "sonner";

import { weeklySubmissionApi } from "@/api/weekly-submission-api";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { PageContainer } from "@/components/page-container";
import { authClient } from "@/lib/auth-client";
import { getSessionUserRole } from "@/lib/roles";

export default function ManagerApprovalsPage() {
  const { data: session } = authClient.useSession();
  const role = getSessionUserRole(session) ?? "developer";

  const [submissions, setSubmissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [active, setActive] = useState<null | { id: string; action: "approve" | "dismiss"; weekStartDate: string; userId: string }>(null);
  const [comment, setComment] = useState("");

  const pendingCount = useMemo(
    () => submissions.filter((submission) => submission.status === "submitted").length,
    [submissions],
  );

  const load = async () => {
    setLoading(true);
    try {
      const res = await weeklySubmissionApi.listSubmitted();
      setSubmissions(res.data?.rows ?? []);
    } catch (err) {
      console.error("Failed to load submissions", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (role === "manager" || role === "admin") {
      load();
    }
  }, [role]);

  const handleConfirm = async () => {
    if (!active) return;

    try {
      setActionLoadingId(active.id);
      if (active.action === "approve") {
        await weeklySubmissionApi.approve(active.weekStartDate, active.userId, comment || "");
        toast.success("Submission approved successfully");
      } else {
        await weeklySubmissionApi.dismiss(active.weekStartDate, active.userId, comment || "");
        toast.success("Submission dismissed successfully");
      }

      setActive(null);
      setComment("");
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(`Failed to ${active?.action}: ${message}`);
      console.error("Action failed", err);
    } finally {
      setActionLoadingId(null);
    }
  };

  if (role !== "manager" && role !== "admin") {
    return (
      <PageContainer className="flex items-center justify-center py-16">
        <Card className="w-full max-w-lg">
          <CardHeader>
            <CardTitle className="text-lg">Approvals</CardTitle>
            <CardDescription>
              You do not have permission to view this page.
            </CardDescription>
          </CardHeader>
        </Card>
      </PageContainer>
    );
  }

  return (
    <PageContainer className="space-y-6 py-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Manager approvals</h1>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Pending review</CardDescription>
            <CardTitle className="text-2xl">{pendingCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Total submissions</CardDescription>
            <CardTitle className="text-2xl">{submissions.length}</CardTitle>
          </CardHeader>
        </Card>
        </section>

      <Card className="overflow-hidden">
        <CardHeader className="border-b border-border/70 pb-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">Submitted weeks</CardTitle>
                        </div>
            <Badge variant="secondary">{pendingCount} pending</Badge>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center gap-3 px-4 py-6 text-sm text-muted-foreground">
              <Spinner />
              Loading submissions...
            </div>
          ) : submissions.length === 0 ? (
            <div className="px-4 py-8 text-sm text-muted-foreground">
              No submitted weeks found.
            </div>
          ) : (
            <div className="divide-y divide-border/70">
              {submissions.map((submission) => {
                const isActioning = actionLoadingId === submission.id;

                return (
                  <div key={submission.id} className="flex flex-col gap-4 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-foreground">
                          {submission.userName ?? submission.userId}
                        </p>
                        <Badge variant="outline">{submission.status}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {submission.userEmail}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Week ending {submission.weekStartDate}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Submitted {submission.submittedAt ? new Date(submission.submittedAt).toLocaleString() : "-"}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 self-start lg:self-auto">
                      <AlertDialog
                        open={active?.id === submission.id && active?.action === "approve"}
                        onOpenChange={(open) => {
                          if (!open) {
                            setActive(null);
                            setComment("");
                          }
                        }}
                      >
                        <AlertDialogTrigger asChild>
                          <Button
                            type="button"
                            className="gap-1.5 bg-teal-600 text-white hover:bg-teal-700"
                            onClick={() => setActive({ id: submission.id, action: "approve", weekStartDate: submission.weekStartDate, userId: submission.userId })}
                            disabled={isActioning}
                          >
                            {isActioning && active?.action === "approve" ? <LoaderCircle className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                            Approve
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Approve submission?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Approve {submission.userName ?? submission.userId} for week {submission.weekStartDate}.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <textarea
                            value={comment}
                            onChange={(event) => setComment(event.target.value)}
                            className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                            placeholder="Optional approval comment"
                          />
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={handleConfirm}>Confirm approval</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>

                      <AlertDialog
                        open={active?.id === submission.id && active?.action === "dismiss"}
                        onOpenChange={(open) => {
                          if (!open) {
                            setActive(null);
                            setComment("");
                          }
                        }}
                      >
                        <AlertDialogTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            className="gap-1.5"
                            onClick={() => setActive({ id: submission.id, action: "dismiss", weekStartDate: submission.weekStartDate, userId: submission.userId })}
                            disabled={isActioning}
                          >
                            {isActioning && active?.action === "dismiss" ? <LoaderCircle className="size-4 animate-spin" /> : <XCircle className="size-4" />}
                            Dismiss
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Dismiss submission?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Dismiss {submission.userName ?? submission.userId} for week {submission.weekStartDate}. Add a comment so they know what to fix.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <textarea
                            value={comment}
                            onChange={(event) => setComment(event.target.value)}
                            className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                            placeholder="Optional dismissal comment"
                          />
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={handleConfirm}>Confirm dismissal</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>

                      <Button type="button" variant="ghost" size="icon" className="size-9 shrink-0">
                        <ChevronRight className="size-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
