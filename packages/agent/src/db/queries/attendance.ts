import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../client.js";
import { attendance, classSession, classroomMembership, users } from "../schema.js";
import { classroomBelongsToSchool } from "./classrooms.js";
import { err, ok, type Result } from "./result.js";

export type AttendanceStatus = "PRESENT" | "ABSENT" | "LATE";

/**
 * Get-or-create the session row for a classroom/date pair. Idempotent.
 */
export async function upsertClassSession(input: {
  classroomId: number;
  sessionDate: string; // YYYY-MM-DD
}): Promise<Result<{ sessionId: number }>> {
  const existing = await db
    .select({ id: classSession.id })
    .from(classSession)
    .where(
      and(
        eq(classSession.classroomId, input.classroomId),
        eq(classSession.sessionDate, input.sessionDate),
      ),
    )
    .limit(1);
  if (existing[0]) return ok({ sessionId: existing[0].id });

  const inserted = await db
    .insert(classSession)
    .values({ classroomId: input.classroomId, sessionDate: input.sessionDate })
    .onConflictDoNothing({ target: [classSession.classroomId, classSession.sessionDate] })
    .returning({ id: classSession.id });
  if (inserted[0]) return ok({ sessionId: inserted[0].id });

  // Race: another write created it after our SELECT. Re-read.
  const [row] = await db
    .select({ id: classSession.id })
    .from(classSession)
    .where(
      and(
        eq(classSession.classroomId, input.classroomId),
        eq(classSession.sessionDate, input.sessionDate),
      ),
    )
    .limit(1);
  if (!row) return err("DB_ERROR", "session upsert failed");
  return ok({ sessionId: row.id });
}

/**
 * Mark attendance for a whole classroom on a specific date in one call.
 *
 * Input is an array of { studentId, status } rows. The session is auto-created
 * if it doesn't exist. Existing attendance rows for the same student/session
 * are overwritten (teachers routinely correct mistakes).
 *
 * Validates that every student is enrolled in the classroom to prevent writing
 * attendance for outsiders.
 */
export async function insertAttendanceBatch(input: {
  schoolId: number;
  classroomId: number;
  sessionDate: string; // YYYY-MM-DD
  markedBy: number; // teacher userId
  rows: Array<{ studentId: number; status: AttendanceStatus }>;
}): Promise<Result<{ sessionId: number; written: number }>> {
  if (input.rows.length === 0) return err("INVALID_INPUT", "no attendance rows supplied");

  // School isolation — the classroom must belong to the claimed school.
  if (!(await classroomBelongsToSchool(input.classroomId, input.schoolId))) {
    return err("UNAUTHORIZED", "classroom does not belong to this school");
  }

  const studentIds = Array.from(new Set(input.rows.map((r) => r.studentId)));

  // Verify every student is actually enrolled in this classroom.
  const enrolled = await db
    .select({ studentId: classroomMembership.studentId })
    .from(classroomMembership)
    .where(
      and(
        eq(classroomMembership.classroomId, input.classroomId),
        inArray(classroomMembership.studentId, studentIds),
      ),
    );
  const enrolledSet = new Set(enrolled.map((r) => r.studentId));
  const notEnrolled = studentIds.filter((id) => !enrolledSet.has(id));
  if (notEnrolled.length > 0) {
    return err(
      "INVALID_INPUT",
      `students not enrolled in classroom ${input.classroomId}: ${notEnrolled.join(",")}`,
    );
  }

  // Verify teacher exists and belongs to school.
  const [teacher] = await db
    .select({ id: users.id, role: users.role, schoolId: users.schoolId })
    .from(users)
    .where(eq(users.id, input.markedBy))
    .limit(1);
  if (!teacher) return err("NOT_FOUND", `teacher ${input.markedBy} not found`);
  if (teacher.role !== "teacher")
    return err("INVALID_INPUT", `user ${input.markedBy} is not a teacher`);
  if (teacher.schoolId !== input.schoolId)
    return err("UNAUTHORIZED", "teacher belongs to a different school");

  // Create session (idempotent) and insert attendance rows in a single tx.
  const writeResult = await db.transaction(async (tx) => {
    // Session upsert (inline to keep it in-tx).
    const existingSession = await tx
      .select({ id: classSession.id })
      .from(classSession)
      .where(
        and(
          eq(classSession.classroomId, input.classroomId),
          eq(classSession.sessionDate, input.sessionDate),
        ),
      )
      .limit(1);
    let sessionId: number;
    if (existingSession[0]) {
      sessionId = existingSession[0].id;
    } else {
      const ins = await tx
        .insert(classSession)
        .values({
          classroomId: input.classroomId,
          sessionDate: input.sessionDate,
        })
        .onConflictDoNothing({
          target: [classSession.classroomId, classSession.sessionDate],
        })
        .returning({ id: classSession.id });
      if (ins[0]) {
        sessionId = ins[0].id;
      } else {
        const [row] = await tx
          .select({ id: classSession.id })
          .from(classSession)
          .where(
            and(
              eq(classSession.classroomId, input.classroomId),
              eq(classSession.sessionDate, input.sessionDate),
            ),
          )
          .limit(1);
        if (!row) throw new Error("failed to resolve session id after upsert");
        sessionId = row.id;
      }
    }

    // Bulk upsert attendance rows.
    const values = input.rows.map((r) => ({
      studentId: r.studentId,
      sessionId,
      status: r.status,
      markedBy: input.markedBy,
    }));
    const written = await tx
      .insert(attendance)
      .values(values)
      .onConflictDoUpdate({
        target: [attendance.studentId, attendance.sessionId],
        set: {
          status: sql`excluded.status`,
          markedBy: sql`excluded.marked_by`,
          markedAt: sql`excluded.marked_at`,
        },
      })
      .returning({ id: attendance.id });

    return { sessionId, written: written.length };
  });

  return ok({
    sessionId: writeResult.sessionId,
    written: writeResult.written,
  });
}
