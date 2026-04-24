import { sql } from "drizzle-orm";
import { db } from "../client.js";
import type { AttendanceStatus } from "./attendance.js";
import { err, ok, type Result } from "./result.js";

/**
 * Analytics / read-path query module for the AI agent.
 *
 * Each function maps to a question category from QUESTION_SCENARIOS_DATABASE_ANALYSIS.md.
 * Goals:
 *   1. One well-structured SQL query per question → single round-trip.
 *   2. Returns a typed, JSON-serialisable result. No strings, no Dates —
 *      numbers are numbers, dates are ISO strings.
 *   3. Null-safe: zero data returns sensible null/empty values, never crashes.
 *   4. No caching. Always fresh, reads raw tables.
 *
 * The LLM receives the returned object verbatim and composes a WhatsApp reply.
 */

// ---------------------------------------------------------------------------
// Type helpers
// ---------------------------------------------------------------------------

const toN = (v: unknown): number => {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};
const toNullable = (v: unknown): number | null => {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};
const round2 = (n: number): number => Math.round(n * 100) / 100;
const toIso = (v: unknown): string | null => {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  return String(v);
};

// ---------------------------------------------------------------------------
// Shared row types (camelCase, agent-facing)
// ---------------------------------------------------------------------------

export type SubmissionBrief = {
  assignmentId: number;
  title: string;
  subject: string;
  type: "HOMEWORK" | "QUIZ" | "TEST";
  score: number;
  maxScore: number;
  percentage: number;
  submittedAt: string;
  dueDate: string;
};

export type UpcomingAssignment = {
  assignmentId: number;
  title: string;
  subject: string;
  type: "HOMEWORK" | "QUIZ" | "TEST";
  maxScore: number;
  dueDate: string;
};

// =============================================================================
// CATEGORY 1 — ATTENDANCE
// =============================================================================

// 1.1 — "Was Arjun present today?"
export type AttendanceToday = {
  date: string; // ISO date (YYYY-MM-DD)
  status: AttendanceStatus | null; // null = not marked yet
  classroomName: string | null;
};

export async function getAttendanceToday(
  studentId: number,
): Promise<Result<AttendanceToday>> {
  const rows = await db.execute(sql`
    SELECT
      cs.session_date::text AS date,
      a.status::text        AS status,
      c.name                AS classroom_name
    FROM class_session cs
    JOIN classroom_membership cm
      ON cm.classroom_id = cs.classroom_id AND cm.student_id = ${studentId}
    JOIN classrooms c ON c.id = cs.classroom_id
    LEFT JOIN attendance a
      ON a.session_id = cs.id AND a.student_id = ${studentId}
    WHERE cs.session_date = CURRENT_DATE
    ORDER BY cs.id DESC
    LIMIT 1
  `);
  const r = (rows as unknown as Array<{
    date: string;
    status: AttendanceStatus | null;
    classroom_name: string | null;
  }>)[0];
  if (!r) {
    return ok({
      date: new Date().toISOString().slice(0, 10),
      status: null,
      classroomName: null,
    });
  }
  return ok({
    date: r.date,
    status: r.status ?? null,
    classroomName: r.classroom_name,
  });
}

// 1.2 — "What is Arjun's attendance percentage?" (optional date range)
export type AttendanceSummary = {
  from: string | null;
  to: string | null;
  totalSessions: number;
  presentCount: number;
  absentCount: number;
  lateCount: number;
  attendancePct: number | null; // null if totalSessions = 0
};

export async function getAttendanceSummary(input: {
  studentId: number;
  from?: string; // YYYY-MM-DD inclusive
  to?: string; // YYYY-MM-DD inclusive
}): Promise<Result<AttendanceSummary>> {
  const rows = await db.execute(sql`
    SELECT
      COUNT(*)::int                                             AS total,
      COUNT(*) FILTER (WHERE a.status = 'PRESENT')::int         AS present,
      COUNT(*) FILTER (WHERE a.status = 'ABSENT')::int          AS absent,
      COUNT(*) FILTER (WHERE a.status = 'LATE')::int            AS late
    FROM attendance a
    JOIN class_session cs ON cs.id = a.session_id
    WHERE a.student_id = ${input.studentId}
      AND (${input.from ?? null}::date IS NULL OR cs.session_date >= ${input.from ?? null}::date)
      AND (${input.to ?? null}::date IS NULL OR cs.session_date <= ${input.to ?? null}::date)
  `);
  const r = (rows as unknown as Array<{
    total: number;
    present: number;
    absent: number;
    late: number;
  }>)[0];
  const total = toN(r?.total);
  const present = toN(r?.present);
  const absent = toN(r?.absent);
  const late = toN(r?.late);
  return ok({
    from: input.from ?? null,
    to: input.to ?? null,
    totalSessions: total,
    presentCount: present,
    absentCount: absent,
    lateCount: late,
    attendancePct: total === 0 ? null : round2(((present + late) / total) * 100),
  });
}

// 1.3 — "Was he there on 15th January?" / "attendance last week"
export type AttendanceDay = {
  date: string;
  status: AttendanceStatus | null;
  classroomName: string;
};

export async function getAttendanceByDateRange(input: {
  studentId: number;
  from: string;
  to: string;
}): Promise<Result<AttendanceDay[]>> {
  const rows = await db.execute(sql`
    SELECT
      cs.session_date::text AS date,
      a.status::text        AS status,
      c.name                AS classroom_name
    FROM class_session cs
    JOIN classroom_membership cm
      ON cm.classroom_id = cs.classroom_id AND cm.student_id = ${input.studentId}
    JOIN classrooms c ON c.id = cs.classroom_id
    LEFT JOIN attendance a
      ON a.session_id = cs.id AND a.student_id = ${input.studentId}
    WHERE cs.session_date BETWEEN ${input.from}::date AND ${input.to}::date
    ORDER BY cs.session_date ASC
  `);
  return ok(
    (rows as unknown as Array<{
      date: string;
      status: AttendanceStatus | null;
      classroom_name: string;
    }>).map((r) => ({
      date: r.date,
      status: r.status,
      classroomName: r.classroom_name,
    })),
  );
}

// =============================================================================
// CATEGORY 2 — GRADES / PERFORMANCE
// =============================================================================

// 2.1 — "Show me his recent scores"
export async function getRecentGrades(input: {
  studentId: number;
  limit?: number;
}): Promise<Result<SubmissionBrief[]>> {
  const limit = Math.max(1, Math.min(50, input.limit ?? 5));
  const rows = await db.execute(sql`
    SELECT
      a.id            AS assignment_id,
      a.title,
      a.subject,
      a.type::text    AS type,
      s.score::float  AS score,
      a.max_score::float AS max_score,
      s.percentage::float AS percentage,
      s.submitted_at,
      a.due_date
    FROM assignment_submission s
    JOIN assignments a ON a.id = s.assignment_id
    WHERE s.student_id = ${input.studentId}
    ORDER BY s.submitted_at DESC
    LIMIT ${limit}
  `);
  return ok(
    (rows as unknown as Array<{
      assignment_id: number;
      title: string;
      subject: string;
      type: "HOMEWORK" | "QUIZ" | "TEST";
      score: number;
      max_score: number;
      percentage: number;
      submitted_at: Date | string;
      due_date: Date | string;
    }>).map((r) => ({
      assignmentId: toN(r.assignment_id),
      title: r.title,
      subject: r.subject,
      type: r.type,
      score: toN(r.score),
      maxScore: toN(r.max_score),
      percentage: toN(r.percentage),
      submittedAt: toIso(r.submitted_at)!,
      dueDate: toIso(r.due_date)!,
    })),
  );
}

// 2.2 — "How is Arjun doing in Math?" (single subject)
export type SubjectPerformance = {
  subject: string;
  assignmentsCount: number;
  averagePct: number | null;
  highestPct: number | null;
  lowestPct: number | null;
  recentSubmissions: SubmissionBrief[];
};

export async function getSubjectPerformance(input: {
  studentId: number;
  subject: string; // fuzzy match via ILIKE '%subject%'
  recentLimit?: number;
}): Promise<Result<SubjectPerformance>> {
  const recentLimit = Math.max(1, Math.min(20, input.recentLimit ?? 5));
  const pattern = `%${input.subject.trim()}%`;

  const aggRows = await db.execute(sql`
    SELECT
      COUNT(*)::int                       AS cnt,
      AVG(s.percentage)::float            AS avg_pct,
      MAX(s.percentage)::float            AS max_pct,
      MIN(s.percentage)::float            AS min_pct
    FROM assignment_submission s
    JOIN assignments a ON a.id = s.assignment_id
    WHERE s.student_id = ${input.studentId}
      AND a.subject ILIKE ${pattern}
  `);
  const agg = (aggRows as unknown as Array<{
    cnt: number;
    avg_pct: number | null;
    max_pct: number | null;
    min_pct: number | null;
  }>)[0];

  const recentRows = await db.execute(sql`
    SELECT
      a.id            AS assignment_id,
      a.title,
      a.subject,
      a.type::text    AS type,
      s.score::float  AS score,
      a.max_score::float AS max_score,
      s.percentage::float AS percentage,
      s.submitted_at,
      a.due_date
    FROM assignment_submission s
    JOIN assignments a ON a.id = s.assignment_id
    WHERE s.student_id = ${input.studentId}
      AND a.subject ILIKE ${pattern}
    ORDER BY s.submitted_at DESC
    LIMIT ${recentLimit}
  `);

  return ok({
    subject: input.subject,
    assignmentsCount: toN(agg?.cnt),
    averagePct: agg?.avg_pct == null ? null : round2(Number(agg.avg_pct)),
    highestPct: agg?.max_pct == null ? null : round2(Number(agg.max_pct)),
    lowestPct: agg?.min_pct == null ? null : round2(Number(agg.min_pct)),
    recentSubmissions: (recentRows as unknown as Array<{
      assignment_id: number;
      title: string;
      subject: string;
      type: "HOMEWORK" | "QUIZ" | "TEST";
      score: number;
      max_score: number;
      percentage: number;
      submitted_at: Date | string;
      due_date: Date | string;
    }>).map((r) => ({
      assignmentId: toN(r.assignment_id),
      title: r.title,
      subject: r.subject,
      type: r.type,
      score: toN(r.score),
      maxScore: toN(r.max_score),
      percentage: toN(r.percentage),
      submittedAt: toIso(r.submitted_at)!,
      dueDate: toIso(r.due_date)!,
    })),
  });
}

// 4.2 — "Show me grades for all subjects" / "weakest subject"
export type SubjectBreakdown = {
  subject: string;
  assignmentsCount: number;
  averagePct: number;
};

export async function getAllSubjectsPerformance(
  studentId: number,
): Promise<Result<{
  subjects: SubjectBreakdown[];
  bestSubject: string | null;
  weakestSubject: string | null;
}>> {
  const rows = await db.execute(sql`
    SELECT
      a.subject,
      COUNT(*)::int                           AS cnt,
      ROUND(AVG(s.percentage)::numeric, 2)::float AS avg_pct
    FROM assignment_submission s
    JOIN assignments a ON a.id = s.assignment_id
    WHERE s.student_id = ${studentId}
    GROUP BY a.subject
    ORDER BY avg_pct DESC
  `);
  const subjects = (rows as unknown as Array<{
    subject: string;
    cnt: number;
    avg_pct: number;
  }>).map((r) => ({
    subject: r.subject,
    assignmentsCount: toN(r.cnt),
    averagePct: toN(r.avg_pct),
  }));
  const best = subjects[0]?.subject ?? null;
  const weakest = subjects.length >= 2 ? subjects[subjects.length - 1]!.subject : null;
  return ok({ subjects, bestSubject: best, weakestSubject: weakest });
}

// 2.3 — "Is he above class average in Math?"
export type ClassComparison = {
  studentAveragePct: number | null;
  classAveragePct: number | null;
  rank: number | null; // 1-indexed; null if student has no submissions
  totalStudents: number;
  subject: string | null;
};

export async function getClassComparison(input: {
  studentId: number;
  classroomId: number;
  subject?: string; // optional; if null, averages across all subjects
}): Promise<Result<ClassComparison>> {
  const subjectPattern = input.subject ? `%${input.subject.trim()}%` : null;
  const rows = await db.execute(sql`
    WITH student_avgs AS (
      SELECT
        s.student_id,
        AVG(s.percentage)::float AS avg_pct
      FROM assignment_submission s
      JOIN assignments a ON a.id = s.assignment_id
      WHERE a.classroom_id = ${input.classroomId}
        AND (${subjectPattern}::text IS NULL OR a.subject ILIKE ${subjectPattern}::text)
      GROUP BY s.student_id
    ),
    ranked AS (
      SELECT
        student_id,
        avg_pct,
        RANK() OVER (ORDER BY avg_pct DESC) AS rnk
      FROM student_avgs
    )
    SELECT
      (SELECT avg_pct FROM ranked WHERE student_id = ${input.studentId}) AS student_avg,
      (SELECT AVG(avg_pct) FROM student_avgs)::float                      AS class_avg,
      (SELECT rnk FROM ranked WHERE student_id = ${input.studentId})::int AS rnk,
      (SELECT COUNT(*) FROM student_avgs)::int                            AS total
  `);
  const r = (rows as unknown as Array<{
    student_avg: number | null;
    class_avg: number | null;
    rnk: number | null;
    total: number;
  }>)[0];
  return ok({
    studentAveragePct: r?.student_avg == null ? null : round2(Number(r.student_avg)),
    classAveragePct: r?.class_avg == null ? null : round2(Number(r.class_avg)),
    rank: r?.rnk == null ? null : toN(r.rnk),
    totalStudents: toN(r?.total),
    subject: input.subject ?? null,
  });
}

// 2.4 — "Is Arjun improving?" (per-subject or overall)
export type GradeTrend = {
  subject: string | null;
  totalSubmissions: number;
  earlierHalfAvgPct: number | null;
  recentHalfAvgPct: number | null;
  direction: "improving" | "declining" | "stable" | "insufficient_data";
  deltaPct: number | null;
};

export async function getGradeTrend(input: {
  studentId: number;
  subject?: string;
}): Promise<Result<GradeTrend>> {
  const subjectPattern = input.subject ? `%${input.subject.trim()}%` : null;
  const rows = await db.execute(sql`
    WITH scoped AS (
      SELECT
        s.percentage::float AS pct,
        s.submitted_at,
        NTILE(2) OVER (ORDER BY s.submitted_at) AS half
      FROM assignment_submission s
      JOIN assignments a ON a.id = s.assignment_id
      WHERE s.student_id = ${input.studentId}
        AND (${subjectPattern}::text IS NULL OR a.subject ILIKE ${subjectPattern}::text)
    )
    SELECT
      COUNT(*)::int                               AS total,
      AVG(pct) FILTER (WHERE half = 1)::float     AS earlier_avg,
      AVG(pct) FILTER (WHERE half = 2)::float     AS recent_avg
    FROM scoped
  `);
  const r = (rows as unknown as Array<{
    total: number;
    earlier_avg: number | null;
    recent_avg: number | null;
  }>)[0];
  const total = toN(r?.total);
  if (total < 3 || r?.earlier_avg == null || r?.recent_avg == null) {
    return ok({
      subject: input.subject ?? null,
      totalSubmissions: total,
      earlierHalfAvgPct: r?.earlier_avg == null ? null : round2(Number(r.earlier_avg)),
      recentHalfAvgPct: r?.recent_avg == null ? null : round2(Number(r.recent_avg)),
      direction: "insufficient_data",
      deltaPct: null,
    });
  }
  const earlier = round2(Number(r.earlier_avg));
  const recent = round2(Number(r.recent_avg));
  const delta = round2(recent - earlier);
  const direction =
    delta > 5 ? "improving" : delta < -5 ? "declining" : "stable";
  return ok({
    subject: input.subject ?? null,
    totalSubmissions: total,
    earlierHalfAvgPct: earlier,
    recentHalfAvgPct: recent,
    direction,
    deltaPct: delta,
  });
}

// 2.5 — "What did he get on the Math Quiz 1?" (fuzzy title)
export async function findSubmissionsByTitle(input: {
  studentId: number;
  titlePattern: string;
}): Promise<Result<SubmissionBrief[]>> {
  const pattern = `%${input.titlePattern.trim()}%`;
  const rows = await db.execute(sql`
    SELECT
      a.id            AS assignment_id,
      a.title,
      a.subject,
      a.type::text    AS type,
      s.score::float  AS score,
      a.max_score::float AS max_score,
      s.percentage::float AS percentage,
      s.submitted_at,
      a.due_date
    FROM assignment_submission s
    JOIN assignments a ON a.id = s.assignment_id
    WHERE s.student_id = ${input.studentId}
      AND a.title ILIKE ${pattern}
    ORDER BY s.submitted_at DESC
    LIMIT 10
  `);
  return ok(
    (rows as unknown as Array<{
      assignment_id: number;
      title: string;
      subject: string;
      type: "HOMEWORK" | "QUIZ" | "TEST";
      score: number;
      max_score: number;
      percentage: number;
      submitted_at: Date | string;
      due_date: Date | string;
    }>).map((r) => ({
      assignmentId: toN(r.assignment_id),
      title: r.title,
      subject: r.subject,
      type: r.type,
      score: toN(r.score),
      maxScore: toN(r.max_score),
      percentage: toN(r.percentage),
      submittedAt: toIso(r.submitted_at)!,
      dueDate: toIso(r.due_date)!,
    })),
  );
}

// 2.5 — "What's due tomorrow?" / "upcoming assignments"
export async function getUpcomingAssignments(input: {
  studentId: number;
  days?: number;
  limit?: number;
}): Promise<Result<UpcomingAssignment[]>> {
  const days = Math.max(1, Math.min(90, input.days ?? 7));
  const limit = Math.max(1, Math.min(50, input.limit ?? 10));
  const rows = await db.execute(sql`
    SELECT
      a.id              AS assignment_id,
      a.title,
      a.subject,
      a.type::text      AS type,
      a.max_score::float AS max_score,
      a.due_date
    FROM assignments a
    JOIN classroom_membership cm
      ON cm.classroom_id = a.classroom_id AND cm.student_id = ${input.studentId}
    WHERE a.due_date >= NOW()
      AND a.due_date <= NOW() + (${days}::int || ' days')::interval
      AND NOT EXISTS (
        SELECT 1 FROM assignment_submission s
        WHERE s.assignment_id = a.id AND s.student_id = ${input.studentId}
      )
    ORDER BY a.due_date ASC
    LIMIT ${limit}
  `);
  return ok(
    (rows as unknown as Array<{
      assignment_id: number;
      title: string;
      subject: string;
      type: "HOMEWORK" | "QUIZ" | "TEST";
      max_score: number;
      due_date: Date | string;
    }>).map((r) => ({
      assignmentId: toN(r.assignment_id),
      title: r.title,
      subject: r.subject,
      type: r.type,
      maxScore: toN(r.max_score),
      dueDate: toIso(r.due_date)!,
    })),
  );
}

// 2.5 — "What assignments are pending?" (any overdue + unsubmitted)
export type PendingAssignment = UpcomingAssignment & { daysOverdue: number };

export async function getPendingAssignments(input: {
  studentId: number;
  includeOverdue?: boolean;
}): Promise<Result<PendingAssignment[]>> {
  const includeOverdue = input.includeOverdue ?? true;
  const rows = await db.execute(sql`
    SELECT
      a.id              AS assignment_id,
      a.title,
      a.subject,
      a.type::text      AS type,
      a.max_score::float AS max_score,
      a.due_date,
      GREATEST(0, EXTRACT(DAY FROM (NOW() - a.due_date))::int) AS days_overdue
    FROM assignments a
    JOIN classroom_membership cm
      ON cm.classroom_id = a.classroom_id AND cm.student_id = ${input.studentId}
    WHERE NOT EXISTS (
      SELECT 1 FROM assignment_submission s
      WHERE s.assignment_id = a.id AND s.student_id = ${input.studentId}
    )
    AND (
      a.due_date >= NOW()
      OR (${includeOverdue}::boolean AND a.due_date < NOW())
    )
    ORDER BY a.due_date ASC
    LIMIT 50
  `);
  return ok(
    (rows as unknown as Array<{
      assignment_id: number;
      title: string;
      subject: string;
      type: "HOMEWORK" | "QUIZ" | "TEST";
      max_score: number;
      due_date: Date | string;
      days_overdue: number;
    }>).map((r) => ({
      assignmentId: toN(r.assignment_id),
      title: r.title,
      subject: r.subject,
      type: r.type,
      maxScore: toN(r.max_score),
      dueDate: toIso(r.due_date)!,
      daysOverdue: toN(r.days_overdue),
    })),
  );
}

// =============================================================================
// CATEGORY 4.1 — VAGUE / HOLISTIC ("how is my son?")
// Single query, multiple CTEs, one round-trip.
// =============================================================================

export type StudentOverview = {
  studentId: number;
  fullName: string;
  classroomId: number | null;
  classroomName: string | null;

  // attendance
  attendance: {
    totalSessions: number;
    presentCount: number;
    absentCount: number;
    lateCount: number;
    pctOverall: number | null;
    pctLast30d: number | null;
    lastSessionDate: string | null;
    lastSessionStatus: AttendanceStatus | null;
  };

  // academics
  academics: {
    submissionsCount: number;
    gradeAvgOverallPct: number | null;
    gradeAvgRecent30dPct: number | null;
    bestSubject: string | null;
    weakestSubject: string | null;
    subjectsBreakdown: SubjectBreakdown[];
    recentSubmissions: SubmissionBrief[];
  };

  // forward-looking
  upcoming: {
    dueInNext7d: UpcomingAssignment[];
    pendingCount: number;
    overdueCount: number;
  };
};

export async function getStudentOverview(
  studentId: number,
): Promise<Result<StudentOverview | null>> {
  // Meta: student row + primary classroom in one query.
  const metaRows = await db.execute(sql`
    SELECT
      u.id                        AS student_id,
      u.full_name,
      (
        SELECT cm.classroom_id
        FROM classroom_membership cm
        WHERE cm.student_id = u.id
        ORDER BY cm.enrolled_at ASC, cm.id ASC
        LIMIT 1
      )                           AS classroom_id,
      (
        SELECT c.name
        FROM classroom_membership cm
        JOIN classrooms c ON c.id = cm.classroom_id
        WHERE cm.student_id = u.id
        ORDER BY cm.enrolled_at ASC, cm.id ASC
        LIMIT 1
      )                           AS classroom_name
    FROM users u
    WHERE u.id = ${studentId} AND u.role = 'student'
  `);
  const meta = (metaRows as unknown as Array<{
    student_id: number;
    full_name: string;
    classroom_id: number | null;
    classroom_name: string | null;
  }>)[0];
  if (!meta) return ok(null);

  // Big compound query: attendance + academics + upcoming + subject breakdown.
  const aggRows = await db.execute(sql`
    WITH att AS (
      SELECT
        COUNT(*)::int                                        AS total,
        COUNT(*) FILTER (WHERE a.status = 'PRESENT')::int    AS present,
        COUNT(*) FILTER (WHERE a.status = 'ABSENT')::int     AS absent,
        COUNT(*) FILTER (WHERE a.status = 'LATE')::int       AS late,
        (
          SELECT cs2.session_date::text
          FROM attendance a2
          JOIN class_session cs2 ON cs2.id = a2.session_id
          WHERE a2.student_id = ${studentId}
          ORDER BY cs2.session_date DESC LIMIT 1
        )                                                    AS last_date,
        (
          SELECT a2.status::text
          FROM attendance a2
          JOIN class_session cs2 ON cs2.id = a2.session_id
          WHERE a2.student_id = ${studentId}
          ORDER BY cs2.session_date DESC LIMIT 1
        )                                                    AS last_status
      FROM attendance a
      WHERE a.student_id = ${studentId}
    ),
    att30 AS (
      SELECT
        COUNT(*)::int                                        AS total,
        COUNT(*) FILTER (WHERE a.status IN ('PRESENT','LATE'))::int AS good
      FROM attendance a
      JOIN class_session cs ON cs.id = a.session_id
      WHERE a.student_id = ${studentId}
        AND cs.session_date >= CURRENT_DATE - INTERVAL '30 days'
    ),
    subs AS (
      SELECT COUNT(*)::int AS cnt, AVG(s.percentage)::float AS avg_pct
      FROM assignment_submission s
      WHERE s.student_id = ${studentId}
    ),
    subs30 AS (
      SELECT AVG(s.percentage)::float AS avg_pct
      FROM assignment_submission s
      WHERE s.student_id = ${studentId}
        AND s.submitted_at >= NOW() - INTERVAL '30 days'
    ),
    pending AS (
      SELECT
        COUNT(*) FILTER (WHERE a.due_date >= NOW())::int     AS pending_cnt,
        COUNT(*) FILTER (WHERE a.due_date < NOW())::int      AS overdue_cnt
      FROM assignments a
      JOIN classroom_membership cm
        ON cm.classroom_id = a.classroom_id AND cm.student_id = ${studentId}
      WHERE NOT EXISTS (
        SELECT 1 FROM assignment_submission s
        WHERE s.assignment_id = a.id AND s.student_id = ${studentId}
      )
    )
    SELECT
      (SELECT total FROM att)                   AS att_total,
      (SELECT present FROM att)                 AS att_present,
      (SELECT absent FROM att)                  AS att_absent,
      (SELECT late FROM att)                    AS att_late,
      (SELECT last_date FROM att)               AS att_last_date,
      (SELECT last_status FROM att)             AS att_last_status,
      (SELECT total FROM att30)                 AS att30_total,
      (SELECT good FROM att30)                  AS att30_good,
      (SELECT cnt FROM subs)                    AS subs_cnt,
      (SELECT avg_pct FROM subs)                AS subs_avg,
      (SELECT avg_pct FROM subs30)              AS subs30_avg,
      (SELECT pending_cnt FROM pending)         AS pending_cnt,
      (SELECT overdue_cnt FROM pending)         AS overdue_cnt
  `);
  const r = (aggRows as unknown as Array<{
    att_total: number;
    att_present: number;
    att_absent: number;
    att_late: number;
    att_last_date: string | null;
    att_last_status: AttendanceStatus | null;
    att30_total: number;
    att30_good: number;
    subs_cnt: number;
    subs_avg: number | null;
    subs30_avg: number | null;
    pending_cnt: number;
    overdue_cnt: number;
  }>)[0]!;

  const attTotal = toN(r.att_total);
  const attPct = attTotal === 0
    ? null
    : round2(((toN(r.att_present) + toN(r.att_late)) / attTotal) * 100);
  const att30Total = toN(r.att30_total);
  const att30Pct = att30Total === 0 ? null : round2((toN(r.att30_good) / att30Total) * 100);

  // Subject breakdown + recent subs via separate cheap calls (we already have
  // the helpers; one extra round-trip each — acceptable for the vague path).
  const subjectsResult = await getAllSubjectsPerformance(studentId);
  const recentResult = await getRecentGrades({ studentId, limit: 5 });
  const upcomingResult = await getUpcomingAssignments({ studentId, days: 7, limit: 10 });

  if (!subjectsResult.success) return subjectsResult;
  if (!recentResult.success) return recentResult;
  if (!upcomingResult.success) return upcomingResult;

  return ok({
    studentId: meta.student_id,
    fullName: meta.full_name,
    classroomId: meta.classroom_id,
    classroomName: meta.classroom_name,
    attendance: {
      totalSessions: attTotal,
      presentCount: toN(r.att_present),
      absentCount: toN(r.att_absent),
      lateCount: toN(r.att_late),
      pctOverall: attPct,
      pctLast30d: att30Pct,
      lastSessionDate: r.att_last_date,
      lastSessionStatus: r.att_last_status,
    },
    academics: {
      submissionsCount: toN(r.subs_cnt),
      gradeAvgOverallPct: toNullable(r.subs_avg) == null ? null : round2(Number(r.subs_avg)),
      gradeAvgRecent30dPct:
        toNullable(r.subs30_avg) == null ? null : round2(Number(r.subs30_avg)),
      bestSubject: subjectsResult.data.bestSubject,
      weakestSubject: subjectsResult.data.weakestSubject,
      subjectsBreakdown: subjectsResult.data.subjects,
      recentSubmissions: recentResult.data,
    },
    upcoming: {
      dueInNext7d: upcomingResult.data,
      pendingCount: toN(r.pending_cnt),
      overdueCount: toN(r.overdue_cnt),
    },
  });
}

// =============================================================================
// CATEGORY 3 — MULTIPLE CHILDREN (parent)
// =============================================================================

export type ChildSummary = {
  studentId: number;
  fullName: string;
  attendancePct: number | null;
  gradeAvgPct: number | null;
  submissionsCount: number;
  pendingCount: number;
  lastSessionDate: string | null;
};

export async function getChildrenSummaryForParent(
  parentId: number,
): Promise<Result<ChildSummary[]>> {
  const rows = await db.execute(sql`
    WITH linked AS (
      SELECT psl.student_id, u.full_name
      FROM parent_student_link psl
      JOIN users u ON u.id = psl.student_id
      WHERE psl.parent_id = ${parentId}
    ),
    att AS (
      SELECT
        a.student_id,
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE a.status IN ('PRESENT','LATE'))::int AS good,
        MAX(cs.session_date)::text AS last_date
      FROM attendance a
      JOIN class_session cs ON cs.id = a.session_id
      WHERE a.student_id IN (SELECT student_id FROM linked)
      GROUP BY a.student_id
    ),
    subs AS (
      SELECT
        s.student_id,
        COUNT(*)::int AS cnt,
        AVG(s.percentage)::float AS avg_pct
      FROM assignment_submission s
      WHERE s.student_id IN (SELECT student_id FROM linked)
      GROUP BY s.student_id
    ),
    pending AS (
      SELECT
        cm.student_id,
        COUNT(*)::int AS cnt
      FROM assignments a
      JOIN classroom_membership cm ON cm.classroom_id = a.classroom_id
      WHERE cm.student_id IN (SELECT student_id FROM linked)
        AND NOT EXISTS (
          SELECT 1 FROM assignment_submission s
          WHERE s.assignment_id = a.id AND s.student_id = cm.student_id
        )
      GROUP BY cm.student_id
    )
    SELECT
      l.student_id,
      l.full_name,
      COALESCE(att.total, 0)                                                          AS att_total,
      COALESCE(att.good, 0)                                                           AS att_good,
      att.last_date,
      COALESCE(subs.cnt, 0)                                                           AS subs_cnt,
      subs.avg_pct                                                                    AS subs_avg,
      COALESCE(pending.cnt, 0)                                                        AS pending_cnt
    FROM linked l
    LEFT JOIN att     ON att.student_id = l.student_id
    LEFT JOIN subs    ON subs.student_id = l.student_id
    LEFT JOIN pending ON pending.student_id = l.student_id
    ORDER BY l.full_name ASC
  `);
  return ok(
    (rows as unknown as Array<{
      student_id: number;
      full_name: string;
      att_total: number;
      att_good: number;
      last_date: string | null;
      subs_cnt: number;
      subs_avg: number | null;
      pending_cnt: number;
    }>).map((r) => {
      const attTotal = toN(r.att_total);
      return {
        studentId: toN(r.student_id),
        fullName: r.full_name,
        attendancePct: attTotal === 0 ? null : round2((toN(r.att_good) / attTotal) * 100),
        gradeAvgPct: r.subs_avg == null ? null : round2(Number(r.subs_avg)),
        submissionsCount: toN(r.subs_cnt),
        pendingCount: toN(r.pending_cnt),
        lastSessionDate: r.last_date,
      };
    }),
  );
}

// Guard to silence unused `err` lint if nothing ever errors at this layer.
// (Kept in imports so callers that chain Results still see it.)
export const __errGuard = err;
