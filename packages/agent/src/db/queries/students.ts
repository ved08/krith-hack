import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../client.js";
import { parentStudentLink, users } from "../schema.js";
import { ok, type Result } from "./result.js";

export type LinkedStudent = { id: number; fullName: string };

export type SenderContext = {
  userId: number;
  role: "student" | "parent" | "teacher";
  schoolId: number;
  fullName: string;
  linkedStudents: LinkedStudent[];
};

/**
 * Resolve a WhatsApp sender phone (E.164) to their user record + the students
 * they have context over. For parents, returns linked children; for students,
 * returns themselves; for teachers, returns an empty list (teachers use a
 * different code path for their questions).
 */
export async function getSenderContextByPhone(
  phoneE164: string,
): Promise<Result<SenderContext | null>> {
  const [user] = await db
    .select({
      id: users.id,
      role: users.role,
      schoolId: users.schoolId,
      fullName: users.fullName,
    })
    .from(users)
    .where(eq(users.phoneNumber, phoneE164))
    .limit(1);

  if (!user) return ok(null);

  let linked: LinkedStudent[] = [];
  if (user.role === "parent") {
    const rows = await db
      .select({ id: users.id, fullName: users.fullName })
      .from(parentStudentLink)
      .innerJoin(users, eq(users.id, parentStudentLink.studentId))
      .where(eq(parentStudentLink.parentId, user.id));
    linked = rows;
  } else if (user.role === "student") {
    linked = [{ id: user.id, fullName: user.fullName }];
  }

  return ok({
    userId: user.id,
    role: user.role,
    schoolId: user.schoolId,
    fullName: user.fullName,
    linkedStudents: linked,
  });
}

export type ResolveStudentResult =
  | { kind: "RESOLVED"; studentId: number; fullName: string }
  | { kind: "MISSING"; reason: "NO_NAME_NO_LINKED" }
  | { kind: "AMBIGUOUS"; options: LinkedStudent[] };

/**
 * Given the caller's linked students and an optional name extracted from their
 * message, return the single target student. Rules:
 *   - 0 linked → MISSING
 *   - 1 linked and no name → that one (convenience)
 *   - name given → case-insensitive substring match against linked full names
 *   - 0 matches → MISSING
 *   - 1 match → RESOLVED
 *   - >1 matches → AMBIGUOUS (reply with options)
 */
export function resolveStudentFromName(
  linked: LinkedStudent[],
  rawName: string | undefined,
): ResolveStudentResult {
  if (linked.length === 0) return { kind: "MISSING", reason: "NO_NAME_NO_LINKED" };

  const needle = rawName?.trim().toLowerCase();

  if (!needle) {
    if (linked.length === 1) {
      const only = linked[0]!;
      return { kind: "RESOLVED", studentId: only.id, fullName: only.fullName };
    }
    return { kind: "AMBIGUOUS", options: linked };
  }

  const matches = linked.filter((s) => s.fullName.toLowerCase().includes(needle));
  if (matches.length === 0) return { kind: "MISSING", reason: "NO_NAME_NO_LINKED" };
  if (matches.length === 1) {
    const hit = matches[0]!;
    return { kind: "RESOLVED", studentId: hit.id, fullName: hit.fullName };
  }
  return { kind: "AMBIGUOUS", options: matches };
}

/**
 * Confirm caller is authorised to view the target student.
 * Returns true if caller is the student themself, or has a verified parent link.
 */
export async function canCallerAccessStudent(
  callerUserId: number,
  targetStudentId: number,
): Promise<boolean> {
  if (callerUserId === targetStudentId) return true;
  const [link] = await db
    .select({ id: parentStudentLink.id })
    .from(parentStudentLink)
    .where(
      and(
        eq(parentStudentLink.parentId, callerUserId),
        eq(parentStudentLink.studentId, targetStudentId),
      ),
    )
    .limit(1);
  return !!link;
}

/**
 * Fetch minimal student identity (for write paths that need school_id).
 */
export async function getStudentIdentity(studentId: number) {
  const [row] = await db
    .select({
      id: users.id,
      fullName: users.fullName,
      schoolId: users.schoolId,
      role: users.role,
    })
    .from(users)
    .where(and(eq(users.id, studentId), eq(users.role, "student")))
    .limit(1);
  return row ?? null;
}

/** Bulk identity lookup for batch write paths. */
export async function getStudentIdentitiesByIds(studentIds: number[]) {
  if (studentIds.length === 0) return [];
  return db
    .select({
      id: users.id,
      fullName: users.fullName,
      schoolId: users.schoolId,
      role: users.role,
    })
    .from(users)
    .where(and(inArray(users.id, studentIds), eq(users.role, "student")));
}

export type ParentAttendanceRecipient = {
  studentId: number;
  schoolId: number;
  studentName: string;
  parentId: number;
  parentName: string;
  parentPhoneE164: string;
};

/**
 * Parent recipients for daily attendance broadcasts.
 * Returns one row per (student, parent) link.
 */
export async function getParentAttendanceRecipients(): Promise<
  ParentAttendanceRecipient[]
> {
  const rows = await db.execute(sql`
    SELECT
      s.id           AS student_id,
      s.school_id    AS school_id,
      s.full_name    AS student_name,
      p.id           AS parent_id,
      p.full_name    AS parent_name,
      p.phone_number AS parent_phone_e164
    FROM parent_student_link l
    JOIN users s ON s.id = l.student_id
    JOIN users p ON p.id = l.parent_id
    WHERE s.role = 'student'
      AND p.role = 'parent'
    ORDER BY s.id, p.id
  `);

  return (rows as unknown as Array<{
    student_id: number;
    school_id: number;
    student_name: string;
    parent_id: number;
    parent_name: string;
    parent_phone_e164: string;
  }>).map((r) => ({
    studentId: r.student_id,
    schoolId: r.school_id,
    studentName: r.student_name,
    parentId: r.parent_id,
    parentName: r.parent_name,
    parentPhoneE164: r.parent_phone_e164,
  }));
}
