import { z } from "zod";

const EnvSchema = z.object({
  PORT: z
    .string()
    .default("3000")
    .transform((v) => Number.parseInt(v, 10)),
  // Optional. If set, the webhook verifies Twilio's X-Twilio-Signature
  // header. Leave empty during local development with the Twilio sandbox.
  TWILIO_AUTH_TOKEN: z.string().optional(),
});

export const env = EnvSchema.parse(process.env);
