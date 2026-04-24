/**
 * Deterministic seed for the Campus Cortex backend.
 *
 *   bun run db:seed
 *
 * Wipes every public-schema table and re-inserts a coherent fixture:
 *   - 1 school, 1 teacher, 1 classroom (Grade 5A)
 *   - 4 students with varied profiles (top / average / struggling / new)
 *   - 3 parents, including one with 2 linked children (multi-child
 *     disambiguation test)
 *   - 30 days of attendance per student (except Meera who started recently)
 *   - 15 assignments across 5 subjects + 1 overdue + 1 future
 *   - ~60 grade submissions
 *
 * The phone numbers below are the demo contract for the WhatsApp teammate
 * and for the agent integration tests:
 *
 *   Teacher  Mrs. Sharma   +911111111111   (role=teacher)
 *   Parent   Mr. Kumar     +912222222222   links: Arjun + Priya
 *   Parent   Mrs. Sen      +913333333333   links: Rahul
 *   Parent   Mrs. Iyer     +914444444444   links: Meera
 *   Student  Arjun Kumar   +915555555555   (self-query test)
 */
import { sql } from "drizzle-orm";
import { db } from "./client.js";
import { classroomMembership, parentStudentLink, schools, users } from "./schema.js";
import { createClassroom } from "./queries/classrooms.js";
import {
  insertAttendanceBatch,
  type AttendanceStatus,
} from "./queries/attendance.js";
import { createAssignment, insertGradesBatch } from "./queries/grades.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FAKE_HASH = "seed-password-placeholder-not-bcrypt";

function isoDate(daysAgo: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

function addDays(daysFromNow: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysFromNow);
  return d;
}

function assertOk<T>(label: string, r: { success: true; data: T } | { success: false; error: { code: string; message: string } }): T {
  if (!r.success) throw new Error(`${label} failed: ${r.error.code}: ${r.error.message}`);
  return r.data;
}

// ---------------------------------------------------------------------------
// Wipe
// ---------------------------------------------------------------------------

async function wipe() {
  console.log("→ wiping public schema tables");
  // TRUNCATE with RESTART IDENTITY resets bigserial counters so IDs are stable
  // across runs. CASCADE handles FK chains.
  await db.execute(sql`
    TRUNCATE TABLE
      assignment_submission,
      attendance,
      assignments,
      class_session,
      classroom_membership,
      classrooms,
      parent_student_link,
      users,
      schools
    RESTART IDENTITY CASCADE
  `);
}

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

type Ids = {
  schoolId: number;
  teacherId: number;
  parentKumarId: number;
  parentSenId: number;
  parentIyerId: number;
  arjunId: number;
  priyaId: number;
  rahulId: number;
  meeraId: number;
  classroomId: number;
};

async function insertIdentities(): Promise<Ids> {
  console.log("→ schools + users + parent_student_link");

  const [school] = await db
    .insert(schools)
    .values({ name: "Springfield Public School" })
    .returning({ id: schools.id });
  if (!school) throw new Error("school insert failed");

  const insertedUsers = await db
    .insert(users)
    .values([
      {
        schoolId: school.id,
        username: "sharma",
        passwordHash: FAKE_HASH,
        role: "teacher",
        phoneNumber: "+911111111111",
        fullName: "Anita Sharma",
      },
      {
        schoolId: school.id,
        username: "kumar",
        passwordHash: FAKE_HASH,
        role: "parent",
        phoneNumber: "+912222222222",
        fullName: "Ramesh Kumar",
      },
      {
        schoolId: school.id,
        username: "sen",
        passwordHash: FAKE_HASH,
        role: "parent",
        phoneNumber: "+913333333333",
        fullName: "Shreya Sen",
      },
      {
        schoolId: school.id,
        username: "iyer",
        passwordHash: FAKE_HASH,
        role: "parent",
        phoneNumber: "+914444444444",
        fullName: "Lakshmi Iyer",
      },
      {
        schoolId: school.id,
        username: "arjun",
        passwordHash: FAKE_HASH,
        role: "student",
        phoneNumber: "+915555555555",
        fullName: "Arjun Kumar",
      },
      {
        schoolId: school.id,
        username: "priya",
        passwordHash: FAKE_HASH,
        role: "student",
        phoneNumber: "+916666666666",
        fullName: "Priya Kumar",
      },
      {
        schoolId: school.id,
        username: "rahul",
        passwordHash: FAKE_HASH,
        role: "student",
        phoneNumber: "+917777777777",
        fullName: "Rahul Sen",
      },
      {
        schoolId: school.id,
        username: "meera",
        passwordHash: FAKE_HASH,
        role: "student",
        phoneNumber: "+918888888888",
        fullName: "Meera Iyer",
      },
    ])
    .returning({
      id: users.id,
      username: users.username,
    });

  const byUsername = (u: string) => {
    const row = insertedUsers.find((r) => r.username === u);
    if (!row) throw new Error(`user ${u} missing`);
    return row.id;
  };

  const ids = {
    schoolId: school.id,
    teacherId: byUsername("sharma"),
    parentKumarId: byUsername("kumar"),
    parentSenId: byUsername("sen"),
    parentIyerId: byUsername("iyer"),
    arjunId: byUsername("arjun"),
    priyaId: byUsername("priya"),
    rahulId: byUsername("rahul"),
    meeraId: byUsername("meera"),
    classroomId: 0, // filled below
  };

  await db.insert(parentStudentLink).values([
    { parentId: ids.parentKumarId, studentId: ids.arjunId },
    { parentId: ids.parentKumarId, studentId: ids.priyaId },
    { parentId: ids.parentSenId, studentId: ids.rahulId },
    { parentId: ids.parentIyerId, studentId: ids.meeraId },
  ]);

  return ids;
}

async function insertClassroomAndEnroll(ids: Ids): Promise<number> {
  console.log("→ classroom + enrolment");
  const created = assertOk(
    "createClassroom",
    await createClassroom({
      schoolId: ids.schoolId,
      name: "Grade 5A",
      teacherId: ids.teacherId,
    }),
  );

  // Enroll directly via Drizzle — createClassroom's helper enrollStudent is
  // fine but bulk insert is cleaner for a seed.
  await db.insert(classroomMembership).values([
    { classroomId: created.id, studentId: ids.arjunId },
    { classroomId: created.id, studentId: ids.priyaId },
    { classroomId: created.id, studentId: ids.rahulId },
    { classroomId: created.id, studentId: ids.meeraId },
  ]);

  return created.id;
}

async function insertAttendance(ids: Ids): Promise<void> {
  console.log("→ attendance (30 days)");

  // Profile-based status picker.
  const statusFor = (
    student: "arjun" | "priya" | "rahul" | "meera",
    daysAgo: number,
  ): AttendanceStatus | null => {
    // Meera started 10 days ago — no attendance before that.
    if (student === "meera" && daysAgo > 10) return null;

    // Skip weekends for everyone.
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - daysAgo);
    const dow = d.getUTCDay();
    if (dow === 0 || dow === 6) return null;

    switch (student) {
      case "priya":
        return "PRESENT"; // perfect attendance
      case "arjun":
        // ~93% present, occasional LATE
        return daysAgo % 10 === 3 ? "LATE" : "PRESENT";
      case "rahul":
        // struggling — mix of ABSENT, LATE, PRESENT
        if (daysAgo % 5 === 0) return "ABSENT";
        if (daysAgo % 7 === 2) return "LATE";
        return "PRESENT";
      case "meera":
        return daysAgo === 3 ? "LATE" : "PRESENT";
    }
  };

  for (let daysAgo = 30; daysAgo >= 0; daysAgo--) {
    const rows = (
      [
        ["arjun", ids.arjunId],
        ["priya", ids.priyaId],
        ["rahul", ids.rahulId],
        ["meera", ids.meeraId],
      ] as const
    )
      .map(([name, id]) => {
        const st = statusFor(name, daysAgo);
        return st ? { studentId: id, status: st } : null;
      })
      .filter((r): r is { studentId: number; status: AttendanceStatus } => r != null);

    if (rows.length === 0) continue;

    assertOk(
      `insertAttendanceBatch ${isoDate(daysAgo)}`,
      await insertAttendanceBatch({
        schoolId: ids.schoolId,
        classroomId: ids.classroomId,
        sessionDate: isoDate(daysAgo),
        markedBy: ids.teacherId,
        rows,
      }),
    );
  }
}

// Profiles: { subject: avgPercentage across submissions for this student }.
const gradeProfiles: Record<"arjun" | "priya" | "rahul" | "meera", Record<string, number>> = {
  arjun: { Math: 78, Science: 82, English: 75, Hindi: 70, "Social Studies": 72 },
  priya: { Math: 95, Science: 92, English: 88, Hindi: 90, "Social Studies": 85 },
  rahul: { Math: 48, Science: 58, English: 52, Hindi: 60, "Social Studies": 55 },
  meera: { Math: 80, Science: 85 }, // only two subjects seen yet (new student)
};

type Profile = "arjun" | "priya" | "rahul" | "meera";

async function insertAssignmentsAndGrades(ids: Ids): Promise<void> {
  console.log("→ assignments + submissions");

  const SUBJECTS = ["Math", "Science", "English", "Hindi", "Social Studies"] as const;
  const TYPES = [
    { type: "HOMEWORK" as const, daysAgoDue: 20, maxScore: 20 },
    { type: "QUIZ" as const, daysAgoDue: 10, maxScore: 50 },
    { type: "TEST" as const, daysAgoDue: 2, maxScore: 100 },
  ];

  const students: Array<{ id: number; key: Profile }> = [
    { id: ids.arjunId, key: "arjun" },
    { id: ids.priyaId, key: "priya" },
    { id: ids.rahulId, key: "rahul" },
    { id: ids.meeraId, key: "meera" },
  ];

  for (const subject of SUBJECTS) {
    for (const { type, daysAgoDue, maxScore } of TYPES) {
      const created = assertOk(
        `createAssignment ${subject} ${type}`,
        await createAssignment({
          schoolId: ids.schoolId,
          classroomId: ids.classroomId,
          title: `${subject} ${type.charAt(0) + type.slice(1).toLowerCase()} #1`,
          subject,
          type,
          maxScore,
          dueDate: addDays(-daysAgoDue),
          createdBy: ids.teacherId,
        }),
      );

      // Build grade rows — skip students whose profile has no entry for
      // this subject (e.g. Meera hasn't done English yet).
      const gradeRows = students
        .map(({ id, key }) => {
          const profile = gradeProfiles[key];
          const target = profile[subject];
          if (target == null) return null;
          // Add some noise so grades aren't identical across assignments.
          const jitter = ((id + daysAgoDue) % 7) - 3; // -3..+3
          const pct = Math.max(0, Math.min(100, target + jitter));
          const score = Math.round((pct / 100) * maxScore * 10) / 10;
          return { studentId: id, score };
        })
        .filter((r): r is { studentId: number; score: number } => r != null);

      if (gradeRows.length === 0) continue;

      assertOk(
        `insertGradesBatch ${subject} ${type}`,
        await insertGradesBatch({
          schoolId: ids.schoolId,
          assignmentId: created.assignmentId,
          submittedBy: ids.teacherId,
          rows: gradeRows,
        }),
      );
    }
  }

  // One future-dated assignment (upcoming test) — nobody submits.
  assertOk(
    "createAssignment upcoming",
    await createAssignment({
      schoolId: ids.schoolId,
      classroomId: ids.classroomId,
      title: "Math Test #2",
      subject: "Math",
      type: "TEST",
      maxScore: 100,
      dueDate: addDays(+4),
      createdBy: ids.teacherId,
    }),
  );

  // One overdue assignment (due yesterday, nobody submitted) — tests
  // "pending"/"overdue" queries.
  assertOk(
    "createAssignment overdue",
    await createAssignment({
      schoolId: ids.schoolId,
      classroomId: ids.classroomId,
      title: "Science Homework #2",
      subject: "Science",
      type: "HOMEWORK",
      maxScore: 20,
      dueDate: addDays(-1),
      createdBy: ids.teacherId,
    }),
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const t0 = Date.now();
  await wipe();
  const ids = await insertIdentities();
  ids.classroomId = await insertClassroomAndEnroll(ids);
  await insertAttendance(ids);
  await insertAssignmentsAndGrades(ids);
  console.log(`\nSeed complete in ${Date.now() - t0}ms`);
  console.log("\nPhone numbers to test:");
  console.log("  Parent Kumar (Arjun + Priya): +912222222222");
  console.log("  Parent Sen (Rahul):           +913333333333");
  console.log("  Parent Iyer (Meera):          +914444444444");
  console.log("  Student Arjun:                +915555555555");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    // postgres-js client won't let the process exit otherwise.
    const { default: postgres } = await import("postgres");
    void postgres; // no-op; bun keeps the connection pool lingering
    process.exit(0);
  });
