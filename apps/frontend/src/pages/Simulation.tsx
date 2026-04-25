import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Banner } from "../components/Banner.js";
import { Button } from "../components/Button.js";
import { Card } from "../components/Card.js";
import { FieldWrapper, Input, Select } from "../components/Field.js";
import { Pill } from "../components/Pill.js";
import {
  analyzeAdmissionsResponses,
  listGradesForSchool,
  listSchools,
  submitAdmissionsIntake,
  type GradeOption,
  type SchoolOption,
} from "../lib/api.js";
import type {
  AdmissionsEvaluation,
  AdmissionsQuestionSet,
  CandidateResponse,
  IntakeResponseData,
} from "../types/api.js";

/**
 * Demo simulation page — walks the full kiosk pipeline phase by phase,
 * each phase behind its own button so you can narrate it during a live
 * demo. Phases:
 *
 *   1. Load schools + grades (prove the backend is reachable).
 *   2. Intake — create student + parent, enrol across all grade classrooms,
 *      kick off Gemini question generation.
 *   3. Auto-answer every generated question with a plausible response.
 *   4. Analyze — Gemini scores, PDF uploads to Supabase, parent WhatsApps.
 *
 * Only one phase is unlocked at a time; completed phases stay on screen so
 * the audience can see what each step produced.
 */

type PhaseState =
  | { kind: "idle" }
  | { kind: "lookups"; schools: SchoolOption[]; grades: GradeOption[] }
  | {
      kind: "intake";
      schools: SchoolOption[];
      grades: GradeOption[];
      intake: IntakeResponseData;
    }
  | {
      kind: "answered";
      schools: SchoolOption[];
      grades: GradeOption[];
      intake: IntakeResponseData;
      questionSet: AdmissionsQuestionSet;
      answers: Record<string, string>;
    }
  | {
      kind: "analyzed";
      schools: SchoolOption[];
      grades: GradeOption[];
      intake: IntakeResponseData;
      questionSet: AdmissionsQuestionSet;
      answers: Record<string, string>;
      evaluation: AdmissionsEvaluation;
    };

function defaultProfile() {
  const suffix = Date.now().toString().slice(-4);
  return {
    studentName: `Demo Student ${suffix}`,
    parentName: `Demo Parent ${suffix}`,
    parentPhoneE164: "+919999900000",
    studentPhoneE164: "+919999900001",
    currentClass: "Grade 5",
    schoolId: "",
    grade: "",
  };
}

export function SimulationPage() {
  const [state, setState] = useState<PhaseState>({ kind: "idle" });
  const [form, setForm] = useState(defaultProfile);
  const [busy, setBusy] = useState<null | "p1" | "p2" | "p3" | "p4">(null);
  const [error, setError] = useState<string | null>(null);

  // Auto-pick the first school + grade once Phase 1 completes, so Phase 2
  // can run without the presenter fiddling with dropdowns mid-demo.
  useEffect(() => {
    if (state.kind !== "lookups") return;
    if (!form.schoolId && state.schools[0]) {
      setForm((f) => ({ ...f, schoolId: String(state.schools[0]!.id) }));
    }
  }, [state, form.schoolId]);

  useEffect(() => {
    if (state.kind !== "lookups") return;
    const chosen = form.schoolId ? state.grades : [];
    if (!form.grade && chosen[0]) {
      setForm((f) => ({ ...f, grade: chosen[0]!.grade }));
    }
  }, [state, form.schoolId, form.grade]);

  async function phase1Lookup() {
    setError(null);
    setBusy("p1");
    const [sRes, _] = await Promise.all([listSchools(), Promise.resolve()]);
    void _;
    if (!sRes.success) {
      setError(sRes.error.message);
      setBusy(null);
      return;
    }
    const firstSchool = sRes.data[0];
    if (!firstSchool) {
      setError("No schools seeded yet — run the teacher login flow first.");
      setBusy(null);
      return;
    }
    const gRes = await listGradesForSchool(firstSchool.id);
    setBusy(null);
    if (!gRes.success) {
      setError(gRes.error.message);
      return;
    }
    setState({ kind: "lookups", schools: sRes.data, grades: gRes.data });
    setForm((f) => ({
      ...f,
      schoolId: String(firstSchool.id),
      grade: gRes.data[0]?.grade ?? "",
    }));
  }

  async function phase2Intake() {
    if (state.kind !== "lookups") return;
    setError(null);
    setBusy("p2");
    const schoolIdNum = Number(form.schoolId);
    const res = await submitAdmissionsIntake({
      schoolId: schoolIdNum,
      grade: form.grade,
      profile: {
        studentName: form.studentName,
        parentName: form.parentName,
        parentPhoneE164: form.parentPhoneE164,
        studentPhoneE164: form.studentPhoneE164,
        currentClass: form.currentClass,
      },
      generateQuestions: true,
    });
    setBusy(null);
    if (!res.success) {
      setError(`${res.error.code}: ${res.error.message}`);
      return;
    }
    if (!res.data.questionSet) {
      setError(
        res.data.questionSetError
          ? `Intake saved, questions failed: ${res.data.questionSetError.message}`
          : "Intake saved but no questions were generated.",
      );
      return;
    }
    setState({
      kind: "intake",
      schools: state.schools,
      grades: state.grades,
      intake: res.data,
    });
  }

  function phase3AutoAnswer() {
    if (state.kind !== "intake") return;
    const qs = state.intake.questionSet;
    if (!qs) return;
    const answers: Record<string, string> = {};
    for (const q of qs.questions) {
      if (q.answerType === "number") {
        answers[q.id] = "5";
      } else if (q.answerType === "mcq") {
        answers[q.id] = `I would pick the first option. ${q.rubricHint}`;
      } else {
        answers[q.id] = `Sample answer demonstrating familiarity with ${q.competency}. ${q.rubricHint}`;
      }
    }
    setState({
      kind: "answered",
      schools: state.schools,
      grades: state.grades,
      intake: state.intake,
      questionSet: qs,
      answers,
    });
  }

  async function phase4Analyze() {
    if (state.kind !== "answered") return;
    setError(null);
    setBusy("p4");
    const responses: CandidateResponse[] = state.questionSet.questions.map((q) => ({
      questionId: q.id,
      question: q.question,
      competency: q.competency,
      answer: state.answers[q.id] ?? "",
    }));
    const res = await analyzeAdmissionsResponses({
      profile: {
        studentName: form.studentName,
        parentName: form.parentName,
        parentPhoneE164: form.parentPhoneE164,
        studentPhoneE164: form.studentPhoneE164,
        currentClass: form.currentClass,
      },
      responses,
      schoolId: state.intake.intake.schoolId,
      studentId: state.intake.intake.studentUserId,
      questionSetId: state.questionSet.questionSetId,
    });
    setBusy(null);
    if (!res.success) {
      setError(`${res.error.code}: ${res.error.message}`);
      return;
    }
    setState({
      ...state,
      kind: "analyzed",
      evaluation: res.data,
    });
  }

  function reset() {
    setState({ kind: "idle" });
    setForm(defaultProfile());
    setError(null);
  }

  const phaseReached = {
    p1: state.kind !== "idle",
    p2:
      state.kind === "intake" ||
      state.kind === "answered" ||
      state.kind === "analyzed",
    p3: state.kind === "answered" || state.kind === "analyzed",
    p4: state.kind === "analyzed",
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <span className="text-xs font-semibold tracking-widest text-slate-500">
            LIVE DEMO · SIMULATION
          </span>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
            Full admissions pipeline
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Four buttons, one per phase. Click them in order during the demo so
            the audience can follow each step — intake persistence, Gemini
            question generation, auto-fill, scoring + PDF + parent WhatsApp.
          </p>
        </div>
        <Link
          to="/"
          className="text-sm text-slate-600 underline hover:text-slate-900"
        >
          Home
        </Link>
      </header>

      <Card>
        <div className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <FieldWrapper label="Student name">
              <Input
                value={form.studentName}
                onChange={(e) =>
                  setForm({ ...form, studentName: e.target.value })
                }
              />
            </FieldWrapper>
            <FieldWrapper label="Parent name">
              <Input
                value={form.parentName}
                onChange={(e) =>
                  setForm({ ...form, parentName: e.target.value })
                }
              />
            </FieldWrapper>
            <FieldWrapper
              label="Parent phone"
              hint="E.164 — use a verified Twilio sandbox number to actually receive the WhatsApp"
            >
              <Input
                value={form.parentPhoneE164}
                onChange={(e) =>
                  setForm({ ...form, parentPhoneE164: e.target.value })
                }
              />
            </FieldWrapper>
            <FieldWrapper label="Student phone">
              <Input
                value={form.studentPhoneE164}
                onChange={(e) =>
                  setForm({ ...form, studentPhoneE164: e.target.value })
                }
              />
            </FieldWrapper>
            <FieldWrapper label="Current class">
              <Input
                value={form.currentClass}
                onChange={(e) =>
                  setForm({ ...form, currentClass: e.target.value })
                }
              />
            </FieldWrapper>
            {state.kind !== "idle" ? (
              <>
                <FieldWrapper label="School">
                  <Select
                    value={form.schoolId}
                    onChange={(e) =>
                      setForm({ ...form, schoolId: e.target.value })
                    }
                  >
                    {state.schools.map((s) => (
                      <option key={s.id} value={String(s.id)}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                </FieldWrapper>
                <FieldWrapper label="Grade">
                  <Select
                    value={form.grade}
                    onChange={(e) =>
                      setForm({ ...form, grade: e.target.value })
                    }
                  >
                    {state.grades.map((g) => (
                      <option key={g.grade} value={g.grade}>
                        {g.grade} — {g.classroomCount} class
                        {g.classroomCount === 1 ? "" : "es"}
                      </option>
                    ))}
                  </Select>
                </FieldWrapper>
              </>
            ) : null}
          </div>
        </div>
      </Card>

      <div className="my-6 grid gap-3 sm:grid-cols-4">
        <PhaseButton
          label="Phase 1 · Load"
          sub="schools + grades"
          done={phaseReached.p1}
          busy={busy === "p1"}
          disabled={phaseReached.p1}
          onClick={phase1Lookup}
        />
        <PhaseButton
          label="Phase 2 · Intake"
          sub="create student + questions"
          done={phaseReached.p2}
          busy={busy === "p2"}
          disabled={!phaseReached.p1 || phaseReached.p2}
          onClick={phase2Intake}
        />
        <PhaseButton
          label="Phase 3 · Auto-answer"
          sub="fill all responses"
          done={phaseReached.p3}
          busy={busy === "p3"}
          disabled={!phaseReached.p2 || phaseReached.p3}
          onClick={phase3AutoAnswer}
        />
        <PhaseButton
          label="Phase 4 · Analyze"
          sub="score + PDF + WhatsApp"
          done={phaseReached.p4}
          busy={busy === "p4"}
          disabled={!phaseReached.p3 || phaseReached.p4}
          onClick={phase4Analyze}
        />
      </div>

      {error ? (
        <div className="mb-4">
          <Banner kind="error" message={error} />
        </div>
      ) : null}

      {state.kind !== "idle" ? (
        <Card className="mb-4">
          <h3 className="mb-2 text-sm font-semibold text-slate-800">
            Phase 1 · schools + grades
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {state.schools.map((s) => (
              <Pill key={s.id} tone="slate">
                {s.name}
              </Pill>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {state.grades.map((g) => (
              <Pill key={g.grade} tone="blue">
                {g.grade} · {g.subjects.join(" / ")}
              </Pill>
            ))}
          </div>
        </Card>
      ) : null}

      {phaseReached.p2 && (state.kind === "intake" ||
        state.kind === "answered" ||
        state.kind === "analyzed") ? (
        <Card className="mb-4 border-emerald-200 bg-emerald-50/40">
          <h3 className="mb-2 text-sm font-semibold text-emerald-900">
            Phase 2 · intake + generated questions
          </h3>
          <div className="grid gap-1 text-xs text-slate-700">
            <div>
              Student #{state.intake.intake.studentUserId} · Parent #{state.intake.intake.parentUserId}
            </div>
            <div>
              Enrolled in {state.intake.intake.classroomEnrollmentsCreated} class
              {state.intake.intake.classroomEnrollmentsCreated === 1 ? "" : "es"} ·{" "}
              {state.intake.intake.grade}
            </div>
            {state.intake.questionSet ? (
              <div>
                Question set: {state.intake.questionSet.questions.length}{" "}
                questions · band {state.intake.questionSet.gradeBand}
              </div>
            ) : null}
          </div>
          {state.intake.questionSet ? (
            <ol className="mt-3 list-decimal space-y-1 pl-5 text-xs text-slate-700">
              {state.intake.questionSet.questions.map((q) => (
                <li key={q.id}>
                  <span className="font-medium">[{q.competency}]</span>{" "}
                  {q.question}
                </li>
              ))}
            </ol>
          ) : null}
        </Card>
      ) : null}

      {phaseReached.p3 &&
      (state.kind === "answered" || state.kind === "analyzed") ? (
        <Card className="mb-4 border-indigo-200 bg-indigo-50/40">
          <h3 className="mb-2 text-sm font-semibold text-indigo-900">
            Phase 3 · auto-filled responses
          </h3>
          <ul className="space-y-1 text-xs text-slate-700">
            {state.questionSet.questions.map((q) => (
              <li key={q.id}>
                <span className="font-semibold">{q.id}:</span>{" "}
                <span className="text-slate-500">{q.question.slice(0, 60)}</span>
                <div className="ml-4 text-slate-900">
                  → {state.answers[q.id]}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {state.kind === "analyzed" ? (
        <Card className="mb-4 border-emerald-300 bg-emerald-50">
          <h3 className="mb-3 text-sm font-semibold text-emerald-900">
            Phase 4 · Learning DNA result
          </h3>
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
            <Pill tone="emerald">
              {state.evaluation.analysis.overallScore}/100 ·{" "}
              {state.evaluation.analysis.readinessBand}
            </Pill>
            <Pill tone="slate">model: {state.evaluation.model}</Pill>
            <Pill
              tone={
                state.evaluation.whatsappDelivery === "sent"
                  ? "emerald"
                  : state.evaluation.whatsappDelivery === "dry_run"
                  ? "amber"
                  : "slate"
              }
            >
              whatsapp: {state.evaluation.whatsappDelivery}
            </Pill>
          </div>
          <p className="text-sm text-slate-800">
            {state.evaluation.analysis.summary}
          </p>
          {state.evaluation.certificateUrl ? (
            <div className="mt-3 text-xs">
              📄 Certificate:{" "}
              <a
                href={state.evaluation.certificateUrl}
                target="_blank"
                rel="noreferrer"
                className="underline hover:text-slate-900"
              >
                {state.evaluation.certificateUrl}
              </a>
            </div>
          ) : null}
        </Card>
      ) : null}

      {state.kind !== "idle" ? (
        <div className="flex justify-end">
          <Button variant="secondary" onClick={reset}>
            Reset simulation
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function PhaseButton({
  label,
  sub,
  done,
  busy,
  disabled,
  onClick,
}: {
  label: string;
  sub: string;
  done: boolean;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled || busy}
      onClick={onClick}
      className={`rounded-xl border px-4 py-3 text-left transition disabled:cursor-not-allowed ${
        done
          ? "border-emerald-300 bg-emerald-50 text-emerald-900"
          : disabled
          ? "border-slate-200 bg-slate-50 text-slate-400"
          : "border-slate-900 bg-slate-900 text-white hover:bg-slate-800"
      }`}
    >
      <div className="flex items-center gap-2 text-sm font-semibold">
        {done ? "✓" : busy ? "⟳" : "▶"} {label}
      </div>
      <div className="text-[11px] opacity-80">{sub}</div>
    </button>
  );
}
