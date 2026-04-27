import { useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { LoaderCircle } from "lucide-react";

import { authClient } from "@/lib/auth-client";
import { env } from "@/lib/env";

type ProviderId = "atlassian" | "bitbucket";

function isProvider(value: string | null): value is ProviderId {
  return value === "atlassian" || value === "bitbucket";
}

function buildPopupCallbackUrl(provider: ProviderId): string {
  const url = new URL("/profile/integration-popup", env.VITE_WEB_BASE_URL);
  url.searchParams.set("provider", provider);
  url.searchParams.set("status", "success");
  return url.toString();
}

function notifyParent(provider: ProviderId, success: boolean) {
  if (window.opener && !window.opener.closed) {
    window.opener.postMessage(
      {
        type: "profile-integration-popup-result",
        provider,
        success,
      },
      window.location.origin,
    );
  }
}

export function ProfileIntegrationPopupPage() {
  const [searchParams] = useSearchParams();
  const didStartLinkingRef = useRef(false);

  const providerParam = searchParams.get("provider");
  const statusParam = searchParams.get("status");
  const errorParam = searchParams.get("error");

  const provider = useMemo(
    () => (isProvider(providerParam) ? providerParam : null),
    [providerParam],
  );

  useEffect(() => {
    if (!provider) {
      window.close();
      return;
    }

    if (statusParam === "success") {
      notifyParent(provider, true);
      window.close();
      return;
    }

    if (errorParam) {
      notifyParent(provider, false);
      window.close();
      return;
    }

    if (didStartLinkingRef.current) {
      return;
    }
    didStartLinkingRef.current = true;

    const callbackURL = buildPopupCallbackUrl(provider);

    const startLinking = async () => {
      try {
        if (provider === "atlassian") {
          await authClient.linkSocial({
            provider: "atlassian",
            callbackURL,
          });
          return;
        }

        await authClient.oauth2.link({
          providerId: "bitbucket",
          callbackURL,
        });
      } catch (error) {
        console.error("Failed to open integration auth flow:", error);
        notifyParent(provider, false);
        window.close();
      }
    };

    void startLinking();
  }, [errorParam, provider, statusParam]);

  return (
    <div className="grid min-h-screen place-items-center bg-background px-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" />
        Redirecting to provider...
      </div>
    </div>
  );
}
