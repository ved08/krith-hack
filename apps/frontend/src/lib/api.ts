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
async function post<TReq, TRes>(
  path: string,
  body: TReq,
): Promise<ApiResult<TRes>> {
  try {
    const res = await fetch(`${env.apiBaseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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

async function get<T>(path: string): Promise<ApiResult<T>> {
  try {
    const res = await fetch(`${env.apiBaseUrl}${path}`);
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
  classroomId: number;
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
