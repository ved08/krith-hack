/**
 * Idempotent seed for a demo teacher account that owns a classroom and
 * has a few students enrolled. Lets the teacher dashboard show real data
 * and lets the login flow be exercised end-to-end.
 *
 * Usage:
 *   bun run scripts/seed-demo-teacher.ts
 *
 * Output: prints the username + password to log in with.
 */

import { and, eq } from "drizzle-orm";
import { db } from "../packages/agent/src/db/client.js";
import { hashPassword } from "../packages/agent/src/db/queries/auth.js";
import {
  classroomMembership,
  classrooms,
  schools,
  users,
} from "../packages/agent/src/db/schema.js";

const TEACHER_USERNAME = "demo_teacher";
const TEACHER_PASSWORD = "teacher123";
const SCHOOL_NAME = "Campus Cortex Demo School";
const CLASSROOM_NAME = "Grade 5A";

async function ensureSchool(): Promise<number> {
  const [existing] = await db
    .select({ id: schools.id })
    .from(schools)
    .where(eq(schools.name, SCHOOL_NAME))
    .limit(1);
  if (existing) return existing.id;
  const [row] = await db
    .insert(schools)
    .values({ name: SCHOOL_NAME })
    .returning({ id: schools.id });
  if (!row) throw new Error("failed to insert school");
  return row.id;
}

async function ensureTeacher(schoolId: number): Promise<number> {
  const passwordHash = await hashPassword(TEACHER_PASSWORD);
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, TEACHER_USERNAME))
    .limit(1);

  if (existing) {
    await db
      .update(users)
      .set({ passwordHash, passwordSetAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, existing.id));
    return existing.id;
  }

  const [row] = await db
    .insert(users)
    .values({
      schoolId,
      username: TEACHER_USERNAME,
      passwordHash,
      role: "teacher",
      phoneNumber: "+910000000000",
      fullName: "Demo Teacher",
      passwordSetAt: new Date(),
    })
    .returning({ id: users.id });
  if (!row) throw new Error("failed to insert teacher");
  return row.id;
}

async function ensureClassroom(
  schoolId: number,
  teacherId: number,
): Promise<number> {
  const [existing] = await db
    .select({ id: classrooms.id })
    .from(classrooms)
    .where(
      and(
        eq(classrooms.name, CLASSROOM_NAME),
        eq(classrooms.schoolId, schoolId),
        eq(classrooms.teacherId, teacherId),
      ),
    )
    .limit(1);
  if (existing) return existing.id;
  const [row] = await db
    .insert(classrooms)
    .values({ schoolId, name: CLASSROOM_NAME, teacherId })
    .returning({ id: classrooms.id });
  if (!row) throw new Error("failed to insert classroom");
  return row.id;
}

async function ensureStudents(
  schoolId: number,
  classroomId: number,
): Promise<number> {
  const passwordHash = "kiosk-intake-placeholder-not-bcrypt";
  const samples = [
    { username: "demo_student_a", fullName: "Aarav Patel", phone: "+910000000101" },
    { username: "demo_student_b", fullName: "Diya Kapoor", phone: "+910000000102" },
    { username: "demo_student_c", fullName: "Vihaan Mehta", phone: "+910000000103" },
  ];
  let count = 0;
  for (const s of samples) {
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, s.username))
      .limit(1);
    let studentId: number;
    if (existing) {
      studentId = existing.id;
    } else {
      const [row] = await db
        .insert(users)
        .values({
          schoolId,
          username: s.username,
          passwordHash,
          role: "student",
          phoneNumber: s.phone,
          fullName: s.fullName,
        })
        .returning({ id: users.id });
      if (!row) continue;
      studentId = row.id;
    }
    // membership upsert (no unique constraint by default — check first)
    const [member] = await db
      .select({ id: classroomMembership.id })
      .from(classroomMembership)
      .where(
        and(
          eq(classroomMembership.studentId, studentId),
          eq(classroomMembership.classroomId, classroomId),
        ),
      )
      .limit(1);
    if (!member) {
      await db
        .insert(classroomMembership)
        .values({ classroomId, studentId });
      count++;
    }
  }
  return count;
}

async function main() {
  const schoolId = await ensureSchool();
  const teacherId = await ensureTeacher(schoolId);
  const classroomId = await ensureClassroom(schoolId, teacherId);
  const enrolled = await ensureStudents(schoolId, classroomId);

  console.log(
    `[seed-demo-teacher] schoolId=${schoolId} teacherId=${teacherId} classroomId=${classroomId} newly-enrolled=${enrolled}`,
  );
  console.log(
    `\n  Login with: ${TEACHER_USERNAME} / ${TEACHER_PASSWORD}\n`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error("[seed-demo-teacher] failed:", e);
  process.exit(1);
});
