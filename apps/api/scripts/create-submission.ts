import "dotenv/config";
import { randomUUID } from "node:crypto";
import { db } from "../src/db/client";
import { user, weeklySubmission } from "../src/db/schema";
import { eq } from "drizzle-orm";

function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getWeekStartDate(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return toIsoDate(d);
}

async function main() {
  const developer = await db.query.user.findFirst({ where: eq(user.email, 'developer@iqm.local') });
  if (!developer) {
    console.error('Developer user not found');
    process.exit(1);
  }

  const weekStart = getWeekStartDate();

  await db.insert(weeklySubmission).values({
    id: randomUUID(),
    userId: developer.id,
    weekStartDate: weekStart,
    status: 'submitted',
    submittedAt: new Date(),
  });

  console.log('Inserted submission for', developer.email, weekStart);
}

main().catch((err) => { console.error(err); process.exit(1); });
