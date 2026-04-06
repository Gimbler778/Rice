import { Router } from "express";
import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { account } from "@/db/schema";
import { auth } from "@/lib/auth";
import logger from "@/lib/logger";
import { RESPONSE_CODE, sendError, sendSuccess } from "@/lib/response";
import { tryCatch } from "@/lib/try-catch";

const router = Router();

function toWebHeaders(
  headers: Record<string, string | string[] | undefined>,
): Headers {
  const webHeaders = new Headers();

  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === "string") {
      webHeaders.set(key, value);
      continue;
    }

    if (Array.isArray(value)) {
      webHeaders.set(key, value.join(", "));
    }
  }

  return webHeaders;
}

router.get("/integrations/status", async (req, res) => {
  const { data: session, error: sessionError } = await tryCatch(
    auth.api.getSession({ headers: toWebHeaders(req.headers) }),
  );

  if (sessionError) {
    logger.error({ err: sessionError }, "Failed to resolve auth session");
    return sendError(
      res,
      RESPONSE_CODE.INTERNAL_SERVER_ERROR,
      "Failed to resolve auth session",
    );
  }

  const userId = session?.user?.id;
  if (!userId) {
    return sendError(res, RESPONSE_CODE.UNAUTHORIZED, "Unauthorized");
  }

  const { data: linkedAccounts, error: accountError } = await tryCatch(
    db
      .select({ providerId: account.providerId })
      .from(account)
      .where(eq(account.userId, userId)),
  );

  if (accountError) {
    logger.error(
      { err: accountError, userId },
      "Failed to fetch linked accounts",
    );
    return sendError(
      res,
      RESPONSE_CODE.INTERNAL_SERVER_ERROR,
      "Failed to fetch linked account status",
    );
  }

  const connectedProviders = Array.from(
    new Set(linkedAccounts.map((entry) => entry.providerId)),
  );

  return sendSuccess(
    res,
    RESPONSE_CODE.OK,
    "Integration status fetched successfully",
    {
      connectedProviders,
      atlassianConnected: connectedProviders.includes("atlassian"),
      bitbucketConnected: connectedProviders.includes("bitbucket"),
    },
  );
});

export default router;
