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
