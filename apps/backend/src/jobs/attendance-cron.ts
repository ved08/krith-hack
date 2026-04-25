import { getAttendanceToday, getParentAttendanceRecipients } from "@campus/agent/db";
import cron from "node-cron";
import { sendWhatsAppMessage } from "../lib/twilio.js";

type StartAttendanceCronOptions = {
  enabled: boolean;
  expression: string;
  timezone: string;
};

let isRunning = false;

/**
 * Schedule the daily attendance push job.
 *
 * Cron expression defaults to "0 18 * * *" (6:00 PM daily).
 */
export function startAttendanceDailyCron(options: StartAttendanceCronOptions): void {
  if (!options.enabled) {
    console.log("[attendance-cron] disabled via ATTENDANCE_CRON_ENABLED=false");
    return;
  }

  if (!cron.validate(options.expression)) {
    console.error(
      `[attendance-cron] invalid cron expression: ${options.expression}. Job not started.`,
    );
    return;
  }

  cron.schedule(
    options.expression,
    async () => {
      await runAttendanceBroadcast(options.timezone);
    },
    { timezone: options.timezone },
  );

  console.log(
    `[attendance-cron] scheduled (${options.expression}, timezone=${options.timezone})`,
  );
}

async function runAttendanceBroadcast(timezone: string): Promise<void> {
  if (isRunning) {
    console.log("[attendance-cron] previous run still in progress; skipping");
    return;
  }

  isRunning = true;
  const startedAt = Date.now();

  let recipientsCount = 0;
  let attempted = 0;
  let sent = 0;
  let dryRun = 0;
  let failed = 0;

  try {
    const recipients = await getParentAttendanceRecipients();
    recipientsCount = recipients.length;

    if (recipients.length === 0) {
      console.log("[attendance-cron] no parent-student links found; nothing to send");
      return;
    }

    const dateLabel = new Intl.DateTimeFormat("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: timezone,
    }).format(new Date());

    for (const recipient of recipients) {
      attempted += 1;

      const attendance = await getAttendanceToday(recipient.studentId);
      if (!attendance.success) {
        failed += 1;
        console.error(
          `[attendance-cron] attendance lookup failed for student=${recipient.studentId}: ${attendance.error.message}`,
        );
        continue;
      }

      const message = buildAttendanceMessage({
        dateLabel,
        studentName: recipient.studentName,
        classroomName: attendance.data.classroomName,
        status: attendance.data.status,
      });

      const result = await sendWhatsAppMessage(recipient.parentPhoneE164, message);
      if (result.kind === "SENT") sent += 1;
      else if (result.kind === "DRY_RUN") dryRun += 1;
      else {
        failed += 1;
        console.error(
          `[attendance-cron] send failed parent=${recipient.parentPhoneE164} student=${recipient.studentId}: ${result.message}`,
        );
      }
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[attendance-cron] fatal run error: ${message}`);
  } finally {
    const durationMs = Date.now() - startedAt;
    console.log(
      `[attendance-cron] done in ${durationMs}ms recipients=${recipientsCount} attempted=${attempted} sent=${sent} dryRun=${dryRun} failed=${failed}`,
    );
    isRunning = false;
  }
}

function buildAttendanceMessage(input: {
  dateLabel: string;
  studentName: string;
  classroomName: string | null;
  status: "PRESENT" | "ABSENT" | "LATE" | null;
}): string {
  const statusText =
    input.status === "PRESENT"
      ? "Present"
      : input.status === "ABSENT"
      ? "Absent"
      : input.status === "LATE"
      ? "Late"
      : "Not marked yet";

  const classLine = input.classroomName ? `\nClass: ${input.classroomName}` : "";
  return [
    `Attendance Update (${input.dateLabel})`,
    `Student: ${input.studentName}`,
    `Status: ${statusText}${classLine}`,
    "Campus Cortex AI",
  ].join("\n");
}