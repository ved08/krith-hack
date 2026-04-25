import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Banner } from "../components/Banner.js";
import { Button } from "../components/Button.js";
import { Card, CardHeader } from "../components/Card.js";
import { FieldWrapper, Input, Textarea } from "../components/Field.js";
import { Pill } from "../components/Pill.js";
import { Spinner } from "../components/Spinner.js";
import { sendAgentMessage } from "../lib/api.js";
import { isValidE164 } from "../lib/validation.js";
import type { AgentCannedReason } from "../types/api.js";

type Turn = {
  id: string;
  role: "user" | "agent" | "system";
  text: string;
  canned?: AgentCannedReason;
  at: string;
};

const SEED_PHONES: Array<{ phone: string; label: string }> = [
  { phone: "+913333333333", label: "Parent Sen (→ Rahul)" },
  { phone: "+912222222222", label: "Parent Kumar (→ Arjun + Priya)" },
  { phone: "+914444444444", label: "Parent Iyer (→ Meera)" },
  { phone: "+915555555555", label: "Student Arjun (self)" },
];

const SUGGESTIONS: string[] = [
  "how is my child doing?",
  "what is the attendance?",
  "how is Arjun in math?",
  "any tests coming up this week?",
  "any pending homework?",
];

export function ChatPage() {
  const [phone, setPhone] = useState("+913333333333");
  const [draft, setDraft] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [turns.length, sending]);

  const phoneValid = isValidE164(phone);
  const canSend = phoneValid && draft.trim().length > 0 && !sending;

  async function send(text?: string) {
    const messageText = (text ?? draft).trim();
    if (!messageText || !phoneValid) return;
    setError(null);
    const userTurn: Turn = {
      id: crypto.randomUUID(),
      role: "user",
      text: messageText,
      at: new Date().toISOString(),
    };
    setTurns((t) => [...t, userTurn]);
    setDraft("");
    setSending(true);

    const res = await sendAgentMessage({ fromPhoneE164: phone, messageText });
    setSending(false);

    if (!res.success) {
      setError(`${res.error.code}: ${res.error.message}`);
      setTurns((t) => [
        ...t,
        {
          id: crypto.randomUUID(),
          role: "system",
          text: `Error: ${res.error.code} — ${res.error.message}`,
          at: new Date().toISOString(),
        },
      ]);
      return;
    }
    setTurns((t) => [
      ...t,
      {
        id: crypto.randomUUID(),
        role: "agent",
        text: res.data.reply,
        canned: res.data.canned,
        at: new Date().toISOString(),
      },
    ]);
  }

  function clearConversation() {
    setTurns([]);
    setError(null);
  }

  return (
    <div className="mx-auto flex min-h-full max-w-3xl flex-col px-4 py-10 text-slate-900">
      <header className="mb-6">
        <Link
          to="/"
          className="text-xs font-semibold tracking-widest text-slate-500 hover:text-slate-900"
        >
          ← HOME
        </Link>
        <h1 className="mt-2 text-3xl font-semibold text-slate-900">
          Parent Chat
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Simulates a WhatsApp conversation. Pick a seeded phone or enter one
          that is registered in{" "}
          <code className="rounded bg-slate-100 px-1 text-xs">users</code>.
        </p>
      </header>

      <Card className="mb-4">
        <CardHeader
          title="Sender"
          subtitle="The backend looks this phone up in the users table to resolve identity."
        />
        <FieldWrapper
          label="Phone (E.164)"
          error={
            phoneValid
              ? undefined
              : "Must be +<country><digits>, e.g. +919876543210"
          }
        >
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            invalid={!phoneValid}
            inputMode="tel"
          />
        </FieldWrapper>
        <div className="mt-3 flex flex-wrap gap-2">
          {SEED_PHONES.map((s) => (
            <button
              key={s.phone}
              type="button"
              onClick={() => setPhone(s.phone)}
              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700 hover:border-slate-400 hover:bg-slate-50"
            >
              {s.phone}
              <span className="ml-1.5 text-slate-400">· {s.label}</span>
            </button>
          ))}
        </div>
      </Card>

      <Card className="flex flex-1 flex-col">
        <div className="mb-4 flex items-center justify-between">
          <CardHeader title="Conversation" />
          {turns.length > 0 ? (
            <Button variant="ghost" onClick={clearConversation}>
              Clear
            </Button>
          ) : null}
        </div>

        {error ? (
          <div className="mb-3">
            <Banner kind="error" message={error} />
          </div>
        ) : null}

        <div
          ref={listRef}
          className="min-h-[240px] max-h-[460px] flex-1 space-y-3 overflow-y-auto rounded-xl bg-slate-50 p-4"
        >
          {turns.length === 0 && !sending ? (
            <div className="py-10 text-center text-sm text-slate-500">
              Send a message to start the conversation.
            </div>
          ) : null}
          {turns.map((t) => (
            <Bubble key={t.id} turn={t} />
          ))}
          {sending ? (
            <div className="flex gap-2">
              <div className="max-w-[80%] rounded-2xl rounded-bl-sm bg-white px-4 py-2.5 shadow-sm">
                <Spinner label="Thinking…" />
              </div>
            </div>
          ) : null}
        </div>

        <div className="mt-4">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setDraft(s)}
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-500 hover:border-slate-400 hover:bg-slate-50"
              >
                {s}
              </button>
            ))}
          </div>
          <div className="flex items-end gap-2">
            <Textarea
              rows={2}
              placeholder="Ask about attendance, grades, pending homework…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  void send();
                }
              }}
            />
            <Button
              onClick={() => void send()}
              loading={sending}
              disabled={!canSend}
            >
              Send
            </Button>
          </div>
          <div className="mt-1 text-right text-xs text-slate-500">
            ⌘/Ctrl + Enter to send
          </div>
        </div>
      </Card>
    </div>
  );
}

function Bubble({ turn }: { turn: Turn }) {
  const isUser = turn.role === "user";
  const isSystem = turn.role === "system";
  return (
    <div
      className={`flex ${isUser ? "justify-end" : "justify-start"} animate-fade-in`}
    >
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm shadow-sm ${
          isUser
            ? "rounded-br-sm bg-slate-900 text-white"
            : isSystem
              ? "rounded-bl-sm bg-red-50 text-red-700"
              : "rounded-bl-sm bg-white text-slate-800"
        }`}
      >
        {turn.canned ? (
          <div className="mb-1">
            <Pill tone={turn.canned === "UNKNOWN_SENDER" ? "amber" : "slate"}>
              {turn.canned}
            </Pill>
          </div>
        ) : null}
        <div className="whitespace-pre-wrap">{turn.text}</div>
        <div
          className={`mt-1 text-[10px] ${isUser ? "text-slate-300" : "text-slate-400"}`}
        >
          {new Date(turn.at).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </div>
      </div>
    </div>
  );
}
