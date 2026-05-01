import { Router } from "express";
import { eq, asc } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/client";
import { categoryConfig } from "@/db/schema";
import { auth } from "@/lib/auth";
import logger from "@/lib/logger";
import { RESPONSE_CODE, sendError, sendSuccess } from "@/lib/response";
import { tryCatch } from "@/lib/try-catch";

const router = Router();

const DEFAULT_CATEGORIES = [
  { id: "development", name: "Development", color: "bg-teal-500", isDefault: true, isEnabled: true },
  { id: "code_review", name: "Code review", color: "bg-purple-500", isDefault: true, isEnabled: true },
  { id: "testing", name: "Testing", color: "bg-blue-400", isDefault: true, isEnabled: true },
  { id: "documentation", name: "Documentation", color: "bg-amber-400", isDefault: true, isEnabled: true },
  { id: "meetings", name: "Meetings", color: "bg-zinc-400", isDefault: true, isEnabled: true },
  { id: "admin", name: "Admin", color: "bg-zinc-500", isDefault: true, isEnabled: true },
  { id: "org_sessions", name: "Org sessions", color: "bg-pink-400", isDefault: true, isEnabled: true },
  { id: "events", name: "Events", color: "bg-orange-400", isDefault: true, isEnabled: true },
  { id: "support", name: "Support", color: "bg-red-400", isDefault: true, isEnabled: true },
  { id: "learning", name: "Learning", color: "bg-green-400", isDefault: true, isEnabled: true },
];

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

// GET /api/categories
router.get("/categories", async (req, res) => {
  const sessionResult = await resolveSessionUserId(req);
  if (!sessionResult.ok) {
    return sendError(res, sessionResult.code, sessionResult.message);
  }

  let { data: rows, error } = await tryCatch(
    db.select().from(categoryConfig).orderBy(asc(categoryConfig.createdAt))
  );

  if (error) {
    logger.error({ err: error }, "Failed to fetch categories");
    return sendError(res, RESPONSE_CODE.INTERNAL_SERVER_ERROR, "Failed to fetch categories");
  }

  // Seed default categories if the table is completely empty
  if (rows && rows.length === 0) {
    const { data: inserted, error: insertError } = await tryCatch(
      db.insert(categoryConfig).values(DEFAULT_CATEGORIES).returning()
    );
    if (insertError) {
      logger.error({ err: insertError }, "Failed to seed default categories");
      return sendError(res, RESPONSE_CODE.INTERNAL_SERVER_ERROR, "Failed to fetch categories");
    }
    rows = inserted;
  }

  return sendSuccess(res, RESPONSE_CODE.OK, "Categories fetched", { categories: rows });
});

const createCategorySchema = z.object({
  name: z.string().trim().min(1).max(50),
});

// POST /api/categories
router.post("/categories", async (req, res) => {
  const sessionResult = await resolveSessionUserId(req);
  if (!sessionResult.ok) {
    return sendError(res, sessionResult.code, sessionResult.message);
  }

  const parsedBody = createCategorySchema.safeParse(req.body);
  if (!parsedBody.success) {
    return sendError(res, RESPONSE_CODE.BAD_REQUEST, "Invalid payload", parsedBody.error.issues[0]?.message);
  }

  const newId = `cat-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const { data, error } = await tryCatch(
    db.insert(categoryConfig).values({
      id: newId,
      name: parsedBody.data.name,
      color: "bg-zinc-400", // Default color for custom categories
      isDefault: false,
      isEnabled: true,
    }).returning()
  );

  if (error) {
    logger.error({ err: error }, "Failed to create category");
    return sendError(res, RESPONSE_CODE.INTERNAL_SERVER_ERROR, "Failed to create category");
  }

  return sendSuccess(res, RESPONSE_CODE.CREATED, "Category created", { category: data[0] });
});

const updateCategorySchema = z.object({
  name: z.string().trim().min(1).max(50).optional(),
  isEnabled: z.boolean().optional(),
});

// PATCH /api/categories/:id
router.patch("/categories/:id", async (req, res) => {
  const sessionResult = await resolveSessionUserId(req);
  if (!sessionResult.ok) {
    return sendError(res, sessionResult.code, sessionResult.message);
  }

  const parsedBody = updateCategorySchema.safeParse(req.body);
  if (!parsedBody.success) {
    return sendError(res, RESPONSE_CODE.BAD_REQUEST, "Invalid payload", parsedBody.error.issues[0]?.message);
  }

  const updates: any = {};
  if (parsedBody.data.name !== undefined) updates.name = parsedBody.data.name;
  if (parsedBody.data.isEnabled !== undefined) updates.isEnabled = parsedBody.data.isEnabled;
  
  if (Object.keys(updates).length > 0) {
    updates.updatedAt = new Date();
  } else {
    return sendError(res, RESPONSE_CODE.BAD_REQUEST, "No updates provided");
  }

  const { data, error } = await tryCatch(
    db.update(categoryConfig).set(updates).where(eq(categoryConfig.id, req.params.id)).returning()
  );

  if (error) {
    logger.error({ err: error, categoryId: req.params.id }, "Failed to update category");
    return sendError(res, RESPONSE_CODE.INTERNAL_SERVER_ERROR, "Failed to update category");
  }

  if (!data || data.length === 0) {
    return sendError(res, RESPONSE_CODE.NOT_FOUND, "Category not found");
  }

  return sendSuccess(res, RESPONSE_CODE.OK, "Category updated", { category: data[0] });
});

// DELETE /api/categories/:id
router.delete("/categories/:id", async (req, res) => {
  const sessionResult = await resolveSessionUserId(req);
  if (!sessionResult.ok) {
    return sendError(res, sessionResult.code, sessionResult.message);
  }

  // Prevent deleting default categories
  const { data: category, error: fetchError } = await tryCatch(
    db.select().from(categoryConfig).where(eq(categoryConfig.id, req.params.id)).limit(1)
  );

  if (fetchError || !category || category.length === 0) {
    return sendError(res, RESPONSE_CODE.NOT_FOUND, "Category not found");
  }

  if (category[0].isDefault) {
    return sendError(res, RESPONSE_CODE.BAD_REQUEST, "Cannot delete default categories");
  }

  const { data, error } = await tryCatch(
    db.delete(categoryConfig).where(eq(categoryConfig.id, req.params.id)).returning()
  );

  if (error) {
    logger.error({ err: error, categoryId: req.params.id }, "Failed to delete category");
    return sendError(res, RESPONSE_CODE.INTERNAL_SERVER_ERROR, "Failed to delete category");
  }

  return sendSuccess(res, RESPONSE_CODE.OK, "Category deleted", { id: req.params.id });
});

export default router;
