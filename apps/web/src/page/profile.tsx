import { Link2, LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ThemeSwitcher } from "@/components/ui/theme-switcher";
import { useProfileIntegrations } from "@/lib/profile-integrations";

type IntegrationRowProps = {
  providerIcon: ReactNode;
  title: string;
  description: string;
  connected: boolean;
  isConnectPending: boolean;
  isDisconnectPending: boolean;
  connectionIssueMessage?: string | null;
  pendingLabel: string;
  connectLabel: string;
  onConnect: () => void;
  onDisconnect: () => void;
  icon: ReactNode;
};

function IntegrationRow({
  providerIcon,
  title,
  description,
  connected,
  isConnectPending,
  isDisconnectPending,
  connectionIssueMessage,
  pendingLabel,
  connectLabel,
  onConnect,
  onDisconnect,
  icon,
}: IntegrationRowProps) {
  const showDisconnectPending = connected && isDisconnectPending;
  const showConnectPending = !connected && isConnectPending;

  return (
    <div className="flex flex-col gap-3 py-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">{providerIcon}</span>
          <p className="text-sm font-medium">{title}</p>
          <Badge variant={connected ? "secondary" : "destructive"}>
            {connected ? "Connected" : "Not connected"}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">{description}</p>
        {connectionIssueMessage ? (
          <p className="text-xs text-destructive">{connectionIssueMessage}</p>
        ) : null}
      </div>

      <Button
        type="button"
        variant={connected ? "destructive" : "outline"}
        className="cursor-pointer"
        onClick={connected ? onDisconnect : onConnect}
        disabled={showConnectPending || showDisconnectPending}
      >
        {showConnectPending || showDisconnectPending ? (
          <LoaderCircle className="animate-spin" />
        ) : !connected ? (
          icon
        ) : null}
        {connected
          ? showDisconnectPending
            ? "Disconnecting..."
            : "Disconnect"
          : showConnectPending
            ? pendingLabel
            : connectLabel}
      </Button>
    </div>
  );
}

function AtlassianSimpleIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="size-4"
      fill="currentColor"
    >
      <path d="M7.12 11.084a.683.683 0 00-1.16.126L.075 22.974a.703.703 0 00.63 1.018h8.19a.678.678 0 00.63-.39c1.767-3.65.696-9.203-2.406-12.52zM11.434.386a15.515 15.515 0 00-.906 15.317l3.95 7.9a.703.703 0 00.628.388h8.19a.703.703 0 00.63-1.017L12.63.38a.664.664 0 00-1.196.006z" />
    </svg>
  );
}

function BitbucketSimpleIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="size-4"
      fill="currentColor"
    >
      <path d="M.778 1.213a.768.768 0 00-.768.892l3.263 19.81c.084.5.515.868 1.022.873H19.95a.772.772 0 00.77-.646l3.27-20.03a.768.768 0 00-.768-.891zM14.52 15.53H9.522L8.17 8.466h7.561z" />
    </svg>
  );
}

export function ProfilePage() {
  const { atlassian, bitbucket } = useProfileIntegrations();

  return (
    <div className="mx-auto mt-8 w-full max-w-4xl space-y-6 px-4 pb-8 sm:px-6 lg:px-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage connected integrations for your account.
          </p>
        </div>
        <ThemeSwitcher />
      </div>

      <section className="rounded-lg border border-border/70 bg-background px-4 sm:px-6">
        <IntegrationRow
          providerIcon={<AtlassianSimpleIcon />}
          title="Atlassian"
          description="Connect Jira and other Atlassian data sources."
          connected={atlassian.connected}
          isConnectPending={atlassian.isConnectPending}
          isDisconnectPending={atlassian.isDisconnectPending}
          connectionIssueMessage={atlassian.connectionIssueMessage}
          pendingLabel="Connecting Atlassian..."
          connectLabel="Connect Atlassian"
          onConnect={atlassian.connect}
          onDisconnect={atlassian.disconnect}
          icon={<Link2 />}
        />

        <div className="border-t border-border/70" />

        <IntegrationRow
          providerIcon={<BitbucketSimpleIcon />}
          title="Bitbucket"
          description="Connect repositories to sync commit and pull request activity."
          connected={bitbucket.connected}
          isConnectPending={bitbucket.isConnectPending}
          isDisconnectPending={bitbucket.isDisconnectPending}
          connectionIssueMessage={bitbucket.connectionIssueMessage}
          pendingLabel="Connecting Bitbucket..."
          connectLabel="Connect Bitbucket"
          onConnect={bitbucket.connect}
          onDisconnect={bitbucket.disconnect}
          icon={<Link2 />}
        />
      </section>
    </div>
  );
}
