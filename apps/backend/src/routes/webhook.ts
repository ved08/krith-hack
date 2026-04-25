import { formatForWhatsApp, runAgent } from "@campus/agent";
import { Hono } from "hono";
import { sendWhatsAppMessage } from "../lib/twilio.js";

export const webhookRouter = new Hono();

webhookRouter.post("/webhook", async (c) => {
  const body = await c.req.parseBody();
  console.log("[webhook] incoming:", c.req);

  console.log("[webhook] incoming:", body);

  const from = typeof body["From"] === "string" ? body["From"] : "";
  const text = typeof body["Body"] === "string" ? body["Body"] : "";
  const phoneE164 = from.startsWith("whatsapp:") ? from.slice("whatsapp:".length) : from;

  if (!phoneE164 || !text) {
    console.log("[webhook] missing From or Body; ignoring");
    return c.json({ status: "ignored" });
  }

  console.log(`[webhook] ${phoneE164} → ${text}`);

  // LLM #1 — tool-calling agent produces a factual draft.
  const outcome = await runAgent(phoneE164, text);
  console.log("[webhook] agent outcome:", outcome);

  // LLM #2 — formatter polishes the draft for WhatsApp (skipped for
  // canned refusals which are already appropriately worded).
  let finalReply = outcome.reply;
  if (outcome.kind === "OK") {
    finalReply = await formatForWhatsApp(text, outcome.reply);
  }

  console.log(`[webhook] ${phoneE164} ← final: ${finalReply}`);

  // Send the polished reply back via Twilio's REST API.
  const sendResult = await sendWhatsAppMessage(phoneE164, finalReply);

  return c.json({ status: "ok", reply: finalReply, send: sendResult });
});
