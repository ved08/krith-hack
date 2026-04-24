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
});

const AnalyzeResponsesSchema = z.object({
  profile: AdmissionProfileSchema,
  responses: z.array(CandidateResponseSchema).min(1).max(20),
});

const E164Schema = z
  .string()
  .regex(/^\+[1-9]\d{7,14}$/, "must be E.164 phone, e.g. +919876543210");

const IntakeProfileSchema = AdmissionProfileSchema.extend({
  studentPhoneE164: E164Schema,
});

const IntakeSchema = z.object({
  schoolId: z.number().int().positive(),
  classroomId: z.number().int().positive(),
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

  const intake = await upsertAdmissionsIntake({
    schoolId: parsed.data.schoolId,
    classroomId: parsed.data.classroomId,
    parentName: parsed.data.profile.parentName,
    parentPhoneE164: parsed.data.profile.parentPhoneE164,
    studentName: parsed.data.profile.studentName,
    studentPhoneE164: parsed.data.profile.studentPhoneE164,
    parentUsername: parsed.data.parentUsername,
    studentUsername: parsed.data.studentUsername,
  });

  if (!intake.success) {
    return queryFailure(c, intake.error.code, intake.error.message);
  }

  try {
    const questionSet = parsed.data.generateQuestions
      ? await generateAdmissionsQuestions({
          profile: parsed.data.profile,
          questionCount: parsed.data.questionCount,
        })
      : null;

    return c.json({
      success: true,
      data: {
        intake: intake.data,
        questionSet,
      },
    });
  } catch (error) {
    return llmFailure(c, error);
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
    const data = await generateAdmissionsQuestions(parsed.data);
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
    const data = await analyzeAdmissionsResponses(parsed.data);
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