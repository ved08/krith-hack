import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { z } from "zod";
import { env } from "../config/env.js";

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
  evidence: z.string().min(8).max(240),
});

const LearningDnaSchema = z.object({
  overallScore: z.number().min(0).max(100),
  readinessBand: z.enum(["Foundational", "Developing", "Proficient", "Advanced"]),
  summary: z.string().min(24).max(1000),
  strengths: z.array(z.string().min(3).max(120)).min(2).max(6),
  growthAreas: z.array(z.string().min(3).max(120)).min(2).max(6),
  recommendedActions: z.array(z.string().min(8).max(220)).min(3).max(8),
  skillBreakdown: z.array(SkillBreakdownSchema).min(3).max(5),
  confidence: z.number().min(0).max(100),
  certificateHeadline: z.string().min(6).max(120),
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
  evaluatedAtIso: string;
  model: string;
  profile: AdmissionProfile;
  responseCount: number;
  analysis: LearningDnaAnalysis;
};

export async function generateAdmissionsQuestions(input: {
  profile: AdmissionProfile;
  questionCount?: number;
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

  return {
    questionSetId: buildQuestionSetId(profile.parentPhoneE164),
    generatedAtIso: new Date().toISOString(),
    model: env.MOCK_LLM ? "mock-admissions-v1" : GEMINI_MODEL,
    profile,
    gradeBand: modelOutput.gradeBand,
    rationale: modelOutput.rationale,
    questions: normalizedQuestions,
  };
}

export async function analyzeAdmissionsResponses(input: {
  profile: AdmissionProfile;
  responses: CandidateResponse[];
}): Promise<AdmissionsEvaluation> {
  const profile = AdmissionProfileSchema.parse(input.profile);
  const responses = z.array(CandidateResponseSchema).min(1).max(20).parse(input.responses);

  const analysis = env.MOCK_LLM
    ? buildMockLearningDna(profile, responses)
    : await analyzeWithGemini(profile, responses);

  return {
    evaluatedAtIso: new Date().toISOString(),
    model: env.MOCK_LLM ? "mock-admissions-v1" : GEMINI_MODEL,
    profile,
    responseCount: responses.length,
    analysis,
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
    maxOutputTokens: 1800,
  });

  const response = await llm.invoke([
    new SystemMessage(systemPrompt),
    new HumanMessage(userPrompt),
  ]);

  const text = extractTextContent(response.content);
  const parsedJson = parseJsonObject(text);
  const parsed = schema.safeParse(parsedJson);

  if (!parsed.success) {
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

function buildQuestionSetId(parentPhoneE164: string): string {
  const suffix = parentPhoneE164.slice(-4);
  return `qs_${Date.now()}_${suffix}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}