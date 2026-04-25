import { randomUUID } from "node:crypto";
import { z } from "zod";
import { env } from "../config/env.js";
import { GEMINI_MODEL, invokeGeminiJson } from "../llm/gemini-json.js";

/**
 * Teacher-created, AI-generated classroom quizzes.
 *
 * Flow mirrors the admissions Phase 2 pipeline but scoped to an
 * enrolled student in a classroom:
 *   1. Teacher supplies metadata (topic, difficulty, question count).
 *   2. Gemini produces a structured question set.
 *   3. Student fills responses.
 *   4. Gemini scores them and writes a learning report.
 *   5. Caller uploads a PDF + WhatsApps the parent (handled elsewhere).
 */

export const QuizDifficultySchema = z.enum(["easy", "medium", "hard"]);
export type QuizDifficulty = z.infer<typeof QuizDifficultySchema>;

const AnswerTypeSchema = z.enum(["mcq", "short_text", "number"]);

export const QuizQuestionSchema = z.object({
  id: z.string().min(1).max(10),
  question: z.string().min(8).max(400),
  answerType: AnswerTypeSchema,
  // For mcq: exactly one of `options` must match `correctAnswer`.
  options: z.array(z.string().min(1).max(200)).min(2).max(6).optional(),
  // For mcq + number: authoritative answer. For short_text: a model
  // answer used as a rubric hint for scoring.
  correctAnswer: z.string().min(1).max(400),
  points: z.number().min(1).max(20),
  rubricHint: z.string().min(5).max(240),
});
export type QuizQuestion = z.infer<typeof QuizQuestionSchema>;

const GenerationOutputSchema = z.object({
  questions: z.array(QuizQuestionSchema).min(3).max(20),
});

export type QuizMeta = {
  title: string;
  subject: string;
  topic: string;
  difficulty: QuizDifficulty;
  questionCount: number;
  timeLimitMinutes?: number | null;
  instructions?: string | null;
  /** Target grade level, e.g. "Grade 5A" — helps Gemini calibrate difficulty. */
  gradeLabel?: string;
};

export type GeneratedQuiz = {
  quizId: string;
  title: string;
  subject: string;
  topic: string;
  difficulty: QuizDifficulty;
  questionCount: number;
  timeLimitMinutes: number | null;
  instructions: string | null;
  questions: QuizQuestion[];
  maxScore: number;
  model: string;
};

// ─── Generation ──────────────────────────────────────────────────────────

export async function generateClassroomQuiz(
  meta: QuizMeta,
): Promise<GeneratedQuiz> {
  const questions = env.MOCK_LLM
    ? buildMockQuiz(meta)
    : await generateWithGemini(meta);

  // Normalize ids so IDs are stable Q1..Qn regardless of what Gemini produced.
  const normalized = questions.slice(0, meta.questionCount).map((q, i) => ({
    ...q,
    id: `Q${i + 1}`,
    points: Math.max(1, Math.round(q.points)),
  }));

  const maxScore = normalized.reduce((sum, q) => sum + q.points, 0);

  return {
    quizId: randomUUID(),
    title: meta.title,
    subject: meta.subject,
    topic: meta.topic,
    difficulty: meta.difficulty,
    questionCount: normalized.length,
    timeLimitMinutes: meta.timeLimitMinutes ?? null,
    instructions: meta.instructions ?? null,
    questions: normalized,
    maxScore,
    model: env.MOCK_LLM ? "mock-quiz-v1" : GEMINI_MODEL,
  };
}

async function generateWithGemini(meta: QuizMeta): Promise<QuizQuestion[]> {
  const out = await invokeGeminiJson(
    GenerationOutputSchema,
    [
      "You are a school teacher building an AI quiz for enrolled students.",
      "Generate age-appropriate questions for the specified topic, subject, and difficulty.",
      "Return strict JSON only. Never include markdown or code fences.",
      "Mix answer types across the set: mostly MCQ, with 1-2 short_text and 0-1 number where it fits the topic.",
      "For mcq questions, include 3-4 plausible `options` and set `correctAnswer` to the exact matching option text.",
      "For short_text and number questions, set `correctAnswer` to the model answer (used as a rubric for scoring).",
      "Make each question's `rubricHint` crisp — one sentence on what a correct answer demonstrates.",
      "Keep wording appropriate for the grade level. Avoid sensitive or harmful content.",
    ].join(" "),
    [
      `Subject: ${meta.subject}`,
      `Topic: ${meta.topic}`,
      `Difficulty: ${meta.difficulty}`,
      `Target count: ${meta.questionCount}`,
      meta.gradeLabel ? `Grade: ${meta.gradeLabel}` : "",
      meta.instructions ? `Teacher instructions: ${meta.instructions}` : "",
      "Output shape:",
      '{"questions":[{"id":"Q1","question":"...","answerType":"mcq|short_text|number","options":["..."],"correctAnswer":"...","points":5,"rubricHint":"..."}]}',
    ]
      .filter(Boolean)
      .join("\n"),
    { label: "classroom-quiz", maxOutputTokens: 4096 },
  );
  return out.questions;
}

function buildMockQuiz(meta: QuizMeta): QuizQuestion[] {
  const qs: QuizQuestion[] = [];
  for (let i = 1; i <= meta.questionCount; i++) {
    qs.push({
      id: `Q${i}`,
      question: `[mock ${meta.difficulty}] ${meta.topic} — question ${i}?`,
      answerType: i % 3 === 0 ? "short_text" : "mcq",
      options: i % 3 === 0 ? undefined : ["A", "B", "C", "D"],
      correctAnswer: i % 3 === 0 ? "sample model answer" : "A",
      points: 5,
      rubricHint: `Tests understanding of ${meta.topic} at ${meta.difficulty} level.`,
    });
  }
  return qs;
}

// ─── Scoring + Analysis ──────────────────────────────────────────────────

export const QuizResponseSchema = z.object({
  questionId: z.string().min(1).max(10),
  question: z.string().min(4).max(600),
  answer: z.string().min(1).max(2000),
});
export type QuizResponse = z.infer<typeof QuizResponseSchema>;

const ScoredQuestionSchema = z.object({
  questionId: z.string().min(1).max(10),
  awardedPoints: z.number().min(0).max(20),
  correct: z.boolean(),
  feedback: z.string().min(2).max(300),
});

const QuizAnalysisSchema = z.object({
  summary: z.string().min(10).max(600),
  strengths: z.array(z.string().min(3).max(200)).min(1).max(6),
  growthAreas: z.array(z.string().min(3).max(200)).min(1).max(6),
  recommendedActions: z.array(z.string().min(3).max(200)).min(1).max(6),
  scoredQuestions: z.array(ScoredQuestionSchema).min(1),
  // LLM is told to align this with scoredQuestions sum, but we always
  // re-compute server-side so a drifted number is fine.
  totalScore: z.number().min(0),
});
export type QuizAnalysis = z.infer<typeof QuizAnalysisSchema>;

export type GradedQuiz = {
  analysis: QuizAnalysis;
  score: number;
  maxScore: number;
  percentage: number;
};

export async function scoreAndAnalyzeQuiz(input: {
  quiz: GeneratedQuiz;
  studentName: string;
  responses: QuizResponse[];
}): Promise<GradedQuiz> {
  const analysis = env.MOCK_LLM
    ? buildMockAnalysis(input)
    : await analyzeWithGemini(input);

  // Server-side re-scoring: sum the awarded points, clamped to each
  // question's point value so a hallucinated "awardedPoints: 999" can't
  // explode the percentage.
  const pointsById = new Map(input.quiz.questions.map((q) => [q.id, q.points]));
  const score = analysis.scoredQuestions.reduce((sum, s) => {
    const max = pointsById.get(s.questionId) ?? 0;
    return sum + Math.max(0, Math.min(max, s.awardedPoints));
  }, 0);
  const maxScore = input.quiz.maxScore;
  const percentage = maxScore > 0 ? (score / maxScore) * 100 : 0;

  return {
    analysis: { ...analysis, totalScore: score },
    score,
    maxScore,
    percentage: Number(percentage.toFixed(2)),
  };
}

async function analyzeWithGemini(input: {
  quiz: GeneratedQuiz;
  studentName: string;
  responses: QuizResponse[];
}): Promise<QuizAnalysis> {
  const qLookup = input.quiz.questions.map((q) => ({
    id: q.id,
    question: q.question,
    answerType: q.answerType,
    correctAnswer: q.correctAnswer,
    points: q.points,
    rubricHint: q.rubricHint,
  }));

  return invokeGeminiJson(
    QuizAnalysisSchema,
    [
      "You are a teacher grading a student's quiz fairly.",
      "Score each question against the provided answer-key / rubric.",
      "For MCQ and number questions, award full points only on exact match (case-insensitive, trimmed).",
      "For short_text, award partial credit proportional to how well the answer covers the rubricHint.",
      "Also produce a concise learning report: summary, strengths, growthAreas, recommendedActions.",
      "Return strict JSON only. Never include markdown or code fences.",
      "Every list MUST contain at least one concrete item — even if evidence is thin, derive a best-effort observation.",
    ].join(" "),
    [
      `Student: ${input.studentName}`,
      `Quiz: ${input.quiz.subject} — ${input.quiz.topic} (${input.quiz.difficulty})`,
      `Question bank: ${JSON.stringify(qLookup)}`,
      `Student responses: ${JSON.stringify(input.responses)}`,
      "Output shape:",
      '{"summary":"...","strengths":["..."],"growthAreas":["..."],"recommendedActions":["..."],"scoredQuestions":[{"questionId":"Q1","awardedPoints":5,"correct":true,"feedback":"..."}],"totalScore":0}',
    ].join("\n"),
    { label: "classroom-quiz-analysis", maxOutputTokens: 4096 },
  );
}

function buildMockAnalysis(input: {
  quiz: GeneratedQuiz;
  studentName: string;
  responses: QuizResponse[];
}): QuizAnalysis {
  const byId = new Map(input.responses.map((r) => [r.questionId, r]));
  const scored = input.quiz.questions.map((q) => {
    const r = byId.get(q.id);
    const correct =
      !!r &&
      r.answer.trim().toLowerCase() === q.correctAnswer.trim().toLowerCase();
    return {
      questionId: q.id,
      awardedPoints: correct ? q.points : 0,
      correct,
      feedback: correct
        ? "Correct."
        : `Expected: ${q.correctAnswer}. Rubric: ${q.rubricHint}`,
    };
  });
  const total = scored.reduce((s, x) => s + x.awardedPoints, 0);
  return {
    summary: `[mock] ${input.studentName} completed the ${input.quiz.difficulty} ${input.quiz.subject} quiz on ${input.quiz.topic}.`,
    strengths: ["Attempted every question."],
    growthAreas: ["Review missed topics before the next quiz."],
    recommendedActions: ["Re-read class notes on the weakest area."],
    scoredQuestions: scored,
    totalScore: total,
  };
}
