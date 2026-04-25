/**
 * Wipe every application table in the public schema.
 *
 * Keeps the schema intact, drops all rows, resets bigserial counters.
 * Running this before manual sample-data insertion guarantees predictable
 * IDs (schools.id starts at 1, etc).
 *
 * Usage:
 *   bun run scripts/wipe-db.ts
 */

import { sql } from "drizzle-orm";
import { db } from "../packages/agent/src/db/client.js";

const TABLES = [
  // admissions artefacts first — they reference users / schools via SET NULL
  "admissions_evaluations",
  "admissions_question_sets",
  // classroom quiz flow
  "classroom_quiz_submissions",
  "classroom_quizzes",
  // grades
  "assignment_submission",
  "assignments",
  // attendance
  "attendance",
  "class_session",
  // enrolment + people
  "classroom_membership",
  "classrooms",
  "parent_student_link",
  "users",
  "schools",
];

async function main() {
  console.log(`→ truncating ${TABLES.length} tables (CASCADE, RESTART IDENTITY)`);
  await db.execute(
    sql.raw(`TRUNCATE TABLE ${TABLES.join(", ")} RESTART IDENTITY CASCADE`),
  );

  // Verify row counts post-wipe — easier to spot a missed table.
  for (const t of TABLES) {
    const rows = (await db.execute(sql.raw(`SELECT count(*)::int AS c FROM ${t}`))) as unknown as Array<{ c: number }>;
    console.log(`  ${t.padEnd(32)} ${rows[0]?.c ?? "?"}`);
  }
  console.log("→ done");
  process.exit(0);
}

main().catch((e) => {
  console.error("wipe failed:", e);
  process.exit(1);
});
