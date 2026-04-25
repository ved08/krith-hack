import Redis from "ioredis";
import { env } from "../config/env.js";
import { ChatTurnSchema, type ChatTurn } from "./history.js";

/**
 * Redis-backed per-user chat history.
 *
 *   Key:   chat:history:<phoneE164>
 *   Value: Redis LIST of JSON-serialized ChatTurn entries, newest at head.
 *   Bound: LTRIM 0 (MAX_ENTRIES-1) after every write — last 40 messages
 *          (≈ 20 exchanges of user + assistant) are retained. Both
 *          roles are cached so follow-ups like "send again", "yes",
 *          "and that one too" resolve against what the assistant
 *          actually said. The cached assistant text is the post-
 *          formatter reply (i.e. exactly what the user saw on
 *          WhatsApp), so re-asking surfaces the same URLs/numbers.
 *   TTL:   sliding 24 h, refreshed on every write.
 *
 * Failure policy: if REDIS_URL is missing or the server is unreachable,
 * we log once and all reads/writes become no-ops. The agent runs
 * stateless — same behaviour as before this module existed.
 */

const KEY_PREFIX = "chat:history:";
const MAX_ENTRIES = 40; // ≈ 20 exchanges (user + assistant) of conversational memory
const TTL_SECONDS = 24 * 60 * 60;

let client: Redis | null = null;
let warned = false;

function keyFor(phoneE164: string): string {
  return `${KEY_PREFIX}${phoneE164}`;
}

function warnOnce(reason: string): void {
  if (warned) return;
  warned = true;
  console.warn(`[chat-cache] redis unavailable, running stateless (${reason})`);
}

/**
 * Lazily construct the shared ioredis client. Returns `null` when no
 * REDIS_URL is configured — the caller must treat that as "skip cache".
 *
 * We use `lazyConnect` + `enableOfflineQueue: false` + a short retry
 * strategy so a dead Redis fails fast instead of blocking every
 * webhook for seconds of TCP timeout.
 */
function getClient(): Redis | null {
  if (client) return client;
  if (!env.REDIS_URL) {
    warnOnce("REDIS_URL not set");
    return null;
  }
  client = new Redis(env.REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    // Cap reconnect backoff so we don't wait forever before declaring dead.
    retryStrategy: (times) => (times > 3 ? null : Math.min(times * 200, 1000)),
  });
  client.on("error", (e) => {
    warnOnce(e.message);
  });
  return client;
}

async function ensureConnected(c: Redis): Promise<boolean> {
  if (c.status === "ready") return true;
  try {
    await c.connect();
    return true;
  } catch (e) {
    warnOnce(e instanceof Error ? e.message : String(e));
    return false;
  }
}

/**
 * Read the full cached history for a phone, chronologically ordered.
 * Returns `[]` on any error (missing key, connection failure, garbage
 * JSON) so callers can unconditionally spread into the LLM prompt.
 */
export async function readHistory(phoneE164: string): Promise<ChatTurn[]> {
  const c = getClient();
  if (!c) return [];
  if (!(await ensureConnected(c))) return [];
  try {
    // LRANGE returns newest-first (LPUSH order); reverse for chronology.
    const raw = await c.lrange(keyFor(phoneE164), 0, -1);
    const turns: ChatTurn[] = [];
    for (const s of raw.reverse()) {
      try {
        const parsed = ChatTurnSchema.safeParse(JSON.parse(s));
        if (parsed.success) turns.push(parsed.data);
      } catch {
        // Skip malformed blobs — the cache self-heals on the next write.
      }
    }
    return turns;
  } catch (e) {
    warnOnce(e instanceof Error ? e.message : String(e));
    return [];
  }
}

/**
 * Append one turn and refresh the TTL. Caller is expected to call this
 * twice per exchange (once for user, once for assistant). Writes are
 * pipelined so the two RTTs become one on a healthy connection.
 */
export async function appendTurn(
  phoneE164: string,
  turn: ChatTurn,
): Promise<void> {
  const c = getClient();
  if (!c) return;
  if (!(await ensureConnected(c))) return;
  try {
    const key = keyFor(phoneE164);
    await c
      .multi()
      .lpush(key, JSON.stringify(turn))
      .ltrim(key, 0, MAX_ENTRIES - 1)
      .expire(key, TTL_SECONDS)
      .exec();
  } catch (e) {
    warnOnce(e instanceof Error ? e.message : String(e));
  }
}

/**
 * Wipe one user's history. Not currently exposed via HTTP — here for
 * ops / a future `/reset` command over WhatsApp.
 */
export async function clearHistory(phoneE164: string): Promise<void> {
  const c = getClient();
  if (!c) return;
  if (!(await ensureConnected(c))) return;
  try {
    await c.del(keyFor(phoneE164));
  } catch (e) {
    warnOnce(e instanceof Error ? e.message : String(e));
  }
}
