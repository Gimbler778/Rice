import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

import { useIntegrationStatus } from "@/hooks/use-integrations";
import { authClient } from "@/lib/auth-client";
 
type ProviderId = "atlassian" | "bitbucket";
type PopupResultMessage = {
  type: "profile-integration-popup-result";
  provider: ProviderId;
  success: boolean;
};

type ProviderState = {
  connected: boolean;
  isConnectPending: boolean;
  isDisconnectPending: boolean;
  connectionIssueMessage: string | null;
  connect: () => void;
  disconnect: () => void;
};

type LinkIssueState = {
  atlassian: string | null;
  bitbucket: string | null;
};

function openIntegrationPopup(provider: ProviderId): Promise<boolean> {
  return new Promise((resolve) => {
    const popupUrl = `/profile/integration-popup?provider=${provider}`;
    const popup = window.open(
      popupUrl,
      `profile-link-${provider}`,
      "popup=yes,width=520,height=720,menubar=no,toolbar=no,location=no,status=no",
    );

    if (!popup) {
      resolve(false);
      return;
    }

    const origin = window.location.origin;

    const cleanup = () => {
      window.removeEventListener("message", onMessage);
      window.clearInterval(closedWatcher);
    };

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== origin) {
        return;
      }

      const payload = event.data as PopupResultMessage | undefined;
      if (
        payload?.type !== "profile-integration-popup-result" ||
        payload.provider !== provider
      ) {
        return;
      }

      cleanup();
      resolve(payload.success);
    };

    const closedWatcher = window.setInterval(() => {
      if (!popup || popup.closed) {
        cleanup();
        resolve(false);
      }
    }, 400);

    window.addEventListener("message", onMessage);
  });
}

export function useProfileIntegrations() {
  const { data: session } = authClient.useSession();
  const integrationStatusQuery = useIntegrationStatus(Boolean(session?.user?.id));
  const status = integrationStatusQuery.data;
  const [linkIssue, setLinkIssue] = useState<LinkIssueState>({
    atlassian: null,
    bitbucket: null,
  });

  const connectAtlassianMutation = useMutation({
    mutationFn: async () => {
      setLinkIssue((prev) => ({ ...prev, atlassian: null }));
      const completed = await openIntegrationPopup("atlassian");
      if (!completed) {
        throw new Error("POPUP_CANCELLED_OR_FAILED");
      }

      const refreshed = await integrationStatusQuery.refetch();
      if (refreshed.data?.atlassianConnected !== true) {
        throw new Error("NOT_CONNECTED_AFTER_CALLBACK");
      }
    },
    onSuccess: () => {
      toast.success("Atlassian connected");
    },
    onError: (error: Error) => {
      if (
        error.message === "POPUP_CANCELLED_OR_FAILED" ||
        error.message === "NOT_CONNECTED_AFTER_CALLBACK"
      ) {
        setLinkIssue((prev) => ({
          ...prev,
          atlassian: "Connection was cancelled or failed. Please try again.",
        }));
        return;
      }

      toast.error("Atlassian connect failed. Please try again.");
      console.error("Atlassian link failed:", error);
    },
  });

  const connectBitbucketMutation = useMutation({
    mutationFn: async () => {
      setLinkIssue((prev) => ({ ...prev, bitbucket: null }));
      const completed = await openIntegrationPopup("bitbucket");
      if (!completed) {
        throw new Error("POPUP_CANCELLED_OR_FAILED");
      }

      const refreshed = await integrationStatusQuery.refetch();
      if (refreshed.data?.bitbucketConnected !== true) {
        throw new Error("NOT_CONNECTED_AFTER_CALLBACK");
      }
    },
    onSuccess: () => {
      toast.success("Bitbucket connected");
    },
    onError: (error: Error) => {
      if (
        error.message === "POPUP_CANCELLED_OR_FAILED" ||
        error.message === "NOT_CONNECTED_AFTER_CALLBACK"
      ) {
        setLinkIssue((prev) => ({
          ...prev,
          bitbucket: "Connection was cancelled or failed. Please try again.",
        }));
        return;
      }

      toast.error("Bitbucket connect failed. Please try again.");
      console.error("Bitbucket link failed:", error);
    },
  });

  const disconnectAtlassianMutation = useMutation({
    mutationFn: async () => {
      await authClient.unlinkAccount({
        providerId: "atlassian",
      });
    },
    onSuccess: async () => {
      await integrationStatusQuery.refetch();
      toast.success("Atlassian disconnected");
    },
    onError: (error) => {
      toast.error("Atlassian disconnect failed. Please try again.");
      console.error("Atlassian unlink failed:", error);
    },
  });

  const disconnectBitbucketMutation = useMutation({
    mutationFn: async () => {
      await authClient.unlinkAccount({
        providerId: "bitbucket",
      });
    },
    onSuccess: async () => {
      await integrationStatusQuery.refetch();
      toast.success("Bitbucket disconnected");
    },
    onError: (error) => {
      toast.error("Bitbucket disconnect failed. Please try again.");
      console.error("Bitbucket unlink failed:", error);
    },
  });

  const atlassian: ProviderState = {
    connected: status?.atlassianConnected === true,
    isConnectPending: connectAtlassianMutation.isPending,
    isDisconnectPending: disconnectAtlassianMutation.isPending,
    connectionIssueMessage: linkIssue.atlassian,
    connect: () => connectAtlassianMutation.mutate(),
    disconnect: () => disconnectAtlassianMutation.mutate(),
  };

  const bitbucket: ProviderState = {
    connected: status?.bitbucketConnected === true,
    isConnectPending: connectBitbucketMutation.isPending,
    isDisconnectPending: disconnectBitbucketMutation.isPending,
    connectionIssueMessage: linkIssue.bitbucket,
    connect: () => connectBitbucketMutation.mutate(),
    disconnect: () => disconnectBitbucketMutation.mutate(),
  };

  return {
    atlassian,
    bitbucket,
  };
}
