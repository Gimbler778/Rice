import "dotenv/config";
import { db } from "../src/db/client";
import { weeklySubmission } from "../src/db/schema";
import { eq } from "drizzle-orm";

async function main() {
  const approved = await db.select().from(weeklySubmission).where(eq(weeklySubmission.status, 'approved'));
  const submitted = await db.select().from(weeklySubmission).where(eq(weeklySubmission.status, 'submitted'));
  console.log('approved rows:', approved);
  console.log('submitted rows:', submitted);
}

main().catch((err) => { console.error(err); process.exit(1); });
