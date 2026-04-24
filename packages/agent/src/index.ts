/**
 * Public surface of the `@campus/agent` package.
 *
 * Consumers (primarily `@campus/backend`, the WhatsApp-facing service) should
 * import only from here — internal modules are not part of the contract.
 */

// Core entry point: takes a WhatsApp phone + message text, returns a reply.
export { runAgent } from "./agent/graph.js";
export type { AgentRunOutcome } from "./agent/graph.js";

// Post-agent formatter: takes the raw agent reply + original question and
// produces a WhatsApp-natural version via a second Gemini call. Safe no-op
// under MOCK_LLM or when GEMINI_API_KEY is absent.
export { formatForWhatsApp } from "./agent/formatter.js";

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
} from "./db/queries/index.js";

// Shared result envelope.
export type { Result, ErrorCode } from "./db/queries/result.js";

// Environment loader — exposed so the backend can read MOCK_LLM etc. via the
// same typed view (rather than re-parsing process.env separately).
export { env } from "./config/env.js";
