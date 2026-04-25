import { z } from "zod";

/**
 * Backend-app-only env. Twilio credentials are declared on the agent
 * package's env (since the agent also sends WhatsApp messages for the
 * admissions flow).
 */
const EnvSchema = z.object({
  PORT: z
    .string()
    .default("3000")
    .transform((v) => Number.parseInt(v, 10)),
  // Default OFF — run the broadcast manually via
  // `bun run scripts/run-attendance-broadcast.ts`. Flip to "true" (or
  // set the env var) only when you genuinely want the daily schedule.
  ATTENDANCE_CRON_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  ATTENDANCE_CRON_EXPRESSION: z.string().default("0 18 * * *"),
  ATTENDANCE_CRON_TIMEZONE: z.string().default("Asia/Kolkata"),
  // Secret for signing teacher-dashboard JWTs. A stable dev default keeps
  // local flows working; override in deployed environments.
  JWT_SECRET: z.string().min(16).default("dev-insecure-secret-change-me-please"),
  // Token lifetime in seconds — 12h is enough for a workday. No refresh
  // flow; users re-login when the token expires.
  JWT_TTL_SECONDS: z
    .string()
    .default("43200")
    .transform((v) => Number.parseInt(v, 10)),
});

export const env = EnvSchema.parse(process.env);
