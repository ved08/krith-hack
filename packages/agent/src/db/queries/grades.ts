import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../client.js";
import {
  assignmentSubmission,
  assignments,
  classroomMembership,
  classrooms,
  users,
} from "../schema.js";
import { classroomBelongsToSchool } from "./classrooms.js";
import { err, ok, type Result } from "./result.js";

export type AssignmentType = "HOMEWORK" | "QUIZ" | "TEST";

/**
 * Create an assignment that will be graded later. Validates school + teacher.
 */
export async function createAssignment(input: {
  schoolId: number;
  classroomId: number;
  title: string;
  subject: string;
  type: AssignmentType;
  maxScore: number;
  dueDate: Date;
  createdBy: number;
}): Promise<Result<{ assignmentId: number }>> {
  if (input.maxScore <= 0) return err("INVALID_INPUT", "maxScore must be positive");
  if (!input.title.trim()) return err("INVALID_INPUT", "title required");
  if (!input.subject.trim()) return err("INVALID_INPUT", "subject required");

  if (!(await classroomBelongsToSchool(input.classroomId, input.schoolId))) {
    return err("UNAUTHORIZED", "classroom does not belong to this school");
  }

  const [teacher] = await db
    .select({ id: users.id, role: users.role, schoolId: users.schoolId })
    .from(users)
    .where(eq(users.id, input.createdBy))
    .limit(1);
  if (!teacher) return err("NOT_FOUND", `teacher ${input.createdBy} not found`);
  if (teacher.role !== "teacher")
    return err("INVALID_INPUT", "assignment creator must be a teacher");
  if (teacher.schoolId !== input.schoolId)
    return err("UNAUTHORIZED", "teacher belongs to a different school");

  const [row] = await db
    .insert(assignments)
    .values({
      classroomId: input.classroomId,
      title: input.title.trim(),
      subject: input.subject.trim(),
      type: input.type,
      maxScore: input.maxScore.toString(),
      dueDate: input.dueDate,
      createdBy: input.createdBy,
    })
    .returning({ id: assignments.id });
  if (!row) return err("DB_ERROR", "assignment insert returned nothing");

  return ok({ assignmentId: row.id });
}

/**
 * Bulk insert/update grades for an assignment. Idempotent — re-submitting
 * overrides the existing score (teachers correct mistakes).
 *
 * Input: one entry per student. Percentage is computed server-side using the
 * assignment's max_score; clamped at 0 but NOT clamped at 100 (allows bonus).
 */
export async function insertGradesBatch(input: {
  schoolId: number;
  assignmentId: number;
  submittedBy: number; // teacher userId
  rows: Array<{ studentId: number; score: number }>;
}): Promise<Result<{ written: number }>> {
  if (input.rows.length === 0) return err("INVALID_INPUT", "no grade rows supplied");

  // Pull assignment + classroom + school in one shot.
  const [row] = await db
    .select({
      assignmentId: assignments.id,
      classroomId: assignments.classroomId,
      maxScore: assignments.maxScore,
      schoolId: classrooms.schoolId,
    })
    .from(assignments)
    .innerJoin(classrooms, eq(classrooms.id, assignments.classroomId))
    .where(eq(assignments.id, input.assignmentId))
    .limit(1);
  if (!row) return err("NOT_FOUND", `assignment ${input.assignmentId} not found`);
  if (row.schoolId !== input.schoolId)
    return err("UNAUTHORIZED", "assignment belongs to a different school");

  const maxScore = Number(row.maxScore);
  if (!Number.isFinite(maxScore) || maxScore <= 0) {
    return err("DB_ERROR", "assignment has invalid max_score");
  }

  // Validate submitter role/school.
  const [teacher] = await db
    .select({ id: users.id, role: users.role, schoolId: users.schoolId })
    .from(users)
    .where(eq(users.id, input.submittedBy))
    .limit(1);
  if (!teacher) return err("NOT_FOUND", `user ${input.submittedBy} not found`);
  if (teacher.role !== "teacher")
    return err("INVALID_INPUT", `user ${input.submittedBy} is not a teacher`);
  if (teacher.schoolId !== input.schoolId)
    return err("UNAUTHORIZED", "teacher belongs to a different school");

  // Validate students are enrolled in the assignment's classroom.
  const studentIds = Array.from(new Set(input.rows.map((r) => r.studentId)));
  const enrolled = await db
    .select({ studentId: classroomMembership.studentId })
    .from(classroomMembership)
    .where(
      and(
        eq(classroomMembership.classroomId, row.classroomId),
        inArray(classroomMembership.studentId, studentIds),
      ),
    );
  const enrolledSet = new Set(enrolled.map((r) => r.studentId));
  const notEnrolled = studentIds.filter((id) => !enrolledSet.has(id));
  if (notEnrolled.length > 0) {
    return err(
      "INVALID_INPUT",
      `students not enrolled in classroom ${row.classroomId}: ${notEnrolled.join(",")}`,
    );
  }

  // Validate scores.
  for (const r of input.rows) {
    if (!Number.isFinite(r.score)) {
      return err("INVALID_INPUT", `score for student ${r.studentId} is not a number`);
    }
    if (r.score < 0) {
      return err("INVALID_INPUT", `score for student ${r.studentId} is negative`);
    }
  }

  const values = input.rows.map((r) => {
    const pct = (r.score / maxScore) * 100;
    return {
      assignmentId: input.assignmentId,
      studentId: r.studentId,
      score: r.score.toString(),
      percentage: pct.toFixed(2),
    };
  });

  const written = await db
    .insert(assignmentSubmission)
    .values(values)
    .onConflictDoUpdate({
      target: [assignmentSubmission.assignmentId, assignmentSubmission.studentId],
      set: {
        score: sql`EXCLUDED.score`,
        percentage: sql`EXCLUDED.percentage`,
        submittedAt: sql`NOW()`,
      },
    })
    .returning({ id: assignmentSubmission.id });

  return ok({ written: written.length });
}
