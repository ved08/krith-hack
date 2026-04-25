import { eq } from "drizzle-orm";
import { db } from "../packages/agent/src/db/client.js";
import { users } from "../packages/agent/src/db/schema.js";

const rows = await db
  .select({
    id: users.id,
    username: users.username,
    role: users.role,
    fullName: users.fullName,
    schoolId: users.schoolId,
  })
  .from(users)
  .where(eq(users.role, "teacher"));

console.log(rows);
process.exit(0);
