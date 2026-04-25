import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { getStudentDetail } from "../db/queries/dashboard.js";
import { err, ok, type Result } from "../db/queries/result.js";
import { schools, users } from "../db/schema.js";
import { uploadCertificatePdf } from "../storage/supabase-storage.js";
import { buildStudentPerformancePdf } from "./student-performance.js";

/**
 * Build + upload a per-student performance report PDF.
 *
 * Used by the agent tool `generate_performance_report`: the LLM calls
 * it when a parent asks for a printable report / PDF / summary, and we
 * weave the returned URL into the WhatsApp reply.
 *
 * The PDF lands in the same Supabase bucket as admissions certificates
 * + quiz reports, under a per-student folder so historical reports for
 * one child stay together (`<studentId>/performance-<ISO>.pdf`).
 *
 * Best-effort behaviour:
 *   - Upload failure → returns `{ ok, url: null, dryRun: true }` so
 *     the LLM can still narrate the report inline.
 *   - DB lookup failure → returns the underlying `Result` error.
 */

export type PerformanceReportOutcome = {
  url: string | null;
  studentName: string;
  dryRun: boolean;
  /** Brief stats so the LLM can compose a one-sentence summary alongside the URL. */
  highlights: {
    presentPct: number;
    quizCount: number;
    markCount: number;
    topSubject: string | null;
    weakestSubject: string | null;
  };
};

export async function generateStudentPerformanceReport(input: {
  studentId: number;
}): Promise<Result<PerformanceReportOutcome>> {
  const detail = await getStudentDetail(input.studentId);
  if (!detail.success) return detail;

  // Pull the student's school name for the PDF header — the dashboard
  // detail object doesn't carry it.
  const [schoolRow] = await db
    .select({ name: schools.name })
    .from(schools)
    .innerJoin(users, eq(users.schoolId, schools.id))
    .where(eq(users.id, input.studentId))
    .limit(1);
  const schoolName = schoolRow?.name ?? "—";

  let pdf: Buffer;
  try {
    pdf = await buildStudentPerformancePdf({
      detail: detail.data,
      schoolName,
      generatedAtIso: new Date().toISOString(),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return err("DB_ERROR", `pdf build failed: ${message}`);
  }

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `performance-${ts}.pdf`;
  const upload = await uploadCertificatePdf(filename, pdf, String(input.studentId));

  const subjectsSorted = [...detail.data.subjectBreakdown].sort(
    (a, b) => b.avgPercentage - a.avgPercentage,
  );
  const topSubject = subjectsSorted[0]?.subject ?? null;
  const weakestSubject = subjectsSorted.at(-1)?.subject ?? null;

  return ok({
    url: upload.kind === "UPLOADED" ? upload.url : null,
    studentName: detail.data.student.fullName,
    dryRun: upload.kind !== "UPLOADED",
    highlights: {
      presentPct: detail.data.attendance.presentPct,
      quizCount: detail.data.quizResults.length,
      markCount: detail.data.assignmentResults.length,
      topSubject,
      weakestSubject,
    },
  });
}
