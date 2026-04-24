import { and, desc, eq } from "drizzle-orm";
import { db } from "../client.js";
import {
  admissionsEvaluations,
  admissionsQuestionSets,
  classroomMembership,
  classrooms,
  parentStudentLink,
  schools,
  users,
} from "../schema.js";
import { err, ok, type ErrorCode, type Result } from "./result.js";

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
  /** Parent/student name renames detected (old → new); empty when none. */
  renamed: Array<{ userId: number; role: "parent" | "student"; from: string; to: string }>;
};

/**
 * Sentinel thrown from inside the transaction to force Postgres to ROLL BACK.
 * Drizzle's `db.transaction(cb)` commits on return (even of an error-shaped
 * value) — only throwing rolls back. The outer wrapper catches this sentinel
 * and converts it back into the `Result` envelope the rest of the codebase
 * expects. Any other thrown error is treated as an unexpected DB failure.
 */
class RollbackAs extends Error {
  readonly code: ErrorCode;
  constructor(code: ErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

/**
 * Persist intake profile for admissions kiosk into normalized identity tables:
 *   - users (parent + student)
 *   - parent_student_link
 *   - classroom_membership
 *
 * Idempotent by school + phone for user upserts, and by unique constraints for
 * link/enrollment rows. Atomic: if any step fails after a prior write, the
 * whole transaction rolls back — no orphan parent rows.
 */
export async function upsertAdmissionsIntake(
  input: UpsertAdmissionsIntakeInput,
): Promise<Result<UpsertAdmissionsIntakeOutput>> {
  const parentName = input.parentName.trim();
  const studentName = input.studentName.trim();
  if (!parentName) return err("INVALID_INPUT", "parentName is required");
  if (!studentName) return err("INVALID_INPUT", "studentName is required");

  try {
    const result = await db.transaction(async (tx) => {
      const [school] = await tx
        .select({ id: schools.id, name: schools.name })
        .from(schools)
        .where(eq(schools.id, input.schoolId))
        .limit(1);
      if (!school) throw new RollbackAs("NOT_FOUND", `school ${input.schoolId} not found`);

      const [classroom] = await tx
        .select({ id: classrooms.id, name: classrooms.name, schoolId: classrooms.schoolId })
        .from(classrooms)
        .where(eq(classrooms.id, input.classroomId))
        .limit(1);
      if (!classroom) {
        throw new RollbackAs("NOT_FOUND", `classroom ${input.classroomId} not found`);
      }
      if (classroom.schoolId !== input.schoolId) {
        throw new RollbackAs("UNAUTHORIZED", "classroom belongs to a different school");
      }

      const renamed: UpsertAdmissionsIntakeOutput["renamed"] = [];

      const parent = await getOrCreateUserByPhone(tx, {
        schoolId: input.schoolId,
        role: "parent",
        fullName: parentName,
        phoneNumber: input.parentPhoneE164,
        preferredUsername: input.parentUsername,
        renamed,
      });

      const student = await getOrCreateUserByPhone(tx, {
        schoolId: input.schoolId,
        role: "student",
        fullName: studentName,
        phoneNumber: input.studentPhoneE164,
        preferredUsername: input.studentUsername,
        renamed,
      });

      const verifiedAt = input.verifiedAt ?? new Date();
      const linkInsert = await tx
        .insert(parentStudentLink)
        .values({
          parentId: parent.id,
          studentId: student.id,
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
          studentId: student.id,
        })
        .onConflictDoNothing({
          target: [classroomMembership.classroomId, classroomMembership.studentId],
        })
        .returning({ id: classroomMembership.id });

      return {
        schoolId: school.id,
        schoolName: school.name,
        classroomId: classroom.id,
        classroomName: classroom.name,
        parentUserId: parent.id,
        studentUserId: student.id,
        parentCreated: parent.created,
        studentCreated: student.created,
        parentStudentLinkCreated: linkInsert.length > 0,
        classroomEnrollmentCreated: enrollmentInsert.length > 0,
        renamed,
      } satisfies UpsertAdmissionsIntakeOutput;
    });

    return ok(result);
  } catch (e) {
    if (e instanceof RollbackAs) return err(e.code, e.message);
    const message = e instanceof Error ? e.message : String(e);
    return err("DB_ERROR", message);
  }
}

/**
 * Get existing user by (schoolId, phoneNumber) or create one.
 *
 * If the user exists under a different role (e.g. a parent phone being reused
 * as a student), we throw a RollbackAs INVALID_INPUT — the transaction is
 * rolled back so we don't partially apply.
 *
 * If the name in the DB differs from the intake payload, we update it and
 * record the rename into the `renamed` buffer so the caller can surface it.
 */
async function getOrCreateUserByPhone(
  tx: WritableDb,
  input: {
    schoolId: number;
    role: "parent" | "student";
    fullName: string;
    phoneNumber: string;
    preferredUsername?: string;
    renamed: UpsertAdmissionsIntakeOutput["renamed"];
  },
): Promise<{ id: number; created: boolean }> {
  const [existing] = await tx
    .select({ id: users.id, role: users.role, fullName: users.fullName })
    .from(users)
    .where(and(eq(users.schoolId, input.schoolId), eq(users.phoneNumber, input.phoneNumber)))
    .limit(1);

  if (existing) {
    if (existing.role !== input.role) {
      throw new RollbackAs(
        "INVALID_INPUT",
        `phone ${input.phoneNumber} is already registered as ${existing.role}, cannot reuse as ${input.role}`,
      );
    }

    if (existing.fullName !== input.fullName) {
      input.renamed.push({
        userId: existing.id,
        role: input.role,
        from: existing.fullName,
        to: input.fullName,
      });
      await tx
        .update(users)
        .set({ fullName: input.fullName, updatedAt: new Date() })
        .where(eq(users.id, existing.id));
    }

    return { id: existing.id, created: false };
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
      // Leave NULL — the user hasn't set a real credential yet. Any future
      // login flow should reject login for users with passwordSetAt IS NULL
      // (until they go through a set-password step).
      passwordSetAt: null,
      role: input.role,
      phoneNumber: input.phoneNumber,
      fullName: input.fullName,
    })
    .returning({ id: users.id });

  if (!inserted) {
    throw new RollbackAs("DB_ERROR", `failed to insert ${input.role}`);
  }
  return { id: inserted.id, created: true };
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

// ===========================================================================
// Phase 2 persistence — question sets + Learning DNA evaluations
// ===========================================================================

export type InsertQuestionSetInput = {
  id: string; // UUID supplied by caller so the return value can be referenced
  schoolId?: number | null;
  studentId?: number | null;
  parentPhoneE164?: string | null;
  studentName: string;
  profile: unknown; // full AdmissionProfile snapshot
  gradeBand: string;
  rationale: string;
  questions: unknown; // array of AdmissionQuestion
  model: string;
};

/** Persist an LLM-generated admissions question set. Best-effort: if it fails,
 * the caller still has the in-memory set to return. */
export async function insertAdmissionsQuestionSet(
  input: InsertQuestionSetInput,
): Promise<Result<{ id: string }>> {
  try {
    const [row] = await db
      .insert(admissionsQuestionSets)
      .values({
        id: input.id,
        schoolId: input.schoolId ?? null,
        studentId: input.studentId ?? null,
        parentPhoneE164: input.parentPhoneE164 ?? null,
        studentName: input.studentName,
        profile: input.profile,
        gradeBand: input.gradeBand,
        rationale: input.rationale,
        questions: input.questions,
        model: input.model,
      })
      .onConflictDoNothing({ target: admissionsQuestionSets.id })
      .returning({ id: admissionsQuestionSets.id });
    if (!row) {
      // ID already existed — treat as success since we have the same UUID.
      return ok({ id: input.id });
    }
    return ok({ id: row.id });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return err("DB_ERROR", message);
  }
}

export type InsertEvaluationInput = {
  id: string;
  schoolId?: number | null;
  studentId?: number | null;
  questionSetId?: string | null;
  parentPhoneE164?: string | null;
  studentName: string;
  profile: unknown;
  responses: unknown; // array of CandidateResponse
  analysis: unknown; // full LearningDnaAnalysis
  overallScore: number;
  readinessBand: string;
  model: string;
};

/** Persist a Learning DNA evaluation. */
export async function insertAdmissionsEvaluation(
  input: InsertEvaluationInput,
): Promise<Result<{ id: string }>> {
  try {
    const [row] = await db
      .insert(admissionsEvaluations)
      .values({
        id: input.id,
        schoolId: input.schoolId ?? null,
        studentId: input.studentId ?? null,
        questionSetId: input.questionSetId ?? null,
        parentPhoneE164: input.parentPhoneE164 ?? null,
        studentName: input.studentName,
        profile: input.profile,
        responses: input.responses,
        analysis: input.analysis,
        overallScore: input.overallScore.toString(),
        readinessBand: input.readinessBand,
        model: input.model,
      })
      .onConflictDoNothing({ target: admissionsEvaluations.id })
      .returning({ id: admissionsEvaluations.id });
    if (!row) return ok({ id: input.id });
    return ok({ id: row.id });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return err("DB_ERROR", message);
  }
}

/** Attach a generated certificate URL to an existing evaluation row. */
export async function updateEvaluationCertificateUrl(
  evaluationId: string,
  certificateUrl: string,
): Promise<Result<void>> {
  try {
    const res = await db
      .update(admissionsEvaluations)
      .set({ certificateUrl })
      .where(eq(admissionsEvaluations.id, evaluationId))
      .returning({ id: admissionsEvaluations.id });
    if (res.length === 0)
      return err("NOT_FOUND", `evaluation ${evaluationId} not found`);
    return ok(undefined);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return err("DB_ERROR", message);
  }
}

/** Most-recent evaluation for a student. Returns null when none exist. */
export async function getLatestAdmissionsEvaluation(
  studentId: number,
): Promise<Result<{
  id: string;
  evaluatedAt: string;
  overallScore: number;
  readinessBand: string;
  model: string;
  analysis: unknown;
  profile: unknown;
  responses: unknown;
} | null>> {
  try {
    const [row] = await db
      .select()
      .from(admissionsEvaluations)
      .where(eq(admissionsEvaluations.studentId, studentId))
      .orderBy(desc(admissionsEvaluations.evaluatedAt))
      .limit(1);
    if (!row) return ok(null);
    return ok({
      id: row.id,
      evaluatedAt:
        row.evaluatedAt instanceof Date
          ? row.evaluatedAt.toISOString()
          : String(row.evaluatedAt),
      overallScore: Number(row.overallScore),
      readinessBand: row.readinessBand,
      model: row.model,
      analysis: row.analysis,
      profile: row.profile,
      responses: row.responses,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return err("DB_ERROR", message);
  }
}

/** True if the user has set a real password (i.e. went through a login setup
 * flow). Kiosk-created users always return false until they set one. */
export function isPasswordSet(user: { passwordSetAt: Date | string | null }): boolean {
  return user.passwordSetAt != null;
}
