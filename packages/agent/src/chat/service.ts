import { formatForWhatsApp } from "../agent/formatter.js";
import { runAgent, type AgentRunOutcome } from "../agent/graph.js";
import { appendTurn, readHistory } from "./cache.js";
import { toLangChainMessages } from "./history.js";

/**
 * Single entry point for any channel that wants to talk to the agent.
 *
 * The webhook (WhatsApp) and /agent/message (dashboard) now both call
 * this — previously they duplicated the runAgent → formatter → send
 * sequence. Putting the orchestration here means:
 *
 *   - The chat cache is consulted exactly once per turn, in one place.
 *   - `formatForWhatsApp` is gated by channel so the dashboard tester
 *     isn't accidentally inconsistent with what hits WhatsApp.
 *   - Adding a new channel (Slack, SMS, web chat) is a matter of
 *     writing an inbound parser + outbound sender; the conversational
 *     core is reused.
 */

export type ChatChannel = "whatsapp" | "dashboard";

export type ChatHandleResult = {
  reply: string;
  outcome: AgentRunOutcome;
};

export async function handleIncomingMessage(input: {
  phoneE164: string;
  text: string;
  channel: ChatChannel;
}): Promise<ChatHandleResult> {
  // 1. Best-effort history fetch. Always returns an array — never throws.
  const turns = await readHistory(input.phoneE164);
  const history = toLangChainMessages(turns);

  // 2. Invoke the ReAct agent with the prior conversation prepended.
  const outcome = await runAgent(input.phoneE164, input.text, { history });

  // 3. Channel-specific polish: WhatsApp gets the formatter pass on
  //    successful agent replies. Canned refusals are already worded
  //    appropriately and don't need reformatting.
  let reply = outcome.reply;
  if (input.channel === "whatsapp" && outcome.kind === "OK") {
    reply = await formatForWhatsApp(input.text, outcome.reply);
  }

  // 4. Cache the full exchange — both the user's question AND the
  //    assistant's final reply (post-formatter, exactly what the
  //    parent saw on their phone). Storing the formatted version
  //    means follow-ups like "send again" / "yes" / "and the marks
  //    too" can resolve against the same URLs and numbers the
  //    parent is referring to.
  //
  //    Skip caching for unknown senders (random WhatsApp probes hit
  //    UNKNOWN_SENDER) and for hard ERROR outcomes (would poison
  //    history with the generic refusal). TEACHER_ON_WHATSAPP is
  //    still cached because that's a real user who got a real reply.
  const skip =
    outcome.kind === "CANNED" &&
    (outcome.reason === "UNKNOWN_SENDER" || outcome.reason === "ERROR");
  if (!skip) {
    const ts = Date.now();
    // Fire-and-forget: cache writes must never delay the HTTP response.
    // Append in chronological order (user first, then assistant) — the
    // cache stores newest-at-head via LPUSH so a later read+reverse
    // produces the right sequence.
    void appendTurn(input.phoneE164, {
      role: "user",
      content: input.text,
      ts,
    });
    void appendTurn(input.phoneE164, {
      role: "assistant",
      content: reply,
      ts: ts + 1,
    });
  }

  return { reply, outcome };
}
