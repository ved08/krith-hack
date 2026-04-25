import { randomUUID } from "node:crypto";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { z } from "zod";
import { env } from "../config/env.js";
import {
  insertAdmissionsEvaluation,
  insertAdmissionsQuestionSet,
  updateEvaluationCertificateUrl,
} from "../db/queries/admissions.js";
import { sendCertificateWhatsApp } from "../notifications/whatsapp.js";
import { uploadCertificatePdf } from "../storage/supabase-storage.js";
import { buildCertificatePdf } from "./certificate.js";

const E164Schema = z
  .string()
  .regex(/^\+[1-9]\d{7,14}$/, "must be E.164 phone, e.g. +919876543210");

const CompetencySchema = z.enum([
  "numeracy",
  "reasoning",
  "language",
  "observation",
  "learning-readiness",
]);

const DifficultySchema = z.enum(["easy", "medium", "hard"]);
const AnswerTypeSchema = z.enum(["short_text", "mcq", "number"]);

export const AdmissionProfileSchema = z.object({
  studentName: z.string().min(1).max(120),
  parentName: z.string().min(1).max(120),
  parentPhoneE164: E164Schema,
  studentPhoneE164: E164Schema.optional(),
  currentClass: z.string().min(1).max(40),
  schoolName: z.string().min(1).max(200).optional(),
  preferredLanguage: z.string().min(2).max(40).optional(),
});

export const AdmissionQuestionSchema = z.object({
  id: z.string().min(1).max(40),
  question: z.string().min(8).max(400),
  competency: CompetencySchema,
  difficulty: DifficultySchema,
  answerType: AnswerTypeSchema,
  rubricHint: z.string().min(5).max(240),
});

export const CandidateResponseSchema = z.object({
  questionId: z.string().min(1).max(40),
  question: z.string().min(8).max(400),
  competency: CompetencySchema.optional(),
  answer: z.string().min(1).max(2000),
});

const QuestionSetModelOutputSchema = z.object({
  gradeBand: z.string().min(2).max(80),
  rationale: z.string().min(12).max(500),
  questions: z.array(AdmissionQuestionSchema).min(5).max(12),
});

const SkillBreakdownSchema = z.object({
  competency: CompetencySchema,
  score: z.number().min(0).max(100),
  evidence: z.string().min(4).max(280),
});

// Minimums here are deliberately permissive. With sparse candidate responses
// (say 2–3 answers), the model honestly can only extract one clear strength
// or growth area — forcing 2+ would push it to fabricate. Max values are kept
// as soft upper bounds to keep the certificate UI readable.
const LearningDnaSchema = z.object({
  overallScore: z.number().min(0).max(100),
  readinessBand: z.enum(["Foundational", "Developing", "Proficient", "Advanced"]),
  summary: z.string().min(16).max(1200),
  strengths: z.array(z.string().min(2).max(160)).min(1).max(8),
  growthAreas: z.array(z.string().min(2).max(160)).min(1).max(8),
  recommendedActions: z.array(z.string().min(4).max(240)).min(1).max(10),
  skillBreakdown: z.array(SkillBreakdownSchema).min(1).max(6),
  confidence: z.number().min(0).max(100),
  certificateHeadline: z.string().min(4).max(140),
});

const GEMINI_MODEL = "gemini-2.5-flash";

export type AdmissionProfile = z.infer<typeof AdmissionProfileSchema>;
export type AdmissionQuestion = z.infer<typeof AdmissionQuestionSchema>;
export type CandidateResponse = z.infer<typeof CandidateResponseSchema>;
export type LearningDnaAnalysis = z.infer<typeof LearningDnaSchema>;

export type AdmissionsQuestionSet = {
  questionSetId: string;
  generatedAtIso: string;
  model: string;
  profile: AdmissionProfile;
  gradeBand: string;
  rationale: string;
  questions: AdmissionQuestion[];
};

export type AdmissionsEvaluation = {
  evaluationId: string;
  evaluatedAtIso: string;
  model: string;
  profile: AdmissionProfile;
  responseCount: number;
  analysis: LearningDnaAnalysis;
  /** Public URL of the Learning DNA certificate PDF (null if generation
   *  / upload failed, or no persistence context was supplied). */
  certificateUrl: string | null;
  /** Outcome of the outbound WhatsApp send to the parent. Always present —
   *  "skipped" means we didn't attempt (no cert URL / no phone). */
  whatsappDelivery: "sent" | "dry_run" | "skipped" | "error";
  whatsappError?: string;
};

/**
 * Optional persistence context. When passed, the module writes the question
 * set / evaluation to the admissions_* tables. When absent (anonymous preview
 * flows), the data is returned in memory only — no DB write happens.
 */
export type AdmissionsPersistContext = {
  schoolId?: number | null;
  studentId?: number | null;
  questionSetId?: string | null; // for evaluations: link back to the set
};

export async function generateAdmissionsQuestions(input: {
  profile: AdmissionProfile;
  questionCount?: number;
  persist?: AdmissionsPersistContext;
}): Promise<AdmissionsQuestionSet> {
  const profile = AdmissionProfileSchema.parse(input.profile);
  const questionCount = clamp(input.questionCount ?? 8, 5, 12);

  const modelOutput = env.MOCK_LLM
    ? buildMockQuestionSet(profile, questionCount)
    : await buildQuestionSetWithGemini(profile, questionCount);

  const normalizedQuestions = normalizeQuestionCount(
    modelOutput.questions,
    questionCount,
    profile,
  );

  const questionSetId = randomUUID();
  const model = env.MOCK_LLM ? "mock-admissions-v1" : GEMINI_MODEL;
  const set: AdmissionsQuestionSet = {
    questionSetId,
    generatedAtIso: new Date().toISOString(),
    model,
    profile,
    gradeBand: modelOutput.gradeBand,
    rationale: modelOutput.rationale,
    questions: normalizedQuestions,
  };

  // Best-effort persistence. A DB failure should not block returning the
  // generated set to the kiosk — the set is already complete and usable.
  if (input.persist) {
    const result = await insertAdmissionsQuestionSet({
      id: questionSetId,
      schoolId: input.persist.schoolId ?? null,
      studentId: input.persist.studentId ?? null,
      parentPhoneE164: profile.parentPhoneE164,
      studentName: profile.studentName,
      profile,
      gradeBand: modelOutput.gradeBand,
      rationale: modelOutput.rationale,
      questions: normalizedQuestions,
      model,
    });
    if (!result.success) {
      console.error(
        `[admissions] failed to persist question set ${questionSetId}: ${result.error.code}: ${result.error.message}`,
      );
    }
  }

  return set;
}

export async function analyzeAdmissionsResponses(input: {
  profile: AdmissionProfile;
  responses: CandidateResponse[];
  persist?: AdmissionsPersistContext;
}): Promise<AdmissionsEvaluation> {
  const profile = AdmissionProfileSchema.parse(input.profile);
  const responses = z.array(CandidateResponseSchema).min(1).max(20).parse(input.responses);

  const analysis = env.MOCK_LLM
    ? buildMockLearningDna(profile, responses)
    : await analyzeWithGemini(profile, responses);

  const evaluationId = randomUUID();
  const model = env.MOCK_LLM ? "mock-admissions-v1" : GEMINI_MODEL;

  let evaluationPersisted = false;
  if (input.persist) {
    const result = await insertAdmissionsEvaluation({
      id: evaluationId,
      schoolId: input.persist.schoolId ?? null,
      studentId: input.persist.studentId ?? null,
      questionSetId: input.persist.questionSetId ?? null,
      parentPhoneE164: profile.parentPhoneE164,
      studentName: profile.studentName,
      profile,
      responses,
      analysis,
      overallScore: analysis.overallScore,
      readinessBand: analysis.readinessBand,
      model,
    });
    if (!result.success) {
      console.error(
        `[admissions] failed to persist evaluation ${evaluationId}: ${result.error.code}: ${result.error.message}`,
      );
    } else {
      evaluationPersisted = true;
    }
  }

  const evaluatedAtIso = new Date().toISOString();

  // Post-analysis side-effects: build the certificate PDF, upload to
  // Supabase Storage, and notify the parent on WhatsApp. Each step is
  // best-effort — a failure logs and continues. The analysis response
  // always returns, with certificateUrl/whatsappDelivery flags telling
  // the caller what succeeded.
  let certificateUrl: string | null = null;
  let whatsappDelivery: AdmissionsEvaluation["whatsappDelivery"] = "skipped";
  let whatsappError: string | undefined;

  try {
    const pdf = await buildCertificatePdf({
      studentName: profile.studentName,
      parentName: profile.parentName,
      schoolName: profile.schoolName,
      currentClass: profile.currentClass,
      overallScore: analysis.overallScore,
      readinessBand: analysis.readinessBand,
      summary: analysis.summary,
      strengths: analysis.strengths,
      growthAreas: analysis.growthAreas,
      recommendedActions: analysis.recommendedActions,
      certificateHeadline: analysis.certificateHeadline,
      evaluationId,
      evaluatedAtIso,
    });

    // Group each student's certificates under their own folder in the
    // bucket. Prefer the persisted studentId; when the intake didn't
    // produce one, fall back to the parent's phone so uploads still
    // land in a stable, per-family folder instead of the bucket root.
    const folder = input.persist?.studentId
      ? String(input.persist.studentId)
      : profile.parentPhoneE164 ?? null;
    const upload = await uploadCertificatePdf(
      `evaluation-${evaluationId}.pdf`,
      pdf,
      folder,
    );
    if (upload.kind === "UPLOADED") {
      certificateUrl = upload.url;
      if (evaluationPersisted) {
        const updateRes = await updateEvaluationCertificateUrl(
          evaluationId,
          upload.url,
        );
        if (!updateRes.success) {
          console.error(
            `[admissions] failed to attach certificate URL to evaluation ${evaluationId}: ${updateRes.error.message}`,
          );
        }
      }
    } else if (upload.kind === "ERROR") {
      console.error(
        `[admissions] certificate upload failed for ${evaluationId}: ${upload.message}`,
      );
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(
      `[admissions] certificate generation failed for ${evaluationId}: ${message}`,
    );
  }

  // WhatsApp the parent only when we have both a URL to send AND the
  // parent's phone. Skip when the certificate wasn't uploaded, since
  // sending "your certificate is at null" is worse than silence.
  if (certificateUrl && profile.parentPhoneE164) {
    const send = await sendCertificateWhatsApp({
      parentPhoneE164: profile.parentPhoneE164,
      parentName: profile.parentName,
      studentName: profile.studentName,
      schoolName: profile.schoolName,
      headline: analysis.certificateHeadline,
      overallScore: analysis.overallScore,
      readinessBand: analysis.readinessBand,
      summary: analysis.summary,
      strengths: analysis.strengths,
      growthAreas: analysis.growthAreas,
      recommendedActions: analysis.recommendedActions,
      certificateUrl,
    });
    if (send.kind === "SENT") whatsappDelivery = "sent";
    else if (send.kind === "DRY_RUN") whatsappDelivery = "dry_run";
    else {
      whatsappDelivery = "error";
      whatsappError = send.message;
    }
  }

  return {
    evaluationId,
    evaluatedAtIso,
    model,
    profile,
    responseCount: responses.length,
    analysis,
    certificateUrl,
    whatsappDelivery,
    ...(whatsappError ? { whatsappError } : {}),
  };
}

async function buildQuestionSetWithGemini(
  profile: AdmissionProfile,
  questionCount: number,
): Promise<z.infer<typeof QuestionSetModelOutputSchema>> {
  const output = await invokeGeminiJson(
    QuestionSetModelOutputSchema,
    [
      "You are an admissions-assessment designer for a school kiosk.",
      "Generate age-appropriate and class-appropriate screening questions.",
      "Return strict JSON only. Never include markdown or code fences.",
      "Question mix should cover numeracy, reasoning, language, observation, and learning-readiness.",
      "Keep question wording clear for school admissions and avoid sensitive or harmful content.",
    ].join(" "),
    [
      `Student profile JSON: ${JSON.stringify(profile)}`,
      `Need exactly ${questionCount} questions.`,
      "Output shape:",
      '{"gradeBand":"...","rationale":"...","questions":[{"id":"Q1","question":"...","competency":"numeracy|reasoning|language|observation|learning-readiness","difficulty":"easy|medium|hard","answerType":"short_text|mcq|number","rubricHint":"..."}]}',
      "Use ascending difficulty from easy to hard where suitable.",
      "Use preferredLanguage if provided in profile; otherwise default to English.",
    ].join("\n"),
  );

  return output;
}

async function analyzeWithGemini(
  profile: AdmissionProfile,
  responses: CandidateResponse[],
): Promise<LearningDnaAnalysis> {
  return invokeGeminiJson(
    LearningDnaSchema,
    [
      "You are an education analyst creating a Learning DNA summary for an admissions test.",
      "Evaluate only from the provided responses.",
      "Return strict JSON only. Never include markdown or code fences.",
      "Scores should be realistic and evidence-based.",
      "Do not provide medical or mental-health diagnoses.",
      // Guard against empty-array rejections when responses are sparse —
      // the schema allows single-item lists and the model should always
      // produce at least one concrete item per list instead of leaving any empty.
      "Every list MUST contain at least one concrete item, even if evidence is thin — derive a best-effort observation rather than returning an empty array.",
    ].join(" "),
    [
      `Student profile JSON: ${JSON.stringify(profile)}`,
      `Question-response JSON: ${JSON.stringify(responses)}`,
      "Output shape:",
      '{"overallScore":0,"readinessBand":"Foundational|Developing|Proficient|Advanced","summary":"...","strengths":["..."],"growthAreas":["..."],"recommendedActions":["..."],"skillBreakdown":[{"competency":"numeracy|reasoning|language|observation|learning-readiness","score":0,"evidence":"..."}],"confidence":0,"certificateHeadline":"..."}',
      "Keep summary practical for school counselors and parents.",
    ].join("\n"),
  );
}

async function invokeGeminiJson<T>(
  schema: z.ZodType<T>,
  systemPrompt: string,
  userPrompt: string,
): Promise<T> {
  if (!env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is required when MOCK_LLM is false");
  }

  const llm = new ChatGoogleGenerativeAI({
    apiKey: env.GEMINI_API_KEY,
    model: GEMINI_MODEL,
    temperature: 0.2,
    // Bumped from 1800 — the Learning DNA schema (summary + 8 actions + 5
    // skill-breakdown items with evidence each) routinely approaches the old
    // ceiling and got truncated mid-JSON.
    maxOutputTokens: 4096,
    // Forces `generationConfig.responseMimeType = "application/json"` under
    // the hood, which suppresses Gemini's natural-language preamble and any
    // <think> scratch-pad it might emit. Essential for 2.5-flash.
    json: true,
  });

  const response = await llm.invoke([
    new SystemMessage(systemPrompt),
    new HumanMessage(userPrompt),
  ]);

  const text = extractTextContent(response.content);
  let parsedJson: unknown;
  try {
    parsedJson = parseJsonObject(text);
  } catch (e) {
    // Dump the raw output so the next run has something actionable to
    // look at rather than a bare "did not return valid JSON".
    console.error(
      "[admissions] Gemini returned non-JSON. Raw output follows:\n---\n%s\n---",
      text,
    );
    throw e;
  }
  const parsed = schema.safeParse(parsedJson);

  if (!parsed.success) {
    console.error(
      "[admissions] Gemini JSON failed schema validation. Raw JSON:\n---\n%s\n---",
      JSON.stringify(parsedJson, null, 2),
    );
    throw new Error(`Gemini output validation failed: ${parsed.error.message}`);
  }

  return parsed.data;
}

function extractTextContent(content: unknown): string {
  if (typeof content === "string") return content;

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (
          typeof part === "object" &&
          part !== null &&
          "text" in part &&
          typeof (part as { text?: unknown }).text === "string"
        ) {
          return (part as { text: string }).text;
        }
        return "";
      })
      .join("\n")
      .trim();
  }

  return String(content ?? "");
}

function parseJsonObject(raw: string): unknown {
  const trimmed = raw.trim();
  const deFenced = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(deFenced);
  } catch {
    const first = deFenced.indexOf("{");
    const last = deFenced.lastIndexOf("}");
    if (first >= 0 && last > first) {
      const candidate = deFenced.slice(first, last + 1);
      return JSON.parse(candidate);
    }
    throw new Error("Gemini did not return valid JSON");
  }
}

function normalizeQuestionCount(
  questions: AdmissionQuestion[],
  questionCount: number,
  profile: AdmissionProfile,
): AdmissionQuestion[] {
  if (questions.length >= questionCount) {
    return questions.slice(0, questionCount).map((q, idx) => ({
      ...q,
      id: `Q${idx + 1}`,
    }));
  }

  const fallbackQuestions = buildMockQuestionSet(profile, questionCount).questions;
  const merged = [...questions];
  for (const fallback of fallbackQuestions) {
    if (merged.length >= questionCount) break;
    merged.push(fallback);
  }

  return merged.slice(0, questionCount).map((q, idx) => ({
    ...q,
    id: `Q${idx + 1}`,
  }));
}

function buildMockQuestionSet(
  profile: AdmissionProfile,
  questionCount: number,
): z.infer<typeof QuestionSetModelOutputSchema> {
  const classNum = parseClassNumber(profile.currentClass);
  const gradeBand = mapGradeBand(classNum);

  const baseQuestions: AdmissionQuestion[] = [
    {
      id: "Q1",
      question:
        classNum <= 5
          ? "What is 18 + 7?"
          : "If a notebook costs 35 rupees, what is the total cost of 4 notebooks?",
      competency: "numeracy",
      difficulty: "easy",
      answerType: "number",
      rubricHint: "Checks basic arithmetic fluency.",
    },
    {
      id: "Q2",
      question:
        classNum <= 5
          ? "Which one is different: mango, banana, carrot, apple? Explain briefly."
          : "Find the odd one out: triangle, square, rectangle, kilometer. Explain why.",
      competency: "reasoning",
      difficulty: "easy",
      answerType: "short_text",
      rubricHint: "Checks category logic and explanation quality.",
    },
    {
      id: "Q3",
      question:
        classNum <= 5
          ? "Write 3 sentences about your favorite game."
          : "Write a short paragraph (4-5 sentences) about a challenge you solved at school.",
      competency: "language",
      difficulty: "medium",
      answerType: "short_text",
      rubricHint: "Checks sentence construction and clarity.",
    },
    {
      id: "Q4",
      question:
        "A student waters a plant daily for one week and it grows taller. What can we conclude from this observation?",
      competency: "observation",
      difficulty: "medium",
      answerType: "short_text",
      rubricHint: "Checks observation-to-inference thinking.",
    },
    {
      id: "Q5",
      question:
        "When you do not know an answer in class, what do you usually do next?",
      competency: "learning-readiness",
      difficulty: "easy",
      answerType: "short_text",
      rubricHint: "Checks willingness to seek help and learning mindset.",
    },
    {
      id: "Q6",
      question:
        classNum <= 7
          ? "If a class has 24 students and 6 are absent, what fraction of students are present?"
          : "A test has 50 marks. A student scores 38. What percentage did the student score?",
      competency: "numeracy",
      difficulty: "medium",
      answerType: "number",
      rubricHint: "Checks fractions/percent basics by class level.",
    },
    {
      id: "Q7",
      question:
        "Read this pattern: 2, 6, 12, 20, __. What is the next number and how did you find it?",
      competency: "reasoning",
      difficulty: "medium",
      answerType: "short_text",
      rubricHint: "Checks pattern recognition and justification.",
    },
    {
      id: "Q8",
      question:
        "Choose the most important detail when reading a chapter for revision and explain your choice.",
      competency: "language",
      difficulty: "hard",
      answerType: "short_text",
      rubricHint: "Checks comprehension and summarization judgment.",
    },
    {
      id: "Q9",
      question:
        "A student studies in a noisy room and scores lower than usual. Name one likely reason and one improvement step.",
      competency: "observation",
      difficulty: "hard",
      answerType: "short_text",
      rubricHint: "Checks cause-effect reasoning from context.",
    },
    {
      id: "Q10",
      question:
        "Set one study goal for the next 7 days and describe how you will track progress.",
      competency: "learning-readiness",
      difficulty: "medium",
      answerType: "short_text",
      rubricHint: "Checks planning, ownership, and reflection.",
    },
  ];

  return {
    gradeBand,
    rationale:
      "Questions are balanced across core competencies with progressive difficulty to estimate baseline readiness.",
    questions: baseQuestions.slice(0, questionCount),
  };
}

function buildMockLearningDna(
  profile: AdmissionProfile,
  responses: CandidateResponse[],
): LearningDnaAnalysis {
  const competencyOrder = [
    "numeracy",
    "reasoning",
    "language",
    "observation",
    "learning-readiness",
  ] as const;

  const byCompetency = new Map<string, string[]>();
  for (const key of competencyOrder) byCompetency.set(key, []);

  responses.forEach((response, index) => {
    const key = response.competency ?? competencyOrder[index % competencyOrder.length]!;
    byCompetency.get(key)?.push(response.answer.trim());
  });

  const breakdown = competencyOrder.map((competency) => {
    const answers = byCompetency.get(competency) ?? [];
    const avgLen =
      answers.length === 0
        ? 0
        : answers.reduce((sum, answer) => sum + answer.length, 0) / answers.length;
    const score = clamp(Math.round(35 + avgLen / 3 + answers.length * 4), 25, 95);
    return {
      competency,
      score,
      evidence:
        answers.length === 0
          ? "No direct evidence captured for this competency."
          : `Observed from ${answers.length} response(s) with average detail length ${Math.round(avgLen)} characters.`,
    };
  });

  const overallScore = Math.round(
    breakdown.reduce((sum, item) => sum + item.score, 0) / breakdown.length,
  );

  const ranked = [...breakdown].sort((a, b) => b.score - a.score);
  const top = ranked.slice(0, 2).map((r) => labelCompetency(r.competency));
  const bottom = ranked.slice(-2).map((r) => labelCompetency(r.competency));

  const readinessBand = mapReadinessBand(overallScore);
  const confidence = clamp(55 + responses.length * 4, 55, 90);

  return {
    overallScore,
    readinessBand,
    summary:
      `${profile.studentName} shows ${readinessBand.toLowerCase()} admissions readiness based on current responses. ` +
      `The strongest evidence appears in ${top.join(" and ")}, while targeted practice is needed in ${bottom.join(" and ")}.`,
    strengths: top.map((s) => `Emerging strength in ${s}`),
    growthAreas: bottom.map((s) => `Needs more guided practice in ${s}`),
    recommendedActions: [
      "Use 20-minute daily practice blocks with one numeracy and one language task.",
      "Ask the student to explain reasoning aloud after each solved question.",
      "Conduct a weekly mini-review to track progress and confidence.",
    ],
    skillBreakdown: breakdown,
    confidence,
    certificateHeadline: `${profile.studentName}: ${readinessBand} Learning DNA Profile`,
  };
}

function mapReadinessBand(score: number): LearningDnaAnalysis["readinessBand"] {
  if (score < 45) return "Foundational";
  if (score < 65) return "Developing";
  if (score < 82) return "Proficient";
  return "Advanced";
}

function parseClassNumber(currentClass: string): number {
  const m = currentClass.match(/\d+/);
  if (!m) return 6;
  const n = Number.parseInt(m[0], 10);
  return Number.isFinite(n) ? n : 6;
}

function mapGradeBand(classNumber: number): string {
  if (classNumber <= 2) return "early-primary";
  if (classNumber <= 5) return "primary";
  if (classNumber <= 8) return "middle-school";
  if (classNumber <= 10) return "secondary";
  return "senior-secondary";
}

function labelCompetency(
  competency: z.infer<typeof CompetencySchema>,
): string {
  switch (competency) {
    case "numeracy":
      return "Numeracy";
    case "reasoning":
      return "Reasoning";
    case "language":
      return "Language";
    case "observation":
      return "Observation";
    case "learning-readiness":
      return "Learning Readiness";
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}