import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Banner } from "../components/Banner.js";
import { Button } from "../components/Button.js";
import { Card, CardHeader } from "../components/Card.js";
import { FieldWrapper, Input } from "../components/Field.js";
import { Pill } from "../components/Pill.js";
import { Navigation } from "../components/Navigation.js";
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

  const [classrooms, setClassrooms] = useState<TeacherClassroomRow[] | null>(
    null,
  );
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
    <div className="min-h-screen bg-white text-slate-900">
      <Navigation />

      <div className="pt-20 pb-20 px-4 lg:px-8">
        <div className="container mx-auto max-w-6xl">
          {/* Header */}
          <div className="mb-10 animate-fade-in">
            <div className="flex items-start justify-between gap-4 mb-2">
              <div>
                <span className="inline-block px-3 py-1 rounded-full bg-primary-100 text-primary-700 text-xs font-bold mb-3">
                  👨‍🏫 TEACHER DASHBOARD
                </span>
                <h1 className="text-5xl font-bold text-slate-900 mb-2">
                  Welcome back, {teacher?.fullName?.split(" ")[0]}
                </h1>
                <p className="text-lg text-slate-600">
                  {teacher?.schoolName} •{" "}
                  <span className="font-mono text-sm text-slate-500">
                    @{teacher?.username}
                  </span>
                </p>
              </div>
              <button
                onClick={onSignOut}
                className="px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors text-sm font-medium"
              >
                Sign out
              </button>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="text-center">
                <div className="w-12 h-12 rounded-full border-4 border-slate-200 border-t-primary-600 animate-spin mx-auto mb-3" />
                <p className="text-slate-600">Loading your dashboard…</p>
              </div>
            </div>
          ) : error ? (
            <Banner kind="error" message={error} />
          ) : (
            <>
              {state?.token ? (
                <TeacherAnalyticsPanel token={state.token} />
              ) : null}

              <div className="mt-10 grid gap-10">
                {/* Classes Section */}
                <ClassroomsCard
                  token={state?.token ?? ""}
                  classrooms={classrooms ?? []}
                  onAdd={() => setShowWizard(true)}
                  onChanged={() => {
                    if (state?.token) reload(state.token);
                  }}
                />

                {/* Students Section */}
                <StudentsCard
                  token={state?.token ?? ""}
                  students={students ?? []}
                  classrooms={classrooms ?? []}
                />
              </div>
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
      </div>
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
  const [active, setActive] = useState<{
    kind: UploadKind;
    row: TeacherClassroomRow;
  } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-3xl font-bold text-slate-900">My Classes</h2>
          <p className="text-slate-600 mt-1">
            Manage your classrooms and upload attendance/marks
          </p>
        </div>
        <Button variant="primary" size="lg" onClick={onAdd}>
          + Add Class
        </Button>
      </div>

      {classrooms.length === 0 ? (
        <Card variant="bordered" className="text-center py-12">
          <div className="text-4xl mb-4">📚</div>
          <Banner
            kind="info"
            message="No classes yet. Click 'Add Class' to set up the grades and subjects you teach — students enrolling via the kiosk will then be auto-assigned to you."
          />
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {classrooms.map((c, idx) => (
            <Card
              key={c.classroomId}
              variant="elevated"
              className="animate-fade-in"
              style={{ animationDelay: `${idx * 50}ms` }}
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-xl font-bold text-slate-900">
                    {c.subject}
                  </h3>
                  <p className="text-sm text-slate-600 mt-1">Grade {c.grade}</p>
                </div>
                <Pill tone="blue" size="lg">
                  {c.studentCount}
                </Pill>
              </div>

              <div className="space-y-2">
                <p className="text-xs text-slate-500 font-semibold uppercase">
                  Quick Actions
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setActive({ kind: "attendance", row: c })}
                    disabled={c.studentCount === 0}
                  >
                    ✓ Attendance
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setActive({ kind: "marks", row: c })}
                    disabled={c.studentCount === 0}
                  >
                    ✎ Marks
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setActive({ kind: "quiz", row: c })}
                  >
                    + Quiz
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
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
          className="fixed bottom-6 right-6 z-50 max-w-sm rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-teal-50 px-6 py-4 text-sm text-emerald-900 shadow-lg hover:shadow-xl cursor-pointer transition-all font-semibold"
          onClick={() => setToast(null)}
        >
          <span className="mr-2">✓</span> {toast}
        </div>
      ) : null}
    </div>
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
  const [notifyTarget, setNotifyTarget] = useState<TeacherStudentRow | null>(
    null,
  );
  const [chartsTarget, setChartsTarget] = useState<TeacherStudentRow | null>(
    null,
  );
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
    <div>
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-3xl font-bold text-slate-900">My Students</h2>
          <p className="text-slate-600 mt-1">
            {students.length} total students across all classes
          </p>
        </div>
      </div>

      <div className="mb-6">
        <input
          type="search"
          placeholder="🔍 Search by name, username, or phone…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-2xl border-2 border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100 transition-all"
        />
      </div>

      {classrooms.length === 0 ? (
        <Card variant="bordered" className="text-center py-12">
          <Banner
            kind="info"
            message="Set up your classes first — students show up here once they enrol via the kiosk."
          />
        </Card>
      ) : students.length === 0 ? (
        <Card variant="bordered" className="text-center py-12">
          <Banner
            kind="info"
            message="No students enrolled yet. Once a parent finishes the kiosk intake for one of your grades, the student appears here."
          />
        </Card>
      ) : (
        <div className="space-y-8">
          {classrooms.map((c) => {
            const rows = grouped.get(c.classroomId) ?? [];
            if (rows.length === 0 && query.trim()) return null;
            return (
              <div key={c.classroomId}>
                <div className="mb-4 flex items-center gap-2">
                  <h3 className="text-xl font-bold text-slate-900">
                    {c.subject} · Grade {c.grade}
                  </h3>
                  <Pill tone="slate" size="md">
                    {rows.length}/{c.studentCount}
                  </Pill>
                </div>
                {rows.length === 0 ? (
                  <p className="text-sm text-slate-500 py-8 text-center bg-slate-50/50 rounded-lg">
                    No students in this class yet
                  </p>
                ) : (
                  <div className="grid gap-3">
                    {rows.map((s) => (
                      <Card
                        key={`${s.classroomId}:${s.studentId}`}
                        variant="bordered"
                        className="p-4 hover:shadow-md transition-all"
                      >
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-slate-900">
                              {s.fullName}
                            </div>
                            <div className="text-sm text-slate-500 mt-0.5">
                              @{s.username} · {s.phoneNumber}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <Pill tone="slate" size="sm">
                              #{s.studentId}
                            </Pill>
                            <Button
                              type="button"
                              variant="ghost"
                              size="md"
                              onClick={() => setChartsTarget(s)}
                              title="View performance"
                            >
                              📊
                            </Button>
                            <Button
                              type="button"
                              variant="secondary"
                              size="md"
                              onClick={() => setNotifyTarget(s)}
                            >
                              Send
                            </Button>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {notifyTarget ? (
        <NotifyStudentModal
          token={token}
          student={notifyTarget}
          onClose={() => setNotifyTarget(null)}
          onSent={() => {
            setNotifyTarget(null);
            setToast(`Message sent to ${notifyTarget.fullName}`);
          }}
        />
      ) : null}

      {chartsTarget ? (
        <StudentDetailModal
          student={chartsTarget}
          onClose={() => setChartsTarget(null)}
        />
      ) : null}

      {toast ? (
        <div
          className="fixed bottom-6 right-6 z-50 max-w-sm rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-teal-50 px-6 py-4 text-sm text-emerald-900 shadow-lg hover:shadow-xl cursor-pointer transition-all font-semibold"
          onClick={() => setToast(null)}
        >
          <span className="mr-2">✓</span> {toast}
        </div>
      ) : null}
    </div>
  );
}

// ─── Classroom Setup Wizard ──────────────────────────────────────────────────────────

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <Card variant="elevated" className="w-full max-w-lg shadow-2xl">
        <header className="mb-6">
          <h2 className="text-2xl font-bold text-slate-900 mb-2">
            {required ? "🎓 Set up your classes" : "➕ Add more classes"}
          </h2>
          <p className="text-slate-600">
            One row per (grade, subject) you teach. Students who enrol in the
            same grade via the kiosk will be auto-assigned to your class.
          </p>
        </header>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {rows.map((r, i) => (
              <div key={r.id} className="grid grid-cols-[1fr,1fr,auto] gap-3">
                <FieldWrapper label={i === 0 ? "Grade" : undefined}>
                  <Input
                    value={r.grade}
                    onChange={(e) => update(r.id, { grade: e.target.value })}
                    placeholder="Grade 5A"
                    maxLength={80}
                    className="rounded-lg border-2 border-slate-200 focus:border-primary-400"
                  />
                </FieldWrapper>
                <FieldWrapper label={i === 0 ? "Subject" : undefined}>
                  <Input
                    value={r.subject}
                    onChange={(e) => update(r.id, { subject: e.target.value })}
                    placeholder="Math"
                    maxLength={80}
                    className="rounded-lg border-2 border-slate-200 focus:border-primary-400"
                  />
                </FieldWrapper>
                <div className={i === 0 ? "pt-7" : ""}>
                  <Button
                    type="button"
                    variant="secondary"
                    size="md"
                    onClick={() => remove(r.id)}
                    disabled={rows.length === 1}
                    aria-label="Remove row"
                  >
                    ✕
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <Button
            type="button"
            variant="secondary"
            size="md"
            onClick={add}
            className="w-full"
          >
            + Add another class
          </Button>

          {error ? <Banner kind="error" message={error} /> : null}

          <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-200">
            {!required ? (
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
            ) : null}
            <Button type="submit" disabled={submitting} size="lg">
              {submitting ? "Saving…" : "Save Classes"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
