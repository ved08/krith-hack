/**
 * Set a real bcrypt password on an existing teacher row so the dashboard
 * login flow works against the seed data.
 *
 * Usage:
 *   bun run scripts/set-teacher-password.ts                     # default: sharma / sharma123
 *   bun run scripts/set-teacher-password.ts <username> <pw>     # override
 */

import { eq } from "drizzle-orm";
import { db } from "../packages/agent/src/db/client.js";
import { hashPassword } from "../packages/agent/src/db/queries/auth.js";
import { users } from "../packages/agent/src/db/schema.js";

async function main() {
  const username = process.argv[2] ?? "sharma";
  const password = process.argv[3] ?? "sharma123";

  const [existing] = await db
    .select({ id: users.id, role: users.role, fullName: users.fullName })
    .from(users)
    .where(eq(users.username, username))
    .limit(1);

  if (!existing) {
    console.error(
      `[set-teacher-password] no user with username="${username}" — run the seed first?`,
    );
    process.exit(1);
  }
  if (existing.role !== "teacher") {
    console.error(
      `[set-teacher-password] user ${username} has role=${existing.role}, expected teacher`,
    );
    process.exit(1);
  }

  const passwordHash = await hashPassword(password);
  await db
    .update(users)
    .set({ passwordHash, passwordSetAt: new Date(), updatedAt: new Date() })
    .where(eq(users.id, existing.id));

  console.log(
    `[set-teacher-password] ${existing.fullName} (id=${existing.id}, username=${username}) → password set`,
  );
  console.log(`\n  Login with: ${username} / ${password}\n`);
  process.exit(0);
}

main().catch((e) => {
  console.error("[set-teacher-password] failed:", e);
  process.exit(1);
});
