import { z } from "zod";

const EnvSchema = z.object({
  PORT: z
    .string()
    .default("3000")
    .transform((v) => Number.parseInt(v, 10)),
  // Twilio REST API credentials for sending outbound WhatsApp messages.
  // Leave unset during local development; the sender falls back to a
  // console-log dry-run (same shape as MOCK_LLM for the agent).
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  // Must include the "whatsapp:" prefix, e.g. "whatsapp:+14155238886"
  // (Twilio sandbox). Without it, Twilio returns a 400.
  TWILIO_WHATSAPP_FROM: z.string().optional(),
});

export const env = EnvSchema.parse(process.env);
