import {
  generateClassroomQuiz,
  getQuizForStudent,
  insertClassroomQuiz,
  listQuizzesForStudent,
  listTeacherQuizzes,
  lookupStudentByUsername,
  submitClassroomQuiz,
  type GeneratedQuiz,
  type QuizResponse,
} from "@campus/agent";
import { Hono } from "hono";
import { jwt } from "hono/jwt";
import { z } from "zod";
import { env } from "../env.js";
import type { TeacherJwtPayload } from "./auth.js";

/**
 * Teacher quiz authoring + student quiz taking.
 *
 * Teacher routes sit under /teacher/quizzes (JWT-gated).
 * Student routes are public (mirroring the kiosk flow) — students
 * identify themselves via username on /student/lookup and then hit
 * /student/:id/quizzes/* endpoints. This is hackathon-grade trust:
 * anyone with a valid username can see/submit quizzes for that
 * student. Real deployment would add a student-auth flow.
 */

export const quizzesRouter = new Hono();

// ─── Teacher (JWT) ────────────────────────────────────────────────────────

quizzesRouter.use("/teacher/*", jwt({ secret: env.JWT_SECRET, alg: "HS256" }));

const CreateQuizSchema = z.object({
  classroomId: z.number().int().positive(),
  title: z.string().min(1).max(120),
  topic: z.string().min(2).max(200),
  difficulty: z.enum(["easy", "medium", "hard"]),
  questionCount: z.number().int().min(3).max(20),
  timeLimitMinutes: z.number().int().min(1).max(240).nullable().optional(),
  instructions: z.string().max(600).nullable().optional(),
  dueDate: z.string().max(40).optional(),
});

quizzesRouter.post("/teacher/quizzes", async (c) => {
  const payload = c.get("jwtPayload") as TeacherJwtPayload;
  const body = await c.req.json().catch(() => null);
  const parsed = CreateQuizSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { success: false, error: { code: "INVALID_INPUT", message: parsed.error.message } },
      400,
    );
  }

  // `insertClassroomQuiz` blindly trusts the caller; ownership is
  // enforced here via a fresh classroom lookup through the agent
  // package's existing `listClassroomsForTeacher` helper (re-used so
  // this route doesn't reach into the ORM directly).
  const teacherClassrooms = await import("@campus/agent").then((m) =>
    m.listClassroomsForTeacher(payload.sub),
  );
  if (!teacherClassrooms.success) {
    return c.json({ success: false, error: teacherClassrooms.error }, 500);
  }
  const owned = teacherClassrooms.data.find(
    (r) => r.classroomId === parsed.data.classroomId,
  );
  if (!owned) {
    return c.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "you don't teach this classroom" } },
      403,
    );
  }

  let generated: GeneratedQuiz;
  try {
    generated = await generateClassroomQuiz({
      title: parsed.data.title,
      subject: owned.subject,
      topic: parsed.data.topic,
      difficulty: parsed.data.difficulty,
      questionCount: parsed.data.questionCount,
      timeLimitMinutes: parsed.data.timeLimitMinutes ?? null,
      instructions: parsed.data.instructions ?? null,
      gradeLabel: owned.grade,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return c.json(
      { success: false, error: { code: "LLM_ERROR", message } },
      502,
    );
  }

  const due = parsed.data.dueDate ? new Date(parsed.data.dueDate) : null;
  if (due && Number.isNaN(due.getTime())) {
    return c.json(
      { success: false, error: { code: "INVALID_INPUT", message: "dueDate is not a valid date" } },
      400,
    );
  }

  const saved = await insertClassroomQuiz({
    quiz: generated,
    classroomId: parsed.data.classroomId,
    createdBy: payload.sub,
    dueDate: due,
  });
  if (!saved.success) {
    return c.json({ success: false, error: saved.error }, 500);
  }

  return c.json({
    success: true,
    data: {
      quizId: saved.data.quizId,
      title: generated.title,
      subject: generated.subject,
      topic: generated.topic,
      difficulty: generated.difficulty,
      questionCount: generated.questionCount,
      maxScore: generated.maxScore,
    },
  });
});

quizzesRouter.get("/teacher/quizzes", async (c) => {
  const payload = c.get("jwtPayload") as TeacherJwtPayload;
  const result = await listTeacherQuizzes(payload.sub);
  if (!result.success) {
    return c.json({ success: false, error: result.error }, 500);
  }
  return c.json({ success: true, data: result.data });
});

// ─── Student (public) ─────────────────────────────────────────────────────

const StudentLookupSchema = z.object({
  username: z.string().min(1).max(120),
});

quizzesRouter.post("/student/lookup", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = StudentLookupSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { success: false, error: { code: "INVALID_INPUT", message: parsed.error.message } },
      400,
    );
  }
  const result = await lookupStudentByUsername(parsed.data.username.trim());
  if (!result.success) {
    const status = result.error.code === "NOT_FOUND" ? 404 : 401;
    return c.json({ success: false, error: result.error }, status);
  }
  return c.json({ success: true, data: result.data });
});

quizzesRouter.get("/student/:studentId/quizzes", async (c) => {
  const studentId = Number.parseInt(c.req.param("studentId"), 10);
  if (!Number.isFinite(studentId) || studentId <= 0) {
    return c.json(
      { success: false, error: { code: "INVALID_INPUT", message: "bad studentId" } },
      400,
    );
  }
  const result = await listQuizzesForStudent(studentId);
  if (!result.success) {
    return c.json({ success: false, error: result.error }, 500);
  }
  return c.json({ success: true, data: result.data });
});

quizzesRouter.get("/student/:studentId/quizzes/:quizId", async (c) => {
  const studentId = Number.parseInt(c.req.param("studentId"), 10);
  const quizId = c.req.param("quizId");
  if (!Number.isFinite(studentId) || studentId <= 0 || !quizId) {
    return c.json(
      { success: false, error: { code: "INVALID_INPUT", message: "bad params" } },
      400,
    );
  }
  const result = await getQuizForStudent({ quizId, studentId });
  if (!result.success) {
    const status =
      result.error.code === "NOT_FOUND"
        ? 404
        : result.error.code === "UNAUTHORIZED"
        ? 403
        : 500;
    return c.json({ success: false, error: result.error }, status);
  }
  return c.json({ success: true, data: result.data });
});

const SubmitQuizSchema = z.object({
  responses: z
    .array(
      z.object({
        questionId: z.string().min(1).max(10),
        question: z.string().min(2).max(600),
        answer: z.string().min(1).max(2000),
      }),
    )
    .min(1)
    .max(40),
});

quizzesRouter.post(
  "/student/:studentId/quizzes/:quizId/submit",
  async (c) => {
    const studentId = Number.parseInt(c.req.param("studentId"), 10);
    const quizId = c.req.param("quizId");
    if (!Number.isFinite(studentId) || studentId <= 0 || !quizId) {
      return c.json(
        { success: false, error: { code: "INVALID_INPUT", message: "bad params" } },
        400,
      );
    }
    const body = await c.req.json().catch(() => null);
    const parsed = SubmitQuizSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { success: false, error: { code: "INVALID_INPUT", message: parsed.error.message } },
        400,
      );
    }

    const result = await submitClassroomQuiz({
      quizId,
      studentId,
      responses: parsed.data.responses as QuizResponse[],
    });
    if (!result.success) {
      const status =
        result.error.code === "NOT_FOUND"
          ? 404
          : result.error.code === "UNAUTHORIZED"
          ? 403
          : result.error.code === "LLM_ERROR"
          ? 502
          : 500;
      return c.json({ success: false, error: result.error }, status);
    }
    return c.json({ success: true, data: result.data });
  },
);
