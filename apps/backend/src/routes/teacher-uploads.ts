import {
  createAssignment,
  getNotificationTargetsForStudents,
  insertAttendanceBatch,
  insertGradesBatch,
  listStudentsInMyClassroom,
  sendWhatsAppMessage,
} from "@campus/agent";
import { Hono } from "hono";
import { jwt } from "hono/jwt";
import { z } from "zod";
import { env } from "../env.js";
import type { TeacherJwtPayload } from "./auth.js";

/**
 * Teacher uploads — attendance + marks. Both writes are gated by JWT
 * and scoped so the teacher can only target classrooms they own.
 *
 * After a successful DB write we fan out WhatsApp notifications to
 * each affected student and their linked parents. Notifications are
 * best-effort: send failures are counted but never fail the HTTP
 * response, since the data is already persisted.
 */

export const teacherUploadsRouter = new Hono();

teacherUploadsRouter.use(
  "/teacher/*",
  jwt({ secret: env.JWT_SECRET, alg: "HS256" }),
);

// ─── Roster (used by the upload modals to resolve usernames) ──────────────

teacherUploadsRouter.get("/teacher/classrooms/:classroomId/students", async (c) => {
  const payload = c.get("jwtPayload") as TeacherJwtPayload;
  const classroomId = Number.parseInt(c.req.param("classroomId"), 10);
  if (!Number.isFinite(classroomId) || classroomId <= 0) {
    return c.json(
      { success: false, error: { code: "INVALID_INPUT", message: "bad classroomId" } },
      400,
    );
  }
  const result = await listStudentsInMyClassroom({
    teacherId: payload.sub,
    classroomId,
  });
  if (!result.success) {
    const status = result.error.code === "UNAUTHORIZED" ? 403 : 500;
    return c.json({ success: false, error: result.error }, status);
  }
  return c.json({ success: true, data: result.data });
});

// ─── Attendance ───────────────────────────────────────────────────────────

const AttendanceStatusSchema = z.enum(["PRESENT", "ABSENT", "LATE"]);

const AttendanceBodySchema = z.object({
  classroomId: z.number().int().positive(),
  sessionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD"),
  rows: z
    .array(
      z.object({
        studentId: z.number().int().positive(),
        status: AttendanceStatusSchema,
      }),
    )
    .min(1)
    .max(200),
});

teacherUploadsRouter.post("/teacher/attendance", async (c) => {
  const payload = c.get("jwtPayload") as TeacherJwtPayload;
  const body = await c.req.json().catch(() => null);
  const parsed = AttendanceBodySchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { success: false, error: { code: "INVALID_INPUT", message: parsed.error.message } },
      400,
    );
  }

  const write = await insertAttendanceBatch({
    schoolId: payload.schoolId,
    classroomId: parsed.data.classroomId,
    sessionDate: parsed.data.sessionDate,
    markedBy: payload.sub,
    rows: parsed.data.rows,
  });
  if (!write.success) {
    const status =
      write.error.code === "UNAUTHORIZED"
        ? 403
        : write.error.code === "INVALID_INPUT" || write.error.code === "NOT_FOUND"
        ? 400
        : 500;
    return c.json({ success: false, error: write.error }, status);
  }

  // Fan-out notifications — one message per student + their parents.
  const notify = await fanOutAttendanceNotifications({
    rows: parsed.data.rows,
    sessionDate: parsed.data.sessionDate,
  });

  return c.json({
    success: true,
    data: {
      sessionId: write.data.sessionId,
      written: write.data.written,
      whatsappSent: notify.sent,
      whatsappFailed: notify.failed,
      whatsappSkipped: notify.skipped,
    },
  });
});

async function fanOutAttendanceNotifications(input: {
  rows: Array<{ studentId: number; status: "PRESENT" | "ABSENT" | "LATE" }>;
  sessionDate: string;
}): Promise<{ sent: number; failed: number; skipped: number }> {
  const studentIds = input.rows.map((r) => r.studentId);
  const targetsRes = await getNotificationTargetsForStudents(studentIds);
  if (!targetsRes.success) {
    console.error(
      `[teacher-uploads] notification target lookup failed: ${targetsRes.error.message}`,
    );
    return { sent: 0, failed: 0, skipped: input.rows.length };
  }
  const targetsById = new Map(targetsRes.data.map((t) => [t.studentId, t]));

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  for (const row of input.rows) {
    const target = targetsById.get(row.studentId);
    if (!target) {
      skipped += 1;
      continue;
    }
    const body = buildAttendanceMessage({
      studentName: target.studentName,
      status: row.status,
      sessionDate: input.sessionDate,
    });
    const phones = [target.studentPhone, ...target.parentPhones].filter(
      (p): p is string => !!p,
    );
    if (phones.length === 0) {
      skipped += 1;
      continue;
    }
    for (const phone of phones) {
      const r = await sendWhatsAppMessage(phone, body);
      if (r.kind === "SENT" || r.kind === "DRY_RUN") sent += 1;
      else failed += 1;
    }
  }
  return { sent, failed, skipped };
}

function buildAttendanceMessage(input: {
  studentName: string;
  status: "PRESENT" | "ABSENT" | "LATE";
  sessionDate: string;
}): string {
  const emoji =
    input.status === "PRESENT" ? "✅" : input.status === "ABSENT" ? "❌" : "⏰";
  const pretty =
    input.status === "PRESENT"
      ? "marked PRESENT"
      : input.status === "ABSENT"
      ? "marked ABSENT"
      : "arrived LATE";
  return `${emoji} ${input.studentName} was ${pretty} on ${input.sessionDate}. — Campus Cortex`;
}

// ─── Grades ───────────────────────────────────────────────────────────────

const GradesBodySchema = z.object({
  classroomId: z.number().int().positive(),
  title: z.string().min(1).max(120),
  subject: z.string().min(1).max(80),
  type: z.enum(["HOMEWORK", "QUIZ", "TEST"]),
  maxScore: z.number().positive().max(1000),
  // ISO date/datetime string. Accept either `YYYY-MM-DD` (interpreted as
  // local midnight) or a full ISO timestamp.
  dueDate: z.string().min(8).max(40),
  rows: z
    .array(
      z.object({
        studentId: z.number().int().positive(),
        score: z.number().min(0).max(1000),
      }),
    )
    .min(1)
    .max(200),
});

teacherUploadsRouter.post("/teacher/grades", async (c) => {
  const payload = c.get("jwtPayload") as TeacherJwtPayload;
  const body = await c.req.json().catch(() => null);
  const parsed = GradesBodySchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { success: false, error: { code: "INVALID_INPUT", message: parsed.error.message } },
      400,
    );
  }

  const due = new Date(parsed.data.dueDate);
  if (Number.isNaN(due.getTime())) {
    return c.json(
      { success: false, error: { code: "INVALID_INPUT", message: "dueDate is not a valid date" } },
      400,
    );
  }

  const created = await createAssignment({
    schoolId: payload.schoolId,
    classroomId: parsed.data.classroomId,
    title: parsed.data.title,
    subject: parsed.data.subject,
    type: parsed.data.type,
    maxScore: parsed.data.maxScore,
    dueDate: due,
    createdBy: payload.sub,
  });
  if (!created.success) {
    const status =
      created.error.code === "UNAUTHORIZED"
        ? 403
        : created.error.code === "INVALID_INPUT" || created.error.code === "NOT_FOUND"
        ? 400
        : 500;
    return c.json({ success: false, error: created.error }, status);
  }

  const write = await insertGradesBatch({
    schoolId: payload.schoolId,
    assignmentId: created.data.assignmentId,
    submittedBy: payload.sub,
    rows: parsed.data.rows,
  });
  if (!write.success) {
    const status =
      write.error.code === "UNAUTHORIZED"
        ? 403
        : write.error.code === "INVALID_INPUT" || write.error.code === "NOT_FOUND"
        ? 400
        : 500;
    return c.json({ success: false, error: write.error }, status);
  }

  const notify = await fanOutGradesNotifications({
    rows: parsed.data.rows,
    title: parsed.data.title,
    subject: parsed.data.subject,
    maxScore: parsed.data.maxScore,
  });

  return c.json({
    success: true,
    data: {
      assignmentId: created.data.assignmentId,
      written: write.data.written,
      whatsappSent: notify.sent,
      whatsappFailed: notify.failed,
      whatsappSkipped: notify.skipped,
    },
  });
});

async function fanOutGradesNotifications(input: {
  rows: Array<{ studentId: number; score: number }>;
  title: string;
  subject: string;
  maxScore: number;
}): Promise<{ sent: number; failed: number; skipped: number }> {
  const studentIds = input.rows.map((r) => r.studentId);
  const targetsRes = await getNotificationTargetsForStudents(studentIds);
  if (!targetsRes.success) {
    console.error(
      `[teacher-uploads] notification target lookup failed: ${targetsRes.error.message}`,
    );
    return { sent: 0, failed: 0, skipped: input.rows.length };
  }
  const targetsById = new Map(targetsRes.data.map((t) => [t.studentId, t]));

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  for (const row of input.rows) {
    const target = targetsById.get(row.studentId);
    if (!target) {
      skipped += 1;
      continue;
    }
    const body = buildGradesMessage({
      studentName: target.studentName,
      score: row.score,
      maxScore: input.maxScore,
      subject: input.subject,
      title: input.title,
    });
    const phones = [target.studentPhone, ...target.parentPhones].filter(
      (p): p is string => !!p,
    );
    if (phones.length === 0) {
      skipped += 1;
      continue;
    }
    for (const phone of phones) {
      const r = await sendWhatsAppMessage(phone, body);
      if (r.kind === "SENT" || r.kind === "DRY_RUN") sent += 1;
      else failed += 1;
    }
  }
  return { sent, failed, skipped };
}

function buildGradesMessage(input: {
  studentName: string;
  score: number;
  maxScore: number;
  subject: string;
  title: string;
}): string {
  const pct = Math.round((input.score / input.maxScore) * 100);
  return [
    `📝 *${input.subject}* — ${input.title}`,
    `${input.studentName} scored ${input.score}/${input.maxScore} (${pct}%).`,
    "— Campus Cortex",
  ].join("\n");
}

// ─── Per-student manual notify ────────────────────────────────────────────

const NotifySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("ATTENDANCE"),
    classroomId: z.number().int().positive(),
    status: z.enum(["PRESENT", "ABSENT", "LATE"]),
    sessionDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD")
      .optional(),
  }),
  z.object({
    action: z.literal("MESSAGE"),
    body: z.string().min(1).max(1000),
  }),
]);

teacherUploadsRouter.post("/teacher/students/:studentId/notify", async (c) => {
  const payload = c.get("jwtPayload") as TeacherJwtPayload;
  const studentId = Number.parseInt(c.req.param("studentId"), 10);
  if (!Number.isFinite(studentId) || studentId <= 0) {
    return c.json(
      { success: false, error: { code: "INVALID_INPUT", message: "bad studentId" } },
      400,
    );
  }
  const body = await c.req.json().catch(() => null);
  const parsed = NotifySchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { success: false, error: { code: "INVALID_INPUT", message: parsed.error.message } },
      400,
    );
  }

  if (parsed.data.action === "ATTENDANCE") {
    const sessionDate = parsed.data.sessionDate ?? todayIso();
    const write = await insertAttendanceBatch({
      schoolId: payload.schoolId,
      classroomId: parsed.data.classroomId,
      sessionDate,
      markedBy: payload.sub,
      rows: [{ studentId, status: parsed.data.status }],
    });
    if (!write.success) {
      const status =
        write.error.code === "UNAUTHORIZED"
          ? 403
          : write.error.code === "INVALID_INPUT" || write.error.code === "NOT_FOUND"
          ? 400
          : 500;
      return c.json({ success: false, error: write.error }, status);
    }
    const notify = await fanOutAttendanceNotifications({
      rows: [{ studentId, status: parsed.data.status }],
      sessionDate,
    });
    return c.json({
      success: true,
      data: {
        action: "ATTENDANCE",
        sessionDate,
        whatsappSent: notify.sent,
        whatsappFailed: notify.failed,
        whatsappSkipped: notify.skipped,
      },
    });
  }

  // MESSAGE — verify the teacher actually teaches this student before
  // letting them blast a free-form WhatsApp message at the parents.
  const targetsRes = await getNotificationTargetsForStudents([studentId]);
  if (!targetsRes.success) {
    return c.json({ success: false, error: targetsRes.error }, 500);
  }
  const target = targetsRes.data[0];
  if (!target) {
    return c.json(
      { success: false, error: { code: "NOT_FOUND", message: "student not found" } },
      404,
    );
  }
  // Ownership check: teacher must teach a classroom this student is enrolled in.
  const teacherClassrooms = await import("@campus/agent").then((m) =>
    m.listClassroomsForTeacher(payload.sub),
  );
  if (!teacherClassrooms.success) {
    return c.json({ success: false, error: teacherClassrooms.error }, 500);
  }
  const teacherClassroomIds = new Set(
    teacherClassrooms.data.map((c) => c.classroomId),
  );
  const studentMembership = await import("@campus/agent").then(async (m) => {
    const all: number[] = [];
    for (const c of teacherClassrooms.data) {
      const r = await m.listStudentsInMyClassroom({
        teacherId: payload.sub,
        classroomId: c.classroomId,
      });
      if (r.success && r.data.some((s) => s.studentId === studentId)) {
        all.push(c.classroomId);
      }
    }
    return all;
  });
  if (studentMembership.length === 0) {
    return c.json(
      {
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "you don't teach a classroom this student is enrolled in",
        },
      },
      403,
    );
  }
  void teacherClassroomIds;

  const phones = [target.studentPhone, ...target.parentPhones].filter(
    (p): p is string => !!p,
  );
  if (phones.length === 0) {
    return c.json({
      success: true,
      data: {
        action: "MESSAGE",
        whatsappSent: 0,
        whatsappFailed: 0,
        whatsappSkipped: 1,
      },
    });
  }
  const text = `${parsed.data.body}\n\n— Campus Cortex (regarding ${target.studentName})`;
  let sent = 0;
  let failed = 0;
  for (const phone of phones) {
    const r = await sendWhatsAppMessage(phone, text);
    if (r.kind === "SENT" || r.kind === "DRY_RUN") sent += 1;
    else failed += 1;
  }
  return c.json({
    success: true,
    data: {
      action: "MESSAGE",
      whatsappSent: sent,
      whatsappFailed: failed,
      whatsappSkipped: 0,
    },
  });
});

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
