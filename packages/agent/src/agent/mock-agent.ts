import type { AgentContext } from "./context.js";
import { buildToolsForRequest } from "./tools/index.js";

/**
 * Deterministic keyword-routed stand-in for Gemini, used when
 * MOCK_LLM=true. Picks one tool based on obvious keywords, calls it, and
 * returns a templated reply. Purpose: verify tool wiring + HTTP plumbing
 * without burning Gemini quota or requiring network.
 *
 * NOTE: This is not trying to be smart. Real prose / multi-hop / tone is
 * the job of the real LLM. Mock mode is for integration tests.
 */
type InvokableTool = { name: string; invoke: (args: Record<string, unknown>) => Promise<unknown> };

export async function runMockAgent(
  ctx: AgentContext,
  text: string,
): Promise<string> {
  const tools = buildToolsForRequest(ctx) as unknown as InvokableTool[];
  const byName = new Map(tools.map((t) => [t.name, t]));
  const q = text.toLowerCase();

  // If the question mentions a specific linked child's name, extract it so
  // we can pass it as `studentName` to every tool we call below. The
  // tool-layer resolver will use it to look up the id server-side.
  const namedChild = ctx.linkedStudents.find((s) =>
    q.includes(s.fullName.split(" ")[0]!.toLowerCase()),
  );
  const studentName = namedChild?.fullName;

  const call = async (name: string, extra: Record<string, unknown> = {}) => {
    const t = byName.get(name);
    if (!t) return `[mock] no tool ${name}`;
    const args: Record<string, unknown> = { ...extra };
    if (studentName && !("studentName" in args)) args.studentName = studentName;
    const raw = await t.invoke(args);
    return typeof raw === "string" ? raw : JSON.stringify(raw);
  };

  // Parent with multiple children + no name mentioned → clarification flow
  if (
    ctx.senderRole === "parent" &&
    ctx.linkedStudents.length >= 2 &&
    ctx.resolvedStudentId == null &&
    !namedChild
  ) {
    const names = ctx.linkedStudents.map((s) => s.fullName).join(" or ");
    return `[mock] You have multiple children linked. Are you asking about ${names}?`;
  }

  // Keyword routing — ordered most-specific → most-general
  if (/\btoday\b/.test(q) && /(present|attend|at school|come)/.test(q)) {
    return `[mock] get_attendance_today → ${await call("get_attendance_today")}`;
  }
  if (/(attendance|absent|missed)/.test(q)) {
    return `[mock] get_attendance_summary → ${await call("get_attendance_summary")}`;
  }
  if (/\b(improv|better|worse|decline|progress)/.test(q)) {
    return `[mock] get_grade_trend → ${await call("get_grade_trend")}`;
  }
  if (/\b(rank|class average|above average|top of)/.test(q)) {
    return `[mock] get_class_comparison → ${await call("get_class_comparison")}`;
  }
  if (/\b(best|weakest|strongest|all subjects|which subject)/.test(q)) {
    return `[mock] get_all_subjects_performance → ${await call("get_all_subjects_performance")}`;
  }
  const subjectMatch = q.match(/\b(math|science|english|hindi|social|physics|chemistry|biology)\b/);
  if (subjectMatch) {
    return `[mock] get_subject_performance(${subjectMatch[1]}) → ${await call("get_subject_performance", { subject: subjectMatch[1] })}`;
  }
  if (/(pending|overdue|not submitted)/.test(q)) {
    return `[mock] get_pending_assignments → ${await call("get_pending_assignments")}`;
  }
  if (/(due|upcoming|tomorrow|this week)/.test(q)) {
    return `[mock] get_upcoming_assignments → ${await call("get_upcoming_assignments")}`;
  }
  if (/(recent|latest|last few) (scores|grades|marks)/.test(q) || /what did .* score/.test(q)) {
    return `[mock] get_recent_grades → ${await call("get_recent_grades")}`;
  }
  if (
    ctx.senderRole === "parent" &&
    ctx.linkedStudents.length >= 2 &&
    /(both|all) (my )?(kid|child|children|son|daughter)/.test(q)
  ) {
    return `[mock] get_children_summary → ${await call("get_children_summary")}`;
  }
  if (/(weather|joke|biryani|principal|fee)/.test(q)) {
    return "I can help with attendance, grades, and assignments. For that, please contact the school office.";
  }

  // Default: holistic overview
  return `[mock] get_student_overview → ${await call("get_student_overview")}`;
}
