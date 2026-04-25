import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type {
  GeneratedQuiz,
  QuizAnalysis,
  QuizResponse,
} from "../../classroom/quizzes.js";
import { db } from "../client.js";
import {
  classroomMembership,
  classroomQuizSubmissions,
  classroomQuizzes,
  classrooms,
  users,
} from "../schema.js";
import { err, ok, type Result } from "./result.js";

/**
 * DB layer for teacher-created classroom quizzes.
 *
 *  - `insertClassroomQuiz` is called AFTER Gemini has produced the
 *    questions; this function is persistence only.
 *  - `listTeacherQuizzes` powers the teacher dashboard card per class.
 *  - `listQuizzesForStudent` powers the student-facing page: every
 *    quiz in every classroom the student is enrolled in, plus whether
 *    they've already submitted it.
 *  - `insertQuizSubmission` persists a scored submission with the full
 *    analysis blob and updates the PDF/report URL when available.
 */

export type ClassroomQuizRow = {
  id: string;
  classroomId: number;
  createdBy: number;
  title: string;
  subject: string;
  topic: string;
  difficulty: "easy" | "medium" | "hard";
  questionCount: number;
  timeLimitMinutes: number | null;
  instructions: string | null;
  maxScore: number;
  dueDate: string | null;
  createdAt: string;
};

export async function insertClassroomQuiz(input: {
  quiz: GeneratedQuiz;
  classroomId: number;
  createdBy: number;
  dueDate: Date | null;
}): Promise<Result<{ quizId: string }>> {
  try {
    const [row] = await db
      .insert(classroomQuizzes)
      .values({
        id: input.quiz.quizId,
        classroomId: input.classroomId,
        createdBy: input.createdBy,
        title: input.quiz.title,
        subject: input.quiz.subject,
        topic: input.quiz.topic,
        difficulty: input.quiz.difficulty,
        questionCount: input.quiz.questionCount,
        timeLimitMinutes: input.quiz.timeLimitMinutes,
        instructions: input.quiz.instructions,
        questions: input.quiz.questions,
        maxScore: input.quiz.maxScore.toString(),
        dueDate: input.dueDate,
        model: input.quiz.model,
      })
      .returning({ id: classroomQuizzes.id });
    if (!row) return err("DB_ERROR", "quiz insert returned nothing");
    return ok({ quizId: row.id });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return err("DB_ERROR", message);
  }
}

/**
 * Quizzes authored by this teacher (across all their classrooms) with
 * a submission count so the dashboard can show "12 students submitted".
 */
export type TeacherQuizSummary = {
  quiz: ClassroomQuizRow;
  classroomGrade: string;
  submissionCount: number;
};

export async function listTeacherQuizzes(
  teacherId: number,
): Promise<Result<TeacherQuizSummary[]>> {
  try {
    const rows = await db
      .select({
        id: classroomQuizzes.id,
        classroomId: classroomQuizzes.classroomId,
        createdBy: classroomQuizzes.createdBy,
        title: classroomQuizzes.title,
        subject: classroomQuizzes.subject,
        topic: classroomQuizzes.topic,
        difficulty: classroomQuizzes.difficulty,
        questionCount: classroomQuizzes.questionCount,
        timeLimitMinutes: classroomQuizzes.timeLimitMinutes,
        instructions: classroomQuizzes.instructions,
        maxScore: classroomQuizzes.maxScore,
        dueDate: classroomQuizzes.dueDate,
        createdAt: classroomQuizzes.createdAt,
        classroomGrade: classrooms.name,
      })
      .from(classroomQuizzes)
      .innerJoin(classrooms, eq(classrooms.id, classroomQuizzes.classroomId))
      .where(eq(classroomQuizzes.createdBy, teacherId))
      .orderBy(desc(classroomQuizzes.createdAt));

    if (rows.length === 0) return ok([]);

    const ids = rows.map((r) => r.id);
    const counts = await db
      .select({
        quizId: classroomQuizSubmissions.quizId,
        c: sql<number>`cast(count(*) as int)`,
      })
      .from(classroomQuizSubmissions)
      .where(inArray(classroomQuizSubmissions.quizId, ids))
      .groupBy(classroomQuizSubmissions.quizId);
    const countMap = new Map(counts.map((r) => [r.quizId, r.c]));

    const out: TeacherQuizSummary[] = rows.map((r) => ({
      quiz: {
        id: r.id,
        classroomId: r.classroomId,
        createdBy: r.createdBy,
        title: r.title,
        subject: r.subject,
        topic: r.topic,
        difficulty: r.difficulty,
        questionCount: r.questionCount,
        timeLimitMinutes: r.timeLimitMinutes,
        instructions: r.instructions,
        maxScore: Number(r.maxScore),
        dueDate: r.dueDate ? r.dueDate.toISOString() : null,
        createdAt: r.createdAt.toISOString(),
      },
      classroomGrade: r.classroomGrade,
      submissionCount: countMap.get(r.id) ?? 0,
    }));
    return ok(out);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return err("DB_ERROR", message);
  }
}

/**
 * Every quiz in every classroom this student is enrolled in, plus
 * submission metadata when they've already taken it.
 */
export type StudentQuizEntry = {
  quiz: ClassroomQuizRow;
  classroomGrade: string;
  teacherName: string;
  submission: {
    submissionId: string;
    score: number;
    maxScore: number;
    percentage: number;
    submittedAt: string;
    reportUrl: string | null;
  } | null;
};

export async function listQuizzesForStudent(
  studentId: number,
): Promise<Result<StudentQuizEntry[]>> {
  try {
    // All classrooms the student is in.
    const enrolled = await db
      .select({ classroomId: classroomMembership.classroomId })
      .from(classroomMembership)
      .where(eq(classroomMembership.studentId, studentId));
    if (enrolled.length === 0) return ok([]);

    const classroomIds = enrolled.map((r) => r.classroomId);

    const rows = await db
      .select({
        id: classroomQuizzes.id,
        classroomId: classroomQuizzes.classroomId,
        createdBy: classroomQuizzes.createdBy,
        title: classroomQuizzes.title,
        subject: classroomQuizzes.subject,
        topic: classroomQuizzes.topic,
        difficulty: classroomQuizzes.difficulty,
        questionCount: classroomQuizzes.questionCount,
        timeLimitMinutes: classroomQuizzes.timeLimitMinutes,
        instructions: classroomQuizzes.instructions,
        maxScore: classroomQuizzes.maxScore,
        dueDate: classroomQuizzes.dueDate,
        createdAt: classroomQuizzes.createdAt,
        classroomGrade: classrooms.name,
        teacherName: users.fullName,
      })
      .from(classroomQuizzes)
      .innerJoin(classrooms, eq(classrooms.id, classroomQuizzes.classroomId))
      .innerJoin(users, eq(users.id, classroomQuizzes.createdBy))
      .where(inArray(classroomQuizzes.classroomId, classroomIds))
      .orderBy(desc(classroomQuizzes.createdAt));

    if (rows.length === 0) return ok([]);

    const quizIds = rows.map((r) => r.id);
    const subs = await db
      .select({
        id: classroomQuizSubmissions.id,
        quizId: classroomQuizSubmissions.quizId,
        score: classroomQuizSubmissions.score,
        maxScore: classroomQuizSubmissions.maxScore,
        percentage: classroomQuizSubmissions.percentage,
        submittedAt: classroomQuizSubmissions.submittedAt,
        reportUrl: classroomQuizSubmissions.reportUrl,
      })
      .from(classroomQuizSubmissions)
      .where(
        and(
          eq(classroomQuizSubmissions.studentId, studentId),
          inArray(classroomQuizSubmissions.quizId, quizIds),
        ),
      );
    const subByQuiz = new Map(subs.map((s) => [s.quizId, s]));

    const out: StudentQuizEntry[] = rows.map((r) => {
      const s = subByQuiz.get(r.id);
      return {
        quiz: {
          id: r.id,
          classroomId: r.classroomId,
          createdBy: r.createdBy,
          title: r.title,
          subject: r.subject,
          topic: r.topic,
          difficulty: r.difficulty,
          questionCount: r.questionCount,
          timeLimitMinutes: r.timeLimitMinutes,
          instructions: r.instructions,
          maxScore: Number(r.maxScore),
          dueDate: r.dueDate ? r.dueDate.toISOString() : null,
          createdAt: r.createdAt.toISOString(),
        },
        classroomGrade: r.classroomGrade,
        teacherName: r.teacherName,
        submission: s
          ? {
              submissionId: s.id,
              score: Number(s.score),
              maxScore: Number(s.maxScore),
              percentage: Number(s.percentage),
              submittedAt: s.submittedAt.toISOString(),
              reportUrl: s.reportUrl,
            }
          : null,
      };
    });
    return ok(out);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return err("DB_ERROR", message);
  }
}

export type QuizForTaking = {
  quiz: ClassroomQuizRow;
  // Questions with the authoritative correctAnswer stripped — the
  // student should never receive the answer key.
  questions: Array<{
    id: string;
    question: string;
    answerType: "mcq" | "short_text" | "number";
    options?: string[];
    points: number;
  }>;
  classroomGrade: string;
  teacherName: string;
};

/**
 * Fetch a quiz for a student to take. Verifies the student is enrolled
 * in the quiz's classroom and strips the answer key from the returned
 * questions.
 */
export async function getQuizForStudent(input: {
  quizId: string;
  studentId: number;
}): Promise<Result<QuizForTaking>> {
  try {
    const [row] = await db
      .select({
        id: classroomQuizzes.id,
        classroomId: classroomQuizzes.classroomId,
        createdBy: classroomQuizzes.createdBy,
        title: classroomQuizzes.title,
        subject: classroomQuizzes.subject,
        topic: classroomQuizzes.topic,
        difficulty: classroomQuizzes.difficulty,
        questionCount: classroomQuizzes.questionCount,
        timeLimitMinutes: classroomQuizzes.timeLimitMinutes,
        instructions: classroomQuizzes.instructions,
        questions: classroomQuizzes.questions,
        maxScore: classroomQuizzes.maxScore,
        dueDate: classroomQuizzes.dueDate,
        createdAt: classroomQuizzes.createdAt,
        classroomGrade: classrooms.name,
        teacherName: users.fullName,
      })
      .from(classroomQuizzes)
      .innerJoin(classrooms, eq(classrooms.id, classroomQuizzes.classroomId))
      .innerJoin(users, eq(users.id, classroomQuizzes.createdBy))
      .where(eq(classroomQuizzes.id, input.quizId))
      .limit(1);
    if (!row) return err("NOT_FOUND", `quiz ${input.quizId} not found`);

    // Enrollment check.
    const [enrolled] = await db
      .select({ id: classroomMembership.id })
      .from(classroomMembership)
      .where(
        and(
          eq(classroomMembership.classroomId, row.classroomId),
          eq(classroomMembership.studentId, input.studentId),
        ),
      )
      .limit(1);
    if (!enrolled) return err("UNAUTHORIZED", "you're not enrolled in this class");

    // Strip the answer key before returning.
    const questionsRaw = row.questions as Array<{
      id: string;
      question: string;
      answerType: "mcq" | "short_text" | "number";
      options?: string[];
      points: number;
    }>;
    const questions = questionsRaw.map((q) => ({
      id: q.id,
      question: q.question,
      answerType: q.answerType,
      options: q.options,
      points: q.points,
    }));

    return ok({
      quiz: {
        id: row.id,
        classroomId: row.classroomId,
        createdBy: row.createdBy,
        title: row.title,
        subject: row.subject,
        topic: row.topic,
        difficulty: row.difficulty,
        questionCount: row.questionCount,
        timeLimitMinutes: row.timeLimitMinutes,
        instructions: row.instructions,
        maxScore: Number(row.maxScore),
        dueDate: row.dueDate ? row.dueDate.toISOString() : null,
        createdAt: row.createdAt.toISOString(),
      },
      questions,
      classroomGrade: row.classroomGrade,
      teacherName: row.teacherName,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return err("DB_ERROR", message);
  }
}

/**
 * Fetch the full quiz (including the answer key) for scoring.
 * Internal use only — never exposed to a student-side route.
 */
export async function getQuizFull(
  quizId: string,
): Promise<Result<GeneratedQuiz & { classroomId: number }>> {
  try {
    const [row] = await db
      .select()
      .from(classroomQuizzes)
      .where(eq(classroomQuizzes.id, quizId))
      .limit(1);
    if (!row) return err("NOT_FOUND", `quiz ${quizId} not found`);
    return ok({
      quizId: row.id,
      title: row.title,
      subject: row.subject,
      topic: row.topic,
      difficulty: row.difficulty,
      questionCount: row.questionCount,
      timeLimitMinutes: row.timeLimitMinutes,
      instructions: row.instructions,
      questions: row.questions as GeneratedQuiz["questions"],
      maxScore: Number(row.maxScore),
      model: row.model,
      classroomId: row.classroomId,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return err("DB_ERROR", message);
  }
}

export async function insertQuizSubmission(input: {
  submissionId: string;
  quizId: string;
  studentId: number;
  responses: QuizResponse[];
  analysis: QuizAnalysis;
  score: number;
  maxScore: number;
  percentage: number;
  reportUrl: string | null;
}): Promise<Result<{ submissionId: string }>> {
  try {
    const [row] = await db
      .insert(classroomQuizSubmissions)
      .values({
        id: input.submissionId,
        quizId: input.quizId,
        studentId: input.studentId,
        responses: input.responses,
        analysis: input.analysis,
        score: input.score.toString(),
        maxScore: input.maxScore.toString(),
        percentage: input.percentage.toString(),
        reportUrl: input.reportUrl,
      })
      .onConflictDoUpdate({
        target: [classroomQuizSubmissions.quizId, classroomQuizSubmissions.studentId],
        set: {
          responses: input.responses,
          analysis: input.analysis,
          score: input.score.toString(),
          maxScore: input.maxScore.toString(),
          percentage: input.percentage.toString(),
          reportUrl: input.reportUrl,
          submittedAt: sql`NOW()`,
        },
      })
      .returning({ id: classroomQuizSubmissions.id });
    if (!row) return err("DB_ERROR", "submission insert returned nothing");
    return ok({ submissionId: row.id });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return err("DB_ERROR", message);
  }
}

/**
 * Identify a student for the public "student" page. We do NOT verify
 * a password (students don't have one set); anyone who knows the
 * username can see/take quizzes. Acceptable for the hackathon — real
 * deployment would add a student-auth flow.
 *
 * Returns the student profile + their enrolled classrooms.
 */
export async function lookupStudentByUsername(
  username: string,
): Promise<Result<{
  studentId: number;
  fullName: string;
  schoolId: number;
  classrooms: Array<{ classroomId: number; grade: string; subject: string; teacherName: string }>;
}>> {
  try {
    const [row] = await db
      .select({
        id: users.id,
        fullName: users.fullName,
        schoolId: users.schoolId,
        role: users.role,
      })
      .from(users)
      .where(eq(users.username, username))
      .limit(1);
    if (!row) return err("NOT_FOUND", `no student with username "${username}"`);
    if (row.role !== "student")
      return err("UNAUTHORIZED", "this account is not a student");

    const teacherAlias = users; // re-alias for clarity in the sub-select
    const rows = await db
      .select({
        classroomId: classrooms.id,
        grade: classrooms.name,
        subject: classrooms.subject,
        teacherName: teacherAlias.fullName,
      })
      .from(classroomMembership)
      .innerJoin(classrooms, eq(classrooms.id, classroomMembership.classroomId))
      .innerJoin(teacherAlias, eq(teacherAlias.id, classrooms.teacherId))
      .where(eq(classroomMembership.studentId, row.id))
      .orderBy(asc(classrooms.name), asc(classrooms.subject));

    return ok({
      studentId: row.id,
      fullName: row.fullName,
      schoolId: row.schoolId,
      classrooms: rows,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return err("DB_ERROR", message);
  }
}

export async function updateSubmissionReportUrl(
  submissionId: string,
  reportUrl: string,
): Promise<Result<true>> {
  try {
    await db
      .update(classroomQuizSubmissions)
      .set({ reportUrl })
      .where(eq(classroomQuizSubmissions.id, submissionId));
    return ok(true);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return err("DB_ERROR", message);
  }
}
