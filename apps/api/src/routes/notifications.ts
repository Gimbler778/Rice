import express from "express";
import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { notification } from "@/db/schema";
import { RESPONSE_CODE, sendError, sendSuccess } from "@/lib/response";
import { auth } from "@/lib/auth";

const router = express.Router();

/** GET /api/notifications — return all notifications for the authenticated user */
router.get("/", async (req, res) => {
  const session = await auth.api.getSession({ headers: req.headers as unknown as Headers });
  if (!session?.user?.id) {
    return sendError(res, RESPONSE_CODE.UNAUTHORIZED, "Not authenticated", "no session");
  }

  try {
    const rows = await db
      .select()
      .from(notification)
      .where(eq(notification.userId, session.user.id))
      .orderBy(desc(notification.createdAt));

    return sendSuccess(res, RESPONSE_CODE.OK, "Fetched notifications", {
      notifications: rows.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        message: n.message,
        metadata: n.metadata ? JSON.parse(n.metadata) : null,
        read: n.read,
        createdAt: n.createdAt,
      })),
    });
  } catch (error) {
    return sendError(
      res,
      RESPONSE_CODE.INTERNAL_SERVER_ERROR,
      "Failed to fetch notifications",
      String(error),
    );
  }
});

/** PATCH /api/notifications/:id/read — mark a single notification as read */
router.patch("/:id/read", async (req, res) => {
  const session = await auth.api.getSession({ headers: req.headers as unknown as Headers });
  if (!session?.user?.id) {
    return sendError(res, RESPONSE_CODE.UNAUTHORIZED, "Not authenticated", "no session");
  }

  const { id } = req.params;

  try {
    await db
      .update(notification)
      .set({ read: true })
      .where(
        and(eq(notification.id, id), eq(notification.userId, session.user.id)),
      );

    return sendSuccess(res, RESPONSE_CODE.OK, "Notification marked as read", { id });
  } catch (error) {
    return sendError(
      res,
      RESPONSE_CODE.INTERNAL_SERVER_ERROR,
      "Failed to update notification",
      String(error),
    );
  }
});

/** PATCH /api/notifications/read-all — mark all notifications as read */
router.patch("/read-all", async (req, res) => {
  const session = await auth.api.getSession({ headers: req.headers as unknown as Headers });
  if (!session?.user?.id) {
    return sendError(res, RESPONSE_CODE.UNAUTHORIZED, "Not authenticated", "no session");
  }

  try {
    await db
      .update(notification)
      .set({ read: true })
      .where(
        and(
          eq(notification.userId, session.user.id),
          eq(notification.read, false),
        ),
      );

    return sendSuccess(res, RESPONSE_CODE.OK, "All notifications marked as read", {});
  } catch (error) {
    return sendError(
      res,
      RESPONSE_CODE.INTERNAL_SERVER_ERROR,
      "Failed to update notifications",
      String(error),
    );
  }
});

export default router;
