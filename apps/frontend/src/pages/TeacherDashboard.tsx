import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Banner } from "../components/Banner.js";
import { Button } from "../components/Button.js";
import { Card } from "../components/Card.js";
import { FieldWrapper, Input } from "../components/Field.js";
import { Pill } from "../components/Pill.js";
import {
  createTeacherClassrooms,
  fetchTeacherClassrooms,
  fetchTeacherStudents,
  type CreateClassroomEntry,
  type TeacherClassroomRow,
  type TeacherStudentRow,
} from "../lib/api.js";
import { useAuth } from "../lib/auth.js";
import {
  AttendanceUploadModal,
  MarksUploadModal,
} from "../components/UploadModals.js";
import { CreateQuizModal } from "../components/CreateQuizModal.js";
import { NotifyStudentModal } from "../components/NotifyStudentModal.js";
import {
  StudentDetailModal,
  TeacherAnalyticsPanel,
} from "../components/TeacherAnalyticsPanel.js";

export function TeacherDashboardPage() {
  const { state, signOut } = useAuth();
  const navigate = useNavigate();
  const teacher = state?.teacher;

  const [classrooms, setClassrooms] = useState<TeacherClassroomRow[] | null>(null);
  const [students, setStudents] = useState<TeacherStudentRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showWizard, setShowWizard] = useState(false);

  async function reload(token: string) {
    setLoading(true);
    setError(null);
    const [c, s] = await Promise.all([
      fetchTeacherClassrooms(token),
      fetchTeacherStudents(token),
    ]);
    setLoading(false);
    if (!c.success) {
      if (c.error.code === "UNAUTHORIZED") {
        signOut();
        navigate("/teacher/login", { replace: true });
        return;
      }
      setError(c.error.message);
      return;
    }
    if (!s.success) {
      setError(s.error.message);
      return;
    }
    setClassrooms(c.data);
    setStudents(s.data);
    // First-login experience: no classrooms yet → force the wizard open.
    if (c.data.length === 0) setShowWizard(true);
  }

  useEffect(() => {
    if (!state?.token) return;
    reload(state.token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.token]);

  function onSignOut() {
    signOut();
    navigate("/teacher/login", { replace: true });
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <span className="text-xs font-semibold tracking-widest text-slate-500">
            TEACHER DASHBOARD
          </span>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
            {teacher?.fullName ?? "Welcome"}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {teacher?.schoolName} ·{" "}
            <span className="font-mono text-xs">@{teacher?.username}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/"
            className="text-sm text-slate-600 underline hover:text-slate-900"
          >
            Home
          </Link>
          <Button variant="secondary" onClick={onSignOut}>
            Sign out
          </Button>
        </div>
      </header>

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : error ? (
        <Banner kind="error" message={error} />
      ) : (
        <>
          {state?.token ? <TeacherAnalyticsPanel token={state.token} /> : null}

          <div className="h-6" />

          <ClassroomsCard
            token={state?.token ?? ""}
            classrooms={classrooms ?? []}
            onAdd={() => setShowWizard(true)}
            onChanged={() => {
              if (state?.token) reload(state.token);
            }}
          />

          <div className="h-6" />

          <StudentsCard
            token={state?.token ?? ""}
            students={students ?? []}
            classrooms={classrooms ?? []}
          />
        </>
      )}

      {showWizard && state?.token ? (
        <ClassroomSetupWizard
          token={state.token}
          required={(classrooms?.length ?? 0) === 0}
          onClose={() => setShowWizard(false)}
          onCreated={async () => {
            setShowWizard(false);
            if (state.token) await reload(state.token);
          }}
        />
      ) : null}
    </div>
  );
}

// ─── Classrooms ──────────────────────────────────────────────────────────

function ClassroomsCard({
  token,
  classrooms,
  onAdd,
  onChanged,
}: {
  token: string;
  classrooms: TeacherClassroomRow[];
  onAdd: () => void;
  onChanged: () => void;
}) {
  type UploadKind = "attendance" | "marks" | "quiz";
  const [active, setActive] = useState<
    { kind: UploadKind; row: TeacherClassroomRow } | null
  >(null);
  const [toast, setToast] = useState<string | null>(null);

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-900">My classes</h2>
        <Button variant="secondary" onClick={onAdd}>
          + Add classes
        </Button>
      </div>

      {classrooms.length === 0 ? (
        <Banner
          kind="info"
          message="No classes yet. Click 'Add classes' to set up the grades and subjects you teach — students enrolling via the kiosk will then be auto-assigned to you."
        />
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {classrooms.map((c) => (
            <li
              key={c.classroomId}
              className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-slate-900">
                    {c.subject}
                  </div>
                  <div className="text-xs text-slate-500">{c.grade}</div>
                </div>
                <Pill tone="slate">
                  {c.studentCount} student{c.studentCount === 1 ? "" : "s"}
                </Pill>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setActive({ kind: "attendance", row: c })}
                  disabled={c.studentCount === 0}
                >
                  Attendance
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setActive({ kind: "marks", row: c })}
                  disabled={c.studentCount === 0}
                >
                  Marks
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setActive({ kind: "quiz", row: c })}
                >
                  + Quiz
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {active?.kind === "attendance" ? (
        <AttendanceUploadModal
          token={token}
          classroomId={active.row.classroomId}
          classroomLabel={`${active.row.subject} · ${active.row.grade}`}
          onClose={() => setActive(null)}
          onSaved={() => {
            setActive(null);
            onChanged();
          }}
        />
      ) : null}

      {active?.kind === "marks" ? (
        <MarksUploadModal
          token={token}
          classroomId={active.row.classroomId}
          classroomLabel={`${active.row.subject} · ${active.row.grade}`}
          defaultSubject={active.row.subject}
          onClose={() => setActive(null)}
          onSaved={() => {
            setActive(null);
            onChanged();
          }}
        />
      ) : null}

      {active?.kind === "quiz" ? (
        <CreateQuizModal
          token={token}
          classroomId={active.row.classroomId}
          classroomLabel={`${active.row.subject} · ${active.row.grade}`}
          onClose={() => setActive(null)}
          onCreated={(r) => {
            setActive(null);
            setToast(
              `Quiz "${r.title}" published · ${r.questionCount} questions · ${r.maxScore} pts total`,
            );
            onChanged();
          }}
        />
      ) : null}

      {toast ? (
        <div
          className="fixed bottom-6 right-6 z-50 max-w-sm rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 shadow-lg"
          onClick={() => setToast(null)}
        >
          {toast}
        </div>
      ) : null}
    </Card>
  );
}

// ─── Students ────────────────────────────────────────────────────────────

function StudentsCard({
  token,
  students,
  classrooms,
}: {
  token: string;
  students: TeacherStudentRow[];
  classrooms: TeacherClassroomRow[];
}) {
  const [query, setQuery] = useState("");
  const [notifyTarget, setNotifyTarget] = useState<TeacherStudentRow | null>(null);
  const [chartsTarget, setChartsTarget] = useState<TeacherStudentRow | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Group students by (classroomId) so each card matches a row in
  // ClassroomsCard. The same student can appear under multiple of the
  // teacher's classes if the teacher teaches multiple subjects to that
  // grade — that's intentional, not a duplicate.
  const grouped = useMemo(() => {
    const filtered = query.trim()
      ? students.filter((s) =>
          [s.fullName, s.username, s.phoneNumber]
            .join(" ")
            .toLowerCase()
            .includes(query.trim().toLowerCase()),
        )
      : students;
    const map = new Map<number, TeacherStudentRow[]>();
    for (const s of filtered) {
      const arr = map.get(s.classroomId) ?? [];
      arr.push(s);
      map.set(s.classroomId, arr);
    }
    return map;
  }, [students, query]);

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-900">My students</h2>
        <Pill tone="slate">{students.length} total</Pill>
      </div>

      <input
        type="search"
        placeholder="Search name, username, or phone…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="mb-4 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
      />

      {classrooms.length === 0 ? (
        <Banner
          kind="info"
          message="Set up your classes first — students show up here once they enrol via the kiosk."
        />
      ) : students.length === 0 ? (
        <Banner
          kind="info"
          message="No students enrolled yet. Once a parent finishes the kiosk intake for one of your grades, the student appears here."
        />
      ) : (
        <div className="grid gap-6">
          {classrooms.map((c) => {
            const rows = grouped.get(c.classroomId) ?? [];
            if (rows.length === 0 && query.trim()) return null;
            return (
              <section key={c.classroomId}>
                <h3 className="mb-2 text-sm font-semibold text-slate-700">
                  {c.subject} · {c.grade}{" "}
                  <span className="ml-1 text-xs font-normal text-slate-500">
                    ({rows.length}/{c.studentCount})
                  </span>
                </h3>
                {rows.length === 0 ? (
                  <p className="text-xs text-slate-500">No students in this class yet.</p>
                ) : (
                  <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200">
                    {rows.map((s) => (
                      <li
                        key={`${s.classroomId}:${s.studentId}`}
                        className="flex items-center justify-between gap-3 px-3 py-2.5"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-slate-900">
                            {s.fullName}
                          </div>
                          <div className="truncate text-xs text-slate-500">
                            @{s.username} · {s.phoneNumber}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Pill tone="slate">#{s.studentId}</Pill>
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => setChartsTarget(s)}
                            title="View charts"
                          >
                            📊
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => setNotifyTarget(s)}
                          >
                            Notify
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}

      {chartsTarget ? (
        <StudentDetailModal
          token={token}
          studentId={chartsTarget.studentId}
          onClose={() => setChartsTarget(null)}
        />
      ) : null}

      {notifyTarget ? (
        <NotifyStudentModal
          token={token}
          studentId={notifyTarget.studentId}
          studentName={notifyTarget.fullName}
          classroomId={notifyTarget.classroomId}
          classroomLabel={`${notifyTarget.subject} · ${notifyTarget.classroomName}`}
          onClose={() => setNotifyTarget(null)}
          onSent={(r) => {
            setNotifyTarget(null);
            const msg =
              r.action === "ATTENDANCE"
                ? `Attendance saved for ${r.sessionDate}. WhatsApp: ${r.whatsappSent} sent, ${r.whatsappFailed} failed.`
                : `Message sent. WhatsApp: ${r.whatsappSent} sent, ${r.whatsappFailed} failed.`;
            setToast(msg);
            window.setTimeout(() => setToast(null), 4000);
          }}
        />
      ) : null}

      {toast ? (
        <div
          className="fixed bottom-6 right-6 z-50 max-w-sm rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 shadow-lg"
          onClick={() => setToast(null)}
        >
          {toast}
        </div>
      ) : null}
    </Card>
  );
}

// ─── Setup wizard ────────────────────────────────────────────────────────

type WizardRow = { id: number; grade: string; subject: string };

let nextRowId = 1;
function newRow(grade = "", subject = ""): WizardRow {
  return { id: nextRowId++, grade, subject };
}

function ClassroomSetupWizard({
  token,
  required,
  onClose,
  onCreated,
}: {
  token: string;
  required: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [rows, setRows] = useState<WizardRow[]>(() => [
    newRow("Grade 5A", "Math"),
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update(id: number, patch: Partial<WizardRow>) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function remove(id: number) {
    setRows((rs) => (rs.length === 1 ? rs : rs.filter((r) => r.id !== id)));
  }

  function add() {
    setRows((rs) => [...rs, newRow()]);
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const cleaned: CreateClassroomEntry[] = rows
      .map((r) => ({ grade: r.grade.trim(), subject: r.subject.trim() }))
      .filter((r) => r.grade && r.subject);

    if (cleaned.length === 0) {
      setError("Add at least one classroom with grade and subject filled in.");
      return;
    }

    setSubmitting(true);
    const res = await createTeacherClassrooms(token, cleaned);
    setSubmitting(false);
    if (!res.success) {
      setError(res.error.message);
      return;
    }
    onCreated();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <header className="mb-4">
          <h2 className="text-xl font-semibold text-slate-900">
            {required ? "Set up your classes" : "Add more classes"}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            One row per (grade, subject) you teach. Students who enrol in the
            same grade via the kiosk will be auto-assigned to your class.
          </p>
        </header>

        <form onSubmit={onSubmit} className="grid gap-3">
          {rows.map((r, i) => (
            <div key={r.id} className="grid grid-cols-[1fr,1fr,auto] gap-2">
              <FieldWrapper label={i === 0 ? "Grade" : ""}>
                <Input
                  value={r.grade}
                  onChange={(e) => update(r.id, { grade: e.target.value })}
                  placeholder="Grade 5A"
                  maxLength={80}
                />
              </FieldWrapper>
              <FieldWrapper label={i === 0 ? "Subject" : ""}>
                <Input
                  value={r.subject}
                  onChange={(e) => update(r.id, { subject: e.target.value })}
                  placeholder="Math"
                  maxLength={80}
                />
              </FieldWrapper>
              <div className={i === 0 ? "pt-7" : ""}>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => remove(r.id)}
                  disabled={rows.length === 1}
                  aria-label="Remove row"
                >
                  ×
                </Button>
              </div>
            </div>
          ))}

          <div>
            <Button type="button" variant="secondary" onClick={add}>
              + Add another
            </Button>
          </div>

          {error ? <Banner kind="error" message={error} /> : null}

          <div className="mt-2 flex items-center justify-end gap-2">
            {!required ? (
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
            ) : null}
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving…" : "Save classes"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
