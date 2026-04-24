import { getPrimaryClassroomId } from "../db/queries/classrooms.js";
import {
  getSenderContextByPhone,
  type LinkedStudent,
} from "../db/queries/students.js";

/**
 * Everything the agent needs to know about the sender and the
 * subject-of-the-question (the student). Built once per incoming message,
 * then closed over by the per-request tool builders. The LLM never sees
 * this object directly.
 */
export type AgentContext = {
  senderPhoneE164: string;
  senderUserId: number;
  senderRole: "parent" | "student" | "teacher";
  schoolId: number;
  senderFullName: string;

  linkedStudents: LinkedStudent[];

  /**
   * The student the current question is about. Pre-resolved when possible:
   *   - sender is a student → their own id
   *   - sender is a parent with exactly one linked child → that child's id
   *   - sender is a parent with ≥ 2 linked children → null; the LLM must
   *     call `list_my_linked_children` and ask the parent to pick
   */
  resolvedStudentId: number | null;
  resolvedStudentName: string | null;

  /** Primary classroom of the resolved student, used by `get_class_comparison`. */
  primaryClassroomId: number | null;
};

export type LoadContextOutcome =
  | { kind: "READY"; context: AgentContext }
  | { kind: "UNKNOWN_SENDER" }
  | { kind: "TEACHER_ON_WHATSAPP" } // out-of-scope for parent-facing agent
  | { kind: "ERROR"; message: string };

/**
 * Resolve an incoming WhatsApp phone into a full AgentContext. Pure
 * read-only against the sender-resolution helpers already in db/queries.
 */
export async function loadAgentContext(
  phoneE164: string,
): Promise<LoadContextOutcome> {
  const ctxResult = await getSenderContextByPhone(phoneE164);
  if (!ctxResult.success) return { kind: "ERROR", message: ctxResult.error.message };
  const ctx = ctxResult.data;
  if (!ctx) return { kind: "UNKNOWN_SENDER" };

  if (ctx.role === "teacher") return { kind: "TEACHER_ON_WHATSAPP" };

  // Pre-resolve the subject student.
  let resolvedStudentId: number | null = null;
  let resolvedStudentName: string | null = null;

  if (ctx.role === "student") {
    resolvedStudentId = ctx.userId;
    resolvedStudentName = ctx.fullName;
  } else if (ctx.role === "parent" && ctx.linkedStudents.length === 1) {
    const only = ctx.linkedStudents[0]!;
    resolvedStudentId = only.id;
    resolvedStudentName = only.fullName;
  }

  const primaryClassroomId =
    resolvedStudentId == null ? null : await getPrimaryClassroomId(resolvedStudentId);

  return {
    kind: "READY",
    context: {
      senderPhoneE164: phoneE164,
      senderUserId: ctx.userId,
      senderRole: ctx.role,
      schoolId: ctx.schoolId,
      senderFullName: ctx.fullName,
      linkedStudents: ctx.linkedStudents,
      resolvedStudentId,
      resolvedStudentName,
      primaryClassroomId,
    },
  };
}
