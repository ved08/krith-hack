import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Banner } from "../components/Banner.js";
import { Button } from "../components/Button.js";
import { Card, CardHeader } from "../components/Card.js";
import { FieldWrapper, Input } from "../components/Field.js";
import { Pill } from "../components/Pill.js";
import {
  fetchQuizForStudent,
  fetchStudentAnalytics,
  fetchStudentQuizzes,
  studentLookup,
  submitStudentQuiz,
  type QuizForTaking,
  type StudentDetail,
  type StudentLookup,
  type StudentQuiz,
  type SubmitQuizResult,
} from "../lib/api.js";
import { PerQuestionBar } from "../components/Charts.js";
import { StudentAnalyticsInner } from "../components/TeacherAnalyticsPanel.js";

/**
 * Public student page. Mirrors the kiosk pattern: no password, identify
 * by username, then list available quizzes and take/submit one.
 * On submit, the backend scores + analyses + uploads a PDF + WhatsApps
 * the parent — this page just renders the result.
 */

type Step =
  | { kind: "login" }
  | { kind: "quizzes"; lookup: StudentLookup; quizzes: StudentQuiz[] }
  | {
      kind: "taking";
      lookup: StudentLookup;
      taking: QuizForTaking;
      answers: Record<string, string>;
    }
  | {
      kind: "submitting";
      lookup: StudentLookup;
      taking: QuizForTaking;
    }
  | {
      kind: "result";
      lookup: StudentLookup;
      taking: QuizForTaking;
      result: SubmitQuizResult;
    };

export function StudentPage() {
  const [step, setStep] = useState<Step>({ kind: "login" });
  const [error, setError] = useState<string | null>(null);
  const [studentMode, setStudentMode] = useState<"existing" | "new">(
    "existing",
  );

  return (
    <div className="mx-auto w-full max-w-full px-6 py-10 bg-white text-slate-900">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <span className="text-xs font-semibold tracking-widest text-slate-500">
            STUDENT ACCESS
          </span>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
            {step.kind === "login" ? "Student login" : step.lookup.fullName}
          </h1>
          {step.kind !== "login" ? (
            <p className="mt-1 text-sm text-slate-600">
              Enrolled in{" "}
              {step.lookup.classrooms.length === 0
                ? "no classes yet"
                : step.lookup.classrooms
                    .map((c) => `${c.subject} · ${c.grade}`)
                    .join(", ")}
            </p>
          ) : (
            <p className="mt-1 text-sm text-slate-600">
              Choose existing or new student access below.
            </p>
          )}
        </div>
        <Link
          to="/"
          className="text-sm text-slate-600 underline hover:text-slate-900"
        >
          Home
        </Link>
      </header>

      {error ? (
        <div className="mb-4">
          <Banner kind="error" message={error} />
        </div>
      ) : null}

      {step.kind === "login" ? (
        <div className="space-y-6">
          <section className="w-full grid gap-6 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-soft lg:grid-cols-[1.4fr_0.9fr]">
            <div className="space-y-6">
              <div>
                <span className="text-xs uppercase tracking-[0.35em] text-slate-500">
                  Student gateway
                </span>
                <h2 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                  Login with your school username
                </h2>
                <p className="mt-4 max-w-xl text-base leading-8 text-slate-600">
                  Use the username your school issued at the kiosk. No password
                  is required, and you can continue directly to quizzes,
                  attendance, and reports.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                  <p className="text-sm font-semibold text-slate-900">
                    Quick sign in
                  </p>
                  <p className="mt-2 text-sm text-slate-600">
                    Enter your username and continue without extra login steps.
                  </p>
                </div>
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                  <p className="text-sm font-semibold text-slate-900">
                    Kiosk-friendly
                  </p>
                  <p className="mt-2 text-sm text-slate-600">
                    New students can follow the kiosk flow to receive their
                    access.
                  </p>
                </div>
              </div>
            </div>

            <div className="relative h-[360px] overflow-hidden rounded-[2rem] bg-slate-100 shadow-soft">
              <img
                src="https://images.unsplash.com/photo-1427504494785-3a9ca7044f45?auto=format&fit=crop&w=1100&q=80"
                alt="Student using learning app"
                className="h-full w-full object-cover"
                loading="eager"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/30 to-transparent" />
              <div className="absolute bottom-6 left-6 right-6">
                <p className="text-sm uppercase tracking-[0.35em] text-slate-500">
                  Start learning
                </p>
                <h3 className="mt-3 text-2xl font-semibold text-slate-900">
                  Your classroom in one place
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Secure student access with a polished interface and clear next
                  steps.
                </p>
              </div>
            </div>
          </section>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              type="button"
              variant={studentMode === "existing" ? "primary" : "secondary"}
              onClick={() => setStudentMode("existing")}
            >
              Existing student
            </Button>
            <Button
              type="button"
              variant={studentMode === "new" ? "primary" : "secondary"}
              onClick={() => setStudentMode("new")}
            >
              New student
            </Button>
          </div>
          {studentMode === "existing" ? (
            <LoginCard
              onLoggedIn={async (lookup) => {
                setError(null);
                const quizzesRes = await fetchStudentQuizzes(lookup.studentId);
                if (!quizzesRes.success) {
                  setError(quizzesRes.error.message);
                  return;
                }
                setStep({ kind: "quizzes", lookup, quizzes: quizzesRes.data });
              }}
            />
          ) : (
            <NewStudentCard />
          )}
        </div>
      ) : null}

      {step.kind === "quizzes" ? (
        <>
          <div className="mb-6">
            <StudentAnalyticsStrip studentId={step.lookup.studentId} />
          </div>
          <QuizzesList
            lookup={step.lookup}
            quizzes={step.quizzes}
            onTake={async (quizId) => {
              setError(null);
              const res = await fetchQuizForStudent(
                step.lookup.studentId,
                quizId,
              );
              if (!res.success) {
                setError(res.error.message);
                return;
              }
              setStep({
                kind: "taking",
                lookup: step.lookup,
                taking: res.data,
                answers: {},
              });
            }}
            onSignOut={() => setStep({ kind: "login" })}
          />
        </>
      ) : null}

      {step.kind === "taking" ? (
        <TakingQuiz
          lookup={step.lookup}
          taking={step.taking}
          answers={step.answers}
          onAnswer={(id, v) =>
            setStep({
              ...step,
              answers: { ...step.answers, [id]: v },
            })
          }
          onCancel={async () => {
            setError(null);
            const quizzesRes = await fetchStudentQuizzes(step.lookup.studentId);
            if (quizzesRes.success) {
              setStep({
                kind: "quizzes",
                lookup: step.lookup,
                quizzes: quizzesRes.data,
              });
            } else {
              setStep({ kind: "login" });
            }
          }}
          onSubmit={async () => {
            setError(null);
            setStep({
              kind: "submitting",
              lookup: step.lookup,
              taking: step.taking,
            });
            const responses = step.taking.questions.map((q) => ({
              questionId: q.id,
              question: q.question,
              answer: (step.answers[q.id] ?? "").trim() || "(no answer)",
            }));
            const res = await submitStudentQuiz(
              step.lookup.studentId,
              step.taking.quiz.id,
              responses,
            );
            if (!res.success) {
              setError(res.error.message);
              // Kick back to the taking state so the student can retry.
              setStep({
                kind: "taking",
                lookup: step.lookup,
                taking: step.taking,
                answers: step.answers,
              });
              return;
            }
            setStep({
              kind: "result",
              lookup: step.lookup,
              taking: step.taking,
              result: res.data,
            });
          }}
        />
      ) : null}

      {step.kind === "submitting" ? (
        <Card>
          <div className="py-10 text-center">
            <div className="mx-auto mb-3 h-6 w-6 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />
            <p className="text-sm text-slate-600">
              Scoring your quiz, writing the report, and notifying your parent…
            </p>
          </div>
        </Card>
      ) : null}

      {step.kind === "result" ? (
        <QuizResult
          taking={step.taking}
          result={step.result}
          onBack={async () => {
            const quizzesRes = await fetchStudentQuizzes(step.lookup.studentId);
            if (quizzesRes.success) {
              setStep({
                kind: "quizzes",
                lookup: step.lookup,
                quizzes: quizzesRes.data,
              });
            }
          }}
        />
      ) : null}
    </div>
  );
}

// ─── Analytics strip (quiz list page) ────────────────────────────────────

function StudentAnalyticsStrip({ studentId }: { studentId: number }) {
  const [detail, setDetail] = useState<StudentDetail | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchStudentAnalytics(studentId).then((r) => {
      if (cancelled) return;
      if (r.success) setDetail(r.data);
    });
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  if (!detail) return null;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-800">Your stats</h2>
        <Button
          type="button"
          variant="ghost"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "Hide charts" : "Show charts"}
        </Button>
      </div>
      {expanded ? (
        <StudentAnalyticsInner detail={detail} />
      ) : (
        <div className="grid grid-cols-3 gap-2 text-center sm:grid-cols-4">
          <MiniStat
            label="Attendance"
            value={`${detail.attendance.presentPct.toFixed(0)}%`}
          />
          <MiniStat label="Quizzes" value={detail.quizResults.length} />
          <MiniStat label="Marks" value={detail.assignmentResults.length} />
          <MiniStat label="Classes" value={detail.classrooms.length} />
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </div>
      <div className="mt-0.5 text-xl font-semibold text-slate-900">{value}</div>
    </div>
  );
}

// ─── Login (username-only) ───────────────────────────────────────────────

function LoginCard({
  onLoggedIn,
}: {
  onLoggedIn: (lookup: StudentLookup) => void | Promise<void>;
}) {
  const [username, setUsername] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const res = await studentLookup(username.trim());
    setSubmitting(false);
    if (!res.success) {
      setError(
        res.error.code === "NOT_FOUND"
          ? "No student with that username. Ask your school to check your account."
          : res.error.message,
      );
      return;
    }
    await onLoggedIn(res.data);
  }

  return (
    <Card className="overflow-hidden w-full bg-white border border-slate-200 shadow-soft">
      <div className="relative h-64 overflow-hidden">
        <img
          src="https://images.unsplash.com/photo-1523050854058-8df90110c9f1?auto=format&fit=crop&w=1200&q=80"
          alt="Studying student"
          className="h-full w-full object-cover"
          loading="eager"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/90 via-slate-900/10 to-transparent" />
        <div className="absolute bottom-5 left-5 text-white">
          <p className="text-xs uppercase tracking-[0.35em] text-slate-200">
            Student login
          </p>
          <p className="mt-2 text-xl font-semibold tracking-tight">
            Fast access to your assignments and quizzes.
          </p>
        </div>
      </div>

      <div className="p-6 md:p-8">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-slate-900">
            Enter your username
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            This is the username your school issued when you enrolled at the
            admissions kiosk.
          </p>
        </div>
        <form onSubmit={onSubmit} className="grid gap-4">
          <FieldWrapper label="Username">
            <Input
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. student_arjun_kumar_1234"
              required
              minLength={1}
              maxLength={120}
            />
          </FieldWrapper>
          {error ? <Banner kind="error" message={error} /> : null}
          <div className="flex justify-end">
            <Button type="submit" disabled={submitting}>
              {submitting ? "Loading…" : "Continue"}
            </Button>
          </div>
        </form>
      </div>
    </Card>
  );
}

function NewStudentCard() {
  return (
    <Card className="bg-white border border-slate-200 shadow-soft">
      <div className="p-6 md:p-8">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-slate-900">
            New student access
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Use the kiosk to register and receive your username.
          </p>
        </div>
      </div>
      <div className="space-y-4 px-6 text-sm text-slate-600">
        <p>
          New students should complete the admissions kiosk so the school can
          assign a username and enroll you in classes.
        </p>
        <p>
          After kiosk registration, come back here and use Existing student to
          sign in.
        </p>
      </div>
      <div className="mt-6 flex justify-end">
        <Link
          to="/kiosk"
          className="inline-flex rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 transition-colors"
        >
          Go to kiosk
        </Link>
      </div>
    </Card>
  );
}

// ─── Quiz list ───────────────────────────────────────────────────────────

function QuizzesList({
  lookup,
  quizzes,
  onTake,
  onSignOut,
}: {
  lookup: StudentLookup;
  quizzes: StudentQuiz[];
  onTake: (quizId: string) => void;
  onSignOut: () => void;
}) {
  return (
    <Card>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-900">Your quizzes</h2>
        <Button variant="secondary" onClick={onSignOut}>
          Sign out
        </Button>
      </div>
      {lookup.classrooms.length === 0 ? (
        <Banner
          kind="info"
          message="You aren't enrolled in any classes yet. Ask your school to set up classes in their teacher dashboard."
        />
      ) : quizzes.length === 0 ? (
        <Banner
          kind="info"
          message="No quizzes posted yet. Your teachers will publish quizzes here."
        />
      ) : (
        <ul className="grid gap-2">
          {quizzes.map((q) => (
            <li
              key={q.quiz.id}
              className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-slate-900">
                    {q.quiz.title}
                  </div>
                  <div className="text-xs text-slate-500">
                    {q.quiz.subject} · {q.classroomGrade} · {q.teacherName}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <Pill tone="slate">{q.quiz.difficulty}</Pill>
                    <Pill tone="slate">
                      {q.quiz.questionCount} Q · {q.quiz.maxScore} pts
                    </Pill>
                    {q.quiz.timeLimitMinutes ? (
                      <Pill tone="slate">{q.quiz.timeLimitMinutes} min</Pill>
                    ) : null}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {q.submission ? (
                    <div className="text-right text-xs text-slate-600">
                      <Pill tone="emerald">
                        scored {q.submission.score}/{q.submission.maxScore}
                      </Pill>
                      {q.submission.reportUrl ? (
                        <div className="mt-1">
                          <a
                            href={q.submission.reportUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="underline hover:text-slate-900"
                          >
                            View report
                          </a>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <Button onClick={() => onTake(q.quiz.id)}>Take quiz</Button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ─── Taking a quiz ───────────────────────────────────────────────────────

function TakingQuiz({
  lookup: _lookup,
  taking,
  answers,
  onAnswer,
  onCancel,
  onSubmit,
}: {
  lookup: StudentLookup;
  taking: QuizForTaking;
  answers: Record<string, string>;
  onAnswer: (questionId: string, value: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const answered = useMemo(
    () =>
      taking.questions.filter((q) => (answers[q.id] ?? "").trim().length > 0)
        .length,
    [taking.questions, answers],
  );
  const total = taking.questions.length;
  const canSubmit = answered === total;

  return (
    <Card>
      <CardHeader
        title={taking.quiz.title}
        subtitle={`${taking.quiz.subject} · ${taking.classroomGrade} · ${taking.teacherName} · ${taking.quiz.difficulty}`}
      />
      {taking.quiz.instructions ? (
        <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
          <span className="font-semibold">Teacher note:</span>{" "}
          {taking.quiz.instructions}
        </div>
      ) : null}

      <ol className="grid gap-5">
        {taking.questions.map((q, i) => (
          <li key={q.id}>
            <div className="mb-2 flex items-start justify-between gap-2">
              <div>
                <div className="text-xs font-semibold tracking-widest text-slate-500">
                  Q{i + 1} · {q.points} pt{q.points === 1 ? "" : "s"}
                </div>
                <p className="mt-0.5 text-sm font-medium text-slate-900">
                  {q.question}
                </p>
              </div>
            </div>

            {q.answerType === "mcq" && q.options ? (
              <Select
                value={answers[q.id] ?? ""}
                onChange={(e) => onAnswer(q.id, e.target.value)}
              >
                <option value="">Choose an option…</option>
                {q.options.map((opt, j) => (
                  <option key={j} value={opt}>
                    {opt}
                  </option>
                ))}
              </Select>
            ) : q.answerType === "number" ? (
              <Input
                type="number"
                value={answers[q.id] ?? ""}
                onChange={(e) => onAnswer(q.id, e.target.value)}
                placeholder="Enter a number"
              />
            ) : (
              <Textarea
                value={answers[q.id] ?? ""}
                onChange={(e) => onAnswer(q.id, e.target.value)}
                placeholder="Your answer…"
                rows={2}
              />
            )}
          </li>
        ))}
      </ol>

      <div className="mt-6 flex items-center justify-between gap-3">
        <div className="text-xs text-slate-500">
          {answered}/{total} answered
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" onClick={onSubmit} disabled={!canSubmit}>
            Submit
          </Button>
        </div>
      </div>
    </Card>
  );
}

// ─── Result ──────────────────────────────────────────────────────────────

function QuizResult({
  taking,
  result,
  onBack,
}: {
  taking: QuizForTaking;
  result: SubmitQuizResult;
  onBack: () => void;
}) {
  return (
    <Card className="border-emerald-200 bg-emerald-50/40">
      <div className="mb-4">
        <div className="text-xs font-semibold tracking-widest text-emerald-700">
          QUIZ SUBMITTED
        </div>
        <h2 className="mt-1 text-2xl font-semibold text-slate-900">
          {taking.quiz.title}
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          {taking.quiz.subject} · {taking.classroomGrade}
        </p>
      </div>

      <div className="mb-4 rounded-xl border border-slate-200 bg-white px-4 py-4 text-center">
        <div className="text-4xl font-bold text-slate-900">
          {result.score} / {result.maxScore}
        </div>
        <div className="text-sm text-slate-600">
          {result.percentage.toFixed(1)}%
        </div>
      </div>

      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-3">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Points per question
        </div>
        <PerQuestionBar
          scored={result.analysis.scoredQuestions}
          questions={taking.questions.map((q) => ({
            id: q.id,
            points: q.points,
          }))}
        />
      </div>

      <Section title="Summary" lines={[result.analysis.summary]} />
      <Section title="Strengths" lines={result.analysis.strengths} />
      <Section title="Areas to grow" lines={result.analysis.growthAreas} />
      <Section
        title="Next steps we recommend"
        lines={result.analysis.recommendedActions}
      />

      <div className="mt-4 grid gap-2 text-xs text-slate-600">
        {result.reportUrl ? (
          <div>
            📄 Full PDF report:{" "}
            <a
              href={result.reportUrl}
              target="_blank"
              rel="noreferrer"
              className="underline hover:text-slate-900"
            >
              {result.reportUrl}
            </a>
          </div>
        ) : (
          <div className="text-slate-500">
            Report PDF wasn't uploaded. Your score was still saved.
          </div>
        )}
        <div>
          WhatsApp: {result.whatsappSent} sent · {result.whatsappFailed} failed
        </div>
      </div>

      <div className="mt-5 flex justify-end">
        <Button onClick={onBack}>Back to quizzes</Button>
      </div>
    </Card>
  );
}

function Section({ title, lines }: { title: string; lines: string[] }) {
  if (lines.length === 0) return null;
  return (
    <div className="mb-3">
      <div className="text-xs font-semibold tracking-widest text-slate-500">
        {title.toUpperCase()}
      </div>
      <ul className="mt-1 list-disc pl-5 text-sm text-slate-800">
        {lines.map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ul>
    </div>
  );
}
