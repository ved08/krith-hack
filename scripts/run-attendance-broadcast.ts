/**
 * Manually fire the daily parent attendance broadcast.
 *
 * Reads the same env vars the scheduler would (TWILIO_*,
 * ATTENDANCE_CRON_TIMEZONE) and invokes the one-shot runner. Exits
 * with the process so a CI/cron wrapper can rely on the exit code.
 *
 * Usage:
 *   bun run scripts/run-attendance-broadcast.ts
 *   bun run scripts/run-attendance-broadcast.ts Asia/Kolkata   # override timezone
 */

import { runAttendanceBroadcast } from "../apps/backend/src/jobs/attendance-cron.js";

const timezone =
  process.argv[2] ?? process.env.ATTENDANCE_CRON_TIMEZONE ?? "Asia/Kolkata";

console.log(`[trigger] running attendance broadcast (timezone=${timezone})`);

try {
  await runAttendanceBroadcast(timezone);
  process.exit(0);
} catch (e) {
  console.error("[trigger] broadcast threw unexpectedly:", e);
  process.exit(1);
}
