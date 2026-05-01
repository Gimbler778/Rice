import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/client";
import { learningEntry, learningTags } from "@/db/schema";
import { auth } from "@/lib/auth";
import logger from "@/lib/logger";
import { RESPONSE_CODE, sendError, sendSuccess } from "@/lib/response";
import { tryCatch } from "@/lib/try-catch";

const router = Router();

const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;
const isoDateSchema = z.string().regex(isoDateRegex, "Expected date in YYYY-MM-DD format");

const upsertLearningSchema = z.object({
  title: z.string().max(300).default(""),
  notes: z.string().max(2000).optional(),
  tag: z.enum(learningTags).optional().nullable(),
});

async function resolveSessionUserId(req: any) {
  try {
    const session = await auth.api.getSession({
      headers: req.headers,
    });

    if (!session?.user?.id) {
      return { ok: false, code: RESPONSE_CODE.UNAUTHORIZED, message: "Unauthorized", userId: null } as const;
    }

    return { ok: true, userId: session.user.id } as const;
  } catch (error) {
    logger.error({ err: error }, "Failed to resolve auth session");
    return { ok: false, code: RESPONSE_CODE.INTERNAL_SERVER_ERROR, message: "Failed to resolve auth session", userId: null } as const;
  }
}

async function computeStreak(userId: string, fromDate: string): Promise<number> {
  // Fetch all entries for this user (title may be empty — filter those out)
  const { data: rows, error } = await tryCatch(
    db
      .select({ date: learningEntry.date, title: learningEntry.title })
      .from(learningEntry)
      .where(eq(learningEntry.userId, userId)),
  );

  if (error || !rows) return 0;

  // Build a Set of dates that have a non-empty title
  const datesWithLearning = new Set(
    rows.filter((r) => r.title.trim().length > 0).map((r) => r.date),
  );

  let streak = 0;
  let cursor = new Date(`${fromDate}T12:00:00`);

  // Walk backwards day by day, skipping weekends
  while (true) {
    const dow = cursor.getDay(); // 0 = Sun, 6 = Sat
    if (dow === 0 || dow === 6) {
      // Skip weekend — don't increment, don't break
      cursor.setDate(cursor.getDate() - 1);
      continue;
    }

    const cursorDate = toIsoDate(cursor);

    if (datesWithLearning.has(cursorDate)) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }

  return streak;
}

function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// GET /api/learning/:date
router.get("/:date", async (req, res) => {
  const sessionResult = await resolveSessionUserId(req);
  if (!sessionResult.ok) {
    return sendError(res, sessionResult.code, sessionResult.message);
  }

  const parsedDate = isoDateSchema.safeParse(req.params.date);
  if (!parsedDate.success) {
    return sendError(res, RESPONSE_CODE.BAD_REQUEST, "Invalid date parameter", parsedDate.error.issues[0]?.message ?? "Invalid date");
  }

  const { data: rows, error } = await tryCatch(
    db
      .select()
      .from(learningEntry)
      .where(
        and(
          eq(learningEntry.userId, sessionResult.userId),
          eq(learningEntry.date, parsedDate.data),
        ),
      )
      .limit(1),
  );

  if (error) {
    logger.error({ err: error, userId: sessionResult.userId }, "Failed to fetch learning entry");
    return sendError(res, RESPONSE_CODE.INTERNAL_SERVER_ERROR, "Failed to fetch learning entry");
  }

  const entry = rows[0] ?? null;
  const streak = await computeStreak(sessionResult.userId, parsedDate.data);

  return sendSuccess(res, RESPONSE_CODE.OK, "Learning entry fetched", { entry, streak });
});

// PUT /api/learning/:date  — upsert
router.put("/:date", async (req, res) => {
  const sessionResult = await resolveSessionUserId(req);
  if (!sessionResult.ok) {
    return sendError(res, sessionResult.code, sessionResult.message);
  }

  const parsedDate = isoDateSchema.safeParse(req.params.date);
  if (!parsedDate.success) {
    return sendError(res, RESPONSE_CODE.BAD_REQUEST, "Invalid date parameter", parsedDate.error.issues[0]?.message ?? "Invalid date");
  }

  const parsedBody = upsertLearningSchema.safeParse(req.body);
  if (!parsedBody.success) {
    return sendError(res, RESPONSE_CODE.BAD_REQUEST, "Invalid payload", parsedBody.error.issues[0]?.message ?? "Invalid payload");
  }

  const { title, notes, tag } = parsedBody.data;
  const date = parsedDate.data;
  const userId = sessionResult.userId;

  const { data: upserted, error } = await tryCatch(
    db
      .insert(learningEntry)
      .values({
        id: crypto.randomUUID(),
        userId,
        date,
        title,
        notes: notes ?? null,
        tag: tag ?? null,
      })
      .onConflictDoUpdate({
        target: [learningEntry.userId, learningEntry.date],
        set: {
          title,
          notes: notes ?? null,
          tag: tag ?? null,
          updatedAt: new Date(),
        },
      })
      .returning(),
  );

  if (error) {
    logger.error({ err: error, userId }, "Failed to upsert learning entry");
    return sendError(res, RESPONSE_CODE.INTERNAL_SERVER_ERROR, "Failed to save learning entry");
  }

  const entry = upserted[0];
  const streak = await computeStreak(userId, date);

  return sendSuccess(res, RESPONSE_CODE.OK, "Learning entry saved", { entry, streak });
});

export default router;
