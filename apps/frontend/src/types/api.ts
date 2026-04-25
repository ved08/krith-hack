/**
 * TypeScript mirrors of the backend's Zod schemas.
 *
 * Keep in sync with `docs/API.md` (which is derived from the backend Zod
 * definitions in `packages/agent/src/admissions/phase2.ts` and the route
 * validators in `apps/backend/src/routes/*.ts`).
 */

// ─── Envelope ─────────────────────────────────────────────────────────────

export type ErrorCode =
  | "INVALID_INPUT"
  | "NOT_FOUND"
  | "UNAUTHORIZED"
  | "NOT_LINKED"
  | "AMBIGUOUS_NAME"
  | "DB_ERROR"
  | "CONFIG_ERROR"
  | "LLM_ERROR";

export type ApiError = { code: ErrorCode; message: string };

export type ApiResult<T> =
  | { success: true; data: T }
  | { success: false; error: ApiError };

// ─── Admissions ───────────────────────────────────────────────────────────

export type Competency =
  | "numeracy"
  | "reasoning"
  | "language"
  | "observation"
  | "learning-readiness";

export type Difficulty = "easy" | "medium" | "hard";
export type AnswerType = "short_text" | "mcq" | "number";
export type ReadinessBand =
  | "Foundational"
  | "Developing"
  | "Proficient"
  | "Advanced";

export type AdmissionProfile = {
  studentName: string;
  parentName: string;
  parentPhoneE164: string;
  studentPhoneE164?: string;
  currentClass: string;
  schoolName?: string;
  preferredLanguage?: string;
};

export type AdmissionQuestion = {
  id: string;
  question: string;
  competency: Competency;
  difficulty: Difficulty;
  answerType: AnswerType;
  rubricHint: string;
};

export type CandidateResponse = {
  questionId: string;
  question: string;
  competency?: Competency;
  answer: string;
};

export type AdmissionsQuestionSet = {
  questionSetId: string;
  generatedAtIso: string;
  model: string;
  profile: AdmissionProfile;
  gradeBand: string;
  rationale: string;
  questions: AdmissionQuestion[];
};

export type SkillBreakdown = {
  competency: Competency;
  score: number;
  evidence: string;
};

export type LearningDnaAnalysis = {
  overallScore: number;
  readinessBand: ReadinessBand;
  summary: string;
  strengths: string[];
  growthAreas: string[];
  recommendedActions: string[];
  skillBreakdown: SkillBreakdown[];
  confidence: number;
  certificateHeadline: string;
};

export type AdmissionsEvaluation = {
  evaluationId: string;
  evaluatedAtIso: string;
  model: string;
  profile: AdmissionProfile;
  responseCount: number;
  analysis: LearningDnaAnalysis;
  /** Public URL of the Learning DNA certificate PDF (null if generation / upload didn't run). */
  certificateUrl: string | null;
  /** Outcome of the parent-WhatsApp notification triggered after analysis. */
  whatsappDelivery: "sent" | "dry_run" | "skipped" | "error";
  whatsappError?: string;
};

export type IntakeEnrolledClassroom = {
  classroomId: number;
  subject: string;
  teacherId: number;
};

export type UpsertAdmissionsIntakeOutput = {
  schoolId: number;
  schoolName: string;
  grade: string;
  enrollments: IntakeEnrolledClassroom[];
  parentUserId: number;
  studentUserId: number;
  parentCreated: boolean;
  studentCreated: boolean;
  parentStudentLinkCreated: boolean;
  classroomEnrollmentsCreated: number;
  renamed: Array<{
    userId: number;
    role: "parent" | "student";
    from: string;
    to: string;
  }>;
};

export type IntakeResponseData = {
  intake: UpsertAdmissionsIntakeOutput;
  questionSet: AdmissionsQuestionSet | null;
  questionSetError?: { code: "LLM_ERROR" | "CONFIG_ERROR"; message: string };
};

// ─── Agent ────────────────────────────────────────────────────────────────

export type AgentCannedReason =
  | "UNKNOWN_SENDER"
  | "TEACHER_ON_WHATSAPP"
  | "ERROR"
  | null;

export type AgentMessageResponse = {
  reply: string;
  canned: AgentCannedReason;
};
