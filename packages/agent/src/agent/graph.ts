import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { env } from "../config/env.js";
import { loadAgentContext, type AgentContext } from "./context.js";
import { runMockAgent } from "./mock-agent.js";
import { CANNED, SYSTEM_PROMPT } from "./prompts/index.js";
import { buildToolsForRequest } from "./tools/index.js";

export type AgentRunOutcome =
  | { kind: "OK"; reply: string }
  | { kind: "CANNED"; reply: string; reason: "UNKNOWN_SENDER" | "TEACHER_ON_WHATSAPP" | "ERROR" };

/**
 * Entry point: take a WhatsApp phone number + the raw message text and
 * return the reply string to send back. Thin wrapper around:
 *   1. loadAgentContext — deterministic identity + pre-resolve student
 *   2. runAgentLoop     — Gemini ReAct over the per-request tool bundle
 *      (or mock-agent keyword routing if MOCK_LLM=true)
 */
export async function runAgent(
  fromPhoneE164: string,
  messageText: string,
): Promise<AgentRunOutcome> {
  const outcome = await loadAgentContext(fromPhoneE164);
  if (outcome.kind === "UNKNOWN_SENDER") {
    return { kind: "CANNED", reply: CANNED.UNKNOWN_SENDER, reason: "UNKNOWN_SENDER" };
  }
  if (outcome.kind === "TEACHER_ON_WHATSAPP") {
    return {
      kind: "CANNED",
      reply: CANNED.TEACHER_ON_WHATSAPP,
      reason: "TEACHER_ON_WHATSAPP",
    };
  }
  if (outcome.kind === "ERROR") {
    return { kind: "CANNED", reply: CANNED.ERROR_FALLBACK, reason: "ERROR" };
  }

  const ctx = outcome.context;
  try {
    if (env.MOCK_LLM) {
      const reply = await runMockAgent(ctx, messageText);
      return { kind: "OK", reply };
    }
    const reply = await runGeminiAgent(ctx, messageText);
    return { kind: "OK", reply };
  } catch (e) {
    console.error("[agent] unexpected failure:", e);
    return { kind: "CANNED", reply: CANNED.ERROR_FALLBACK, reason: "ERROR" };
  }
}

// ---------------------------------------------------------------------------
// Real agent (Gemini + LangGraph ReAct prebuilt)
// ---------------------------------------------------------------------------

async function runGeminiAgent(ctx: AgentContext, messageText: string): Promise<string> {
  if (!env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is required when MOCK_LLM is false");
  }

  const llm = new ChatGoogleGenerativeAI({
    apiKey: env.GEMINI_API_KEY,
    model: "gemini-2.5-flash",
    temperature: 0.3,
    maxOutputTokens: 512,
  });

  const tools = buildToolsForRequest(ctx);

  const agent = createReactAgent({
    llm,
    tools,
  });

  const preamble = buildContextPreamble(ctx);

  const result = await agent.invoke(
    {
      messages: [
        new SystemMessage(SYSTEM_PROMPT),
        new HumanMessage(`${preamble}\n\nParent's question: ${messageText}`),
      ],
    },
    {
      recursionLimit: 10, // allows ~4 tool-call iterations
    },
  );

  const last = result.messages[result.messages.length - 1];
  if (!last) return CANNED.ERROR_FALLBACK;
  const content = last.content;
  if (typeof content === "string") return content;
  // Fallback for multi-part content — stringify
  return JSON.stringify(content);
}

/**
 * Sender identity / resolved student → preamble user-message that the LLM
 * treats as ground-truth context. Placed as a user message (not system)
 * because most models weight user-provided context higher than system
 * prompts for factual grounding.
 */
function buildContextPreamble(ctx: AgentContext): string {
  const lines: string[] = [];
  lines.push(`Sender: ${ctx.senderFullName} (${ctx.senderRole}).`);
  if (ctx.senderRole === "parent") {
    if (ctx.linkedStudents.length === 0) {
      lines.push("Linked children: none.");
    } else {
      lines.push(
        `Linked children: ${ctx.linkedStudents.map((s) => s.fullName).join(", ")}.`,
      );
    }
  }
  if (ctx.resolvedStudentId != null && ctx.resolvedStudentName) {
    lines.push(
      `Question is about: ${ctx.resolvedStudentName} (student id resolved server-side; you don't need to supply it).`,
    );
  } else if (ctx.senderRole === "parent" && ctx.linkedStudents.length >= 2) {
    lines.push(
      "No specific child identified yet. If the parent didn't name one, call list_my_linked_children and ask which child before any analytics tool.",
    );
  }
  return lines.join(" ");
}
