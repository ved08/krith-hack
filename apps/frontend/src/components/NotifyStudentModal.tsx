import { useState, type FormEvent } from "react";
import {
  notifyStudent,
  type AttendanceStatus,
  type NotifyResult,
} from "../lib/api.js";
import { Banner } from "./Banner.js";
import { Button } from "./Button.js";
import { FieldWrapper, Select, Textarea } from "./Field.js";

/**
 * Per-student quick-notify modal. Two actions:
 *   - ATTENDANCE: mark the student present/absent/late for a given date
 *     and WhatsApp the student + parents.
 *   - MESSAGE: send a custom WhatsApp to the student + parents.
 *
 * Attendance is scoped to one classroom (the row the button was
 * clicked from). Message is student-wide.
 */

type Action = "ATTENDANCE" | "MESSAGE";

export function NotifyStudentModal({
  token,
  studentId,
  studentName,
  classroomId,
  classroomLabel,
  onClose,
  onSent,
}: {
  token: string;
  studentId: number;
  studentName: string;
  classroomId: number;
  classroomLabel: string;
  onClose: () => void;
  onSent: (result: NotifyResult) => void;
}) {
  const [action, setAction] = useState<Action>("ATTENDANCE");
  const [status, setStatus] = useState<AttendanceStatus>("PRESENT");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (action === "MESSAGE" && message.trim().length === 0) {
      setError("Write a message first.");
      return;
    }

    setSubmitting(true);
    const res =
      action === "ATTENDANCE"
        ? await notifyStudent(token, studentId, {
            action: "ATTENDANCE",
            classroomId,
            status,
          })
        : await notifyStudent(token, studentId, {
            action: "MESSAGE",
            body: message.trim(),
          });
    setSubmitting(false);

    if (!res.success) {
      setError(res.error.message);
      return;
    }
    onSent(res.data);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 py-10">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <header className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">
              Notify parent
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {studentName} · {classroomLabel}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-900"
          >
            ✕
          </button>
        </header>

        <form onSubmit={onSubmit} className="grid gap-4">
          <FieldWrapper label="What to send">
            <Select
              value={action}
              onChange={(e) => setAction(e.target.value as Action)}
            >
              <option value="ATTENDANCE">Mark attendance (today)</option>
              <option value="MESSAGE">Custom message</option>
            </Select>
          </FieldWrapper>

          {action === "ATTENDANCE" ? (
            <FieldWrapper
              label="Status"
              hint="Writes one attendance row for today and WhatsApps the parent."
            >
              <Select
                value={status}
                onChange={(e) => setStatus(e.target.value as AttendanceStatus)}
              >
                <option value="PRESENT">✅ Present</option>
                <option value="ABSENT">❌ Absent</option>
                <option value="LATE">⏰ Late</option>
              </Select>
            </FieldWrapper>
          ) : (
            <FieldWrapper
              label="Message"
              hint="Sent to the student + linked parents as a WhatsApp text."
            >
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="E.g. Great job on today's class — keep it up!"
                rows={4}
                maxLength={1000}
              />
            </FieldWrapper>
          )}

          {error ? <Banner kind="error" message={error} /> : null}

          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Sending…" : "Send"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
