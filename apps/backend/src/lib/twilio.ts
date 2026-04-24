import Twilio from "twilio";
import { env } from "../env.js";

/**
 * Outbound WhatsApp sender built on Twilio's REST Messages API.
 *
 * Why REST instead of TwiML? TwiML only works inside the inbound webhook
 * response. If we want to send follow-ups, proactive pushes, or decouple
 * the reply from the webhook latency, we need the REST client.
 *
 * Dry-run fallback: if any of TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN /
 * TWILIO_WHATSAPP_FROM are missing, log what would have been sent and
 * return { dryRun: true } instead of calling Twilio. Keeps local dev
 * free of unintended sends.
 */

type SendResult =
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
 * @param toPhoneE164 recipient phone in E.164 (e.g. "+919876543210"); the
 *                    required "whatsapp:" prefix is added here.
 * @param body message text. Twilio enforces a 1600-char limit; we truncate
 *             safely to 1500 and append a marker.
 */
export async function sendWhatsAppMessage(
  toPhoneE164: string,
  body: string,
): Promise<SendResult> {
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
