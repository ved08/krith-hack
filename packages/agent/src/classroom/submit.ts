import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  getQuizFull,
  insertQuizSubmission,
  updateSubmissionReportUrl,
} from "../db/queries/quizzes.js";
import { err, ok, type Result } from "../db/queries/result.js";
import { parentStudentLink, users } from "../db/schema.js";
import { sendWhatsAppMessage } from "../notifications/whatsapp.js";
import { uploadCertificatePdf } from "../storage/supabase-storage.js";
import { buildQuizReportPdf } from "./quiz-report.js";
import { scoreAndAnalyzeQuiz, type QuizAnalysis, type QuizResponse } from "./quizzes.js";

/**
 * Full student quiz-submission pipeline: LLM scores the responses,
 * the submission + analysis are persisted, a report PDF is built and
 * uploaded, and the parent(s) + the student get a WhatsApp summary
 * with the public report link.
 *
 * PDF + WhatsApp steps are best-effort: failures are logged and the
 * returned payload has flags the caller can surface in the UI.
 */

export type SubmitQuizInput = {
  quizId: string;
  studentId: number;
  responses: QuizResponse[];
};

export type SubmitQuizOutput = {
  submissionId: string;
  score: number;
  maxScore: number;
  percentage: number;
  analysis: QuizAnalysis;
  reportUrl: string | null;
  whatsappSent: number;
  whatsappFailed: number;
};

export async function submitClassroomQuiz(
  input: SubmitQuizInput,
): Promise<Result<SubmitQuizOutput>> {
  const quizRes = await getQuizFull(input.quizId);
  if (!quizRes.success) return quizRes;

  const [student] = await db
    .select({ id: users.id, fullName: users.fullName, phone: users.phoneNumber })
    .from(users)
    .where(eq(users.id, input.studentId))
    .limit(1);
  if (!student) return err("NOT_FOUND", `student ${input.studentId} not found`);

  let graded;
  try {
    graded = await scoreAndAnalyzeQuiz({
      quiz: quizRes.data,
      studentName: student.fullName,
      responses: input.responses,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return err("LLM_ERROR", message);
  }

  const submissionId = randomUUID();
  const persisted = await insertQuizSubmission({
    submissionId,
    quizId: input.quizId,
    studentId: input.studentId,
    responses: input.responses,
    analysis: graded.analysis,
    score: graded.score,
    maxScore: graded.maxScore,
    percentage: graded.percentage,
    reportUrl: null,
  });
  if (!persisted.success) return persisted;

  // PDF + upload (best effort).
  let reportUrl: string | null = null;
  try {
    const pdf = await buildQuizReportPdf({
      studentName: student.fullName,
      quizTitle: quizRes.data.title,
      subject: quizRes.data.subject,
      topic: quizRes.data.topic,
      difficulty: quizRes.data.difficulty,
      score: graded.score,
      maxScore: graded.maxScore,
      percentage: graded.percentage,
      analysis: graded.analysis,
      submittedAtIso: new Date().toISOString(),
    });
    const upload = await uploadCertificatePdf(
      `quiz-${persisted.data.submissionId}.pdf`,
      pdf,
      String(input.studentId),
    );
    if (upload.kind === "UPLOADED") {
      reportUrl = upload.url;
      await updateSubmissionReportUrl(persisted.data.submissionId, reportUrl);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[quiz-submit] report pipeline failed: ${message}`);
  }

  // WhatsApp fan-out to student + linked parents.
  const notify = await fanOutQuizNotification({
    studentId: input.studentId,
    studentPhone: student.phone,
    studentName: student.fullName,
    quizTitle: quizRes.data.title,
    subject: quizRes.data.subject,
    score: graded.score,
    maxScore: graded.maxScore,
    percentage: graded.percentage,
    summary: graded.analysis.summary,
    reportUrl,
  });

  return ok({
    submissionId: persisted.data.submissionId,
    score: graded.score,
    maxScore: graded.maxScore,
    percentage: graded.percentage,
    analysis: graded.analysis,
    reportUrl,
    whatsappSent: notify.sent,
    whatsappFailed: notify.failed,
  });
}

async function fanOutQuizNotification(input: {
  studentId: number;
  studentPhone: string;
  studentName: string;
  quizTitle: string;
  subject: string;
  score: number;
  maxScore: number;
  percentage: number;
  summary: string;
  reportUrl: string | null;
}): Promise<{ sent: number; failed: number }> {
  const parentRows = await db
    .select({ phone: users.phoneNumber })
    .from(parentStudentLink)
    .innerJoin(users, eq(users.id, parentStudentLink.parentId))
    .where(eq(parentStudentLink.studentId, input.studentId));

  const phones = new Set<string>();
  if (input.studentPhone?.trim()) phones.add(input.studentPhone);
  for (const p of parentRows) if (p.phone?.trim()) phones.add(p.phone);
  if (phones.size === 0) return { sent: 0, failed: 0 };

  const pct = Math.round(input.percentage);
  const body = [
    `📝 *${input.subject}* — ${input.quizTitle}`,
    `${input.studentName} scored ${input.score}/${input.maxScore} (${pct}%).`,
    "",
    input.summary,
    input.reportUrl ? `\n📄 Full report: ${input.reportUrl}` : "",
    "— Campus Cortex",
  ]
    .filter(Boolean)
    .join("\n");

  let sent = 0;
  let failed = 0;
  for (const phone of phones) {
    const r = await sendWhatsAppMessage(phone, body);
    if (r.kind === "SENT" || r.kind === "DRY_RUN") sent += 1;
    else failed += 1;
  }
  return { sent, failed };
}
