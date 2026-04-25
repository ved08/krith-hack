import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  fetchClassroomRoster,
  uploadAttendance,
  uploadGrades,
  type AttendanceStatus,
  type AssignmentType,
  type RosterEntry,
  type UploadAttendanceResult,
  type UploadGradesResult,
} from "../lib/api.js";
import { parseCsv, toKeyValueRows } from "../lib/csv.js";
import { Banner } from "./Banner.js";
import { Button } from "./Button.js";
import { FieldWrapper, Input, Select } from "./Field.js";
import { Pill } from "./Pill.js";

/**
 * Shared UX for the two uploads:
 *  1. Roster loads on open so CSV usernames can be resolved → `studentId`.
 *  2. Teacher can either upload a CSV or click "Use full roster" to
 *     populate the table with every enrolled student defaulted to a
 *     sensible value (PRESENT / blank score).
 *  3. Rows are fully editable inline; bad rows are highlighted and
 *     block submission.
 *  4. Submit posts to the backend, which also fans out WhatsApp.
 */

// ─── Shared helpers ───────────────────────────────────────────────────────

type ModalShellProps = {
  title: string;
  subtitle: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
};

function ModalShell({ title, subtitle, onClose, children, wide }: ModalShellProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 py-10">
      <div
        className={`w-full rounded-2xl bg-white p-6 shadow-xl ${wide ? "max-w-4xl" : "max-w-2xl"}`}
      >
        <header className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
            <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
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
        {children}
      </div>
    </div>
  );
}

/**
 * Resolve CSV-supplied keys ("username" or numeric "studentId") against
 * the roster. Returns the matched `studentId` or `null` with an error
 * message.
 */
function resolveKeyToStudent(
  key: string,
  roster: RosterEntry[],
): { studentId: number; fullName: string } | { error: string } {
  const trimmed = key.trim();
  if (!trimmed) return { error: "empty identifier" };
  if (/^\d+$/.test(trimmed)) {
    const id = Number(trimmed);
    const byId = roster.find((r) => r.studentId === id);
    if (byId) return { studentId: byId.studentId, fullName: byId.fullName };
    return { error: `no student with id ${id}` };
  }
  const byUsername = roster.find(
    (r) => r.username.toLowerCase() === trimmed.toLowerCase(),
  );
  if (byUsername)
    return { studentId: byUsername.studentId, fullName: byUsername.fullName };
  return { error: `no student matches "${trimmed}"` };
}

// ─── Attendance modal ────────────────────────────────────────────────────

type AttendanceRow = {
  studentId: number | null;
  fullName: string;
  username: string;
  status: AttendanceStatus;
  error?: string;
};

export function AttendanceUploadModal({
  token,
  classroomId,
  classroomLabel,
  onClose,
  onSaved,
}: {
  token: string;
  classroomId: number;
  classroomLabel: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [roster, setRoster] = useState<RosterEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [sessionDate, setSessionDate] = useState(() => todayIso());
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<UploadAttendanceResult | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchClassroomRoster(token, classroomId).then((r) => {
      if (cancelled) return;
      if (!r.success) {
        setLoadError(r.error.message);
        return;
      }
      setRoster(r.data);
    });
    return () => {
      cancelled = true;
    };
  }, [token, classroomId]);

  async function onCsvFile(file: File) {
    setSubmitError(null);
    const text = await file.text();
    if (!roster) return;
    const parsed = parseCsv(text);
    const kv = toKeyValueRows(parsed);
    if (kv.length === 0) {
      setSubmitError("No data rows found in the CSV.");
      return;
    }
    const next: AttendanceRow[] = kv.map((entry) => {
      const match = resolveKeyToStudent(entry.key, roster);
      const statusRaw = entry.value.trim().toUpperCase();
      const status: AttendanceStatus | null =
        statusRaw === "PRESENT" || statusRaw === "P"
          ? "PRESENT"
          : statusRaw === "ABSENT" || statusRaw === "A"
          ? "ABSENT"
          : statusRaw === "LATE" || statusRaw === "L"
          ? "LATE"
          : null;

      if ("error" in match) {
        return {
          studentId: null,
          fullName: "(unknown)",
          username: entry.key,
          status: status ?? "PRESENT",
          error: match.error,
        };
      }
      if (!status) {
        return {
          studentId: match.studentId,
          fullName: match.fullName,
          username: entry.key,
          status: "PRESENT",
          error: `invalid status "${entry.value}" — using PRESENT`,
        };
      }
      return {
        studentId: match.studentId,
        fullName: match.fullName,
        username: entry.key,
        status,
      };
    });
    setRows(next);
  }

  function loadFullRoster() {
    if (!roster) return;
    setRows(
      roster.map((r) => ({
        studentId: r.studentId,
        fullName: r.fullName,
        username: r.username,
        status: "PRESENT" as const,
      })),
    );
  }

  const errorCount = rows.filter((r) => r.studentId === null).length;
  const canSubmit = rows.length > 0 && errorCount === 0 && !submitting;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitError(null);
    const valid = rows
      .filter((r) => r.studentId !== null)
      .map((r) => ({ studentId: r.studentId as number, status: r.status }));
    if (valid.length === 0) {
      setSubmitError("Need at least one valid row.");
      return;
    }
    setSubmitting(true);
    const res = await uploadAttendance(token, {
      classroomId,
      sessionDate,
      rows: valid,
    });
    setSubmitting(false);
    if (!res.success) {
      setSubmitError(res.error.message);
      return;
    }
    setResult(res.data);
  }

  if (result) {
    return (
      <ModalShell
        title="Attendance saved"
        subtitle={`${classroomLabel} · ${sessionDate}`}
        onClose={() => {
          onSaved();
        }}
      >
        <Banner
          kind="success"
          message={`Wrote ${result.written} rows. WhatsApp: ${result.whatsappSent} sent, ${result.whatsappFailed} failed, ${result.whatsappSkipped} skipped.`}
        />
        <div className="mt-4 flex justify-end">
          <Button onClick={onSaved}>Done</Button>
        </div>
      </ModalShell>
    );
  }

  return (
    <ModalShell
      title="Upload attendance"
      subtitle={`${classroomLabel} — students get a WhatsApp message when saved.`}
      onClose={onClose}
      wide
    >
      <form onSubmit={onSubmit} className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldWrapper label="Session date">
            <Input
              type="date"
              value={sessionDate}
              onChange={(e) => setSessionDate(e.target.value)}
              required
            />
          </FieldWrapper>
          <FieldWrapper
            label="CSV file"
            hint="Columns: username,status (PRESENT / ABSENT / LATE)"
          >
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onCsvFile(file);
              }}
              className="block w-full text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-slate-800"
            />
          </FieldWrapper>
        </div>

        <div className="flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={loadFullRoster}
            disabled={!roster}
          >
            Use full class roster
          </Button>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            {roster ? (
              <Pill tone="slate">{roster.length} enrolled</Pill>
            ) : loadError ? (
              <Pill tone="red">roster error</Pill>
            ) : (
              <Pill tone="slate">loading…</Pill>
            )}
            {errorCount > 0 ? (
              <Pill tone="red">{errorCount} row{errorCount === 1 ? "" : "s"} bad</Pill>
            ) : null}
          </div>
        </div>

        {loadError ? <Banner kind="error" message={loadError} /> : null}

        {rows.length > 0 ? (
          <RowsTable>
            <thead>
              <tr>
                <th>Student</th>
                <th>Username (from CSV)</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr
                  key={`${r.username}-${i}`}
                  className={r.error ? "bg-red-50" : ""}
                >
                  <td>
                    {r.fullName}
                    {r.error ? (
                      <div className="text-[11px] text-red-600">{r.error}</div>
                    ) : null}
                  </td>
                  <td className="text-xs text-slate-500">@{r.username}</td>
                  <td>
                    <Select
                      value={r.status}
                      onChange={(e) => {
                        const next = rows.slice();
                        next[i] = { ...r, status: e.target.value as AttendanceStatus };
                        setRows(next);
                      }}
                    >
                      <option value="PRESENT">PRESENT</option>
                      <option value="ABSENT">ABSENT</option>
                      <option value="LATE">LATE</option>
                    </Select>
                  </td>
                </tr>
              ))}
            </tbody>
          </RowsTable>
        ) : (
          <Banner
            kind="info"
            message="Upload a CSV or click 'Use full class roster' to pre-fill the table."
          />
        )}

        {submitError ? <Banner kind="error" message={submitError} /> : null}

        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!canSubmit}>
            {submitting ? "Saving…" : `Confirm & save${rows.length ? ` (${rows.length - errorCount})` : ""}`}
          </Button>
        </div>
      </form>
    </ModalShell>
  );
}

// ─── Marks modal ─────────────────────────────────────────────────────────

type MarkRow = {
  studentId: number | null;
  fullName: string;
  username: string;
  score: string;
  error?: string;
};

export function MarksUploadModal({
  token,
  classroomId,
  classroomLabel,
  defaultSubject,
  onClose,
  onSaved,
}: {
  token: string;
  classroomId: number;
  classroomLabel: string;
  defaultSubject: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [roster, setRoster] = useState<RosterEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rows, setRows] = useState<MarkRow[]>([]);

  // Assignment meta
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState(defaultSubject);
  const [type, setType] = useState<AssignmentType>("QUIZ");
  const [maxScoreStr, setMaxScoreStr] = useState("100");
  const [dueDate, setDueDate] = useState(() => todayIso());

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<UploadGradesResult | null>(null);

  const maxScore = useMemo(() => Number(maxScoreStr), [maxScoreStr]);
  const maxScoreInvalid = !Number.isFinite(maxScore) || maxScore <= 0;

  useEffect(() => {
    let cancelled = false;
    fetchClassroomRoster(token, classroomId).then((r) => {
      if (cancelled) return;
      if (!r.success) {
        setLoadError(r.error.message);
        return;
      }
      setRoster(r.data);
    });
    return () => {
      cancelled = true;
    };
  }, [token, classroomId]);

  async function onCsvFile(file: File) {
    setSubmitError(null);
    const text = await file.text();
    if (!roster) return;
    const parsed = parseCsv(text);
    const kv = toKeyValueRows(parsed);
    if (kv.length === 0) {
      setSubmitError("No data rows found in the CSV.");
      return;
    }
    const next: MarkRow[] = kv.map((entry) => {
      const match = resolveKeyToStudent(entry.key, roster);
      if ("error" in match) {
        return {
          studentId: null,
          fullName: "(unknown)",
          username: entry.key,
          score: entry.value,
          error: match.error,
        };
      }
      return {
        studentId: match.studentId,
        fullName: match.fullName,
        username: entry.key,
        score: entry.value,
      };
    });
    setRows(next);
  }

  function loadFullRoster() {
    if (!roster) return;
    setRows(
      roster.map((r) => ({
        studentId: r.studentId,
        fullName: r.fullName,
        username: r.username,
        score: "",
      })),
    );
  }

  // Row-level validation: score must be a number in [0, maxScore + tolerance].
  const rowsWithErrors = useMemo(
    () =>
      rows.map((r) => {
        if (r.studentId === null) return r;
        const n = Number(r.score);
        if (!Number.isFinite(n)) return { ...r, error: "score must be a number" };
        if (n < 0) return { ...r, error: "score can't be negative" };
        if (!maxScoreInvalid && n > maxScore * 1.2)
          return { ...r, error: `score far above max (${maxScore})` };
        return { ...r, error: undefined };
      }),
    [rows, maxScore, maxScoreInvalid],
  );
  const errorCount = rowsWithErrors.filter((r) => r.error || r.studentId === null).length;
  const canSubmit =
    rows.length > 0 &&
    errorCount === 0 &&
    title.trim().length > 0 &&
    subject.trim().length > 0 &&
    !maxScoreInvalid &&
    !submitting;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitError(null);
    const valid = rowsWithErrors
      .filter((r) => r.studentId !== null && !r.error)
      .map((r) => ({ studentId: r.studentId as number, score: Number(r.score) }));
    if (valid.length === 0) {
      setSubmitError("Need at least one valid row.");
      return;
    }
    setSubmitting(true);
    const res = await uploadGrades(token, {
      classroomId,
      title: title.trim(),
      subject: subject.trim(),
      type,
      maxScore,
      dueDate,
      rows: valid,
    });
    setSubmitting(false);
    if (!res.success) {
      setSubmitError(res.error.message);
      return;
    }
    setResult(res.data);
  }

  if (result) {
    return (
      <ModalShell
        title="Marks saved"
        subtitle={`${classroomLabel} · ${title}`}
        onClose={() => onSaved()}
      >
        <Banner
          kind="success"
          message={`Wrote ${result.written} rows. WhatsApp: ${result.whatsappSent} sent, ${result.whatsappFailed} failed, ${result.whatsappSkipped} skipped.`}
        />
        <div className="mt-4 flex justify-end">
          <Button onClick={onSaved}>Done</Button>
        </div>
      </ModalShell>
    );
  }

  return (
    <ModalShell
      title="Upload marks"
      subtitle={`${classroomLabel} — student + parent get WhatsApp with the score.`}
      onClose={onClose}
      wide
    >
      <form onSubmit={onSubmit} className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldWrapper label="Assignment title">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Unit 3 Quiz"
              required
              maxLength={120}
            />
          </FieldWrapper>
          <FieldWrapper label="Subject">
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
              maxLength={80}
            />
          </FieldWrapper>
          <FieldWrapper label="Type">
            <Select
              value={type}
              onChange={(e) => setType(e.target.value as AssignmentType)}
            >
              <option value="HOMEWORK">HOMEWORK</option>
              <option value="QUIZ">QUIZ</option>
              <option value="TEST">TEST</option>
            </Select>
          </FieldWrapper>
          <FieldWrapper
            label="Max score"
            error={maxScoreInvalid ? "must be a positive number" : undefined}
          >
            <Input
              type="number"
              min="1"
              step="0.5"
              value={maxScoreStr}
              onChange={(e) => setMaxScoreStr(e.target.value)}
              invalid={maxScoreInvalid}
            />
          </FieldWrapper>
          <FieldWrapper label="Due date">
            <Input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              required
            />
          </FieldWrapper>
          <FieldWrapper label="CSV file" hint="Columns: username,score">
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onCsvFile(file);
              }}
              className="block w-full text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-slate-800"
            />
          </FieldWrapper>
        </div>

        <div className="flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={loadFullRoster}
            disabled={!roster}
          >
            Use full class roster
          </Button>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            {roster ? (
              <Pill tone="slate">{roster.length} enrolled</Pill>
            ) : loadError ? (
              <Pill tone="red">roster error</Pill>
            ) : (
              <Pill tone="slate">loading…</Pill>
            )}
            {errorCount > 0 ? (
              <Pill tone="red">{errorCount} row{errorCount === 1 ? "" : "s"} bad</Pill>
            ) : null}
          </div>
        </div>

        {loadError ? <Banner kind="error" message={loadError} /> : null}

        {rowsWithErrors.length > 0 ? (
          <RowsTable>
            <thead>
              <tr>
                <th>Student</th>
                <th>Username</th>
                <th>Score</th>
              </tr>
            </thead>
            <tbody>
              {rowsWithErrors.map((r, i) => (
                <tr
                  key={`${r.username}-${i}`}
                  className={r.error ? "bg-red-50" : ""}
                >
                  <td>
                    {r.fullName}
                    {r.error ? (
                      <div className="text-[11px] text-red-600">{r.error}</div>
                    ) : null}
                  </td>
                  <td className="text-xs text-slate-500">@{r.username}</td>
                  <td>
                    <Input
                      type="number"
                      min="0"
                      step="0.5"
                      value={r.score}
                      onChange={(e) => {
                        const next = rows.slice();
                        next[i] = { ...rows[i]!, score: e.target.value };
                        setRows(next);
                      }}
                      className="w-28"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </RowsTable>
        ) : (
          <Banner
            kind="info"
            message="Upload a CSV or click 'Use full class roster' to pre-fill, then enter scores."
          />
        )}

        {submitError ? <Banner kind="error" message={submitError} /> : null}

        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!canSubmit}>
            {submitting ? "Saving…" : "Confirm & save"}
          </Button>
        </div>
      </form>
    </ModalShell>
  );
}

// ─── Shared table wrapper ────────────────────────────────────────────────

function RowsTable({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-h-72 overflow-auto rounded-lg border border-slate-200">
      <table className="w-full table-auto text-sm [&_th]:bg-slate-50 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:text-xs [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-wider [&_th]:text-slate-500 [&_td]:px-3 [&_td]:py-1.5 [&_td]:align-middle [&_tr]:border-t [&_tr]:border-slate-100">
        {children}
      </table>
    </div>
  );
}

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
