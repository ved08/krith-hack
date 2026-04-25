import {
  getStudentDetail,
  getStudentDetailForTeacher,
  getTeacherOverview,
} from "@campus/agent";
import { Hono } from "hono";
import { jwt } from "hono/jwt";
import { env } from "../env.js";
import type { TeacherJwtPayload } from "./auth.js";

/**
 * Dashboard analytics endpoints.
 *
 *  - /teacher/analytics            → overview for the logged-in teacher
 *  - /teacher/students/:id/analytics → drill-down (ownership-checked)
 *  - /student/:id/analytics        → public self-serve (matches kiosk trust model)
 */

export const analyticsRouter = new Hono();

analyticsRouter.use(
  "/teacher/*",
  jwt({ secret: env.JWT_SECRET, alg: "HS256" }),
);

analyticsRouter.get("/teacher/analytics", async (c) => {
  const payload = c.get("jwtPayload") as TeacherJwtPayload;
  const result = await getTeacherOverview(payload.sub);
  if (!result.success) {
    return c.json({ success: false, error: result.error }, 500);
  }
  return c.json({ success: true, data: result.data });
});

analyticsRouter.get("/teacher/students/:studentId/analytics", async (c) => {
  const payload = c.get("jwtPayload") as TeacherJwtPayload;
  const studentId = Number.parseInt(c.req.param("studentId"), 10);
  if (!Number.isFinite(studentId) || studentId <= 0) {
    return c.json(
      { success: false, error: { code: "INVALID_INPUT", message: "bad studentId" } },
      400,
    );
  }
  const result = await getStudentDetailForTeacher({
    teacherId: payload.sub,
    studentId,
  });
  if (!result.success) {
    const status =
      result.error.code === "UNAUTHORIZED"
        ? 403
        : result.error.code === "NOT_FOUND"
        ? 404
        : 500;
    return c.json({ success: false, error: result.error }, status);
  }
  return c.json({ success: true, data: result.data });
});

analyticsRouter.get("/student/:studentId/analytics", async (c) => {
  const studentId = Number.parseInt(c.req.param("studentId"), 10);
  if (!Number.isFinite(studentId) || studentId <= 0) {
    return c.json(
      { success: false, error: { code: "INVALID_INPUT", message: "bad studentId" } },
      400,
    );
  }
  const result = await getStudentDetail(studentId);
  if (!result.success) {
    const status = result.error.code === "NOT_FOUND" ? 404 : 500;
    return c.json({ success: false, error: result.error }, status);
  }
  return c.json({ success: true, data: result.data });
});
