import { CheckCircle2, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import type { IntegrationStatus } from "../types";
import { SectionHeader } from "../ui";

type IntegrationsTabProps = {
  integrations: IntegrationStatus;
  onDisconnect: (service: "jira" | "bitbucket") => void;
};

export function IntegrationsTab({ integrations, onDisconnect }: IntegrationsTabProps) {
  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        title="Integrations"
        description="Manage JIRA and Bitbucket OAuth connections. These are org-level connections used for the suggestion sync engine."
      />

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <span className="size-5 rounded bg-blue-600 flex items-center justify-center text-white text-[9px] font-bold shrink-0">
                  J
                </span>
                Atlassian JIRA
              </CardTitle>
              <CardDescription className="text-xs mt-1">
                Syncs issue transitions, comments, and assignments to power the suggestions
                panel. Polls every 30 minutes via node-cron.
              </CardDescription>
            </div>
            {integrations.jira.connected ? (
              <CheckCircle2 className="size-5 text-teal-500 shrink-0 mt-0.5" />
            ) : (
              <XCircle className="size-5 text-muted-foreground shrink-0 mt-0.5" />
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {integrations.jira.connected ? (
            <div className="flex items-center justify-between">
              <div className="text-xs text-muted-foreground">
                Connected to <strong className="text-foreground">{integrations.jira.org}</strong>
                {integrations.jira.connectedAt && ` · since ${integrations.jira.connectedAt}`}
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs hover:border-destructive hover:text-destructive"
                onClick={() => onDisconnect("jira")}
              >
                Disconnect
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Not connected</p>
              <Button size="sm" className="h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white">
                Connect JIRA
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <span className="size-5 rounded bg-blue-500 flex items-center justify-center text-white text-[9px] font-bold shrink-0">
                  B
                </span>
                Bitbucket
              </CardTitle>
              <CardDescription className="text-xs mt-1">
                Syncs commits, PRs opened/merged, and PR reviews to surface Development and
                Code Review suggestions.
              </CardDescription>
            </div>
            {integrations.bitbucket.connected ? (
              <CheckCircle2 className="size-5 text-teal-500 shrink-0 mt-0.5" />
            ) : (
              <XCircle className="size-5 text-muted-foreground shrink-0 mt-0.5" />
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {integrations.bitbucket.connected ? (
            <div className="flex items-center justify-between">
              <div className="text-xs text-muted-foreground">
                Connected to
                <strong className="text-foreground"> {integrations.bitbucket.org}</strong>
                {integrations.bitbucket.connectedAt &&
                  ` · since ${integrations.bitbucket.connectedAt}`}
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs hover:border-destructive hover:text-destructive"
                onClick={() => onDisconnect("bitbucket")}
              >
                Disconnect
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Not connected</p>
              <Button size="sm" className="h-7 text-xs bg-blue-500 hover:bg-blue-600 text-white">
                Connect Bitbucket
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="rounded-md border border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
        <strong className="text-foreground">Note:</strong> These are org-level OAuth
        connections. Individual users may also connect their personal Atlassian account for
        per-user sync. Per-user connections are managed from the profile settings page.
      </div>
    </div>
  );
}
