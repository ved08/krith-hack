import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { env } from "../config/env.js";

/**
 * Post-agent formatting pass.
 *
 * The main agent is optimised for picking tools and relaying their facts
 * accurately. Its raw reply can still sound a bit report-like. This second
 * Gemini call polishes the reply for WhatsApp: warmer, shorter, natural
 * phrasing — without changing any facts.
 *
 * Behaviour:
 *   - MOCK_LLM=true → no-op (returns draft verbatim).
 *   - GEMINI_API_KEY missing → no-op.
 *   - Any failure → returns the draft (never blocks the main reply path).
 */
const FORMATTER_PROMPT = `You are rewriting a school assistant's draft reply for WhatsApp. The message will be sent to an Indian parent or student.

Hard rules (never violate):
- Preserve every fact from the draft exactly. Do not invent, add, remove, or change numbers, percentages, dates, names, or subjects.
- If the draft contains URLs (http://… or https://…), copy each URL VERBATIM. Never abbreviate, shorten, paraphrase, or wrap them. Output the full URL even if it is long.
- If the draft says "no data" or declines, keep that meaning — don't soften it into a false claim.
- Output plain text only. No markdown, no bullet points, no emojis unless the parent's question used them.

Style:
- Warm, natural, WhatsApp-appropriate. Concise but COMPLETE — never truncate mid-sentence or drop content the parent asked for.
- No formal greetings ("Dear parent", "Hi there"). Just start with the answer.
- Match the tone of the parent's question — casual question gets a casual reply.
- If the draft is already a good WhatsApp message, return it with minimal or no changes.

Parent's question:
{question}

Assistant draft:
{draft}

Return ONLY the final WhatsApp message — no quotes, no preamble, no explanation.`;

export async function formatForWhatsApp(
  originalQuestion: string,
  draftReply: string,
): Promise<string> {
  if (env.MOCK_LLM || !env.GEMINI_API_KEY) return draftReply;

  const llm = new ChatGoogleGenerativeAI({
    apiKey: env.GEMINI_API_KEY,
    model: "gemini-2.5-flash",
    temperature: 0.4,
    // Bumped from 256 — short replies were fine, but anything that
    // included a Supabase PDF URL (~140 chars, plus 1–2 sentences of
    // narration) blew past the old cap and arrived truncated.
    maxOutputTokens: 1024,
  });

  const prompt = FORMATTER_PROMPT.replace("{question}", originalQuestion).replace(
    "{draft}",
    draftReply,
  );

  console.log(`[formatter] → draft: "${truncate(draftReply, 160)}"`);

  try {
    const result = await llm.invoke(prompt);
    const text =
      typeof result.content === "string" ? result.content : JSON.stringify(result.content);
    const cleaned = text.trim();
    console.log(`[formatter] ← final: "${truncate(cleaned, 160)}"`);
    if (cleaned.length === 0) return draftReply;

    // Safety net: if the draft had a URL but the formatter mangled or
    // dropped it, abandon the polish and ship the raw draft. URLs
    // surviving intact matters more than tone here.
    const draftUrls = extractUrls(draftReply);
    if (draftUrls.length > 0) {
      const cleanedUrls = extractUrls(cleaned);
      const allPresent = draftUrls.every((u) => cleanedUrls.includes(u));
      if (!allPresent) {
        console.warn("[formatter] URL mismatch detected — returning raw draft");
        return draftReply;
      }
    }
    return cleaned;
  } catch (e) {
    console.error("[formatter] failed, returning draft:", e);
    return draftReply;
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

function extractUrls(s: string): string[] {
  // Greedy match of http(s) URLs up to the next whitespace / closing
  // punctuation. Conservative — better to over-keep than under-keep.
  const m = s.match(/https?:\/\/[^\s)>\]]+/g);
  return m ?? [];
}
