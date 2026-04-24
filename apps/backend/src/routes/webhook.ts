import { runAgent } from "@campus/agent";
import { Hono } from "hono";

/**
 * Twilio WhatsApp inbound webhook.
 *
 * Twilio posts application/x-www-form-urlencoded with at least:
 *   From:        "whatsapp:+919876543210"
 *   Body:        the message text
 *   ProfileName: sender's display name (optional)
 *   MessageSid:  unique id
 *
 * The simplest reply path is returning TwiML — Twilio forwards the
 * <Message> back to the sender automatically. No Twilio API credentials
 * required on the reply path. Response Content-Type must be text/xml.
 */
export const webhookRouter = new Hono();

webhookRouter.post("/webhook", async (c) => {
  const body = await c.req.parseBody();
  const from = typeof body["From"] === "string" ? body["From"] : "";
  const text = typeof body["Body"] === "string" ? body["Body"] : "";

  // Normalise Twilio's "whatsapp:+919876543210" → "+919876543210" (E.164).
  const phoneE164 = from.startsWith("whatsapp:") ? from.slice("whatsapp:".length) : from;

  console.log(`[webhook] ${phoneE164} → ${text}`);

  if (!phoneE164 || !text) {
    return c.text(twiml("I couldn't read that message. Please try again."), 200, {
      "Content-Type": "text/xml; charset=utf-8",
    });
  }

  const outcome = await runAgent(phoneE164, text);
  console.log(
    `[webhook] ${phoneE164} ← ${outcome.kind === "CANNED" ? `CANNED:${outcome.reason}` : "OK"}`,
  );

  return c.text(twiml(outcome.reply), 200, {
    "Content-Type": "text/xml; charset=utf-8",
  });
});

/**
 * Minimal TwiML encoder for an outbound Message reply. Escapes XML-sensitive
 * characters in the body.
 */
function twiml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<Response><Message>${escaped}</Message></Response>`;
}
