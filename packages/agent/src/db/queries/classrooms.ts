import { and, eq } from "drizzle-orm";
import { db } from "../client.js";
import { classroomMembership, classrooms, users } from "../schema.js";
import { err, ok, type Result } from "./result.js";

/**
 * Create a classroom. Caller must ensure the teacher exists + has role=teacher.
 */
export async function createClassroom(input: {
  schoolId: number;
  name: string;
  teacherId: number;
}): Promise<Result<{ id: number }>> {
  // Validate teacher role / school match.
  const [teacher] = await db
    .select({ id: users.id, role: users.role, schoolId: users.schoolId })
    .from(users)
    .where(eq(users.id, input.teacherId))
    .limit(1);
  if (!teacher) return err("NOT_FOUND", `teacher ${input.teacherId} not found`);
  if (teacher.role !== "teacher")
    return err("INVALID_INPUT", `user ${input.teacherId} is not a teacher`);
  if (teacher.schoolId !== input.schoolId)
    return err("INVALID_INPUT", "teacher belongs to a different school");

  const [row] = await db
    .insert(classrooms)
    .values({ schoolId: input.schoolId, name: input.name, teacherId: input.teacherId })
    .returning({ id: classrooms.id });
  if (!row) return err("DB_ERROR", "failed to insert classroom");
  return ok({ id: row.id });
}

/**
 * Enroll a student in a classroom. Idempotent — re-adding is a no-op.
 */
export async function enrollStudent(input: {
  classroomId: number;
  studentId: number;
}): Promise<Result<{ enrolled: boolean }>> {
  const [student] = await db
    .select({ id: users.id, role: users.role, schoolId: users.schoolId })
    .from(users)
    .where(eq(users.id, input.studentId))
    .limit(1);
  if (!student) return err("NOT_FOUND", `student ${input.studentId} not found`);
  if (student.role !== "student")
    return err("INVALID_INPUT", `user ${input.studentId} is not a student`);

  const [classroom] = await db
    .select({ id: classrooms.id, schoolId: classrooms.schoolId })
    .from(classrooms)
    .where(eq(classrooms.id, input.classroomId))
    .limit(1);
  if (!classroom) return err("NOT_FOUND", `classroom ${input.classroomId} not found`);
  if (classroom.schoolId !== student.schoolId)
    return err("INVALID_INPUT", "student and classroom are in different schools");

  const result = await db
    .insert(classroomMembership)
    .values({ classroomId: input.classroomId, studentId: input.studentId })
    .onConflictDoNothing({
      target: [classroomMembership.classroomId, classroomMembership.studentId],
    })
    .returning({ id: classroomMembership.id });

  return ok({ enrolled: result.length > 0 });
}

/**
 * Primary classroom for a student. A student can in principle belong to
 * multiple classrooms; DNA uses the earliest-enrolled as "primary".
 */
export async function getPrimaryClassroomId(studentId: number): Promise<number | null> {
  const [row] = await db
    .select({ classroomId: classroomMembership.classroomId })
    .from(classroomMembership)
    .where(eq(classroomMembership.studentId, studentId))
    .orderBy(classroomMembership.enrolledAt, classroomMembership.id)
    .limit(1);
  return row?.classroomId ?? null;
}

/** All students in a classroom (ids only). */
export async function getStudentsInClassroom(classroomId: number): Promise<number[]> {
  const rows = await db
    .select({ studentId: classroomMembership.studentId })
    .from(classroomMembership)
    .where(eq(classroomMembership.classroomId, classroomId));
  return rows.map((r) => r.studentId);
}

/** All classrooms a teacher owns. */
export async function getTeacherClassrooms(teacherId: number) {
  return db
    .select({ id: classrooms.id, name: classrooms.name, schoolId: classrooms.schoolId })
    .from(classrooms)
    .where(eq(classrooms.teacherId, teacherId));
}

/** Confirm a classroom belongs to a school (for isolation checks). */
export async function classroomBelongsToSchool(
  classroomId: number,
  schoolId: number,
): Promise<boolean> {
  const [row] = await db
    .select({ id: classrooms.id })
    .from(classrooms)
    .where(and(eq(classrooms.id, classroomId), eq(classrooms.schoolId, schoolId)))
    .limit(1);
  return !!row;
}
