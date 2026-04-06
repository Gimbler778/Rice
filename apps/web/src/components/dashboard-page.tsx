import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { LogOut, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export function DashboardPage() {
  const { data: session } = authClient.useSession();
  const navigate = useNavigate();

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

  return (
    <Card className="mx-auto mt-10 max-w-2xl border-border/70 shadow-lg shadow-primary/5">
      <CardHeader className="border-b border-border/60">
        <CardTitle className="flex items-center gap-2 text-xl">
          <UserRound className="size-5 text-primary" />
          Today
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6 pt-6">
        <div className="space-y-2">
          <p className="text-sm uppercase tracking-[0.25em] text-muted-foreground">
            Authenticated session
          </p>
          <p className="text-lg font-medium">
            Signed in as {session?.user.email ?? "Unknown user"}
          </p>
        </div>

        <div className="rounded-xl border border-border/70 bg-muted/30 p-4 text-sm text-muted-foreground">
          Your Atlassian account is connected through Better Auth. Use this area
          as the first protected page after login.
        </div>

        <div className="flex flex-wrap gap-3">
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
      </CardContent>
    </Card>
  );
}
