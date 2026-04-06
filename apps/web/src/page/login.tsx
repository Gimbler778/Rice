import { useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { env } from "@/lib/env";

function buildCallbackUrl(): string {
  return new URL("/today", env.VITE_WEB_BASE_URL).toString();
}

export function LoginPage() {
  const navigate = useNavigate();
  const { data: session, isPending } = authClient.useSession();

  const signInMutation = useMutation({
    mutationFn: async () => {
      await authClient.signIn.social({
        provider: "atlassian",
        callbackURL: buildCallbackUrl(),
      });
    },
    onError: (error) => {
      toast.error("Atlassian sign in failed. Please try again.");
      navigate("/", { replace: true });
      console.error("Sign in failed:", error);
    },
  });

  useEffect(() => {
    if (session) {
      navigate("/today", { replace: true });
    }
  }, [navigate, session]);

  if (isPending) {
    return (
      <div className="grid min-h-[calc(100vh-4rem)] place-items-center px-4">
        <div className="text-center text-sm text-muted-foreground">
          Loading session...
        </div>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-7rem)] w-full max-w-2xl items-center">
        <Card className="w-full border-border/70">
          <CardHeader className="space-y-3 border-b border-border/60 pb-6">
            <CardTitle className="text-2xl sm:text-3xl">Sign in</CardTitle>
            <CardDescription className="text-base">
              Use your Atlassian account to access the protected workspace.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5 pt-6">
            <Button
              type="button"
              className="h-11 w-full text-sm"
              onClick={() => signInMutation.mutate()}
              disabled={signInMutation.isPending}
            >
              {signInMutation.isPending
                ? "Redirecting to Atlassian..."
                : "Continue with Atlassian"}
            </Button>

            <p className="text-sm leading-6 text-muted-foreground">
              After authentication, you will return to the page you were trying
              to open. If no protected page was requested, the app sends you to
              <span className="font-medium text-foreground"> /today</span>.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
