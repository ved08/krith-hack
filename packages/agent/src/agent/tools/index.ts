import { tool } from "@langchain/core/tools";
import * as analytics from "../../db/queries/analytics.js";
import { getPrimaryClassroomId } from "../../db/queries/classrooms.js";
import { generateStudentPerformanceReport } from "../../reports/generate-report.js";
import type { AgentContext } from "../context.js";
import { descriptions } from "./descriptions.js";
import { schemas } from "./schemas.js";

/**
 * Build the per-request tool set for the LangGraph agent.
 *
 * Each tool closes over the AgentContext so identity fields (studentId,
 * schoolId, classroomId, parentId) are injected at runtime — the LLM can
 * never shift them. If a tool needs a resolved studentId but context has
 * none (parent with multiple children, no name), the tool returns a typed
 * error that tells the LLM to ask the parent for clarification first.
 */
export function buildToolsForRequest(ctx: AgentContext) {
  /**
   * Resolve the target student for this specific tool call.
   * Priority order:
   *   1. Pre-resolved in context (student self-query, parent with 1 child)
   *   2. LLM-supplied studentName → fuzzy match against ctx.linkedStudents
   *      (server-side; the LLM cannot supply IDs)
   *   3. Multi-child parent without a name → error, prompts LLM to clarify
   */
  const resolveStudent = (
    studentName?: string,
  ):
    | { ok: true; studentId: number; fullName: string }
    | { ok: false; error: { code: string; message: string } } => {
    if (ctx.resolvedStudentId != null) {
      return {
        ok: true,
        studentId: ctx.resolvedStudentId,
        fullName: ctx.resolvedStudentName ?? "",
      };
    }
    if (studentName && ctx.linkedStudents.length > 0) {
      const needle = studentName.trim().toLowerCase();
      const matches = ctx.linkedStudents.filter((s) =>
        s.fullName.toLowerCase().includes(needle),
      );
      if (matches.length === 1) {
        const hit = matches[0]!;
        return { ok: true, studentId: hit.id, fullName: hit.fullName };
      }
      if (matches.length > 1) {
        return {
          ok: false,
          error: {
            code: "AMBIGUOUS_NAME",
            message: `multiple linked children match '${studentName}': ${matches.map((s) => s.fullName).join(", ")}. Ask the parent to be more specific.`,
          },
        };
      }
      return {
        ok: false,
        error: {
          code: "NOT_LINKED",
          message: `no linked child matches '${studentName}'. Call list_my_linked_children to see who is linked.`,
        },
      };
    }
    return {
      ok: false,
      error: {
        code: "STUDENT_UNRESOLVED",
        message:
          "sender has multiple linked children and none named. Call list_my_linked_children and ask the parent which child to use.",
      },
    };
  };

  const needStudent = async <T>(
    studentName: string | undefined,
    fn: (studentId: number) => Promise<T>,
  ): Promise<T | { success: false; error: { code: string; message: string } }> => {
    const r = resolveStudent(studentName);
    if (!r.ok) return { success: false as const, error: r.error };
    return fn(r.studentId);
  };

  const toolset = [
    // -----------------------------------------------------------------------
    // Attendance
    // -----------------------------------------------------------------------
    tool(
      async (args) => {
        const r = await needStudent(args.studentName, (studentId) =>
          analytics.getAttendanceToday(studentId),
        );
        return JSON.stringify(r);
      },
      {
        name: "get_attendance_today",
        description: descriptions.get_attendance_today,
        schema: schemas.getAttendanceToday,
      },
    ),

    tool(
      async (args) => {
        const r = await needStudent(args.studentName, (studentId) =>
          analytics.getAttendanceSummary({
            studentId,
            from: args.from,
            to: args.to,
          }),
        );
        return JSON.stringify(r);
      },
      {
        name: "get_attendance_summary",
        description: descriptions.get_attendance_summary,
        schema: schemas.getAttendanceSummary,
      },
    ),

    tool(
      async (args) => {
        const r = await needStudent(args.studentName, (studentId) =>
          analytics.getAttendanceByDateRange({
            studentId,
            from: args.from,
            to: args.to,
          }),
        );
        return JSON.stringify(r);
      },
      {
        name: "get_attendance_by_date_range",
        description: descriptions.get_attendance_by_date_range,
        schema: schemas.getAttendanceByDateRange,
      },
    ),

    // -----------------------------------------------------------------------
    // Grades
    // -----------------------------------------------------------------------
    tool(
      async (args) => {
        const r = await needStudent(args.studentName, (studentId) =>
          analytics.getRecentGrades({ studentId, limit: args.limit }),
        );
        return JSON.stringify(r);
      },
      {
        name: "get_recent_grades",
        description: descriptions.get_recent_grades,
        schema: schemas.getRecentGrades,
      },
    ),

    tool(
      async (args) => {
        const r = await needStudent(args.studentName, (studentId) =>
          analytics.getSubjectPerformance({ studentId, subject: args.subject }),
        );
        return JSON.stringify(r);
      },
      {
        name: "get_subject_performance",
        description: descriptions.get_subject_performance,
        schema: schemas.getSubjectPerformance,
      },
    ),

    tool(
      async (args) => {
        const r = await needStudent(args.studentName, (studentId) =>
          analytics.getAllSubjectsPerformance(studentId),
        );
        return JSON.stringify(r);
      },
      {
        name: "get_all_subjects_performance",
        description: descriptions.get_all_subjects_performance,
        schema: schemas.getAllSubjectsPerformance,
      },
    ),

    tool(
      async (args) => {
        const resolved = resolveStudent(args.studentName);
        if (!resolved.ok) {
          return JSON.stringify({ success: false, error: resolved.error });
        }
        // Classroom is cached only for the pre-resolved student. For a
        // name-resolved child, look it up now.
        const classroomId =
          resolved.studentId === ctx.resolvedStudentId
            ? ctx.primaryClassroomId
            : await getPrimaryClassroomId(resolved.studentId);
        if (classroomId == null) {
          return JSON.stringify({
            success: false,
            error: {
              code: "NO_CLASSROOM",
              message: "student is not enrolled in any classroom",
            },
          });
        }
        const r = await analytics.getClassComparison({
          studentId: resolved.studentId,
          classroomId,
          subject: args.subject,
        });
        return JSON.stringify(r);
      },
      {
        name: "get_class_comparison",
        description: descriptions.get_class_comparison,
        schema: schemas.getClassComparison,
      },
    ),

    tool(
      async (args) => {
        const r = await needStudent(args.studentName, (studentId) =>
          analytics.getGradeTrend({ studentId, subject: args.subject }),
        );
        return JSON.stringify(r);
      },
      {
        name: "get_grade_trend",
        description: descriptions.get_grade_trend,
        schema: schemas.getGradeTrend,
      },
    ),

    tool(
      async (args) => {
        const r = await needStudent(args.studentName, (studentId) =>
          analytics.findSubmissionsByTitle({
            studentId,
            titlePattern: args.titlePattern,
          }),
        );
        return JSON.stringify(r);
      },
      {
        name: "find_submissions_by_title",
        description: descriptions.find_submissions_by_title,
        schema: schemas.findSubmissionsByTitle,
      },
    ),

    // -----------------------------------------------------------------------
    // Assignments (forward-looking)
    // -----------------------------------------------------------------------
    tool(
      async (args) => {
        const r = await needStudent(args.studentName, (studentId) =>
          analytics.getUpcomingAssignments({
            studentId,
            days: args.days,
            limit: args.limit,
          }),
        );
        return JSON.stringify(r);
      },
      {
        name: "get_upcoming_assignments",
        description: descriptions.get_upcoming_assignments,
        schema: schemas.getUpcomingAssignments,
      },
    ),

    tool(
      async (args) => {
        const r = await needStudent(args.studentName, (studentId) =>
          analytics.getPendingAssignments({
            studentId,
            includeOverdue: args.includeOverdue,
          }),
        );
        return JSON.stringify(r);
      },
      {
        name: "get_pending_assignments",
        description: descriptions.get_pending_assignments,
        schema: schemas.getPendingAssignments,
      },
    ),

    // -----------------------------------------------------------------------
    // Composite / catch-all
    // -----------------------------------------------------------------------
    tool(
      async (args) => {
        const r = await needStudent(args.studentName, (studentId) =>
          analytics.getStudentOverview(studentId),
        );
        return JSON.stringify(r);
      },
      {
        name: "get_student_overview",
        description: descriptions.get_student_overview,
        schema: schemas.getStudentOverview,
      },
    ),

    tool(
      async () => {
        if (ctx.senderRole !== "parent") {
          return JSON.stringify({
            success: false,
            error: {
              code: "UNAUTHORIZED",
              message: "only parents can call get_children_summary",
            },
          });
        }
        const r = await analytics.getChildrenSummaryForParent(ctx.senderUserId);
        return JSON.stringify(r);
      },
      {
        name: "get_children_summary",
        description: descriptions.get_children_summary,
        schema: schemas.getChildrenSummary,
      },
    ),

    // -----------------------------------------------------------------------
    // Side-effecting: builds + uploads a PDF performance report
    // -----------------------------------------------------------------------
    tool(
      async (args) => {
        const r = await needStudent(args.studentName, async (studentId) => {
          const result = await generateStudentPerformanceReport({ studentId });
          if (!result.success) return result;
          // Surface the URL + headline stats verbatim so the LLM can
          // include them in its reply. The LLM is instructed (via
          // descriptions) to keep the URL intact.
          return {
            success: true as const,
            data: result.data,
          };
        });
        return JSON.stringify(r);
      },
      {
        name: "generate_performance_report",
        description: descriptions.generate_performance_report,
        schema: schemas.generatePerformanceReport,
      },
    ),

    // -----------------------------------------------------------------------
    // Bootstrap — exposes linkedStudents so the model can ask the parent to pick
    // -----------------------------------------------------------------------
    tool(
      async () => {
        return JSON.stringify({
          success: true,
          data: {
            senderRole: ctx.senderRole,
            linkedChildren: ctx.linkedStudents.map((s) => ({
              id: s.id,
              fullName: s.fullName,
            })),
            resolved: ctx.resolvedStudentId != null,
            resolvedChild:
              ctx.resolvedStudentId == null
                ? null
                : {
                    id: ctx.resolvedStudentId,
                    fullName: ctx.resolvedStudentName,
                  },
          },
        });
      },
      {
        name: "list_my_linked_children",
        description: descriptions.list_my_linked_children,
        schema: schemas.listMyLinkedChildren,
      },
    ),
  ];

  return toolset;
}
