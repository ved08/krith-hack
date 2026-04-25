import { loginOrCreateTeacher, type AuthenticatedTeacher } from "@campus/agent";
import { Hono } from "hono";
import { sign } from "hono/jwt";
import { z } from "zod";
import { env } from "../env.js";

export const authRouter = new Hono();

// Username/password are always required. `schoolId` + `fullName` are
// only consulted when the username doesn't exist yet — the backend
// auto-creates the teacher account on first login.
const LoginSchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(6).max(256),
  schoolId: z.number().int().positive().optional(),
  fullName: z.string().min(1).max(120).optional(),
});

export type TeacherJwtPayload = {
  sub: number;
  username: string;
  schoolId: number;
  role: "teacher";
  exp: number;
};

/**
 * POST /auth/teacher/login
 * Verifies bcrypt credentials and returns `{ token, teacher }`.
 * Token is a Hono-signed JWT (HS256) with the teacher's id + schoolId.
 */
authRouter.post("/auth/teacher/login", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = LoginSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { success: false, error: { code: "INVALID_INPUT", message: parsed.error.message } },
      400,
    );
  }

  const signup =
    parsed.data.schoolId != null && parsed.data.fullName
      ? { schoolId: parsed.data.schoolId, fullName: parsed.data.fullName.trim() }
      : undefined;

  const result = await loginOrCreateTeacher({
    username: parsed.data.username,
    password: parsed.data.password,
    signup,
  });
  if (!result.success) {
    const status =
      result.error.code === "UNAUTHORIZED"
        ? 401
        : result.error.code === "INVALID_INPUT"
        ? 400
        : 500;
    return c.json({ success: false, error: result.error }, status);
  }

  const teacher: AuthenticatedTeacher = result.data;
  const payload: TeacherJwtPayload = {
    sub: teacher.id,
    username: teacher.username,
    schoolId: teacher.schoolId,
    role: "teacher",
    exp: Math.floor(Date.now() / 1000) + env.JWT_TTL_SECONDS,
  };
  const token = await sign(payload, env.JWT_SECRET);

  return c.json({ success: true, data: { token, teacher } });
});
