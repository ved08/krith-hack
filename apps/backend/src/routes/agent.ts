import { handleIncomingMessage } from "@campus/agent";
import { Hono } from "hono";
import { z } from "zod";

/**
 * JSON-RPC-style entrypoint for non-Twilio callers — used by the teacher
 * dashboard for test queries, and by local curl during development. The
 * Twilio webhook lives at /webhook and speaks form-encoded TwiML instead.
 */
export const agentRouter = new Hono();

const MessageSchema = z.object({
  fromPhoneE164: z
    .string()
    .regex(/^\+[1-9]\d{7,14}$/, "must be E.164 phone, e.g. +919876543210"),
  messageText: z.string().min(1).max(2000),
});

agentRouter.post("/agent/message", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = MessageSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { success: false, error: { code: "INVALID_INPUT", message: parsed.error.message } },
      400,
    );
  }

  const { reply, outcome } = await handleIncomingMessage({
    phoneE164: parsed.data.fromPhoneE164,
    text: parsed.data.messageText,
    channel: "dashboard",
  });
  return c.json({
    success: true,
    data: {
      reply,
      canned: outcome.kind === "CANNED" ? outcome.reason : null,
    },
  });
});
