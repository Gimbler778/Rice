import "dotenv/config";
import { db } from "../src/db/client";
import { weeklySubmission, user } from "../src/db/schema";
import { eq } from "drizzle-orm";

async function main() {
  const manager = await db.query.user.findFirst({ where: eq(user.email, 'manager@iqm.local') });
  if (!manager) {
    console.error('Manager user not found');
    process.exit(1);
  }

  const rows = await db.select().from(weeklySubmission).where(eq(weeklySubmission.status, 'submitted'));
  if (!rows || rows.length === 0) {
    console.log('No submitted rows to approve');
    return;
  }

  const row = rows[0];

  await db.update(weeklySubmission).set({
    status: 'approved',
    approvedBy: manager.id,
    approverRole: 'manager',
    approverComment: 'Approved via script',
    updatedAt: new Date(),
  }).where(eq(weeklySubmission.id, row.id));

  console.log('Approved submission', row.id);
}

main().catch((err) => { console.error(err); process.exit(1); });
