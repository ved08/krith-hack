/**
 * Idempotently seed 3 demo students into a (grade, subject) classroom
 * owned by the given teacher. Creates the classroom if missing.
 *
 * Usage:
 *   bun run scripts/seed-demo-students.ts
 *     # defaults: teacher=demo_teacher, grade="Grade 5A", subject=Math
 *   bun run scripts/seed-demo-students.ts <teacherUsername> "<grade>" <subject>
 *
 * Pair with `scripts/demo-marks.csv` for the marks upload flow.
 */

import { and, eq } from "drizzle-orm";
import { db } from "../packages/agent/src/db/client.js";
import {
  classroomMembership,
  classrooms,
  users,
} from "../packages/agent/src/db/schema.js";

const TEACHER_USERNAME = process.argv[2] ?? "demo_teacher";
const GRADE = process.argv[3] ?? "Grade 5A";
const SUBJECT = process.argv[4] ?? "Math";

// Per-(grade, subject) student rosters keep usernames stable across
// repeated runs of the same demo combo.
const ROSTER_BY_KEY: Record<
  string,
  Array<{ username: string; fullName: string; phoneNumber: string }>
> = {
  default: [
    { username: "demo_aarav",  fullName: "Aarav Patel",  phoneNumber: "+919000000101" },
    { username: "demo_diya",   fullName: "Diya Kapoor",  phoneNumber: "+919000000102" },
    { username: "demo_vihaan", fullName: "Vihaan Mehta", phoneNumber: "+919000000103" },
  ],
  "Grade 6A|Science": [
    { username: "sci_kabir",  fullName: "Kabir Rao",    phoneNumber: "+919000000201" },
    { username: "sci_isha",   fullName: "Isha Nair",    phoneNumber: "+919000000202" },
    { username: "sci_neel",   fullName: "Neel Joshi",   phoneNumber: "+919000000203" },
  ],
};

const KIOSK_PASSWORD_HASH = "kiosk-intake-placeholder-not-bcrypt";

async function main() {
  const [teacher] = await db
    .select({ id: users.id, schoolId: users.schoolId, fullName: users.fullName })
    .from(users)
    .where(and(eq(users.username, TEACHER_USERNAME), eq(users.role, "teacher")))
    .limit(1);

  if (!teacher) {
    console.error(
      `[seed-demo-students] no teacher with username "${TEACHER_USERNAME}".`,
    );
    process.exit(1);
  }

  // Ensure the (school, grade, subject, teacher) classroom exists.
  let [classroom] = await db
    .select({ id: classrooms.id })
    .from(classrooms)
    .where(
      and(
        eq(classrooms.schoolId, teacher.schoolId),
        eq(classrooms.teacherId, teacher.id),
        eq(classrooms.name, GRADE),
        eq(classrooms.subject, SUBJECT),
      ),
    )
    .limit(1);

  let classroomCreated = false;
  if (!classroom) {
    const [row] = await db
      .insert(classrooms)
      .values({
        schoolId: teacher.schoolId,
        teacherId: teacher.id,
        name: GRADE,
        subject: SUBJECT,
      })
      .returning({ id: classrooms.id });
    if (!row) {
      console.error("[seed-demo-students] failed to insert classroom");
      process.exit(1);
    }
    classroom = row;
    classroomCreated = true;
  }

  const rosterKey = `${GRADE}|${SUBJECT}`;
  const roster = ROSTER_BY_KEY[rosterKey] ?? ROSTER_BY_KEY["default"]!;

  let createdUsers = 0;
  let createdMemberships = 0;

  for (const s of roster) {
    let [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, s.username))
      .limit(1);

    if (!existing) {
      const [row] = await db
        .insert(users)
        .values({
          schoolId: teacher.schoolId,
          username: s.username,
          passwordHash: KIOSK_PASSWORD_HASH,
          role: "student",
          phoneNumber: s.phoneNumber,
          fullName: s.fullName,
        })
        .returning({ id: users.id });
      if (!row) {
        console.error(`[seed-demo-students] failed to insert ${s.username}`);
        process.exit(1);
      }
      existing = row;
      createdUsers += 1;
    }

    const [member] = await db
      .select({ id: classroomMembership.id })
      .from(classroomMembership)
      .where(
        and(
          eq(classroomMembership.studentId, existing.id),
          eq(classroomMembership.classroomId, classroom.id),
        ),
      )
      .limit(1);
    if (!member) {
      await db
        .insert(classroomMembership)
        .values({ classroomId: classroom.id, studentId: existing.id });
      createdMemberships += 1;
    }
  }

  console.log(
    `[seed-demo-students] teacher=${teacher.fullName} (id=${teacher.id})`,
  );
  console.log(
    `  classroom: ${SUBJECT} / ${GRADE} (id=${classroom.id})${classroomCreated ? " [created]" : ""}`,
  );
  console.log(
    `  newly-created users: ${createdUsers}, newly-created memberships: ${createdMemberships}`,
  );
  console.log(
    `\n  CSV-ready usernames: ${roster.map((s) => s.username).join(", ")}\n`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error("[seed-demo-students] failed:", e);
  process.exit(1);
});
