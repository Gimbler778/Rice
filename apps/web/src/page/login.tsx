import { useMemo, useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

function assertNoAuthError(response: unknown): void {
  if (!response || typeof response !== "object") {
    return;
  }

  if ("error" in response && response.error) {
    throw new Error("Authentication failed");
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
  const mode: AuthMode = useMemo(() => {
    if (resetToken) {
      return "reset";
    }
    return modeFromQuery === "signup" || modeFromQuery === "forgot"
      ? modeFromQuery
      : "signin";
  }, [modeFromQuery, resetToken]);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

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

  const signInMutation = useMutation({
    mutationFn: async () => {
      const response = await authClient.signIn.email({
        email,
        password,
        callbackURL: buildDashboardCallbackUrl(),
      });
      assertNoAuthError(response);
    },
    onError: (error) => {
      toast.error("Authentication failed. Please try again.");
      console.error("Email sign in failed:", error);
    },
  });

  const signUpMutation = useMutation({
    mutationFn: async () => {
      const response = await authClient.signUp.email({
        name,
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
    },
    onError: (error) => {
      toast.error("Authentication failed. Please try again.");
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
      toast.error("Authentication failed. Please try again.");
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
      toast.error("Authentication failed. Please try again.");
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
      toast.error("Authentication failed. Please try again.");
      console.error("Send verification email failed:", error);
    },
  });

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

  return (
    <section className="flex min-h-screen w-full items-center justify-center px-4 py-6 lg:py-20">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2">
          <h2 className="font-bold text-3xl">
            {mode === "signup"
              ? "Create your account"
              : mode === "forgot"
                ? "Reset your password"
                : mode === "reset"
                  ? "Choose a new password"
                  : "Sign in to your account"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {mode === "signup"
              ? "Email verification is required before sign in."
              : mode === "forgot"
                ? "Enter your email to get a reset link."
                : mode === "reset"
                  ? "Set a new password to continue."
                  : "Use email and password to continue."}
          </p>
        </div>

        {authError ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {authError === "invalid_token"
              ? "That verification or reset link is invalid or expired. Please request a new one."
              : `Authentication error: ${authError}`}
          </div>
        ) : null}

        {mode === "signup" ? (
          <form
            className="space-y-4"
            onSubmit={(event) => event.preventDefault()}
          >
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Jane Doe"
                autoComplete="name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email address</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
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
                !name ||
                !email ||
                password.length < 8
              }
              onClick={() => signUpMutation.mutate()}
            >
              {signUpMutation.isPending
                ? "Creating account..."
                : "Create account"}
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
        ) : mode === "forgot" ? (
          <form
            className="space-y-4"
            onSubmit={(event) => event.preventDefault()}
          >
            <div className="space-y-2">
              <Label htmlFor="email">Email address</Label>
              <Input
                id="email"
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
              onClick={() => forgotPasswordMutation.mutate()}
            >
              {forgotPasswordMutation.isPending
                ? "Sending..."
                : "Send reset link"}
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
        ) : mode === "reset" ? (
          <form
            className="space-y-4"
            onSubmit={(event) => event.preventDefault()}
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
              onClick={() => resetPasswordMutation.mutate()}
            >
              {resetPasswordMutation.isPending
                ? "Updating..."
                : "Update password"}
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
            onSubmit={(event) => event.preventDefault()}
          >
            <div className="space-y-2">
              <Label htmlFor="email">Email address</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
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
                className="text-sm hover:underline"
              >
                Forgot your password?
              </button>
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={signInMutation.isPending || !email || !password}
              onClick={() => signInMutation.mutate()}
            >
              {signInMutation.isPending ? "Signing in..." : "Sign in"}
            </Button>

            <div className="flex flex-wrap items-center gap-2 text-sm">
              <button
                type="button"
                className="hover:underline"
                onClick={() => setMode("signup")}
              >
                Create account
              </button>
              <button
                type="button"
                className="hover:underline"
                disabled={resendVerificationMutation.isPending || !email}
                onClick={() => resendVerificationMutation.mutate()}
              >
                {resendVerificationMutation.isPending
                  ? "Sending verification..."
                  : "Resend verification"}
              </button>
            </div>
          </form>
        )}

        <p className="text-sm leading-6 text-muted-foreground">
          After sign in, connect Atlassian and Bitbucket from the dashboard.
        </p>
      </div>
    </section>
  );
}
