import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../client.js";
import {
  assignmentSubmission,
  assignments,
  attendance,
  classSession,
  classroomMembership,
  classroomQuizSubmissions,
  classroomQuizzes,
  classrooms,
  users,
} from "../schema.js";
import { err, ok, type Result } from "./result.js";

/**
 * Aggregator queries for the teacher + student dashboards.
 *
 * Each query bundles everything one dashboard screen needs into a
 * single Result so the UI can render with minimal fetch fan-out. All
 * time-windowed queries default to the last N days; callers can
 * override for zoom-in views.
 */

const DEFAULT_WINDOW_DAYS = 14;

function windowStart(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - (days - 1));
  return d.toISOString().slice(0, 10);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// ─── Teacher overview ────────────────────────────────────────────────────

export type AttendanceTrendDay = {
  date: string;
  present: number;
  absent: number;
  late: number;
};

export type RecentQuizSubmission = {
  submissionId: string;
  quizId: string;
  quizTitle: string;
  subject: string;
  studentId: number;
  studentName: string;
  score: number;
  maxScore: number;
  percentage: number;
  submittedAt: string;
};

export type SubjectAverage = { subject: string; avgPercentage: number; count: number };

export type TeacherOverview = {
  totals: {
    classrooms: number;
    students: number;
    quizzesPublished: number;
    quizSubmissions: number;
  };
  attendance: {
    last14Days: AttendanceTrendDay[];
    overallPresentPct: number;
    overallLatePct: number;
    overallAbsentPct: number;
  };
  avgQuizPct: number;
  avgAssignmentPct: number;
  recentQuizSubmissions: RecentQuizSubmission[];
  subjectBreakdown: SubjectAverage[];
};

export async function getTeacherOverview(
  teacherId: number,
): Promise<Result<TeacherOverview>> {
  try {
    // 1. Classrooms + their ids.
    const myClassrooms = await db
      .select({
        classroomId: classrooms.id,
        subject: classrooms.subject,
        grade: classrooms.name,
      })
      .from(classrooms)
      .where(eq(classrooms.teacherId, teacherId));
    const classroomIds = myClassrooms.map((c) => c.classroomId);

    if (classroomIds.length === 0) {
      return ok({
        totals: {
          classrooms: 0,
          students: 0,
          quizzesPublished: 0,
          quizSubmissions: 0,
        },
        attendance: {
          last14Days: buildEmptyTrend(DEFAULT_WINDOW_DAYS),
          overallPresentPct: 0,
          overallLatePct: 0,
          overallAbsentPct: 0,
        },
        avgQuizPct: 0,
        avgAssignmentPct: 0,
        recentQuizSubmissions: [],
        subjectBreakdown: [],
      });
    }

    // 2. Student count (distinct, since a student can be in multiple of my classrooms).
    const studentCountRows = await db
      .select({
        studentCount: sql<number>`cast(count(distinct ${classroomMembership.studentId}) as int)`,
      })
      .from(classroomMembership)
      .where(inArray(classroomMembership.classroomId, classroomIds));
    const studentCount = studentCountRows[0]?.studentCount ?? 0;

    // 3. Attendance — last 14 days, stacked by status.
    const from = windowStart(DEFAULT_WINDOW_DAYS);
    const to = todayIso();
    const attendanceRows = await db
      .select({
        date: sql<string>`${classSession.sessionDate}::text`,
        status: attendance.status,
        c: sql<number>`cast(count(*) as int)`,
      })
      .from(attendance)
      .innerJoin(classSession, eq(classSession.id, attendance.sessionId))
      .where(
        and(
          inArray(classSession.classroomId, classroomIds),
          sql`${classSession.sessionDate} BETWEEN ${from}::date AND ${to}::date`,
        ),
      )
      .groupBy(classSession.sessionDate, attendance.status);

    const trendMap = new Map<string, AttendanceTrendDay>();
    for (const d of buildEmptyTrend(DEFAULT_WINDOW_DAYS)) {
      trendMap.set(d.date, d);
    }
    let totalPresent = 0, totalLate = 0, totalAbsent = 0;
    for (const r of attendanceRows) {
      const day = trendMap.get(r.date);
      if (!day) continue;
      if (r.status === "PRESENT") {
        day.present += r.c;
        totalPresent += r.c;
      } else if (r.status === "LATE") {
        day.late += r.c;
        totalLate += r.c;
      } else if (r.status === "ABSENT") {
        day.absent += r.c;
        totalAbsent += r.c;
      }
    }
    const totalAtt = totalPresent + totalLate + totalAbsent;
    const attendanceSummary = {
      overallPresentPct: totalAtt ? +(totalPresent * 100 / totalAtt).toFixed(1) : 0,
      overallLatePct: totalAtt ? +(totalLate * 100 / totalAtt).toFixed(1) : 0,
      overallAbsentPct: totalAtt ? +(totalAbsent * 100 / totalAtt).toFixed(1) : 0,
    };

    // 4. Quiz stats.
    const publishedRows = await db
      .select({ quizzesPublished: sql<number>`cast(count(*) as int)` })
      .from(classroomQuizzes)
      .where(eq(classroomQuizzes.createdBy, teacherId));
    const quizzesPublished = publishedRows[0]?.quizzesPublished ?? 0;

    const quizIdsRows = await db
      .select({ id: classroomQuizzes.id })
      .from(classroomQuizzes)
      .where(eq(classroomQuizzes.createdBy, teacherId));
    const quizIds = quizIdsRows.map((r) => r.id);

    let quizSubmissionsCount = 0;
    let avgQuizPct = 0;
    const recentQuizSubmissions: RecentQuizSubmission[] = [];
    if (quizIds.length > 0) {
      const aggRows = await db
        .select({
          total: sql<number>`cast(count(*) as int)`,
          avg: sql<number>`coalesce(avg(${classroomQuizSubmissions.percentage}), 0)`,
        })
        .from(classroomQuizSubmissions)
        .where(inArray(classroomQuizSubmissions.quizId, quizIds));
      quizSubmissionsCount = aggRows[0]?.total ?? 0;
      avgQuizPct = Number(aggRows[0]?.avg ?? 0);

      const recent = await db
        .select({
          submissionId: classroomQuizSubmissions.id,
          quizId: classroomQuizSubmissions.quizId,
          quizTitle: classroomQuizzes.title,
          subject: classroomQuizzes.subject,
          studentId: classroomQuizSubmissions.studentId,
          studentName: users.fullName,
          score: classroomQuizSubmissions.score,
          maxScore: classroomQuizSubmissions.maxScore,
          percentage: classroomQuizSubmissions.percentage,
          submittedAt: classroomQuizSubmissions.submittedAt,
        })
        .from(classroomQuizSubmissions)
        .innerJoin(
          classroomQuizzes,
          eq(classroomQuizzes.id, classroomQuizSubmissions.quizId),
        )
        .innerJoin(users, eq(users.id, classroomQuizSubmissions.studentId))
        .where(inArray(classroomQuizSubmissions.quizId, quizIds))
        .orderBy(desc(classroomQuizSubmissions.submittedAt))
        .limit(10);
      for (const r of recent) {
        recentQuizSubmissions.push({
          submissionId: r.submissionId,
          quizId: r.quizId,
          quizTitle: r.quizTitle,
          subject: r.subject,
          studentId: r.studentId,
          studentName: r.studentName,
          score: Number(r.score),
          maxScore: Number(r.maxScore),
          percentage: Number(r.percentage),
          submittedAt: r.submittedAt.toISOString(),
        });
      }
    }

    // 5. Assignment (marks) average — across teacher's classrooms.
    const assignmentIds = (await db
      .select({ id: assignments.id })
      .from(assignments)
      .where(inArray(assignments.classroomId, classroomIds)))
      .map((r) => r.id);
    let avgAssignmentPct = 0;
    if (assignmentIds.length > 0) {
      const aggRows = await db
        .select({
          avg: sql<number>`coalesce(avg(${assignmentSubmission.percentage}), 0)`,
        })
        .from(assignmentSubmission)
        .where(inArray(assignmentSubmission.assignmentId, assignmentIds));
      avgAssignmentPct = Number(aggRows[0]?.avg ?? 0);
    }

    // 6. Subject breakdown — combine quiz + assignment %s per subject.
    const subjectMap = new Map<string, { total: number; count: number }>();

    if (quizIds.length > 0) {
      const rows = await db
        .select({
          subject: classroomQuizzes.subject,
          percentage: classroomQuizSubmissions.percentage,
        })
        .from(classroomQuizSubmissions)
        .innerJoin(
          classroomQuizzes,
          eq(classroomQuizzes.id, classroomQuizSubmissions.quizId),
        )
        .where(inArray(classroomQuizSubmissions.quizId, quizIds));
      for (const r of rows) {
        const s = subjectMap.get(r.subject) ?? { total: 0, count: 0 };
        s.total += Number(r.percentage);
        s.count += 1;
        subjectMap.set(r.subject, s);
      }
    }
    if (assignmentIds.length > 0) {
      const rows = await db
        .select({
          subject: assignments.subject,
          percentage: assignmentSubmission.percentage,
        })
        .from(assignmentSubmission)
        .innerJoin(assignments, eq(assignments.id, assignmentSubmission.assignmentId))
        .where(inArray(assignmentSubmission.assignmentId, assignmentIds));
      for (const r of rows) {
        const s = subjectMap.get(r.subject) ?? { total: 0, count: 0 };
        s.total += Number(r.percentage);
        s.count += 1;
        subjectMap.set(r.subject, s);
      }
    }
    const subjectBreakdown: SubjectAverage[] = [...subjectMap.entries()]
      .map(([subject, v]) => ({
        subject,
        avgPercentage: +(v.total / v.count).toFixed(1),
        count: v.count,
      }))
      .sort((a, b) => b.avgPercentage - a.avgPercentage);

    return ok({
      totals: {
        classrooms: classroomIds.length,
        students: studentCount,
        quizzesPublished,
        quizSubmissions: quizSubmissionsCount,
      },
      attendance: {
        last14Days: [...trendMap.values()].sort((a, b) =>
          a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
        ),
        ...attendanceSummary,
      },
      avgQuizPct: +avgQuizPct.toFixed(1),
      avgAssignmentPct: +avgAssignmentPct.toFixed(1),
      recentQuizSubmissions,
      subjectBreakdown,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return err("DB_ERROR", message);
  }
}

function buildEmptyTrend(days: number): AttendanceTrendDay[] {
  const out: AttendanceTrendDay[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    out.push({
      date: d.toISOString().slice(0, 10),
      present: 0,
      absent: 0,
      late: 0,
    });
  }
  return out;
}

// ─── Per-student detail ──────────────────────────────────────────────────

export type AttendanceTimelineEntry = {
  date: string;
  status: "PRESENT" | "ABSENT" | "LATE" | null;
  classroomName: string;
};

export type StudentQuizResult = {
  submissionId: string;
  quizId: string;
  quizTitle: string;
  subject: string;
  difficulty: "easy" | "medium" | "hard";
  score: number;
  maxScore: number;
  percentage: number;
  submittedAt: string;
};

export type StudentAssignmentResult = {
  submissionId: number;
  assignmentId: number;
  title: string;
  subject: string;
  type: "HOMEWORK" | "QUIZ" | "TEST";
  score: number;
  maxScore: number;
  percentage: number;
  submittedAt: string;
};

export type StudentDetail = {
  student: {
    id: number;
    fullName: string;
    username: string;
    phoneNumber: string;
  };
  classrooms: Array<{ classroomId: number; grade: string; subject: string }>;
  attendance: {
    last30Days: AttendanceTimelineEntry[];
    presentPct: number;
    absentPct: number;
    latePct: number;
  };
  quizResults: StudentQuizResult[];
  assignmentResults: StudentAssignmentResult[];
  subjectBreakdown: SubjectAverage[];
};

export async function getStudentDetail(
  studentId: number,
): Promise<Result<StudentDetail>> {
  try {
    const [studentRow] = await db
      .select({
        id: users.id,
        fullName: users.fullName,
        username: users.username,
        phoneNumber: users.phoneNumber,
        role: users.role,
      })
      .from(users)
      .where(eq(users.id, studentId))
      .limit(1);
    if (!studentRow) return err("NOT_FOUND", `student ${studentId} not found`);
    if (studentRow.role !== "student")
      return err("INVALID_INPUT", "user is not a student");

    // Classrooms.
    const classroomsRows = await db
      .select({
        classroomId: classrooms.id,
        grade: classrooms.name,
        subject: classrooms.subject,
      })
      .from(classroomMembership)
      .innerJoin(classrooms, eq(classrooms.id, classroomMembership.classroomId))
      .where(eq(classroomMembership.studentId, studentId))
      .orderBy(asc(classrooms.name), asc(classrooms.subject));

    // Attendance — last 30 days.
    const from = windowStart(30);
    const to = todayIso();
    const attRows = await db.execute(sql`
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
      WHERE cs.session_date BETWEEN ${from}::date AND ${to}::date
      ORDER BY cs.session_date ASC
    `);
    const last30Days = (
      attRows as unknown as Array<{
        date: string;
        status: "PRESENT" | "ABSENT" | "LATE" | null;
        classroom_name: string;
      }>
    ).map((r) => ({
      date: r.date,
      status: r.status,
      classroomName: r.classroom_name,
    }));

    let present = 0, late = 0, absent = 0, total = 0;
    for (const d of last30Days) {
      if (!d.status) continue;
      total += 1;
      if (d.status === "PRESENT") present += 1;
      else if (d.status === "LATE") late += 1;
      else if (d.status === "ABSENT") absent += 1;
    }
    const pct = (n: number) => (total ? +(n * 100 / total).toFixed(1) : 0);

    // Quiz results.
    const quizRows = await db
      .select({
        submissionId: classroomQuizSubmissions.id,
        quizId: classroomQuizzes.id,
        title: classroomQuizzes.title,
        subject: classroomQuizzes.subject,
        difficulty: classroomQuizzes.difficulty,
        score: classroomQuizSubmissions.score,
        maxScore: classroomQuizSubmissions.maxScore,
        percentage: classroomQuizSubmissions.percentage,
        submittedAt: classroomQuizSubmissions.submittedAt,
      })
      .from(classroomQuizSubmissions)
      .innerJoin(
        classroomQuizzes,
        eq(classroomQuizzes.id, classroomQuizSubmissions.quizId),
      )
      .where(eq(classroomQuizSubmissions.studentId, studentId))
      .orderBy(asc(classroomQuizSubmissions.submittedAt));

    const quizResults: StudentQuizResult[] = quizRows.map((r) => ({
      submissionId: r.submissionId,
      quizId: r.quizId,
      quizTitle: r.title,
      subject: r.subject,
      difficulty: r.difficulty,
      score: Number(r.score),
      maxScore: Number(r.maxScore),
      percentage: Number(r.percentage),
      submittedAt: r.submittedAt.toISOString(),
    }));

    // Assignment (marks) results.
    const asRows = await db
      .select({
        submissionId: assignmentSubmission.id,
        assignmentId: assignments.id,
        title: assignments.title,
        subject: assignments.subject,
        type: assignments.type,
        score: assignmentSubmission.score,
        maxScore: assignments.maxScore,
        percentage: assignmentSubmission.percentage,
        submittedAt: assignmentSubmission.submittedAt,
      })
      .from(assignmentSubmission)
      .innerJoin(assignments, eq(assignments.id, assignmentSubmission.assignmentId))
      .where(eq(assignmentSubmission.studentId, studentId))
      .orderBy(asc(assignmentSubmission.submittedAt));

    const assignmentResults: StudentAssignmentResult[] = asRows.map((r) => ({
      submissionId: r.submissionId,
      assignmentId: r.assignmentId,
      title: r.title,
      subject: r.subject,
      type: r.type,
      score: Number(r.score),
      maxScore: Number(r.maxScore),
      percentage: Number(r.percentage),
      submittedAt: r.submittedAt.toISOString(),
    }));

    // Subject breakdown (quiz + assignment combined).
    const subjMap = new Map<string, { total: number; count: number }>();
    for (const q of quizResults) {
      const s = subjMap.get(q.subject) ?? { total: 0, count: 0 };
      s.total += q.percentage;
      s.count += 1;
      subjMap.set(q.subject, s);
    }
    for (const a of assignmentResults) {
      const s = subjMap.get(a.subject) ?? { total: 0, count: 0 };
      s.total += a.percentage;
      s.count += 1;
      subjMap.set(a.subject, s);
    }
    const subjectBreakdown: SubjectAverage[] = [...subjMap.entries()]
      .map(([subject, v]) => ({
        subject,
        avgPercentage: +(v.total / v.count).toFixed(1),
        count: v.count,
      }))
      .sort((a, b) => b.avgPercentage - a.avgPercentage);

    return ok({
      student: {
        id: studentRow.id,
        fullName: studentRow.fullName,
        username: studentRow.username,
        phoneNumber: studentRow.phoneNumber,
      },
      classrooms: classroomsRows,
      attendance: {
        last30Days,
        presentPct: pct(present),
        absentPct: pct(absent),
        latePct: pct(late),
      },
      quizResults,
      assignmentResults,
      subjectBreakdown,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return err("DB_ERROR", message);
  }
}

/**
 * Validates that a teacher actually teaches this student before
 * returning the detail view. Thin wrapper over `getStudentDetail`.
 */
export async function getStudentDetailForTeacher(input: {
  teacherId: number;
  studentId: number;
}): Promise<Result<StudentDetail>> {
  // Ownership check via a direct join: does any classroom I teach
  // contain this student?
  const [hit] = await db
    .select({ id: classroomMembership.id })
    .from(classroomMembership)
    .innerJoin(classrooms, eq(classrooms.id, classroomMembership.classroomId))
    .where(
      and(
        eq(classroomMembership.studentId, input.studentId),
        eq(classrooms.teacherId, input.teacherId),
      ),
    )
    .limit(1);
  if (!hit) return err("UNAUTHORIZED", "you don't teach this student");
  return getStudentDetail(input.studentId);
}
