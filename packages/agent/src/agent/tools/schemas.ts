import { z } from "zod";

/**
 * Zod schemas for every tool's LLM-supplied arguments.
 *
 * CRITICAL: these schemas describe ONLY what the LLM is allowed to pass.
 * studentId / schoolId / callerUserId / classroomId are NEVER here — those
 * are injected from AgentContext via closure in tools/index.ts. The model
 * cannot name a student_id (or any other identity) to shift the query.
 *
 * IMPORTANT: Gemini's function-calling schema parser rejects `$ref` JSON
 * Schema nodes, which Zod emits when sub-schemas are reused. So every
 * field is inlined — do NOT extract shared `dateStr` / `studentName`
 * variables even though it'd be DRYer.
 */

export const schemas = {
  getAttendanceToday: z.object({
    studentName: z
      .string()
      .optional()
      .describe(
        "Name of the child (only needed if sender is a parent with 2+ linked children).",
      ),
  }),

  getAttendanceSummary: z.object({
    studentName: z.string().optional().describe("Child's name for multi-child parents"),
    from: z
      .string()
      .optional()
      .describe("Start date inclusive, YYYY-MM-DD"),
    to: z
      .string()
      .optional()
      .describe("End date inclusive, YYYY-MM-DD"),
  }),

  getAttendanceByDateRange: z.object({
    studentName: z.string().optional().describe("Child's name for multi-child parents"),
    from: z.string().describe("Start date inclusive, YYYY-MM-DD"),
    to: z.string().describe("End date inclusive, YYYY-MM-DD"),
  }),

  getRecentGrades: z.object({
    studentName: z.string().optional().describe("Child's name for multi-child parents"),
    limit: z
      .number()
      .int()
      .optional()
      .describe("How many recent submissions; 1-20, defaults to 5"),
  }),

  getSubjectPerformance: z.object({
    studentName: z.string().optional().describe("Child's name for multi-child parents"),
    subject: z
      .string()
      .describe("Subject name as mentioned by the parent, e.g. 'Math'"),
  }),

  getAllSubjectsPerformance: z.object({
    studentName: z.string().optional().describe("Child's name for multi-child parents"),
  }),

  getClassComparison: z.object({
    studentName: z.string().optional().describe("Child's name for multi-child parents"),
    subject: z
      .string()
      .optional()
      .describe("If omitted, compares across all subjects"),
  }),

  getGradeTrend: z.object({
    studentName: z.string().optional().describe("Child's name for multi-child parents"),
    subject: z
      .string()
      .optional()
      .describe("If omitted, trend is computed across all subjects"),
  }),

  findSubmissionsByTitle: z.object({
    studentName: z.string().optional().describe("Child's name for multi-child parents"),
    titlePattern: z
      .string()
      .describe("Part of the assignment title, e.g. 'Quiz 1'"),
  }),

  getUpcomingAssignments: z.object({
    studentName: z.string().optional().describe("Child's name for multi-child parents"),
    days: z
      .number()
      .int()
      .optional()
      .describe("Look-ahead window in days, 1-90, defaults to 7"),
    limit: z.number().int().optional(),
  }),

  getPendingAssignments: z.object({
    studentName: z.string().optional().describe("Child's name for multi-child parents"),
    includeOverdue: z
      .boolean()
      .optional()
      .describe("Include assignments past their due date, default true"),
  }),

  getStudentOverview: z.object({
    studentName: z.string().optional().describe("Child's name for multi-child parents"),
  }),

  getChildrenSummary: z.object({}),

  listMyLinkedChildren: z.object({}),

  generatePerformanceReport: z.object({
    studentName: z
      .string()
      .optional()
      .describe(
        "Child's name — required only when the sender is a parent with 2+ linked children and hasn't been resolved.",
      ),
  }),
} as const;
