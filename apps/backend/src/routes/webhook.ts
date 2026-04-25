import { formatForWhatsApp, runAgent } from "@campus/agent";
import { Hono } from "hono";
import { sendWhatsAppMessage } from "../lib/twilio.js";
import twilio from "twilio";

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN,
);

export const webhookRouter = new Hono();

webhookRouter.post("/webhook", async (c) => {
  const body = await c.req.parseBody();

  const from = typeof body["From"] === "string" ? body["From"] : "";
  const text = typeof body["Body"] === "string" ? body["Body"] : "";

  const phoneE164 = from.startsWith("whatsapp:")
    ? from.slice("whatsapp:".length)
    : from;

  if (!phoneE164) {
    return c.json({ status: "ignored" });
  }

  const normalized = text.trim().toLowerCase();

  console.log(`[webhook] ${phoneE164} → ${text}`);

  // 🟢 1. GREETING → SEND TEMPLATE
  if (["hi", "hello", "hey"].includes(normalized)) {
    await client.messages.create({
      from: "whatsapp:+14155238886",
      to: `whatsapp:${phoneE164}`,
      contentSid: "HX481462b2c71708931e888370f779da2a",
    });

    return c.json({ status: "menu_sent" });
  }

  // 🟡 2. HANDLE LIST SELECTION → CONVERT TO QUERY
  const selected = body.ListId || body.ButtonPayload || body.ButtonText || text;

  let agentInput = text; // default

  switch (selected) {
    case "1":
      agentInput = "Give me the weekly report of my child";
      break;

    case "2":
      agentInput = "What is today's attendance of my child?";
      break;

    case "3":
      agentInput = "Provide performance analysis report of my child";
      break;

    case "4":
      agentInput = text;
      break;

    default:
      agentInput = text;
  }

  // 🔵 3. SEND TO AGENT (FOR ALL CASES)
  const outcome = await runAgent(phoneE164, agentInput);

  let finalReply = outcome.reply;

  if (outcome.kind === "OK") {
    finalReply = await formatForWhatsApp(agentInput, outcome.reply);
  }

  console.log(`[webhook] ${phoneE164} ← final: ${finalReply}`);

  const sendResult = await sendWhatsAppMessage(phoneE164, finalReply);

  return c.json({
    status: "ok",
    reply: finalReply,
    send: sendResult,
  });
});
