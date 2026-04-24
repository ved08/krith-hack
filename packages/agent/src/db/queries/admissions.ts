import { and, eq } from "drizzle-orm";
import { db } from "../client.js";
import {
  classroomMembership,
  classrooms,
  parentStudentLink,
  schools,
  users,
} from "../schema.js";
import { err, ok, type Result } from "./result.js";

const KIOSK_PASSWORD_HASH = "kiosk-intake-placeholder-not-bcrypt";

type WritableDb = Pick<typeof db, "select" | "insert" | "update">;

export type UpsertAdmissionsIntakeInput = {
  schoolId: number;
  classroomId: number;
  parentName: string;
  parentPhoneE164: string;
  studentName: string;
  studentPhoneE164: string;
  parentUsername?: string;
  studentUsername?: string;
  verifiedAt?: Date;
};

export type UpsertAdmissionsIntakeOutput = {
  schoolId: number;
  schoolName: string;
  classroomId: number;
  classroomName: string;
  parentUserId: number;
  studentUserId: number;
  parentCreated: boolean;
  studentCreated: boolean;
  parentStudentLinkCreated: boolean;
  classroomEnrollmentCreated: boolean;
};

/**
 * Persist intake profile for admissions kiosk into normalized identity tables:
 *   - users (parent + student)
 *   - parent_student_link
 *   - classroom_membership
 *
 * Idempotent by school + phone for user upserts, and by unique constraints for
 * link/enrollment rows.
 */
export async function upsertAdmissionsIntake(
  input: UpsertAdmissionsIntakeInput,
): Promise<Result<UpsertAdmissionsIntakeOutput>> {
  const parentName = input.parentName.trim();
  const studentName = input.studentName.trim();
  if (!parentName) return err("INVALID_INPUT", "parentName is required");
  if (!studentName) return err("INVALID_INPUT", "studentName is required");

  return db.transaction(async (tx) => {
    const [school] = await tx
      .select({ id: schools.id, name: schools.name })
      .from(schools)
      .where(eq(schools.id, input.schoolId))
      .limit(1);
    if (!school) return err("NOT_FOUND", `school ${input.schoolId} not found`);

    const [classroom] = await tx
      .select({ id: classrooms.id, name: classrooms.name, schoolId: classrooms.schoolId })
      .from(classrooms)
      .where(eq(classrooms.id, input.classroomId))
      .limit(1);
    if (!classroom) return err("NOT_FOUND", `classroom ${input.classroomId} not found`);
    if (classroom.schoolId !== input.schoolId) {
      return err("UNAUTHORIZED", "classroom belongs to a different school");
    }

    const parentResult = await getOrCreateUserByPhone(tx, {
      schoolId: input.schoolId,
      role: "parent",
      fullName: parentName,
      phoneNumber: input.parentPhoneE164,
      preferredUsername: input.parentUsername,
    });
    if (!parentResult.success) return parentResult;

    const studentResult = await getOrCreateUserByPhone(tx, {
      schoolId: input.schoolId,
      role: "student",
      fullName: studentName,
      phoneNumber: input.studentPhoneE164,
      preferredUsername: input.studentUsername,
    });
    if (!studentResult.success) return studentResult;

    const verifiedAt = input.verifiedAt ?? new Date();
    const linkInsert = await tx
      .insert(parentStudentLink)
      .values({
        parentId: parentResult.data.id,
        studentId: studentResult.data.id,
        verifiedAt,
      })
      .onConflictDoNothing({
        target: [parentStudentLink.parentId, parentStudentLink.studentId],
      })
      .returning({ id: parentStudentLink.id });

    const enrollmentInsert = await tx
      .insert(classroomMembership)
      .values({
        classroomId: input.classroomId,
        studentId: studentResult.data.id,
      })
      .onConflictDoNothing({
        target: [classroomMembership.classroomId, classroomMembership.studentId],
      })
      .returning({ id: classroomMembership.id });

    return ok({
      schoolId: school.id,
      schoolName: school.name,
      classroomId: classroom.id,
      classroomName: classroom.name,
      parentUserId: parentResult.data.id,
      studentUserId: studentResult.data.id,
      parentCreated: parentResult.data.created,
      studentCreated: studentResult.data.created,
      parentStudentLinkCreated: linkInsert.length > 0,
      classroomEnrollmentCreated: enrollmentInsert.length > 0,
    });
  });
}

async function getOrCreateUserByPhone(
  tx: WritableDb,
  input: {
    schoolId: number;
    role: "parent" | "student";
    fullName: string;
    phoneNumber: string;
    preferredUsername?: string;
  },
): Promise<Result<{ id: number; created: boolean }>> {
  const [existing] = await tx
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(and(eq(users.schoolId, input.schoolId), eq(users.phoneNumber, input.phoneNumber)))
    .limit(1);

  if (existing) {
    if (existing.role !== input.role) {
      return err(
        "INVALID_INPUT",
        `phone ${input.phoneNumber} is already used by role ${existing.role}`,
      );
    }

    await tx
      .update(users)
      .set({ fullName: input.fullName, updatedAt: new Date() })
      .where(eq(users.id, existing.id));

    return ok({ id: existing.id, created: false });
  }

  const username = await allocateUsername(tx, {
    schoolId: input.schoolId,
    preferredUsername: input.preferredUsername,
    fullName: input.fullName,
    role: input.role,
    phoneNumber: input.phoneNumber,
  });

  const [inserted] = await tx
    .insert(users)
    .values({
      schoolId: input.schoolId,
      username,
      passwordHash: KIOSK_PASSWORD_HASH,
      role: input.role,
      phoneNumber: input.phoneNumber,
      fullName: input.fullName,
    })
    .returning({ id: users.id });

  if (!inserted) return err("DB_ERROR", `failed to insert ${input.role}`);
  return ok({ id: inserted.id, created: true });
}

async function allocateUsername(
  tx: WritableDb,
  input: {
    schoolId: number;
    preferredUsername?: string;
    fullName: string;
    role: "parent" | "student";
    phoneNumber: string;
  },
): Promise<string> {
  const base = input.preferredUsername?.trim()
    ? slugify(input.preferredUsername)
    : slugify(`${input.role}_${input.fullName}`);

  const digits = input.phoneNumber.replace(/\D/g, "");
  const phoneTail = digits.slice(-4) || "0000";
  const prefix = `${base.slice(0, 24)}_${phoneTail}`;

  for (let i = 0; i < 25; i += 1) {
    const candidate = i === 0 ? prefix : `${prefix}_${i}`;
    const [taken] = await tx
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.schoolId, input.schoolId), eq(users.username, candidate)))
      .limit(1);
    if (!taken) return candidate;
  }

  return `${prefix}_${Date.now().toString().slice(-5)}`;
}

function slugify(raw: string): string {
  const s = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return s || "user";
}