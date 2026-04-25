import type {
  AdmissionProfile,
  AdmissionsEvaluation,
  AdmissionsQuestionSet,
  AgentMessageResponse,
  ApiError,
  ApiResult,
  CandidateResponse,
  IntakeResponseData,
} from "../types/api.js";
import { env } from "./env.js";

/**
 * Typed fetch wrapper. Never throws — returns an ApiResult so callers can
 * render errors inline. Network failures become { code: "NETWORK_ERROR" }.
 */
function authHeaders(token?: string): HeadersInit {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function post<TReq, TRes>(
  path: string,
  body: TReq,
  token?: string,
): Promise<ApiResult<TRes>> {
  try {
    const res = await fetch(`${env.apiBaseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(token) },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as ApiResult<TRes>;
    return json;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const error: ApiError = { code: "DB_ERROR", message: `Network: ${message}` };
    return { success: false, error };
  }
}

async function get<T>(path: string, token?: string): Promise<ApiResult<T>> {
  try {
    const res = await fetch(`${env.apiBaseUrl}${path}`, {
      headers: authHeaders(token),
    });
    return (await res.json()) as ApiResult<T>;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { success: false, error: { code: "DB_ERROR", message: `Network: ${message}` } };
  }
}

// ─── Endpoints ────────────────────────────────────────────────────────────

export function checkHealth(): Promise<ApiResult<{ status: string }>> {
  return get("/health");
}

export function sendAgentMessage(input: {
  fromPhoneE164: string;
  messageText: string;
}): Promise<ApiResult<AgentMessageResponse>> {
  return post("/agent/message", input);
}

export type IntakeBody = {
  schoolId: number;
  /** Grade label (e.g. "Grade 5A") — student will be enrolled in every classroom with this name. */
  grade: string;
  profile: AdmissionProfile & { studentPhoneE164: string };
  parentUsername?: string;
  studentUsername?: string;
  questionCount?: number;
  generateQuestions?: boolean;
};

export function submitAdmissionsIntake(
  body: IntakeBody,
): Promise<ApiResult<IntakeResponseData>> {
  return post("/admissions/phase2/intake", body);
}

export type QuestionsBody = {
  profile: AdmissionProfile;
  questionCount?: number;
  schoolId?: number;
  studentId?: number;
};

export function generateAdmissionsQuestions(
  body: QuestionsBody,
): Promise<ApiResult<AdmissionsQuestionSet>> {
  return post("/admissions/phase2/questions", body);
}

export type AnalyzeBody = {
  profile: AdmissionProfile;
  responses: CandidateResponse[];
  schoolId?: number;
  studentId?: number;
  questionSetId?: string;
};

export function analyzeAdmissionsResponses(
  body: AnalyzeBody,
): Promise<ApiResult<AdmissionsEvaluation>> {
  return post("/admissions/phase2/analyze", body);
}

// ─── Lookups (public) ─────────────────────────────────────────────────────

export type SchoolOption = { id: number; name: string };
export type ClassroomOption = { id: number; name: string };
export type GradeOption = {
  grade: string;
  classroomCount: number;
  subjects: string[];
};

export function listSchools(): Promise<ApiResult<SchoolOption[]>> {
  return get("/schools");
}

export function listClassroomsBySchool(
  schoolId: number,
): Promise<ApiResult<ClassroomOption[]>> {
  return get(`/schools/${schoolId}/classrooms`);
}

export function listGradesForSchool(
  schoolId: number,
): Promise<ApiResult<GradeOption[]>> {
  return get(`/schools/${schoolId}/grades`);
}

// ─── Auth (teacher) ───────────────────────────────────────────────────────

export type AuthTeacher = {
  id: number;
  username: string;
  fullName: string;
  schoolId: number;
  schoolName: string;
};

export type LoginResponse = { token: string; teacher: AuthTeacher };

export function loginTeacher(input: {
  username: string;
  password: string;
  // Only used when the username doesn't exist yet — the backend
  // auto-creates the teacher account on first login.
  schoolId?: number;
  fullName?: string;
}): Promise<ApiResult<LoginResponse>> {
  return post("/auth/teacher/login", input);
}

export type TeacherStudentRow = {
  studentId: number;
  fullName: string;
  username: string;
  phoneNumber: string;
  classroomId: number;
  classroomName: string;
  subject: string;
};

export function fetchTeacherStudents(
  token: string,
): Promise<ApiResult<TeacherStudentRow[]>> {
  return get("/teacher/students", token);
}

export type TeacherClassroomRow = {
  classroomId: number;
  grade: string;
  subject: string;
  studentCount: number;
};

export function fetchTeacherClassrooms(
  token: string,
): Promise<ApiResult<TeacherClassroomRow[]>> {
  return get("/teacher/classrooms", token);
}

export type CreateClassroomEntry = { grade: string; subject: string };

export function createTeacherClassrooms(
  token: string,
  classrooms: CreateClassroomEntry[],
): Promise<ApiResult<{ createdCount: number; skippedCount: number; classroomIds: number[] }>> {
  return post("/teacher/classrooms", { classrooms }, token);
}

// ─── Teacher uploads (attendance + marks) ─────────────────────────────────

export type RosterEntry = {
  studentId: number;
  fullName: string;
  username: string;
  phoneNumber: string;
};

export function fetchClassroomRoster(
  token: string,
  classroomId: number,
): Promise<ApiResult<RosterEntry[]>> {
  return get(`/teacher/classrooms/${classroomId}/students`, token);
}

export type AttendanceStatus = "PRESENT" | "ABSENT" | "LATE";

export type UploadAttendanceBody = {
  classroomId: number;
  sessionDate: string; // YYYY-MM-DD
  rows: Array<{ studentId: number; status: AttendanceStatus }>;
};

export type UploadAttendanceResult = {
  sessionId: number;
  written: number;
  whatsappSent: number;
  whatsappFailed: number;
  whatsappSkipped: number;
};

export function uploadAttendance(
  token: string,
  body: UploadAttendanceBody,
): Promise<ApiResult<UploadAttendanceResult>> {
  return post("/teacher/attendance", body, token);
}

export type AssignmentType = "HOMEWORK" | "QUIZ" | "TEST";

export type UploadGradesBody = {
  classroomId: number;
  title: string;
  subject: string;
  type: AssignmentType;
  maxScore: number;
  dueDate: string; // ISO
  rows: Array<{ studentId: number; score: number }>;
};

export type UploadGradesResult = {
  assignmentId: number;
  written: number;
  whatsappSent: number;
  whatsappFailed: number;
  whatsappSkipped: number;
};

export function uploadGrades(
  token: string,
  body: UploadGradesBody,
): Promise<ApiResult<UploadGradesResult>> {
  return post("/teacher/grades", body, token);
}

// ─── Analytics ────────────────────────────────────────────────────────────

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

export function fetchTeacherOverview(
  token: string,
): Promise<ApiResult<TeacherOverview>> {
  return get("/teacher/analytics", token);
}

export function fetchTeacherStudentDetail(
  token: string,
  studentId: number,
): Promise<ApiResult<StudentDetail>> {
  return get(`/teacher/students/${studentId}/analytics`, token);
}

export function fetchStudentAnalytics(
  studentId: number,
): Promise<ApiResult<StudentDetail>> {
  return get(`/student/${studentId}/analytics`);
}

// ─── Per-student notify ──────────────────────────────────────────────────

export type NotifyAction =
  | {
      action: "ATTENDANCE";
      classroomId: number;
      status: AttendanceStatus;
      sessionDate?: string;
    }
  | {
      action: "MESSAGE";
      body: string;
    };

export type NotifyResult = {
  action: "ATTENDANCE" | "MESSAGE";
  sessionDate?: string;
  whatsappSent: number;
  whatsappFailed: number;
  whatsappSkipped: number;
};

export function notifyStudent(
  token: string,
  studentId: number,
  body: NotifyAction,
): Promise<ApiResult<NotifyResult>> {
  return post(`/teacher/students/${studentId}/notify`, body, token);
}

// ─── Classroom quizzes ────────────────────────────────────────────────────

export type QuizDifficulty = "easy" | "medium" | "hard";

export type CreateQuizBody = {
  classroomId: number;
  title: string;
  topic: string;
  difficulty: QuizDifficulty;
  questionCount: number;
  timeLimitMinutes?: number | null;
  instructions?: string | null;
  dueDate?: string;
};

export type CreateQuizResult = {
  quizId: string;
  title: string;
  subject: string;
  topic: string;
  difficulty: QuizDifficulty;
  questionCount: number;
  maxScore: number;
};

export function createTeacherQuiz(
  token: string,
  body: CreateQuizBody,
): Promise<ApiResult<CreateQuizResult>> {
  return post("/teacher/quizzes", body, token);
}

export type TeacherQuizRow = {
  quiz: {
    id: string;
    classroomId: number;
    title: string;
    subject: string;
    topic: string;
    difficulty: QuizDifficulty;
    questionCount: number;
    maxScore: number;
    dueDate: string | null;
    createdAt: string;
  };
  classroomGrade: string;
  submissionCount: number;
};

export function fetchTeacherQuizzes(
  token: string,
): Promise<ApiResult<TeacherQuizRow[]>> {
  return get("/teacher/quizzes", token);
}

// ─── Student side ─────────────────────────────────────────────────────────

export type StudentLookup = {
  studentId: number;
  fullName: string;
  schoolId: number;
  classrooms: Array<{
    classroomId: number;
    grade: string;
    subject: string;
    teacherName: string;
  }>;
};

export function studentLookup(
  username: string,
): Promise<ApiResult<StudentLookup>> {
  return post("/student/lookup", { username });
}

export type StudentQuiz = {
  quiz: {
    id: string;
    classroomId: number;
    title: string;
    subject: string;
    topic: string;
    difficulty: QuizDifficulty;
    questionCount: number;
    timeLimitMinutes: number | null;
    instructions: string | null;
    maxScore: number;
    dueDate: string | null;
    createdAt: string;
  };
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

export function fetchStudentQuizzes(
  studentId: number,
): Promise<ApiResult<StudentQuiz[]>> {
  return get(`/student/${studentId}/quizzes`);
}

export type QuizForTaking = {
  quiz: StudentQuiz["quiz"];
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

export function fetchQuizForStudent(
  studentId: number,
  quizId: string,
): Promise<ApiResult<QuizForTaking>> {
  return get(`/student/${studentId}/quizzes/${quizId}`);
}

export type SubmitQuizResult = {
  submissionId: string;
  score: number;
  maxScore: number;
  percentage: number;
  analysis: {
    summary: string;
    strengths: string[];
    growthAreas: string[];
    recommendedActions: string[];
    scoredQuestions: Array<{
      questionId: string;
      awardedPoints: number;
      correct: boolean;
      feedback: string;
    }>;
  };
  reportUrl: string | null;
  whatsappSent: number;
  whatsappFailed: number;
};

export function submitStudentQuiz(
  studentId: number,
  quizId: string,
  responses: Array<{ questionId: string; question: string; answer: string }>,
): Promise<ApiResult<SubmitQuizResult>> {
  return post(`/student/${studentId}/quizzes/${quizId}/submit`, { responses });
}
