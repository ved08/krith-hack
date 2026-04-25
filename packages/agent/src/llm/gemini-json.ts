import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { z } from "zod";
import { env } from "../config/env.js";

/**
 * Shared Gemini JSON invocation — used by both the admissions Phase 2
 * flow and the classroom-quiz flow. Returns strictly-validated output
 * via the caller-supplied Zod schema, or throws.
 */

export const GEMINI_MODEL = "gemini-2.5-flash";

export async function invokeGeminiJson<T>(
  schema: z.ZodType<T>,
  systemPrompt: string,
  userPrompt: string,
  opts: { maxOutputTokens?: number; temperature?: number; label?: string } = {},
): Promise<T> {
  if (!env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is required when MOCK_LLM is false");
  }

  const label = opts.label ?? "llm";
  const llm = new ChatGoogleGenerativeAI({
    apiKey: env.GEMINI_API_KEY,
    model: GEMINI_MODEL,
    temperature: opts.temperature ?? 0.2,
    maxOutputTokens: opts.maxOutputTokens ?? 4096,
    // Forces `generationConfig.responseMimeType = "application/json"` —
    // suppresses Gemini's natural-language preamble and any <think>
    // scratch-pad. Essential for 2.5-flash.
    json: true,
  });

  const response = await llm.invoke([
    new SystemMessage(systemPrompt),
    new HumanMessage(userPrompt),
  ]);

  const text = extractTextContent(response.content);
  let parsedJson: unknown;
  try {
    parsedJson = parseJsonObject(text);
  } catch (e) {
    console.error(
      `[${label}] Gemini returned non-JSON. Raw output follows:\n---\n%s\n---`,
      text,
    );
    throw e;
  }
  const parsed = schema.safeParse(parsedJson);

  if (!parsed.success) {
    console.error(
      `[${label}] Gemini JSON failed schema validation. Raw JSON:\n---\n%s\n---`,
      JSON.stringify(parsedJson, null, 2),
    );
    throw new Error(`Gemini output validation failed: ${parsed.error.message}`);
  }

  return parsed.data;
}

function extractTextContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (
          typeof part === "object" &&
          part !== null &&
          "text" in part &&
          typeof (part as { text?: unknown }).text === "string"
        ) {
          return (part as { text: string }).text;
        }
        return "";
      })
      .join("\n")
      .trim();
  }
  return String(content ?? "");
}

function parseJsonObject(raw: string): unknown {
  const trimmed = raw.trim();
  const deFenced = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(deFenced);
  } catch {
    const first = deFenced.indexOf("{");
    const last = deFenced.lastIndexOf("}");
    if (first >= 0 && last > first) {
      const candidate = deFenced.slice(first, last + 1);
      return JSON.parse(candidate);
    }
    throw new Error("Gemini did not return valid JSON");
  }
}
