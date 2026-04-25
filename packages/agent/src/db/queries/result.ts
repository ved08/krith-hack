export type ErrorCode =
  | "NOT_FOUND"
  | "NOT_LINKED"
  | "UNAUTHORIZED"
  | "AMBIGUOUS_NAME"
  | "INVALID_INPUT"
  | "DB_ERROR"
  | "LLM_ERROR"
  | "CONFIG_ERROR";

export type Result<T> =
  | { success: true; data: T }
  | { success: false; error: { code: ErrorCode; message: string } };

export const ok = <T>(data: T): Result<T> => ({ success: true, data });

export const err = (code: ErrorCode, message: string): Result<never> => ({
  success: false,
  error: { code, message },
});
