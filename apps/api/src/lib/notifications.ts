import { randomUUID } from "node:crypto";
import { db } from "@/db/client";
import { notification } from "@/db/schema/notification";
import { env } from "@/lib/env";
import logger from "@/lib/logger";
import type { NotificationType } from "@/db/schema/notification";

// ── Cloudflare AI message generation ────────────────────────────────

const CF_AI_URL = env.CLOUDFLARE_ACCOUNT_ID
  ? `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/meta/llama-3.1-8b-instruct`
  : null;

async function generateAIMessage(prompt: string): Promise<string | null> {
  if (!CF_AI_URL || !env.CLOUDFLARE_API_TOKEN) return null;
  try {
    const response = await fetch(CF_AI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
      },
      body: JSON.stringify({
        messages: [
          {
            role: "system",
            content:
              "You are a concise notification assistant. Generate a single, friendly, professional notification message in plain text (no markdown, no lists). Maximum 2 sentences. Do not include greetings.",
          },
          { role: "user", content: prompt },
        ],
        max_tokens: 120,
      }),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      result?: { response?: string };
    };
    return data.result?.response?.trim() ?? null;
  } catch {
    return null;
  }
}

// ── Notification payloads ────────────────────────────────────────────

export type CreateNotificationInput =
  | {
      type: "team_assigned";
      userId: string;
      teamName: string;
      managerName: string;
      assignedBy: string; // admin name
    }
  | {
      type: "manager_assigned";
      userId: string;
      managerName: string;
      teamName: string;
    }
  | {
      type: "report_approved";
      userId: string; // developer id
      weekStartDate: string;
      managerName: string;
      comment?: string | null;
    }
  | {
      type: "report_dismissed";
      userId: string; // developer id
      weekStartDate: string;
      managerName: string;
      comment?: string | null;
    }
  | {
      type: "report_submitted";
      userId: string; // manager id
      developerName: string;
      weekStartDate: string;
    }
  | {
      type: "role_changed";
      userId: string; // admin id(s) — one notification per admin
      targetUserName: string;
      oldRole: string;
      newRole: string;
    };

// ── Core helper ──────────────────────────────────────────────────────

function buildDefaultMessage(input: CreateNotificationInput): {
  title: string;
  prompt: string;
  fallback: string;
  metadata: Record<string, unknown>;
} {
  switch (input.type) {
    case "team_assigned":
      return {
        title: `Assigned to team "${input.teamName}"`,
        prompt: `Notify a developer that they have been assigned to team "${input.teamName}" managed by ${input.managerName} by admin ${input.assignedBy}.`,
        fallback: `You've been assigned to team "${input.teamName}" managed by ${input.managerName}.`,
        metadata: { teamName: input.teamName, managerName: input.managerName, assignedBy: input.assignedBy },
      };
    case "manager_assigned":
      return {
        title: `Team assignment update`,
        prompt: `Notify a manager that they have been assigned as manager of team "${input.teamName}".`,
        fallback: `You've been assigned as manager of team "${input.teamName}".`,
        metadata: { teamName: input.teamName, managerName: input.managerName },
      };
    case "report_approved":
      return {
        title: `Weekly report approved`,
        prompt: `Notify a developer that their weekly report for the week starting ${input.weekStartDate} was approved by manager ${input.managerName}${input.comment ? ` with comment: "${input.comment}"` : ""}.`,
        fallback: `Your weekly report for w/c ${input.weekStartDate} was approved by ${input.managerName}.${input.comment ? ` Comment: "${input.comment}"` : ""}`,
        metadata: { weekStartDate: input.weekStartDate, managerName: input.managerName, comment: input.comment },
      };
    case "report_dismissed":
      return {
        title: `Weekly report dismissed`,
        prompt: `Notify a developer that their weekly report for the week starting ${input.weekStartDate} was dismissed by manager ${input.managerName}${input.comment ? ` with comment: "${input.comment}"` : ""}.`,
        fallback: `Your weekly report for w/c ${input.weekStartDate} was dismissed by ${input.managerName}.${input.comment ? ` Comment: "${input.comment}"` : ""}`,
        metadata: { weekStartDate: input.weekStartDate, managerName: input.managerName, comment: input.comment },
      };
    case "report_submitted":
      return {
        title: `New report awaiting review`,
        prompt: `Notify a manager that developer ${input.developerName} submitted a weekly report for the week starting ${input.weekStartDate} and it is awaiting review.`,
        fallback: `${input.developerName} submitted their weekly report for w/c ${input.weekStartDate} — awaiting your review.`,
        metadata: { developerName: input.developerName, weekStartDate: input.weekStartDate },
      };
    case "role_changed":
      return {
        title: `User role updated`,
        prompt: `Notify an admin that user ${input.targetUserName}'s role was changed from ${input.oldRole} to ${input.newRole}.`,
        fallback: `${input.targetUserName}'s role has been updated from "${input.oldRole}" to "${input.newRole}".`,
        metadata: { targetUserName: input.targetUserName, oldRole: input.oldRole, newRole: input.newRole },
      };
  }
}

export async function createNotification(input: CreateNotificationInput): Promise<void> {
  const { title, prompt, fallback, metadata } = buildDefaultMessage(input);

  let message = fallback;
  try {
    const aiMsg = await generateAIMessage(prompt);
    if (aiMsg && aiMsg.length > 0) {
      message = aiMsg;
    }
  } catch (err) {
    logger.warn({ err }, "AI message generation failed, using fallback");
  }

  await db.insert(notification).values({
    id: randomUUID(),
    userId: input.userId,
    type: input.type,
    title,
    message,
    metadata: JSON.stringify(metadata),
    read: false,
  });
}

/** Create multiple notifications in parallel, ignoring individual failures */
export async function createNotifications(inputs: CreateNotificationInput[]): Promise<void> {
  await Promise.allSettled(inputs.map((input) => createNotification(input)));
}
