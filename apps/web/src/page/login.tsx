import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { authClient } from "@/lib/auth-client";
import { env } from "@/lib/env";

function buildDashboardCallbackUrl(): string {
  return new URL("/today", env.VITE_WEB_BASE_URL).toString();
}

function buildVerificationCallbackUrl(): string {
  const url = new URL("/", env.VITE_WEB_BASE_URL);
  url.searchParams.set("verified", "1");
  return url.toString();
}

function buildPasswordResetRedirectUrl(): string {
  const url = new URL("/", env.VITE_WEB_BASE_URL);
  url.searchParams.set("mode", "reset");
  return url.toString();
}

function getAuthErrorMessage(response: unknown): string | null {
  if (!response || typeof response !== "object") {
    return null;
  }

  if (!("error" in response) || !response.error) {
    return null;
  }

  const error = response.error;
  if (typeof error === "string") {
    return error;
  }

  if (typeof error === "object" && error && "message" in error && typeof error.message === "string") {
    return error.message;
  }

  return "Authentication failed";
}

function assertNoAuthError(response: unknown): void {
  const message = getAuthErrorMessage(response);
  if (message) {
    throw new Error(message);
  }
}

type AuthMode = "signin" | "signup" | "forgot" | "reset";

export function LoginPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: session, isPending } = authClient.useSession();
  const resetToken = searchParams.get("token") ?? "";
  const verified = searchParams.get("verified") === "1";
  const authError = searchParams.get("error");
  const modeFromQuery = searchParams.get("mode") as AuthMode | null;
  const mode = useMemo<AuthMode>(() => {
    if (resetToken) {
      return "reset";
    }
    return modeFromQuery === "signup" || modeFromQuery === "forgot"
      ? modeFromQuery
      : "signin";
  }, [modeFromQuery, resetToken]);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const isForgotMode = mode === "forgot";

  const setMode = (nextMode: Exclude<AuthMode, "reset">) => {
    const next = new URLSearchParams(searchParams);
    next.delete("token");
    if (nextMode === "signin") {
      next.delete("mode");
    } else {
      next.set("mode", nextMode);
    }
    setSearchParams(next, { replace: true });
  };

  const setAuthTab = (tab: "signin" | "signup") => {
    if (tab === "signup") {
      setMode("signup");
      return;
    }
    setMode("signin");
  };

  const signInMutation = useMutation({
    mutationFn: async () => {
      const response = await authClient.signIn.email({
        email,
        password,
        callbackURL: buildDashboardCallbackUrl(),
      });
      assertNoAuthError(response);
    },
    onSuccess: () => {
      navigate("/today", { replace: true });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Authentication failed. Please try again.");
      console.error("Email sign in failed:", error);
    },
  });

  const signUpMutation = useMutation({
    mutationFn: async () => {
      const response = await authClient.signUp.email({
        name: fullName,
        email,
        password,
        callbackURL: buildVerificationCallbackUrl(),
      });
      assertNoAuthError(response);
    },
    onSuccess: () => {
      toast.success("Check your email to verify your account.");
      setMode("signin");
      setPassword("");
      setFullName("");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Authentication failed. Please try again.");
      console.error("Email sign up failed:", error);
    },
  });

  const forgotPasswordMutation = useMutation({
    mutationFn: async () => {
      const response = await authClient.requestPasswordReset({
        email,
        redirectTo: buildPasswordResetRedirectUrl(),
      });
      assertNoAuthError(response);
    },
    onSuccess: () => {
      toast.success("If this email exists, a reset link has been sent.");
      setMode("signin");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Authentication failed. Please try again.");
      console.error("Request password reset failed:", error);
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async () => {
      const response = await authClient.resetPassword({
        token: resetToken,
        newPassword,
      });
      assertNoAuthError(response);
    },
    onSuccess: () => {
      toast.success("Password updated. You can sign in now.");
      setNewPassword("");
      setMode("signin");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Authentication failed. Please try again.");
      console.error("Reset password failed:", error);
    },
  });

  const resendVerificationMutation = useMutation({
    mutationFn: async () => {
      const response = await authClient.sendVerificationEmail({
        email,
        callbackURL: buildVerificationCallbackUrl(),
      });
      assertNoAuthError(response);
    },
    onSuccess: () => {
      toast.success("Verification email sent.");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Authentication failed. Please try again.");
      console.error("Send verification email failed:", error);
    },
  });

  const handleResendVerification = () => {
    if (!email.trim()) {
      toast.error("Enter your email first to resend verification.");
      return;
    }
    resendVerificationMutation.mutate();
  };

  useEffect(() => {
    if (session) {
      navigate("/today", { replace: true });
    }
  }, [navigate, session]);

  useEffect(() => {
    if (!verified) {
      return;
    }

    toast.success("Email verified. You can sign in now.");
    const next = new URLSearchParams(searchParams);
    next.delete("verified");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, verified]);

  if (isPending) {
    return (
      <div className="grid min-h-[calc(100vh-4rem)] place-items-center px-4">
        <div className="text-center text-sm text-muted-foreground">
          Loading session...
        </div>
      </div>
    );
  }

  if (mode === "reset") {
    return (
      <section className="flex min-h-screen w-full items-center justify-center px-4 py-6 lg:py-20">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Choose a new password</CardTitle>
            <CardDescription>Set a new password to continue.</CardDescription>
          </CardHeader>
          <CardContent>
            {authError ? (
              <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {authError === "invalid_token"
                  ? "That reset link is invalid or expired. Request a new one."
                  : `Authentication error: ${authError}`}
              </div>
            ) : null}

            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                resetPasswordMutation.mutate();
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="new-password">New password</Label>
                <Input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                />
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={
                  resetPasswordMutation.isPending ||
                  !resetToken ||
                  newPassword.length < 8
                }
              >
                {resetPasswordMutation.isPending ? "Updating..." : "Update password"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => setMode("signin")}
              >
                Back to sign in
              </Button>
            </form>
          </CardContent>
        </Card>
      </section>
    );
  }

  return (
    <section className="flex min-h-screen w-full items-center justify-center px-4 py-6 lg:py-20">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>
            {isForgotMode ? "Reset your password" : "Welcome to Rice"}
          </CardTitle>
          <CardDescription>
            {isForgotMode
              ? "Enter your email to get a reset link."
              : "Sign in or create an account to continue."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {verified ? (
            <div className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
              Email verified. You can sign in now.
            </div>
          ) : null}

          {authError ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {authError === "invalid_token"
                ? "That verification link is invalid or expired. Request a new one below."
                : `Authentication error: ${authError}`}
            </div>
          ) : null}

          <Tabs value={mode === "signup" ? "signup" : "signin"} onValueChange={(value) => setAuthTab(value as "signin" | "signup")}>
            <TabsList className="w-full">
              <TabsTrigger value="signin" className="flex-1">
                Sign in
              </TabsTrigger>
              <TabsTrigger value="signup" className="flex-1">
                Sign up
              </TabsTrigger>
            </TabsList>

            <TabsContent value="signin" className="mt-4">
              {isForgotMode ? (
                <form
                  className="space-y-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    forgotPasswordMutation.mutate();
                  }}
                >
                  <div className="space-y-2">
                    <Label htmlFor="forgot-email">Email address</Label>
                    <Input
                      id="forgot-email"
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="you@example.com"
                      autoComplete="email"
                    />
                  </div>
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={forgotPasswordMutation.isPending || !email}
                  >
                    {forgotPasswordMutation.isPending ? "Sending..." : "Send reset link"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full"
                    onClick={() => setMode("signin")}
                  >
                    Back to sign in
                  </Button>
                </form>
              ) : (
                <form
                  className="space-y-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    signInMutation.mutate();
                  }}
                >
                  <div className="space-y-2">
                    <Label htmlFor="signin-email">Email address</Label>
                    <Input
                      id="signin-email"
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="you@example.com"
                      autoComplete="email"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signin-password">Password</Label>
                    <Input
                      id="signin-password"
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="Your password"
                      autoComplete="current-password"
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setMode("forgot")}
                      className="text-sm text-muted-foreground hover:text-foreground hover:underline"
                    >
                      Forgot your password?
                    </button>
                    <button
                      type="button"
                      className="text-sm text-muted-foreground hover:text-foreground hover:underline disabled:opacity-60"
                      disabled={resendVerificationMutation.isPending}
                      onClick={handleResendVerification}
                    >
                      {resendVerificationMutation.isPending
                        ? "Sending verification..."
                        : "Resend verification"}
                    </button>
                  </div>

                  <Button
                    type="submit"
                    className="w-full"
                    disabled={signInMutation.isPending || !email || !password}
                  >
                    {signInMutation.isPending ? "Signing in..." : "Sign in"}
                  </Button>
                </form>
              )}
            </TabsContent>

            <TabsContent value="signup" className="mt-4">
              <form
                className="space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  signUpMutation.mutate();
                }}
              >
                <div className="space-y-2">
                  <Label htmlFor="signup-name">Name</Label>
                  <Input
                    id="signup-name"
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    placeholder="Jane Doe"
                    autoComplete="name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-email">Email address</Label>
                  <Input
                    id="signup-email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password">Password</Label>
                  <Input
                    id="signup-password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="At least 8 characters"
                    autoComplete="new-password"
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={
                    signUpMutation.isPending ||
                    !fullName ||
                    !email ||
                    password.length < 8
                  }
                >
                  {signUpMutation.isPending ? "Creating account..." : "Create account"}
                </Button>
                <p className="text-xs text-muted-foreground">
                  A verification email will be sent before you can sign in.
                </p>
              </form>
            </TabsContent>
          </Tabs>

          <p className="text-sm leading-6 text-muted-foreground">
            After sign in, connect Atlassian and Bitbucket from the dashboard.
          </p>
        </CardContent>
      </Card>
    </section>
  );
}
