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
  ATTENDANCE_CRON_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  ATTENDANCE_CRON_EXPRESSION: z.string().default("0 18 * * *"),
  ATTENDANCE_CRON_TIMEZONE: z.string().default("Asia/Kolkata"),
});

export const env = EnvSchema.parse(process.env);
