import { type FallbackProps } from "react-error-boundary";
import { AlertTriangle, Home, RefreshCcw } from "lucide-react";

import { PageContainer } from "./page-container";
import { Button } from "./ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./ui/card";

export function ErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  const message =
    error instanceof Error ? error.message : "Unknown application error";
  const isDev = import.meta.env.DEV;

  return (
    <PageContainer className="grid min-h-screen place-items-center">
      <Card className="w-full max-w-xl border-destructive/20">
        <CardHeader className="space-y-2 border-b border-border/60">
          <div className="inline-flex size-10 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
            <AlertTriangle className="size-5" />
          </div>
          <CardTitle className="text-xl">Something went wrong</CardTitle>
          <CardDescription>
            An unexpected error interrupted this screen. You can try again or
            return to a safe page.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4 pt-5">
          <div className="rounded-lg border border-border/70 bg-muted/30 p-3">
            <p className="text-sm text-muted-foreground">
              {isDev ? message : "Please retry. If this keeps happening, sign out and sign in again."}
            </p>
          </div>

          {isDev ? (
            <details className="rounded-lg border border-border/70 bg-background p-3 text-xs text-muted-foreground">
              <summary className="cursor-pointer font-medium text-foreground">
                Technical details
              </summary>
              <pre className="mt-3 overflow-auto whitespace-pre-wrap wrap-break-word">
                {error instanceof Error ? error.stack ?? error.message : String(error)}
              </pre>
            </details>
          ) : null}
        </CardContent>

        <CardFooter className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => window.location.assign("/")}
          >
            <Home />
            Go to home
          </Button>
          <Button type="button" onClick={resetErrorBoundary}>
            <RefreshCcw />
            Try again
          </Button>
        </CardFooter>
      </Card>
    </PageContainer>
  );
}
