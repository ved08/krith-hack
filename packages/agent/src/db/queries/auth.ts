import bcrypt from "bcryptjs";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../client.js";
import {
  classroomMembership,
  classrooms,
  parentStudentLink,
  schools,
  users,
} from "../schema.js";
import { err, ok, type Result } from "./result.js";

/**
 * Teacher dashboard auth + data access.
 *
 * `verifyTeacherCredentials` is the login check. It returns the teacher
 * record (minus the hash) on success. Password hashes are bcrypt; the
 * kiosk-seeded placeholder hash (`kiosk-intake-placeholder-not-bcrypt`)
 * never matches a bcrypt verify, so only properly-hashed accounts can log
 * in.
 */

const BCRYPT_ROUNDS = 10;

export type AuthenticatedTeacher = {
  id: number;
  username: string;
  fullName: string;
  schoolId: number;
  schoolName: string;
};

/**
 * Login-or-signup for teachers. If the username exists, we bcrypt-verify
 * the password. If it doesn't exist, we create the teacher with the
 * supplied `signup` data (schoolId + fullName) and return the new row.
 * Existing non-teacher accounts are rejected so a parent can't take
 * over their own row by guessing the username.
 */
export async function loginOrCreateTeacher(input: {
  username: string;
  password: string;
  signup?: { schoolId: number; fullName: string };
}): Promise<Result<AuthenticatedTeacher>> {
  try {
    const [row] = await db
      .select({
        id: users.id,
        username: users.username,
        fullName: users.fullName,
        schoolId: users.schoolId,
        schoolName: schools.name,
        role: users.role,
        passwordHash: users.passwordHash,
      })
      .from(users)
      .innerJoin(schools, eq(schools.id, users.schoolId))
      .where(eq(users.username, input.username))
      .limit(1);

    if (row) {
      if (row.role !== "teacher")
        return err("UNAUTHORIZED", "this username is taken by a non-teacher account");
      const matches = await bcrypt.compare(input.password, row.passwordHash);
      if (!matches) return err("UNAUTHORIZED", "invalid username or password");
      return ok({
        id: row.id,
        username: row.username,
        fullName: row.fullName,
        schoolId: row.schoolId,
        schoolName: row.schoolName,
      });
    }

    // No such user — create on the fly. Caller must have supplied the
    // signup data (school + full name) so the new row is well-formed.
    if (!input.signup) {
      return err(
        "INVALID_INPUT",
        "Account not found. Provide schoolId and fullName to create one.",
      );
    }

    const [school] = await db
      .select({ id: schools.id, name: schools.name })
      .from(schools)
      .where(eq(schools.id, input.signup.schoolId))
      .limit(1);
    if (!school) return err("INVALID_INPUT", "selected school does not exist");

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    const [created] = await db
      .insert(users)
      .values({
        schoolId: school.id,
        username: input.username,
        passwordHash,
        role: "teacher",
        phoneNumber: "",
        fullName: input.signup.fullName,
        passwordSetAt: new Date(),
      })
      .returning({ id: users.id, fullName: users.fullName, username: users.username });

    if (!created) return err("DB_ERROR", "failed to create teacher");
    return ok({
      id: created.id,
      username: created.username,
      fullName: created.fullName,
      schoolId: school.id,
      schoolName: school.name,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return err("DB_ERROR", message);
  }
}

export async function verifyTeacherCredentials(
  username: string,
  password: string,
): Promise<Result<AuthenticatedTeacher>> {
  try {
    const [row] = await db
      .select({
        id: users.id,
        username: users.username,
        fullName: users.fullName,
        schoolId: users.schoolId,
        schoolName: schools.name,
        role: users.role,
        passwordHash: users.passwordHash,
      })
      .from(users)
      .innerJoin(schools, eq(schools.id, users.schoolId))
      .where(eq(users.username, username))
      .limit(1);

    if (!row) return err("UNAUTHORIZED", "invalid username or password");
    if (row.role !== "teacher")
      return err("UNAUTHORIZED", "this account is not a teacher");

    const matches = await bcrypt.compare(password, row.passwordHash);
    if (!matches) return err("UNAUTHORIZED", "invalid username or password");

    return ok({
      id: row.id,
      username: row.username,
      fullName: row.fullName,
      schoolId: row.schoolId,
      schoolName: row.schoolName,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return err("DB_ERROR", message);
  }
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

/**
 * All students enrolled in any classroom taught by this teacher.
 *
 * Joins: classrooms (by teacherId) → classroomMembership → users.
 * De-duplicates by student id, since a student could (in theory) be in
 * multiple of the teacher's classrooms.
 */
export type TeacherStudentRow = {
  studentId: number;
  fullName: string;
  username: string;
  phoneNumber: string;
  classroomId: number;
  classroomName: string;
  subject: string;
};

export async function listStudentsForTeacher(
  teacherId: number,
): Promise<Result<TeacherStudentRow[]>> {
  try {
    const rows = await db
      .select({
        studentId: users.id,
        fullName: users.fullName,
        username: users.username,
        phoneNumber: users.phoneNumber,
        classroomId: classrooms.id,
        classroomName: classrooms.name,
        subject: classrooms.subject,
      })
      .from(classrooms)
      .innerJoin(
        classroomMembership,
        eq(classroomMembership.classroomId, classrooms.id),
      )
      .innerJoin(users, eq(users.id, classroomMembership.studentId))
      .where(and(eq(classrooms.teacherId, teacherId), eq(users.role, "student")))
      .orderBy(asc(classrooms.name), asc(classrooms.subject), asc(users.fullName));
    return ok(rows);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return err("DB_ERROR", message);
  }
}

// ─── Teacher classroom management ─────────────────────────────────────────

export type TeacherClassroomRow = {
  classroomId: number;
  grade: string;
  subject: string;
  studentCount: number;
};

/**
 * Classrooms taught by this teacher, with a student count per row so the
 * dashboard can render a roster summary without a second query.
 */
export async function listClassroomsForTeacher(
  teacherId: number,
): Promise<Result<TeacherClassroomRow[]>> {
  try {
    // Drizzle doesn't have a clean count-on-join helper, so we fetch
    // classrooms first and then count memberships in a single second
    // query, then merge in JS. Two queries are cheap and the JOIN+COUNT
    // approach forces us into a sub-select that's harder to read.
    const own = await db
      .select({
        classroomId: classrooms.id,
        grade: classrooms.name,
        subject: classrooms.subject,
      })
      .from(classrooms)
      .where(eq(classrooms.teacherId, teacherId))
      .orderBy(asc(classrooms.name), asc(classrooms.subject));

    if (own.length === 0) return ok([]);

    const ids = own.map((c) => c.classroomId);
    const counts = await db
      .select({
        classroomId: classroomMembership.classroomId,
        c: sql<number>`cast(count(*) as int)`,
      })
      .from(classroomMembership)
      .where(inArray(classroomMembership.classroomId, ids))
      .groupBy(classroomMembership.classroomId);

    const countMap = new Map(counts.map((r) => [r.classroomId, r.c]));
    const merged: TeacherClassroomRow[] = own.map((c) => ({
      ...c,
      studentCount: countMap.get(c.classroomId) ?? 0,
    }));
    return ok(merged);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return err("DB_ERROR", message);
  }
}

/**
 * For a set of students, return each student's phone + the phones of
 * any parents linked to them. Used to fan-out WhatsApp notifications
 * after an attendance or grades write: one message to the student and
 * one to each linked parent. Empty phone strings (kiosk-created users
 * that never set one) are filtered out.
 */
export type NotificationTarget = {
  studentId: number;
  studentName: string;
  studentPhone: string | null;
  parentPhones: string[];
};

export async function getNotificationTargetsForStudents(
  studentIds: number[],
): Promise<Result<NotificationTarget[]>> {
  if (studentIds.length === 0) return ok([]);
  try {
    const studentRows = await db
      .select({
        id: users.id,
        fullName: users.fullName,
        phone: users.phoneNumber,
      })
      .from(users)
      .where(and(inArray(users.id, studentIds), eq(users.role, "student")));

    const linkRows = await db
      .select({
        studentId: parentStudentLink.studentId,
        parentPhone: users.phoneNumber,
      })
      .from(parentStudentLink)
      .innerJoin(users, eq(users.id, parentStudentLink.parentId))
      .where(inArray(parentStudentLink.studentId, studentIds));

    const parentMap = new Map<number, string[]>();
    for (const r of linkRows) {
      if (!r.parentPhone) continue;
      const arr = parentMap.get(r.studentId) ?? [];
      if (!arr.includes(r.parentPhone)) arr.push(r.parentPhone);
      parentMap.set(r.studentId, arr);
    }

    const out: NotificationTarget[] = studentRows.map((s) => ({
      studentId: s.id,
      studentName: s.fullName,
      studentPhone: s.phone && s.phone.trim() ? s.phone : null,
      parentPhones: parentMap.get(s.id) ?? [],
    }));
    return ok(out);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return err("DB_ERROR", message);
  }
}

/**
 * Students enrolled in a classroom — but only if that classroom is owned
 * by this teacher. Used by the attendance + marks upload flows to (a)
 * resolve CSV-supplied usernames into `studentId` and (b) pre-fill the
 * editable table with the full roster. Returns an error when the
 * teacher doesn't own the classroom, so a caller can't peek at another
 * teacher's students.
 */
export type ClassroomRosterEntry = {
  studentId: number;
  fullName: string;
  username: string;
  phoneNumber: string;
};

export async function listStudentsInMyClassroom(input: {
  teacherId: number;
  classroomId: number;
}): Promise<Result<ClassroomRosterEntry[]>> {
  try {
    const [owned] = await db
      .select({ id: classrooms.id })
      .from(classrooms)
      .where(
        and(
          eq(classrooms.id, input.classroomId),
          eq(classrooms.teacherId, input.teacherId),
        ),
      )
      .limit(1);
    if (!owned) return err("UNAUTHORIZED", "you don't teach this classroom");

    const rows = await db
      .select({
        studentId: users.id,
        fullName: users.fullName,
        username: users.username,
        phoneNumber: users.phoneNumber,
      })
      .from(classroomMembership)
      .innerJoin(users, eq(users.id, classroomMembership.studentId))
      .where(
        and(
          eq(classroomMembership.classroomId, input.classroomId),
          eq(users.role, "student"),
        ),
      )
      .orderBy(asc(users.fullName));
    return ok(rows);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return err("DB_ERROR", message);
  }
}

export type CreateClassroomInput = {
  /** Grade label, e.g. "Grade 5A". Becomes `classrooms.name`. */
  grade: string;
  /** Subject taught. Becomes `classrooms.subject`. */
  subject: string;
};

/**
 * Bulk-create classrooms owned by this teacher. Each row pairs a grade
 * label with a subject. Skips silently when an identical row already
 * exists for this teacher (same school + grade + subject + teacher).
 */
export async function createClassroomsForTeacher(input: {
  teacherId: number;
  schoolId: number;
  classrooms: CreateClassroomInput[];
}): Promise<Result<{ createdCount: number; skippedCount: number; classroomIds: number[] }>> {
  if (input.classrooms.length === 0)
    return err("INVALID_INPUT", "at least one classroom is required");

  try {
    const createdIds: number[] = [];
    let skipped = 0;

    for (const entry of input.classrooms) {
      const grade = entry.grade.trim();
      const subject = entry.subject.trim();
      if (!grade || !subject) {
        return err("INVALID_INPUT", "each classroom needs a grade and subject");
      }

      const [existing] = await db
        .select({ id: classrooms.id })
        .from(classrooms)
        .where(
          and(
            eq(classrooms.schoolId, input.schoolId),
            eq(classrooms.teacherId, input.teacherId),
            eq(classrooms.name, grade),
            eq(classrooms.subject, subject),
          ),
        )
        .limit(1);

      if (existing) {
        skipped += 1;
        continue;
      }

      const [row] = await db
        .insert(classrooms)
        .values({
          schoolId: input.schoolId,
          name: grade,
          subject,
          teacherId: input.teacherId,
        })
        .returning({ id: classrooms.id });
      if (!row) return err("DB_ERROR", "failed to insert classroom");
      createdIds.push(row.id);
    }

    return ok({
      createdCount: createdIds.length,
      skippedCount: skipped,
      classroomIds: createdIds,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return err("DB_ERROR", message);
  }
}
