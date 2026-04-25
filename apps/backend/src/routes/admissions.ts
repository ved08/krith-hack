import {
  AdmissionProfileSchema,
  CandidateResponseSchema,
  analyzeAdmissionsResponses,
  generateAdmissionsQuestions,
  upsertAdmissionsIntake,
} from "@campus/agent";
import { Hono, type Context } from "hono";
import { z } from "zod";

export const admissionsRouter = new Hono();

const GenerateQuestionsSchema = z.object({
  profile: AdmissionProfileSchema,
  questionCount: z.number().int().min(5).max(12).optional(),
  // Optional persistence context. If both schoolId and studentId are present
  // the generated set is persisted and linked to the student row.
  schoolId: z.number().int().positive().optional(),
  studentId: z.number().int().positive().optional(),
});

const AnalyzeResponsesSchema = z.object({
  profile: AdmissionProfileSchema,
  responses: z.array(CandidateResponseSchema).min(1).max(20),
  // Optional persistence context — same semantics as the question route.
  // `questionSetId` links the evaluation back to the set that spawned it.
  schoolId: z.number().int().positive().optional(),
  studentId: z.number().int().positive().optional(),
  questionSetId: z.string().uuid().optional(),
});

const E164Schema = z
  .string()
  .regex(/^\+[1-9]\d{7,14}$/, "must be E.164 phone, e.g. +919876543210");

const IntakeProfileSchema = AdmissionProfileSchema.extend({
  studentPhoneE164: E164Schema,
});

const IntakeSchema = z.object({
  schoolId: z.number().int().positive(),
  /**
   * Grade label, e.g. "Grade 5A". The student will be enrolled in
   * every classroom row in this school whose `name` matches.
   */
  grade: z.string().min(1).max(80),
  profile: IntakeProfileSchema,
  parentUsername: z.string().min(3).max(64).optional(),
  studentUsername: z.string().min(3).max(64).optional(),
  questionCount: z.number().int().min(5).max(12).optional(),
  generateQuestions: z.boolean().default(true),
});

admissionsRouter.post("/admissions/phase2/intake", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = IntakeSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { success: false, error: { code: "INVALID_INPUT", message: parsed.error.message } },
      400,
    );
  }

  // 1. DB intake — wrapped so raw drizzle/network errors surface as structured
  //    Result instead of a generic 500.
  let intake: Awaited<ReturnType<typeof upsertAdmissionsIntake>>;
  try {
    intake = await upsertAdmissionsIntake({
      schoolId: parsed.data.schoolId,
      grade: parsed.data.grade,
      parentName: parsed.data.profile.parentName,
      parentPhoneE164: parsed.data.profile.parentPhoneE164,
      studentName: parsed.data.profile.studentName,
      studentPhoneE164: parsed.data.profile.studentPhoneE164,
      parentUsername: parsed.data.parentUsername,
      studentUsername: parsed.data.studentUsername,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return c.json(
      { success: false, error: { code: "DB_ERROR", message } },
      500,
    );
  }

  if (!intake.success) {
    return queryFailure(c, intake.error.code, intake.error.message);
  }

  // 2. Question generation — OPTIONAL and independently failable. We never
  //    roll back the intake over an LLM problem; we return the intake plus a
  //    structured `questionSetError` the kiosk can surface.
  if (!parsed.data.generateQuestions) {
    return c.json({ success: true, data: { intake: intake.data, questionSet: null } });
  }

  try {
    // Intake gave us a studentUserId and schoolId — persist the question set
    // against the student so it can be retrieved later (kiosk certificate
    // re-print, analyst review, etc.).
    const questionSet = await generateAdmissionsQuestions({
      profile: parsed.data.profile,
      questionCount: parsed.data.questionCount,
      persist: {
        schoolId: intake.data.schoolId,
        studentId: intake.data.studentUserId,
      },
    });
    return c.json({ success: true, data: { intake: intake.data, questionSet } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown LLM error";
    const isConfigError = message.includes("GEMINI_API_KEY");
    // Partial success: intake saved, questions not generated. HTTP 200 so the
    // kiosk treats this as a normal flow and can retry /questions separately.
    return c.json({
      success: true,
      data: {
        intake: intake.data,
        questionSet: null,
        questionSetError: {
          code: isConfigError ? "CONFIG_ERROR" : "LLM_ERROR",
          message,
        },
      },
    });
  }
});

admissionsRouter.post("/admissions/phase2/questions", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = GenerateQuestionsSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { success: false, error: { code: "INVALID_INPUT", message: parsed.error.message } },
      400,
    );
  }

  try {
    // Only persist when BOTH school + student are supplied — a standalone
    // question-generation call without a bound student stays in-memory only.
    const persist =
      parsed.data.schoolId != null && parsed.data.studentId != null
        ? { schoolId: parsed.data.schoolId, studentId: parsed.data.studentId }
        : undefined;
    const data = await generateAdmissionsQuestions({
      profile: parsed.data.profile,
      questionCount: parsed.data.questionCount,
      persist,
    });
    return c.json({ success: true, data });
  } catch (error) {
    return llmFailure(c, error);
  }
});

admissionsRouter.post("/admissions/phase2/analyze", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = AnalyzeResponsesSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { success: false, error: { code: "INVALID_INPUT", message: parsed.error.message } },
      400,
    );
  }

  try {
    // Persist the Learning DNA when we have identifiers to tie it to. The
    // questionSetId is optional — it simply lets analysts join evaluations
    // to the originating set.
    const persist =
      parsed.data.schoolId != null && parsed.data.studentId != null
        ? {
            schoolId: parsed.data.schoolId,
            studentId: parsed.data.studentId,
            questionSetId: parsed.data.questionSetId ?? null,
          }
        : undefined;
    const data = await analyzeAdmissionsResponses({
      profile: parsed.data.profile,
      responses: parsed.data.responses,
      persist,
    });
    return c.json({ success: true, data });
  } catch (error) {
    return llmFailure(c, error);
  }
});

function llmFailure(c: Context, error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown LLM error";
  const isConfigError = message.includes("GEMINI_API_KEY");
  return c.json(
    {
      success: false,
      error: {
        code: isConfigError ? "CONFIG_ERROR" : "LLM_ERROR",
        message,
      },
    },
    isConfigError ? 500 : 502,
  );
}

function queryFailure(c: Context, code: string, message: string) {
  const status =
    code === "NOT_FOUND"
      ? 404
      : code === "UNAUTHORIZED"
      ? 403
      : code === "DB_ERROR"
      ? 500
      : 400;

  return c.json(
    {
      success: false,
      error: {
        code,
        message,
      },
    },
    status,
  );
}