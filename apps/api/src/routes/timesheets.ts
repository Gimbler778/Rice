import { Router } from "express";
import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/client";
import {
  account,
  entryCategories,
  entrySources,
  entryStatuses,
  timesheetEntry,
  weeklySubmission,
  weeklySubmissionStatuses,
  user,
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
  timeRemaining: z.number().min(0).max(100).optional().default(0),
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
    timeRemaining: z.number().min(0).max(100).optional(),
    status: z.enum(entryStatuses).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

const copyYesterdaySchema = z.object({
  date: isoDateSchema.optional(),
});

async function resolveSessionUserId(req: any) {
  try {
    const session = await auth.api.getSession({
      headers: req.headers,
    });

    if (!session?.user?.id) {
      return {
        ok: false,
        code: RESPONSE_CODE.UNAUTHORIZED,
        message: "Unauthorized",
        userId: null,
        role: null,
      } as const;
    }

    return {
      ok: true,
      userId: session.user.id,
      role: (session.user.role ?? "developer") as string,
    } as const;
  } catch (error) {
    logger.error({ err: error }, "Failed to resolve auth session");
    return {
      ok: false,
      code: RESPONSE_CODE.INTERNAL_SERVER_ERROR,
      message: "Failed to resolve auth session",
      userId: null,
      role: null,
    } as const;
  }
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
  atlassianName?: string | null;
  hours: number;
}) {
  return [
    entry.category,
    entry.description.trim().toLowerCase(),
    entry.jiraIssueKey ?? "",
    entry.source ?? "",
    entry.sourceLink ?? "",
    entry.atlassianName ?? "",
    entry.hours.toFixed(2),
    (entry as any).timeRemaining?.toFixed(2) ?? "0.00",
  ].join("|");
}

router.get("/timesheets/date/:date", async (req, res) => {
  const sessionResult = await resolveSessionUserId(req);

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
    return sendError(res, RESPONSE_CODE.INTERNAL_SERVER_ERROR, "Failed to fetch timesheet by date");
  }

  return sendSuccess(res, RESPONSE_CODE.OK, "Timesheet entries fetched", {
    date: parsedDate.data,
    entries,
  });
});

router.get("/timesheets/entries", async (req, res) => {
  const sessionResult = await resolveSessionUserId(req);

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
  const sessionResult = await resolveSessionUserId(req);

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

  let atlassianName: string | null = null;
  const { data: atlassianAccounts } = await tryCatch(
    db
      .select({ accessToken: account.accessToken })
      .from(account)
      .where(
        and(
          eq(account.userId, sessionResult.userId),
          eq(account.providerId, "atlassian")
        )
      )
      .limit(1)
  );

  if (atlassianAccounts && atlassianAccounts.length > 0 && atlassianAccounts[0].accessToken) {
    try {
      const meRes = await fetch("https://api.atlassian.com/me", {
        headers: { Authorization: `Bearer ${atlassianAccounts[0].accessToken}` },
      });
      if (meRes.ok) {
        const meData = await meRes.json() as { name?: string };
        if (meData.name) {
          atlassianName = meData.name;
        }
      }
    } catch (e) {
      // Ignore if it fails
    }
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
        timeRemaining: parsedBody.data.timeRemaining,
        atlassianName,
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
  const sessionResult = await resolveSessionUserId(req);

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
  const sessionResult = await resolveSessionUserId(req);

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
  const sessionResult = await resolveSessionUserId(req);

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
        atlassianName: timesheetEntry.atlassianName,
        hours: timesheetEntry.hours,
        timeRemaining: timesheetEntry.timeRemaining,
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
      atlassianName: entry.atlassianName,
      hours: entry.hours,
      timeRemaining: entry.timeRemaining,
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

// Weekly Submission Endpoints

/** Get the Monday (start of week) for a given date */
function getWeekStartDate(date: Date | string): string {
  if (typeof date === "string") {
    date = new Date(`${date}T12:00:00`);
  }
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is Sunday
  d.setDate(diff);
  return toIsoDate(d);
}

/** Check if the given date is a Friday */
function isFriday(isoDate: string): boolean {
  const date = toDateAtNoon(isoDate);
  return date.getDay() === 5;
}

/** Check if today is Friday or later in the week */
function canSubmitWeek(weekStartDate: string): boolean {
  const today = new Date();
  const todayIso = toIsoDate(today);
  
  // Can only submit if today is Friday (day 5 of the week) or later
  const weekEnd = toDateAtNoon(weekStartDate);
  weekEnd.setDate(weekEnd.getDate() + 4); // Friday is 4 days after Monday
  
  return todayIso >= toIsoDate(weekEnd);
}

const submitWeekSchema = z.object({
  weekStartDate: isoDateSchema,
});

const approveWeekSchema = z.object({
  weekStartDate: isoDateSchema,
  userId: z.string().min(1),
  approverComment: z.string().max(500).optional(),
});

const dismissWeekSchema = z.object({
  weekStartDate: isoDateSchema,
  userId: z.string().min(1),
  dismissComment: z.string().max(500).optional(),
});

/** Save or update weekly submission draft */
router.post("/timesheets/week/draft", async (req, res) => {
  const sessionResult = await resolveSessionUserId(req);

  if (!sessionResult.ok) {
    return sendError(res, sessionResult.code, sessionResult.message);
  }

  const parsedBody = submitWeekSchema.safeParse(req.body);

  if (!parsedBody.success) {
    return sendError(
      res,
      RESPONSE_CODE.BAD_REQUEST,
      "Invalid payload",
      parsedBody.error.issues[0]?.message ?? "Invalid payload",
    );
  }

  const { weekStartDate } = parsedBody.data;

  // Check if submission already exists
  const { data: existing } = await tryCatch(
    db
      .select()
      .from(weeklySubmission)
      .where(
        and(
          eq(weeklySubmission.userId, sessionResult.userId),
          eq(weeklySubmission.weekStartDate, weekStartDate),
        ),
      )
      .limit(1),
  );

  let result;
  if (existing && existing.length > 0) {
    // Update existing draft
    const { data: updated, error } = await tryCatch(
      db
        .update(weeklySubmission)
        .set({
          status: "draft",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(weeklySubmission.userId, sessionResult.userId),
            eq(weeklySubmission.weekStartDate, weekStartDate),
          ),
        )
        .returning(),
    );

    if (error) {
      logger.error({ err: error, userId: sessionResult.userId }, "Failed to update week draft");
      return sendError(res, RESPONSE_CODE.INTERNAL_SERVER_ERROR, "Failed to save week draft");
    }

    result = updated[0];
  } else {
    // Create new draft
    const { data: created, error } = await tryCatch(
      db
        .insert(weeklySubmission)
        .values({
          id: crypto.randomUUID(),
          userId: sessionResult.userId,
          weekStartDate,
          status: "draft",
        })
        .returning(),
    );

    if (error) {
      logger.error({ err: error, userId: sessionResult.userId }, "Failed to create week draft");
      return sendError(res, RESPONSE_CODE.INTERNAL_SERVER_ERROR, "Failed to save week draft");
    }

    result = created[0];
  }

  return sendSuccess(res, RESPONSE_CODE.OK, "Week draft saved", result);
});

/** Submit a week (only allowed on Friday or later) */
router.post("/timesheets/week/submit", async (req, res) => {
  const sessionResult = await resolveSessionUserId(req);

  if (!sessionResult.ok) {
    return sendError(res, sessionResult.code, sessionResult.message);
  }

  const parsedBody = submitWeekSchema.safeParse(req.body);

  if (!parsedBody.success) {
    return sendError(
      res,
      RESPONSE_CODE.BAD_REQUEST,
      "Invalid payload",
      parsedBody.error.issues[0]?.message ?? "Invalid payload",
    );
  }

  const { weekStartDate } = parsedBody.data;

  // Check if submission is allowed (must be Friday or later)
  if (!canSubmitWeek(weekStartDate)) {
    return sendError(
      res,
      RESPONSE_CODE.BAD_REQUEST,
      "Week can only be submitted on Friday or later",
    );
  }

  // Check if submission already exists
  const { data: existing } = await tryCatch(
    db
      .select()
      .from(weeklySubmission)
      .where(
        and(
          eq(weeklySubmission.userId, sessionResult.userId),
          eq(weeklySubmission.weekStartDate, weekStartDate),
        ),
      )
      .limit(1),
  );

  let result;
  if (existing && existing.length > 0) {
    // Update existing
    const { data: updated, error } = await tryCatch(
      db
        .update(weeklySubmission)
        .set({
          status: "submitted",
          submittedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(weeklySubmission.userId, sessionResult.userId),
            eq(weeklySubmission.weekStartDate, weekStartDate),
          ),
        )
        .returning(),
    );

    if (error) {
      logger.error({ err: error, userId: sessionResult.userId }, "Failed to submit week");
      return sendError(res, RESPONSE_CODE.INTERNAL_SERVER_ERROR, "Failed to submit week");
    }

    result = updated[0];
  } else {
    // Create new submission
    const { data: created, error } = await tryCatch(
      db
        .insert(weeklySubmission)
        .values({
          id: crypto.randomUUID(),
          userId: sessionResult.userId,
          weekStartDate,
          status: "submitted",
          submittedAt: new Date(),
        })
        .returning(),
    );

    if (error) {
      logger.error({ err: error, userId: sessionResult.userId }, "Failed to submit week");
      return sendError(res, RESPONSE_CODE.INTERNAL_SERVER_ERROR, "Failed to submit week");
    }

    result = created[0];
  }

  return sendSuccess(res, RESPONSE_CODE.OK, "Week submitted", result);
});

/** Get week submission status */
router.get("/timesheets/week/:weekStartDate", async (req, res) => {
  const sessionResult = await resolveSessionUserId(req);

  if (!sessionResult.ok) {
    return sendError(res, sessionResult.code, sessionResult.message);
  }

  const { weekStartDate: weekStartDateParam } = req.params;
  const parsedDate = isoDateSchema.safeParse(weekStartDateParam);

  if (!parsedDate.success) {
    return sendError(
      res,
      RESPONSE_CODE.BAD_REQUEST,
      "Invalid week start date",
      parsedDate.error.issues[0]?.message ?? "Invalid date",
    );
  }

  const { data: submission, error } = await tryCatch(
    db
      .select()
      .from(weeklySubmission)
      .where(
        and(
          eq(weeklySubmission.userId, sessionResult.userId),
          eq(weeklySubmission.weekStartDate, parsedDate.data),
        ),
      )
      .limit(1),
  );

  if (error) {
    logger.error({ err: error, userId: sessionResult.userId }, "Failed to fetch week status");
    return sendError(res, RESPONSE_CODE.INTERNAL_SERVER_ERROR, "Failed to fetch week status");
  }

  // Return existing submission or a default draft status
  const result = submission && submission.length > 0
    ? submission[0]
    : {
        weekStartDate: parsedDate.data,
        status: "draft",
        canSubmit: canSubmitWeek(parsedDate.data),
      };

  return sendSuccess(res, RESPONSE_CODE.OK, "Week status fetched", result);
});

/** Approve a week submission (admin or manager) */
router.patch("/timesheets/week/:weekStartDate/approve", async (req, res) => {
  const sessionResult = await resolveSessionUserId(req);

  if (!sessionResult.ok) {
    return sendError(res, sessionResult.code, sessionResult.message);
  }

  // Admin or manager can approve
  if (sessionResult.role !== "admin" && sessionResult.role !== "manager") {
    return sendError(res, RESPONSE_CODE.FORBIDDEN, "Only admins or managers can approve weeks");
  }

  const { weekStartDate: weekStartDateParam } = req.params;
  const parsedDate = isoDateSchema.safeParse(weekStartDateParam);

  if (!parsedDate.success) {
    return sendError(
      res,
      RESPONSE_CODE.BAD_REQUEST,
      "Invalid week start date",
      parsedDate.error.issues[0]?.message ?? "Invalid date",
    );
  }

  const parsedBody = approveWeekSchema.safeParse(req.body);

  if (!parsedBody.success) {
    return sendError(
      res,
      RESPONSE_CODE.BAD_REQUEST,
      "Invalid payload",
      parsedBody.error.issues[0]?.message ?? "Invalid payload",
    );
  }

  const { data: updated, error } = await tryCatch(
    db
      .update(weeklySubmission)
      .set({
        status: "approved",
        approvedBy: sessionResult.userId,
        approverRole: sessionResult.role,
        approverComment: parsedBody.data.approverComment,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(weeklySubmission.userId, parsedBody.data.userId),
          eq(weeklySubmission.weekStartDate, parsedDate.data),
        ),
      )
      .returning(),
  );

  if (error) {
    logger.error({ err: error, userId: sessionResult.userId }, "Failed to approve week");
    return sendError(res, RESPONSE_CODE.INTERNAL_SERVER_ERROR, "Failed to approve week");
  }

  if (updated.length === 0) {
    return sendError(res, RESPONSE_CODE.NOT_FOUND, "Week submission not found");
  }

  return sendSuccess(res, RESPONSE_CODE.OK, "Week approved", updated[0]);
});

/** Dismiss a week submission (admin or manager) */
router.patch("/timesheets/week/:weekStartDate/dismiss", async (req, res) => {
  const sessionResult = await resolveSessionUserId(req);

  if (!sessionResult.ok) {
    return sendError(res, sessionResult.code, sessionResult.message);
  }

  // Admin or manager can dismiss
  if (sessionResult.role !== "admin" && sessionResult.role !== "manager") {
    return sendError(res, RESPONSE_CODE.FORBIDDEN, "Only admins or managers can dismiss weeks");
  }

  const { weekStartDate: weekStartDateParam } = req.params;
  const parsedDate = isoDateSchema.safeParse(weekStartDateParam);

  if (!parsedDate.success) {
    return sendError(
      res,
      RESPONSE_CODE.BAD_REQUEST,
      "Invalid week start date",
      parsedDate.error.issues[0]?.message ?? "Invalid date",
    );
  }

  const parsedBody = dismissWeekSchema.safeParse(req.body);

  if (!parsedBody.success) {
    return sendError(
      res,
      RESPONSE_CODE.BAD_REQUEST,
      "Invalid payload",
      parsedBody.error.issues[0]?.message ?? "Invalid payload",
    );
  }

  const { data: updated, error } = await tryCatch(
    db
      .update(weeklySubmission)
      .set({
        status: "dismissed",
        dismissedBy: sessionResult.userId,
        dismissComment: parsedBody.data.dismissComment,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(weeklySubmission.userId, parsedBody.data.userId),
          eq(weeklySubmission.weekStartDate, parsedDate.data),
        ),
      )
      .returning(),
  );

  if (error) {
    logger.error({ err: error, userId: sessionResult.userId }, "Failed to dismiss week");
    return sendError(res, RESPONSE_CODE.INTERNAL_SERVER_ERROR, "Failed to dismiss week");
  }

  if (updated.length === 0) {
    return sendError(res, RESPONSE_CODE.NOT_FOUND, "Week submission not found");
  }

  return sendSuccess(res, RESPONSE_CODE.OK, "Week dismissed", updated[0]);
});

/**
 * List weekly submissions (admin or manager)
 * Query params: status (default 'submitted'), from, to
 */
router.get("/timesheets/submissions", async (req, res) => {
  const sessionResult = await resolveSessionUserId(req);

  if (!sessionResult.ok) {
    return sendError(res, sessionResult.code, sessionResult.message);
  }

  if (sessionResult.role !== "admin" && sessionResult.role !== "manager") {
    return sendError(res, RESPONSE_CODE.FORBIDDEN, "Only admins or managers can list submissions");
  }

  const status = (req.query.status as string) ?? "submitted";
  const from = (req.query.from as string) ?? undefined;
  const to = (req.query.to as string) ?? undefined;

  const filters: any[] = [];

  if (status) {
    filters.push(eq(weeklySubmission.status, status));
  }

  if (from) {
    filters.push(gte(weeklySubmission.weekStartDate, from));
  }

  if (to) {
    filters.push(lte(weeklySubmission.weekStartDate, to));
  }

  try {
    const { data: rows, error } = await tryCatch(
      db
        .select({
          id: weeklySubmission.id,
          userId: weeklySubmission.userId,
          weekStartDate: weeklySubmission.weekStartDate,
          status: weeklySubmission.status,
          submittedAt: weeklySubmission.submittedAt,
          approverComment: weeklySubmission.approverComment,
          dismissComment: weeklySubmission.dismissComment,
          createdAt: weeklySubmission.createdAt,
          updatedAt: weeklySubmission.updatedAt,
          userName: user.name,
          userEmail: user.email,
        })
        .from(weeklySubmission)
        .leftJoin(user, eq(weeklySubmission.userId, user.id))
        .where(and(...filters))
        .orderBy(desc(weeklySubmission.submittedAt)),
    );

    if (error) {
      logger.error({ err: error, userId: sessionResult.userId }, "Failed to list submissions");
      return sendError(res, RESPONSE_CODE.INTERNAL_SERVER_ERROR, "Failed to list submissions");
    }

    return sendSuccess(res, RESPONSE_CODE.OK, "Submissions fetched", { count: rows.length, rows });
  } catch (err) {
    logger.error({ err }, "Failed to list submissions unexpected error");
    return sendError(res, RESPONSE_CODE.INTERNAL_SERVER_ERROR, "Failed to list submissions");
  }
});

export default router;
