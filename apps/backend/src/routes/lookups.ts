import {
  listClassroomsBySchool,
  listGradesForSchool,
  listSchools,
} from "@campus/agent";
import { Hono } from "hono";
import { z } from "zod";

export const lookupsRouter = new Hono();

/**
 * Public read-only lookups used by the kiosk to populate school + class
 * dropdowns. Exposed without auth because the kiosk itself is public (it
 * is the admissions intake entry point — see the product spec).
 */

lookupsRouter.get("/schools", async (c) => {
  const result = await listSchools();
  if (!result.success) {
    return c.json({ success: false, error: result.error }, 500);
  }
  return c.json({ success: true, data: result.data });
});

const SchoolIdParam = z.coerce.number().int().positive();

lookupsRouter.get("/schools/:schoolId/classrooms", async (c) => {
  const parsed = SchoolIdParam.safeParse(c.req.param("schoolId"));
  if (!parsed.success) {
    return c.json(
      { success: false, error: { code: "INVALID_INPUT", message: "schoolId must be a positive integer" } },
      400,
    );
  }
  const result = await listClassroomsBySchool(parsed.data);
  if (!result.success) {
    return c.json({ success: false, error: result.error }, 500);
  }
  return c.json({ success: true, data: result.data });
});

/**
 * Distinct grade labels (`classrooms.name`) plus the subjects offered
 * for each, scoped to a school. The kiosk uses this to populate its
 * "pick your grade" dropdown.
 */
lookupsRouter.get("/schools/:schoolId/grades", async (c) => {
  const parsed = SchoolIdParam.safeParse(c.req.param("schoolId"));
  if (!parsed.success) {
    return c.json(
      { success: false, error: { code: "INVALID_INPUT", message: "schoolId must be a positive integer" } },
      400,
    );
  }
  const result = await listGradesForSchool(parsed.data);
  if (!result.success) {
    return c.json({ success: false, error: result.error }, 500);
  }
  return c.json({ success: true, data: result.data });
});
