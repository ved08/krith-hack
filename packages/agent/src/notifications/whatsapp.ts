import Twilio from "twilio";
import { env } from "../config/env.js";

/**
 * Outbound WhatsApp sender built on Twilio's REST Messages API.
 *
 * Dry-run fallback: if any of TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN /
 * TWILIO_WHATSAPP_FROM are missing, logs what would have been sent and
 * returns { kind: "DRY_RUN" } instead of calling Twilio. Keeps local dev
 * free of unintended sends.
 */

export type WhatsAppSendResult =
  | { kind: "SENT"; sid: string }
  | { kind: "DRY_RUN" }
  | { kind: "ERROR"; message: string };

let cachedClient: ReturnType<typeof Twilio> | null = null;
function getClient() {
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) return null;
  if (!cachedClient) {
    cachedClient = Twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
  }
  return cachedClient;
}

/**
 * Send a WhatsApp message via Twilio.
 * @param toPhoneE164 recipient phone in E.164 (e.g. "+919876543210") — the
 *                    "whatsapp:" prefix is added here.
 * @param body message text. Twilio caps at 1600 chars; truncated to 1500.
 */
export async function sendWhatsAppMessage(
  toPhoneE164: string,
  body: string,
): Promise<WhatsAppSendResult> {
  const text = body.length > 1500 ? `${body.slice(0, 1500)}… (truncated)` : body;

  const client = getClient();
  if (!client || !env.TWILIO_WHATSAPP_FROM) {
    console.log(`[twilio] (dry-run) → ${toPhoneE164}: ${text}`);
    return { kind: "DRY_RUN" };
  }

  try {
    const msg = await client.messages.create({
      body: text,
      from: env.TWILIO_WHATSAPP_FROM,
      to: `whatsapp:${toPhoneE164}`,
    });
    console.log(`[twilio] sent sid=${msg.sid} to=${toPhoneE164}`);
    return { kind: "SENT", sid: msg.sid };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[twilio] send failed: ${message}`);
    return { kind: "ERROR", message };
  }
}

/**
 * Payload for the admissions-certificate WhatsApp notification.
 * Kept as plain structured fields (not an LLM JSON blob) so this sender
 * stays independent of the agent-reply pipeline.
 */
export type CertificateNotificationPayload = {
  parentPhoneE164: string;
  parentName: string;
  studentName: string;
  schoolName?: string;
  headline: string;
  overallScore: number;
  readinessBand: string;
  summary: string;
  strengths: string[];
  growthAreas: string[];
  recommendedActions: string[];
  certificateUrl: string;
};

/**
 * Dedicated sender for the post-admissions certificate notification.
 *
 * Owns its own message template so changes here never ripple into the
 * agent-reply path (which forwards free-form LLM output via
 * `sendWhatsAppMessage`). Any future structured notifications (attendance
 * digests, fee reminders, etc.) should add a sibling function rather than
 * overloading `sendWhatsAppMessage`.
 */
export async function sendCertificateWhatsApp(
  payload: CertificateNotificationPayload,
): Promise<WhatsAppSendResult> {
  const body = buildCertificateMessage(payload);
  return sendWhatsAppMessage(payload.parentPhoneE164, body);
}

function buildCertificateMessage(p: CertificateNotificationPayload): string {
  const bullet = (items: string[], max: number) =>
    items.slice(0, max).map((s) => `• ${s}`).join("\n");

  const schoolLine = p.schoolName ? ` at ${p.schoolName}` : "";

  return [
    `Hello ${p.parentName}, 👋`,
    "",
    `${p.studentName}'s Campus Cortex *Learning DNA* assessment${schoolLine} is ready.`,
    "",
    `*${p.headline}*`,
    `Overall score: *${p.overallScore}/100*  •  Readiness: *${p.readinessBand}*`,
    "",
    p.summary,
    "",
    "*Top strengths*",
    bullet(p.strengths, 3),
    "",
    "*Areas to grow*",
    bullet(p.growthAreas, 2),
    "",
    "*Next steps we recommend*",
    bullet(p.recommendedActions, 3),
    "",
    "📄 Full certificate & detailed report:",
    p.certificateUrl,
    "",
    "Reply to this message if you'd like to discuss the report with our counselor. — Campus Cortex",
  ].join("\n");
}
