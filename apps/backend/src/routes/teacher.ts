import {
  createClassroomsForTeacher,
  listClassroomsForTeacher,
  listStudentsForTeacher,
} from "@campus/agent";
import { Hono } from "hono";
import { jwt } from "hono/jwt";
import { z } from "zod";
import { env } from "../env.js";
import type { TeacherJwtPayload } from "./auth.js";

export const teacherRouter = new Hono();

/**
 * All routes under `/teacher/*` require a valid teacher JWT. The Hono
 * middleware verifies the signature and stashes the decoded payload at
 * `c.get("jwtPayload")`.
 */
teacherRouter.use("/teacher/*", jwt({ secret: env.JWT_SECRET, alg: "HS256" }));

teacherRouter.get("/teacher/me", (c) => {
  const payload = c.get("jwtPayload") as TeacherJwtPayload;
  return c.json({
    success: true,
    data: {
      id: payload.sub,
      username: payload.username,
      schoolId: payload.schoolId,
      role: payload.role,
    },
  });
});

teacherRouter.get("/teacher/students", async (c) => {
  const payload = c.get("jwtPayload") as TeacherJwtPayload;
  const result = await listStudentsForTeacher(payload.sub);
  if (!result.success) {
    return c.json({ success: false, error: result.error }, 500);
  }
  return c.json({ success: true, data: result.data });
});

teacherRouter.get("/teacher/classrooms", async (c) => {
  const payload = c.get("jwtPayload") as TeacherJwtPayload;
  const result = await listClassroomsForTeacher(payload.sub);
  if (!result.success) {
    return c.json({ success: false, error: result.error }, 500);
  }
  return c.json({ success: true, data: result.data });
});

const CreateClassroomsSchema = z.object({
  classrooms: z
    .array(
      z.object({
        grade: z.string().min(1).max(80),
        subject: z.string().min(1).max(80),
      }),
    )
    .min(1)
    .max(40),
});

teacherRouter.post("/teacher/classrooms", async (c) => {
  const payload = c.get("jwtPayload") as TeacherJwtPayload;
  const body = await c.req.json().catch(() => null);
  const parsed = CreateClassroomsSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { success: false, error: { code: "INVALID_INPUT", message: parsed.error.message } },
      400,
    );
  }
  const result = await createClassroomsForTeacher({
    teacherId: payload.sub,
    schoolId: payload.schoolId,
    classrooms: parsed.data.classrooms,
  });
  if (!result.success) {
    const status = result.error.code === "INVALID_INPUT" ? 400 : 500;
    return c.json({ success: false, error: result.error }, status);
  }
  return c.json({ success: true, data: result.data });
});
