import { z } from "zod";

/**
 * Env variables the `@campus/agent` package requires.
 *
 * HTTP-layer env (PORT) lives in `@campus/backend`. Everything the agent
 * itself needs — DB, LLM, storage, outbound WhatsApp — is declared here so
 * both the backend and any other workspace package that imports the agent
 * sees a single typed view.
 */

// Many deployments keep placeholder blanks in .env (e.g. `SUPABASE_URL=`)
// which Bun surfaces as an empty string. Treat those as unset so optional
// vars don't fail url/min-length validation.
const emptyToUndef = (v: unknown) =>
  typeof v === "string" && v.trim() === "" ? undefined : v;

const optionalUrl = z.preprocess(emptyToUndef, z.string().url().optional());
const optionalStr = z.preprocess(emptyToUndef, z.string().min(1).optional());

const EnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  GEMINI_API_KEY: optionalStr,
  MOCK_LLM: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),

  // Supabase Storage for certificate PDFs. Leave blank to skip the upload
  // step; evaluations still persist, just without a public URL.
  SUPABASE_URL: optionalUrl,
  SUPABASE_SERVICE_ROLE_KEY: optionalStr,
  SUPABASE_CERTIFICATES_BUCKET: z.preprocess(
    emptyToUndef,
    z.string().min(1).default("certificates"),
  ),

  // Twilio REST API for outbound WhatsApp. Leave blank for dry-run.
  TWILIO_ACCOUNT_SID: optionalStr,
  TWILIO_AUTH_TOKEN: optionalStr,
  // Must include the "whatsapp:" prefix — e.g. "whatsapp:+14155238886".
  TWILIO_WHATSAPP_FROM: optionalStr,

  // Redis for per-user WhatsApp chat history (last 30 exchanges, 24h TTL).
  // Leave blank to run the agent stateless — everything else still works.
  // Accepts redis://… so we don't use z.url() (older zod rejects non-http schemes).
  REDIS_URL: optionalStr,
});

export const env = EnvSchema.parse(process.env);
