import { asc, eq } from "drizzle-orm";
import { db } from "../client.js";
import { classrooms, schools } from "../schema.js";
import { err, ok, type Result } from "./result.js";

/**
 * Read-only lookup helpers used by the kiosk + teacher dashboard to
 * populate "pick from an existing record" dropdowns — preventing
 * typos like `schoolId=999` that don't exist.
 */

export type SchoolOption = { id: number; name: string };
export type ClassroomOption = { id: number; name: string };

export async function listSchools(): Promise<Result<SchoolOption[]>> {
  try {
    const rows = await db
      .select({ id: schools.id, name: schools.name })
      .from(schools)
      .orderBy(asc(schools.name));
    return ok(rows);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return err("DB_ERROR", message);
  }
}

export async function listClassroomsBySchool(
  schoolId: number,
): Promise<Result<ClassroomOption[]>> {
  try {
    const rows = await db
      .select({ id: classrooms.id, name: classrooms.name })
      .from(classrooms)
      .where(eq(classrooms.schoolId, schoolId))
      .orderBy(asc(classrooms.name));
    return ok(rows);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return err("DB_ERROR", message);
  }
}

export type GradeOption = {
  /** Grade label (e.g. "Grade 5A") — same value stored in classrooms.name. */
  grade: string;
  /** How many subject-classrooms exist for this grade — useful UX hint. */
  classroomCount: number;
  /** All distinct subjects offered for this grade. */
  subjects: string[];
};

/**
 * Distinct grade labels in a school, with the subjects offered under
 * each. The kiosk uses this to populate its "pick your grade" dropdown
 * — and to tell the prospect "you'll join 5 classes" before submission.
 */
export async function listGradesForSchool(
  schoolId: number,
): Promise<Result<GradeOption[]>> {
  try {
    const rows = await db
      .select({
        grade: classrooms.name,
        subject: classrooms.subject,
      })
      .from(classrooms)
      .where(eq(classrooms.schoolId, schoolId))
      .orderBy(asc(classrooms.name), asc(classrooms.subject));

    const map = new Map<string, GradeOption>();
    for (const r of rows) {
      let bucket = map.get(r.grade);
      if (!bucket) {
        bucket = { grade: r.grade, classroomCount: 0, subjects: [] };
        map.set(r.grade, bucket);
      }
      bucket.classroomCount += 1;
      if (!bucket.subjects.includes(r.subject)) bucket.subjects.push(r.subject);
    }
    return ok([...map.values()]);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return err("DB_ERROR", message);
  }
}

