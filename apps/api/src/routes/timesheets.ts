import { Router } from "express";
import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/client";
import {
  entryCategories,
  entrySources,
  entryStatuses,
  timesheetEntry,
} from "@/db/schema";
import { auth } from "@/lib/auth";
import logger from "@/lib/logger";
import { RESPONSE_CODE, sendError, sendSuccess } from "@/lib/response";
import { tryCatch } from "@/lib/try-catch";

const router = Router();

const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;

const isoDateSchema = z
  .string()
  .regex(isoDateRegex, "Expected date in YYYY-MM-DD format");

const listEntriesQuerySchema = z.object({
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  category: z.enum(entryCategories).optional(),
  status: z.enum(entryStatuses).optional(),
});

const createEntrySchema = z.object({
  date: isoDateSchema,
  category: z.enum(entryCategories),
  description: z.string().trim().min(1).max(500),
  jiraIssueKey: z.string().trim().min(1).max(50).optional(),
  source: z.enum(entrySources).optional(),
  sourceLink: z.url().trim().max(2048).optional(),
  hours: z.number().positive().max(24),
  status: z.enum(entryStatuses).optional(),
});

const updateEntrySchema = z
  .object({
    category: z.enum(entryCategories).optional(),
    description: z.string().trim().min(1).max(500).optional(),
    jiraIssueKey: z.string().trim().min(1).max(50).nullable().optional(),
    source: z.enum(entrySources).nullable().optional(),
    sourceLink: z.url().trim().max(2048).nullable().optional(),
    hours: z.number().positive().max(24).optional(),
    status: z.enum(entryStatuses).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

const copyYesterdaySchema = z.object({
  date: isoDateSchema.optional(),
});

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

async function resolveSessionUserId(reqHeaders: Record<string, string | string[] | undefined>) {
  const { data: session, error } = await tryCatch(
    auth.api.getSession({ headers: toWebHeaders(reqHeaders) }),
  );

  if (error) {
    logger.error({ err: error }, "Failed to resolve auth session");
    return {
      ok: false,
      code: RESPONSE_CODE.INTERNAL_SERVER_ERROR,
      message: "Failed to resolve auth session",
      userId: null,
    } as const;
  }

  if (!session?.user?.id) {
    return {
      ok: false,
      code: RESPONSE_CODE.UNAUTHORIZED,
      message: "Unauthorized",
      userId: null,
    } as const;
  }

  return {
    ok: true,
    userId: session.user.id,
  } as const;
}

function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toDateAtNoon(isoDate: string) {
  return new Date(`${isoDate}T12:00:00`);
}

function buildCopySignature(entry: {
  category: string;
  description: string;
  jiraIssueKey: string | null;
  source: string | null;
  sourceLink: string | null;
  hours: number;
}) {
  return [
    entry.category,
    entry.description.trim().toLowerCase(),
    entry.jiraIssueKey ?? "",
    entry.source ?? "",
    entry.sourceLink ?? "",
    entry.hours.toFixed(2),
  ].join("|");
}

router.get("/timesheets/date/:date", async (req, res) => {
  const sessionResult = await resolveSessionUserId(req.headers);

  if (!sessionResult.ok) {
    return sendError(res, sessionResult.code, sessionResult.message);
  }

  const parsedDate = isoDateSchema.safeParse(req.params.date);

  if (!parsedDate.success) {
    return sendError(
      res,
      RESPONSE_CODE.BAD_REQUEST,
      "Invalid date parameter",
      parsedDate.error.issues[0]?.message ?? "Invalid date",
    );
  }

  const { data: entries, error } = await tryCatch(
    db
      .select()
      .from(timesheetEntry)
      .where(
        and(
          eq(timesheetEntry.userId, sessionResult.userId),
          eq(timesheetEntry.date, parsedDate.data),
        ),
      )
      .orderBy(asc(timesheetEntry.createdAt)),
  );

  if (error) {
    logger.error({ err: error, userId: sessionResult.userId }, "Failed to fetch timesheet by date");
    return sendError(res, RESPONSE_CODE.INTERNAL_SERVER_ERROR, "Failed to fetch timesheet entries");
  }

  return sendSuccess(res, RESPONSE_CODE.OK, "Timesheet entries fetched", {
    date: parsedDate.data,
    entries,
  });
});

router.get("/timesheets/entries", async (req, res) => {
  const sessionResult = await resolveSessionUserId(req.headers);

  if (!sessionResult.ok) {
    return sendError(res, sessionResult.code, sessionResult.message);
  }

  const parsedQuery = listEntriesQuerySchema.safeParse(req.query);

  if (!parsedQuery.success) {
    return sendError(
      res,
      RESPONSE_CODE.BAD_REQUEST,
      "Invalid query parameters",
      parsedQuery.error.issues[0]?.message ?? "Invalid query",
    );
  }

  const { from, to, category, status } = parsedQuery.data;

  const filters = [eq(timesheetEntry.userId, sessionResult.userId)];

  if (from) {
    filters.push(gte(timesheetEntry.date, from));
  }

  if (to) {
    filters.push(lte(timesheetEntry.date, to));
  }

  if (category) {
    filters.push(eq(timesheetEntry.category, category));
  }

  if (status) {
    filters.push(eq(timesheetEntry.status, status));
  }

  const { data: entries, error } = await tryCatch(
    db
      .select()
      .from(timesheetEntry)
      .where(and(...filters))
      .orderBy(desc(timesheetEntry.date), desc(timesheetEntry.createdAt)),
  );

  if (error) {
    logger.error({ err: error, userId: sessionResult.userId }, "Failed to fetch timesheet entries range");
    return sendError(res, RESPONSE_CODE.INTERNAL_SERVER_ERROR, "Failed to fetch timesheet entries");
  }

  return sendSuccess(res, RESPONSE_CODE.OK, "Timesheet entries fetched", {
    count: entries.length,
    entries,
  });
});

router.post("/timesheets/entries", async (req, res) => {
  const sessionResult = await resolveSessionUserId(req.headers);

  if (!sessionResult.ok) {
    return sendError(res, sessionResult.code, sessionResult.message);
  }

  const parsedBody = createEntrySchema.safeParse(req.body);

  if (!parsedBody.success) {
    return sendError(
      res,
      RESPONSE_CODE.BAD_REQUEST,
      "Invalid payload",
      parsedBody.error.issues[0]?.message ?? "Invalid payload",
    );
  }

  const { data: createdEntries, error } = await tryCatch(
    db
      .insert(timesheetEntry)
      .values({
        id: crypto.randomUUID(),
        userId: sessionResult.userId,
        date: parsedBody.data.date,
        category: parsedBody.data.category,
        description: parsedBody.data.description,
        jiraIssueKey: parsedBody.data.jiraIssueKey,
        source: parsedBody.data.source,
        sourceLink: parsedBody.data.sourceLink,
        hours: parsedBody.data.hours,
        status: parsedBody.data.status ?? "in-progress",
      })
      .returning(),
  );

  if (error) {
    logger.error({ err: error, userId: sessionResult.userId }, "Failed to create timesheet entry");
    return sendError(res, RESPONSE_CODE.INTERNAL_SERVER_ERROR, "Failed to create timesheet entry");
  }

  return sendSuccess(res, RESPONSE_CODE.CREATED, "Timesheet entry created", createdEntries[0]);
});

router.patch("/timesheets/entries/:id", async (req, res) => {
  const sessionResult = await resolveSessionUserId(req.headers);

  if (!sessionResult.ok) {
    return sendError(res, sessionResult.code, sessionResult.message);
  }

  const entryId = req.params.id;

  if (!entryId) {
    return sendError(res, RESPONSE_CODE.BAD_REQUEST, "Entry id is required");
  }

  const parsedBody = updateEntrySchema.safeParse(req.body);

  if (!parsedBody.success) {
    return sendError(
      res,
      RESPONSE_CODE.BAD_REQUEST,
      "Invalid payload",
      parsedBody.error.issues[0]?.message ?? "Invalid payload",
    );
  }

  const { data: updatedEntries, error } = await tryCatch(
    db
      .update(timesheetEntry)
      .set({
        ...parsedBody.data,
        jiraIssueKey:
          parsedBody.data.jiraIssueKey === null
            ? null
            : parsedBody.data.jiraIssueKey,
        source: parsedBody.data.source === null ? null : parsedBody.data.source,
        sourceLink:
          parsedBody.data.sourceLink === null ? null : parsedBody.data.sourceLink,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(timesheetEntry.id, entryId),
          eq(timesheetEntry.userId, sessionResult.userId),
        ),
      )
      .returning(),
  );

  if (error) {
    logger.error({ err: error, userId: sessionResult.userId, entryId }, "Failed to update timesheet entry");
    return sendError(res, RESPONSE_CODE.INTERNAL_SERVER_ERROR, "Failed to update timesheet entry");
  }

  if (updatedEntries.length === 0) {
    return sendError(res, RESPONSE_CODE.NOT_FOUND, "Timesheet entry not found");
  }

  return sendSuccess(res, RESPONSE_CODE.OK, "Timesheet entry updated", updatedEntries[0]);
});

router.delete("/timesheets/entries/:id", async (req, res) => {
  const sessionResult = await resolveSessionUserId(req.headers);

  if (!sessionResult.ok) {
    return sendError(res, sessionResult.code, sessionResult.message);
  }

  const entryId = req.params.id;

  if (!entryId) {
    return sendError(res, RESPONSE_CODE.BAD_REQUEST, "Entry id is required");
  }

  const { data: deletedEntries, error } = await tryCatch(
    db
      .delete(timesheetEntry)
      .where(
        and(
          eq(timesheetEntry.id, entryId),
          eq(timesheetEntry.userId, sessionResult.userId),
        ),
      )
      .returning({ id: timesheetEntry.id }),
  );

  if (error) {
    logger.error({ err: error, userId: sessionResult.userId, entryId }, "Failed to delete timesheet entry");
    return sendError(res, RESPONSE_CODE.INTERNAL_SERVER_ERROR, "Failed to delete timesheet entry");
  }

  if (deletedEntries.length === 0) {
    return sendError(res, RESPONSE_CODE.NOT_FOUND, "Timesheet entry not found");
  }

  return sendSuccess(res, RESPONSE_CODE.OK, "Timesheet entry deleted", deletedEntries[0]);
});

router.post("/timesheets/copy-yesterday", async (req, res) => {
  const sessionResult = await resolveSessionUserId(req.headers);

  if (!sessionResult.ok) {
    return sendError(res, sessionResult.code, sessionResult.message);
  }

  const parsedBody = copyYesterdaySchema.safeParse(req.body ?? {});

  if (!parsedBody.success) {
    return sendError(
      res,
      RESPONSE_CODE.BAD_REQUEST,
      "Invalid payload",
      parsedBody.error.issues[0]?.message ?? "Invalid payload",
    );
  }

  const targetDate = parsedBody.data.date ?? toIsoDate(new Date());
  const parsedTargetDate = toDateAtNoon(targetDate);

  if (Number.isNaN(parsedTargetDate.getTime())) {
    return sendError(res, RESPONSE_CODE.BAD_REQUEST, "Invalid target date");
  }

  parsedTargetDate.setDate(parsedTargetDate.getDate() - 1);
  const previousDate = toIsoDate(parsedTargetDate);

  const { data: sourceEntries, error: sourceError } = await tryCatch(
    db
      .select()
      .from(timesheetEntry)
      .where(
        and(
          eq(timesheetEntry.userId, sessionResult.userId),
          eq(timesheetEntry.date, previousDate),
        ),
      )
      .orderBy(asc(timesheetEntry.createdAt)),
  );

  if (sourceError) {
    logger.error({ err: sourceError, userId: sessionResult.userId }, "Failed to fetch yesterday entries");
    return sendError(res, RESPONSE_CODE.INTERNAL_SERVER_ERROR, "Failed to copy yesterday entries");
  }

  if (sourceEntries.length === 0) {
    return sendSuccess(res, RESPONSE_CODE.OK, "No entries to copy from yesterday", {
      targetDate,
      copiedCount: 0,
      entries: [],
    });
  }

  const { data: targetEntries, error: targetError } = await tryCatch(
    db
      .select({
        category: timesheetEntry.category,
        description: timesheetEntry.description,
        jiraIssueKey: timesheetEntry.jiraIssueKey,
        source: timesheetEntry.source,
        sourceLink: timesheetEntry.sourceLink,
        hours: timesheetEntry.hours,
      })
      .from(timesheetEntry)
      .where(
        and(
          eq(timesheetEntry.userId, sessionResult.userId),
          eq(timesheetEntry.date, targetDate),
        ),
      ),
  );

  if (targetError) {
    logger.error({ err: targetError, userId: sessionResult.userId }, "Failed to read target day entries");
    return sendError(res, RESPONSE_CODE.INTERNAL_SERVER_ERROR, "Failed to copy yesterday entries");
  }

  const existingSignatures = new Set(targetEntries.map(buildCopySignature));

  const insertValues = sourceEntries
    .filter((entry) => !existingSignatures.has(buildCopySignature(entry)))
    .map((entry) => ({
      id: crypto.randomUUID(),
      userId: sessionResult.userId,
      date: targetDate,
      category: entry.category,
      description: entry.description,
      jiraIssueKey: entry.jiraIssueKey,
      source: entry.source,
      sourceLink: entry.sourceLink,
      hours: entry.hours,
      status: "in-progress" as const,
    }));

  if (insertValues.length === 0) {
    return sendSuccess(res, RESPONSE_CODE.OK, "No new entries to copy", {
      targetDate,
      copiedCount: 0,
      entries: [],
    });
  }

  const { data: copiedEntries, error: insertError } = await tryCatch(
    db.insert(timesheetEntry).values(insertValues).returning(),
  );

  if (insertError) {
    logger.error({ err: insertError, userId: sessionResult.userId }, "Failed to insert copied entries");
    return sendError(res, RESPONSE_CODE.INTERNAL_SERVER_ERROR, "Failed to copy yesterday entries");
  }

  return sendSuccess(res, RESPONSE_CODE.OK, "Yesterday entries copied", {
    targetDate,
    copiedCount: copiedEntries.length,
    entries: copiedEntries,
  });
});

export default router;
