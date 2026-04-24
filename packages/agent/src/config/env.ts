import { z } from "zod";

/**
 * Env variables the `@campus/agent` package requires.
 * HTTP-layer env (PORT, TWILIO_*) belongs to `@campus/backend` and is not
 * declared here.
 */
const EnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  GEMINI_API_KEY: z.string().min(1).optional(),
  MOCK_LLM: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
});

export const env = EnvSchema.parse(process.env);
