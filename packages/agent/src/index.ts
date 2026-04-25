/**
 * Public surface of the `@campus/agent` package.
 *
 * Consumers (primarily `@campus/backend`, the WhatsApp-facing service) should
 * import only from here — internal modules are not part of the contract.
 */

// Core entry point: takes a WhatsApp phone + message text, returns a reply.
export { runAgent } from "./agent/graph.js";
export type { AgentRunOutcome, RunAgentOptions } from "./agent/graph.js";

// Chat service: the unified entry point for any channel (WhatsApp,
// dashboard tester, future Slack/SMS). Consults the Redis-backed chat
// history, invokes the agent, and persists the turn. Every HTTP route
// that wants "talk to the agent" behaviour should call this rather
// than `runAgent` directly.
export { handleIncomingMessage } from "./chat/index.js";
export type {
  ChatChannel,
  ChatHandleResult,
  ChatTurn,
} from "./chat/index.js";

// Post-agent formatter: takes the raw agent reply + original question and
// produces a WhatsApp-natural version via a second Gemini call. Safe no-op
// under MOCK_LLM or when GEMINI_API_KEY is absent.
export { formatForWhatsApp } from "./agent/formatter.js";

// Outbound WhatsApp sender — shared across the webhook (quick reply) and
// the admissions flow (certificate notification). Dry-run when TWILIO_*
// env vars are missing.
export {
  sendWhatsAppMessage,
  sendCertificateWhatsApp,
} from "./notifications/whatsapp.js";
export type {
  WhatsAppSendResult,
  CertificateNotificationPayload,
} from "./notifications/whatsapp.js";

// Sender context — useful for logging / observability on the webhook side.
export { loadAgentContext } from "./agent/context.js";
export type { AgentContext, LoadContextOutcome } from "./agent/context.js";

// Canned reply constants the webhook may use for offline / fallback cases.
export { CANNED } from "./agent/prompts/index.js";

// Write-path helpers for the teacher-dashboard teammate (imported directly,
// NOT exposed as LangGraph tools — prompt-injection protection).
export {
  // attendance
  insertAttendanceBatch,
  upsertClassSession,
  // grades + assignments
  createAssignment,
  insertGradesBatch,
  // classrooms
  createClassroom,
  enrollStudent,
  getPrimaryClassroomId,
  getStudentsInClassroom,
  getTeacherClassrooms,
  classroomBelongsToSchool,
  // students
  getSenderContextByPhone,
  getStudentIdentity,
  getStudentIdentitiesByIds,
  resolveStudentFromName,
  canCallerAccessStudent,
  upsertAdmissionsIntake,
  insertAdmissionsQuestionSet,
  insertAdmissionsEvaluation,
  updateEvaluationCertificateUrl,
  getLatestAdmissionsEvaluation,
  isPasswordSet,
  // auth + lookups for the teacher dashboard + kiosk dropdowns
  listSchools,
  listClassroomsBySchool,
  verifyTeacherCredentials,
  loginOrCreateTeacher,
  listStudentsForTeacher,
  listClassroomsForTeacher,
  createClassroomsForTeacher,
  listStudentsInMyClassroom,
  getNotificationTargetsForStudents,
  listGradesForSchool,
  hashPassword,
  // classroom quizzes
  insertClassroomQuiz,
  listTeacherQuizzes,
  listQuizzesForStudent,
  getQuizForStudent,
  getQuizFull,
  insertQuizSubmission,
  lookupStudentByUsername,
  updateSubmissionReportUrl,
  // dashboards
  getTeacherOverview,
  getStudentDetail,
  getStudentDetailForTeacher,
} from "./db/queries/index.js";

export type {
  TeacherOverview,
  StudentDetail,
  AttendanceTrendDay,
  AttendanceTimelineEntry,
  RecentQuizSubmission,
  StudentQuizResult,
  StudentAssignmentResult,
  SubjectAverage,
} from "./db/queries/dashboard.js";

export {
  generateClassroomQuiz,
  scoreAndAnalyzeQuiz,
} from "./classroom/quizzes.js";
export { submitClassroomQuiz } from "./classroom/submit.js";
export type { SubmitQuizInput, SubmitQuizOutput } from "./classroom/submit.js";
export type {
  QuizDifficulty,
  QuizQuestion,
  QuizMeta,
  GeneratedQuiz,
  QuizResponse,
  QuizAnalysis,
  GradedQuiz,
} from "./classroom/quizzes.js";
export type {
  SchoolOption,
  ClassroomOption,
  GradeOption,
} from "./db/queries/schools.js";
export type {
  AuthenticatedTeacher,
  TeacherStudentRow,
  TeacherClassroomRow,
  CreateClassroomInput,
  ClassroomRosterEntry,
  NotificationTarget,
} from "./db/queries/auth.js";
export type {
  ClassroomQuizRow,
  TeacherQuizSummary,
  StudentQuizEntry,
  QuizForTaking,
} from "./db/queries/quizzes.js";

// Shared result envelope.
export type { Result, ErrorCode } from "./db/queries/result.js";
export type {
  UpsertAdmissionsIntakeInput,
  UpsertAdmissionsIntakeOutput,
  InsertQuestionSetInput,
  InsertEvaluationInput,
} from "./db/queries/admissions.js";

// Environment loader — exposed so the backend can read MOCK_LLM etc. via the
// same typed view (rather than re-parsing process.env separately).
export { env } from "./config/env.js";

// Admissions kiosk Phase 2 — question generation + Learning DNA analysis.
export {
  AdmissionProfileSchema,
  AdmissionQuestionSchema,
  CandidateResponseSchema,
  generateAdmissionsQuestions,
  analyzeAdmissionsResponses,
} from "./admissions/phase2.js";
export type {
  AdmissionProfile,
  AdmissionQuestion,
  CandidateResponse,
  AdmissionsQuestionSet,
  AdmissionsEvaluation,
  AdmissionsPersistContext,
  LearningDnaAnalysis,
} from "./admissions/phase2.js";
