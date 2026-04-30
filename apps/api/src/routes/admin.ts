import { randomUUID } from "node:crypto";

import express from "express";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db/client";
import {
  adminProject,
  adminTeam,
  adminTeamMember,
  user,
} from "@/db/schema";
import { RESPONSE_CODE, sendError, sendSuccess } from "@/lib/response";

const router = express.Router();

const allowedRoles = ["developer", "manager", "admin", "auditor"] as const;

function normalizeUser(userRow: {
  id: string;
  name: string;
  email: string;
  role: string | null;
}) {
  return {
    id: userRow.id,
    name: userRow.name,
    email: userRow.email,
    role: (userRow.role ?? "developer") as (typeof allowedRoles)[number],
  };
}

async function getTeamsResponse() {
  const teams = await db
    .select({
      id: adminTeam.id,
      name: adminTeam.name,
      managerId: adminTeam.managerId,
      createdAt: adminTeam.createdAt,
      updatedAt: adminTeam.updatedAt,
    })
    .from(adminTeam)
    .orderBy(desc(adminTeam.createdAt));

  const teamIds = teams.map((team) => team.id);
  const [memberRows, projectRows] = await Promise.all([
    teamIds.length
      ? db
          .select({ teamId: adminTeamMember.teamId, userId: adminTeamMember.userId })
          .from(adminTeamMember)
          .where(inArray(adminTeamMember.teamId, teamIds))
      : Promise.resolve([] as Array<{ teamId: string; userId: string }>),
    teamIds.length
      ? db
          .select({ teamId: adminProject.teamId, name: adminProject.name })
          .from(adminProject)
          .where(inArray(adminProject.teamId, teamIds))
          .orderBy(asc(adminProject.createdAt))
      : Promise.resolve([] as Array<{ teamId: string; name: string }>),
  ]);

  const teamMap = new Map(
    teams.map((team) => [team.id, { ...team, memberIds: [] as string[], projects: [] as string[] }]),
  );

  for (const memberRow of memberRows) {
    teamMap.get(memberRow.teamId)?.memberIds.push(memberRow.userId);
  }

  for (const projectRow of projectRows) {
    teamMap.get(projectRow.teamId)?.projects.push(projectRow.name);
  }

  return Array.from(teamMap.values()).map((team) => ({
    id: team.id,
    name: team.name,
    managerId: team.managerId,
    memberIds: team.memberIds,
    projects: team.projects,
  }));
}

router.get("/users", async (_req, res) => {
  try {
    const users = await db
      .select({ id: user.id, name: user.name, email: user.email, role: user.role })
      .from(user)
      .orderBy(asc(user.name));

    return sendSuccess(res, RESPONSE_CODE.OK, "Fetched users", {
      users: users.map(normalizeUser),
    });
  } catch (error) {
    return sendError(
      res,
      RESPONSE_CODE.INTERNAL_SERVER_ERROR,
      "Failed to fetch users",
      String(error),
    );
  }
});

router.patch("/users/:id/role", async (req, res) => {
  const { id } = req.params;
  const { role } = req.body as { role?: string };

  if (!role || !allowedRoles.includes(role as (typeof allowedRoles)[number])) {
    return sendError(res, RESPONSE_CODE.UNPROCESSABLE_ENTITY, "Invalid role", "role is invalid");
  }

  try {
    const targetUser = await db.query.user.findFirst({
      where: eq(user.id, id),
    });

    if (!targetUser) {
      return sendError(res, RESPONSE_CODE.NOT_FOUND, "User not found", "user not found");
    }

    if (targetUser.role === "admin" && role !== "admin") {
      const adminCountRows = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(user)
        .where(eq(user.role, "admin"));

      const adminCount = adminCountRows[0]?.count ?? 0;
      if (adminCount <= 1) {
        return sendError(
          res,
          RESPONSE_CODE.CONFLICT,
          "Cannot remove last admin",
          "at least one admin required",
        );
      }
    }

    await db.update(user).set({ role: role as (typeof allowedRoles)[number] }).where(eq(user.id, id));

    return sendSuccess(res, RESPONSE_CODE.OK, "Role updated", { id, role });
  } catch (error) {
    return sendError(
      res,
      RESPONSE_CODE.INTERNAL_SERVER_ERROR,
      "Failed to update role",
      String(error),
    );
  }
});

router.get("/teams", async (_req, res) => {
  try {
    const teams = await getTeamsResponse();
    return sendSuccess(res, RESPONSE_CODE.OK, "Fetched teams", { teams });
  } catch (error) {
    return sendError(
      res,
      RESPONSE_CODE.INTERNAL_SERVER_ERROR,
      "Failed to fetch teams",
      String(error),
    );
  }
});

router.post("/teams", async (req, res) => {
  const { name, managerId, memberIds = [] } = req.body as {
    name?: string;
    managerId?: string;
    memberIds?: string[];
  };

  if (!name?.trim() || !managerId) {
    return sendError(
      res,
      RESPONSE_CODE.BAD_REQUEST,
      "Missing team data",
      "name and managerId are required",
    );
  }

  const uniqueMemberIds = Array.from(new Set([managerId, ...memberIds]));

  try {
    const manager = await db.query.user.findFirst({
      where: eq(user.id, managerId),
    });

    if (!manager) {
      return sendError(res, RESPONSE_CODE.NOT_FOUND, "Manager not found", "manager not found");
    }

    const teamId = randomUUID();
    await db.transaction(async (tx) => {
      await tx.insert(adminTeam).values({
        id: teamId,
        name: name.trim(),
        managerId,
      });

      if (uniqueMemberIds.length > 0) {
        await tx.insert(adminTeamMember).values(
          uniqueMemberIds.map((userId) => ({
            id: randomUUID(),
            teamId,
            userId,
          })),
        );
      }
    });

    const teams = await getTeamsResponse();
    const created = teams.find((team) => team.id === teamId);

    return sendSuccess(res, RESPONSE_CODE.CREATED, "Team created", { team: created });
  } catch (error) {
    return sendError(
      res,
      RESPONSE_CODE.INTERNAL_SERVER_ERROR,
      "Failed to create team",
      String(error),
    );
  }
});

router.patch("/teams/:id", async (req, res) => {
  const { id } = req.params;
  const { name, managerId, memberIds } = req.body as {
    name?: string;
    managerId?: string;
    memberIds?: string[];
  };

  try {
    const existingTeam = await db.query.adminTeam.findFirst({
      where: eq(adminTeam.id, id),
    });

    if (!existingTeam) {
      return sendError(res, RESPONSE_CODE.NOT_FOUND, "Team not found", "team not found");
    }

    if (managerId) {
      const manager = await db.query.user.findFirst({ where: eq(user.id, managerId) });
      if (!manager) {
        return sendError(res, RESPONSE_CODE.NOT_FOUND, "Manager not found", "manager not found");
      }
    }

    await db.transaction(async (tx) => {
      await tx.update(adminTeam).set({
        name: name?.trim() || existingTeam.name,
        managerId: managerId || existingTeam.managerId,
      }).where(eq(adminTeam.id, id));

      if (Array.isArray(memberIds)) {
        await tx.delete(adminTeamMember).where(eq(adminTeamMember.teamId, id));

        const nextMemberIds = Array.from(
          new Set([managerId || existingTeam.managerId, ...memberIds].filter(Boolean)),
        ) as string[];

        if (nextMemberIds.length > 0) {
          await tx.insert(adminTeamMember).values(
            nextMemberIds.map((userId) => ({
              id: randomUUID(),
              teamId: id,
              userId,
            })),
          );
        }
      } else if (managerId && managerId !== existingTeam.managerId) {
        await tx.insert(adminTeamMember).values({
          id: randomUUID(),
          teamId: id,
          userId: managerId,
        }).onConflictDoNothing();
      }
    });

    const teams = await getTeamsResponse();
    const updated = teams.find((team) => team.id === id);

    return sendSuccess(res, RESPONSE_CODE.OK, "Team updated", { team: updated });
  } catch (error) {
    return sendError(
      res,
      RESPONSE_CODE.INTERNAL_SERVER_ERROR,
      "Failed to update team",
      String(error),
    );
  }
});

router.delete("/teams/:id", async (req, res) => {
  const { id } = req.params;

  try {
    await db.delete(adminTeam).where(eq(adminTeam.id, id));
    return sendSuccess(res, RESPONSE_CODE.OK, "Team deleted", { id });
  } catch (error) {
    return sendError(
      res,
      RESPONSE_CODE.INTERNAL_SERVER_ERROR,
      "Failed to delete team",
      String(error),
    );
  }
});

router.post("/teams/:id/projects", async (req, res) => {
  const { id } = req.params;
  const { name } = req.body as { name?: string };

  if (!name?.trim()) {
    return sendError(res, RESPONSE_CODE.BAD_REQUEST, "Missing project name", "name is required");
  }

  try {
    const team = await db.query.adminTeam.findFirst({ where: eq(adminTeam.id, id) });
    if (!team) {
      return sendError(res, RESPONSE_CODE.NOT_FOUND, "Team not found", "team not found");
    }

    await db.insert(adminProject).values({
      id: randomUUID(),
      teamId: id,
      name: name.trim(),
    });

    const teams = await getTeamsResponse();
    const updated = teams.find((teamRow) => teamRow.id === id);

    return sendSuccess(res, RESPONSE_CODE.CREATED, "Project created", { team: updated });
  } catch (error) {
    return sendError(
      res,
      RESPONSE_CODE.INTERNAL_SERVER_ERROR,
      "Failed to create project",
      String(error),
    );
  }
});

router.delete("/teams/:teamId/projects/:projectName", async (req, res) => {
  const { teamId, projectName } = req.params;

  try {
    await db
      .delete(adminProject)
      .where(and(eq(adminProject.teamId, teamId), eq(adminProject.name, projectName)));

    return sendSuccess(res, RESPONSE_CODE.OK, "Project deleted", {
      teamId,
      projectName,
    });
  } catch (error) {
    return sendError(
      res,
      RESPONSE_CODE.INTERNAL_SERVER_ERROR,
      "Failed to delete project",
      String(error),
    );
  }
});

export default router;
