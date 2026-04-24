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
});

export const env = EnvSchema.parse(process.env);
