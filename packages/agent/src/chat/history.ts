import { AIMessage, HumanMessage, type BaseMessage } from "@langchain/core/messages";
import { z } from "zod";

/**
 * Shape of one stored turn in the chat cache. Either the user's raw
 * inbound text or the agent's final outbound reply. Stored as JSON in
 * Redis; kept intentionally small — no tool-call payloads, no
 * intermediate messages.
 */

export const ChatTurnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(4000),
  ts: z.number().int().nonnegative(),
});
export type ChatTurn = z.infer<typeof ChatTurnSchema>;

/**
 * Convert stored turns into LangChain message objects. Order is
 * chronological (oldest first) so the LLM sees the conversation as it
 * happened. Malformed entries are skipped rather than thrown — a
 * single bad blob shouldn't poison the whole history.
 */
export function toLangChainMessages(turns: ChatTurn[]): BaseMessage[] {
  const out: BaseMessage[] = [];
  for (const t of turns) {
    const parsed = ChatTurnSchema.safeParse(t);
    if (!parsed.success) continue;
    out.push(
      parsed.data.role === "user"
        ? new HumanMessage(parsed.data.content)
        : new AIMessage(parsed.data.content),
    );
  }
  return out;
}
