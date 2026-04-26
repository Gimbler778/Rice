import "dotenv/config";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";

import { db } from "../src/db/client";
import { account, timesheetEntry, user } from "../src/db/schema";

const demoPassword = "Demo1234!";

const demoUsers = [
  {
    name: "Demo Developer",
    email: "developer@iqm.local",
    role: "developer" as const,
  },
  {
    name: "Demo Manager",
    email: "manager@iqm.local",
    role: "manager" as const,
  },
  {
    name: "Demo Admin",
    email: "admin@iqm.local",
    role: "admin" as const,
  },
  {
    name: "Demo Auditor",
    email: "auditor@iqm.local",
    role: "auditor" as const,
  },
] as const;

type DemoActivity = {
  category: (typeof timesheetEntry.$inferInsert)["category"];
  description: string;
  hours: number;
  status: (typeof timesheetEntry.$inferInsert)["status"];
  jiraIssueKey?: string;
};

const demoActivityPatterns: DemoActivity[][] = [
  [
    {
      category: "development",
      description: "Feature implementation",
      hours: 3.5,
      status: "accepted",
      jiraIssueKey: "RICE-101",
    },
    {
      category: "testing",
      description: "Regression checks",
      hours: 1.5,
      status: "accepted",
      jiraIssueKey: "RICE-102",
    },
    {
      category: "meetings",
      description: "Planning sync",
      hours: 1,
      status: "in-progress",
    },
  ],
  [
    {
      category: "code_review",
      description: "Pull request review",
      hours: 2,
      status: "accepted",
      jiraIssueKey: "RICE-103",
    },
    {
      category: "development",
      description: "Bug fix follow-up",
      hours: 2.5,
      status: "accepted",
      jiraIssueKey: "RICE-104",
    },
    {
      category: "documentation",
      description: "Notes and handoff",
      hours: 1,
      status: "on-hold",
    },
    {
      category: "support",
      description: "Slack support queue",
      hours: 0.5,
      status: "in-progress",
    },
  ],
  [
    {
      category: "development",
      description: "Feature branch work",
      hours: 3,
      status: "accepted",
      jiraIssueKey: "RICE-105",
    },
    {
      category: "testing",
      description: "Smoke testing",
      hours: 2,
      status: "accepted",
      jiraIssueKey: "RICE-106",
    },
    {
      category: "learning",
      description: "Team learning session",
      hours: 1,
      status: "in-progress",
    },
  ],
  [
    {
      category: "code_review",
      description: "Review queue cleanup",
      hours: 1.5,
      status: "accepted",
      jiraIssueKey: "RICE-107",
    },
    {
      category: "development",
      description: "Implementation block",
      hours: 3,
      status: "accepted",
      jiraIssueKey: "RICE-108",
    },
    {
      category: "admin",
      description: "Admin overhead",
      hours: 1,
      status: "in-progress",
    },
    {
      category: "meetings",
      description: "Stakeholder call",
      hours: 0.5,
      status: "accepted",
    },
  ],
  [
    {
      category: "development",
      description: "Feature polish",
      hours: 2.5,
      status: "accepted",
      jiraIssueKey: "RICE-109",
    },
    {
      category: "testing",
      description: "Integration checks",
      hours: 2,
      status: "accepted",
      jiraIssueKey: "RICE-110",
    },
    {
      category: "documentation",
      description: "Release notes",
      hours: 1.5,
      status: "in-progress",
    },
  ],
];

function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildDemoEntries(userId: string, role: (typeof demoUsers)[number]["role"]) {
  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - 13);

  const entries = Array.from({ length: 14 }, (_, dayIndex) => {
    const date = new Date(start);
    date.setDate(start.getDate() + dayIndex);
    const dateIso = toIsoDate(date);
    const pattern = demoActivityPatterns[dayIndex % demoActivityPatterns.length];

    return pattern.map((activity, activityIndex) => ({
      id: randomUUID(),
      userId,
      date: dateIso,
      category: activity.category,
      description: `${role} ${activity.description} ${dayIndex + 1}-${activityIndex + 1}`,
      jiraIssueKey: activity.jiraIssueKey ? `RICE-${role.slice(0, 1).toUpperCase()}${100 + dayIndex * 10 + activityIndex}` : undefined,
      hours: activity.hours,
      status: activity.status,
      createdAt: today,
      updatedAt: today,
    }));
  });

  return entries.flat();
}

async function upsertDemoUser(
  demoUser: (typeof demoUsers)[number],
  passwordHash: string,
) {
  const now = new Date();

  const existingUser = await db.query.user.findFirst({
    where: eq(user.email, demoUser.email),
  });

  const userId = existingUser?.id ?? randomUUID();

  if (!existingUser) {
    const accountId = randomUUID();

    await db.insert(user).values({
      id: userId,
      name: demoUser.name,
      email: demoUser.email,
      emailVerified: true,
      role: demoUser.role,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(account).values({
      id: accountId,
      accountId: userId,
      providerId: "credential",
      userId,
      password: passwordHash,
      createdAt: now,
      updatedAt: now,
    });
  } else {
    await db
      .update(user)
      .set({
        name: demoUser.name,
        emailVerified: true,
        role: demoUser.role,
        updatedAt: now,
      })
      .where(eq(user.id, existingUser.id));

    const existingCredentialAccount = await db.query.account.findFirst({
      where: and(
        eq(account.userId, existingUser.id),
        eq(account.providerId, "credential"),
      ),
    });

    if (existingCredentialAccount) {
      await db
        .update(account)
        .set({
          password: passwordHash,
          updatedAt: now,
        })
        .where(eq(account.id, existingCredentialAccount.id));
    } else {
      await db.insert(account).values({
        id: randomUUID(),
        accountId: existingUser.id,
        providerId: "credential",
        userId: existingUser.id,
        password: passwordHash,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  await db.delete(timesheetEntry).where(eq(timesheetEntry.userId, userId));

  const demoEntries = buildDemoEntries(userId, demoUser.role);
  if (demoEntries.length > 0) {
    await db.insert(timesheetEntry).values(demoEntries);
  }

  console.log(`Updated demo user: ${demoUser.email} (${demoUser.role})`);
}

async function seedDemoUsers() {
  const passwordHash = await hashPassword(demoPassword);

  for (const demoUser of demoUsers) {
    await upsertDemoUser(demoUser, passwordHash);
  }
}

seedDemoUsers()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Failed to seed demo user:", error);
    process.exit(1);
  });
