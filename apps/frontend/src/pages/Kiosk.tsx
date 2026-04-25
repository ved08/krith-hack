import { useEffect, useMemo, useReducer, useState } from "react";
import { Link } from "react-router-dom";
import { Banner } from "../components/Banner.js";
import { Button } from "../components/Button.js";
import { Card, CardHeader } from "../components/Card.js";
import { FieldWrapper, Input, Select, Textarea } from "../components/Field.js";
import { Pill } from "../components/Pill.js";
import {
  analyzeAdmissionsResponses,
  generateAdmissionsQuestions,
  listGradesForSchool,
  listSchools,
  submitAdmissionsIntake,
  type GradeOption,
  type SchoolOption,
} from "../lib/api.js";
import { isValidE164 } from "../lib/validation.js";
import type {
  AdmissionProfile,
  AdmissionQuestion,
  AdmissionsEvaluation,
  AdmissionsQuestionSet,
  CandidateResponse,
  IntakeResponseData,
  SkillBreakdown,
} from "../types/api.js";

// ─── Reducer ──────────────────────────────────────────────────────────────

type Step = "intake" | "questions" | "analyzing" | "certificate";

type State = {
  step: Step;
  form: {
    schoolId: string;
    grade: string;
    studentName: string;
    parentName: string;
    parentPhoneE164: string;
    studentPhoneE164: string;
    currentClass: string;
    schoolName: string;
    preferredLanguage: string;
    questionCount: string;
  };
  submitting: boolean;
  intakeError: string | null;
  intake: IntakeResponseData | null;
  questionSet: AdmissionsQuestionSet | null;
  questionSetError: string | null;
  answers: Record<string, string>; // questionId → answer
  evaluation: AdmissionsEvaluation | null;
  analyzeError: string | null;
};

const INITIAL: State = {
  step: "intake",
  form: {
    schoolId: "",
    grade: "",
    studentName: "",
    parentName: "",
    parentPhoneE164: "+91",
    studentPhoneE164: "+91",
    currentClass: "Class 6",
    schoolName: "Springfield Public School",
    preferredLanguage: "English",
    // Question count is fixed server-side (defaults to 8). We don't show
    // this to students — giving them control invites "regenerate until
    // I get easy questions" behaviour.
    questionCount: "",
  },
  submitting: false,
  intakeError: null,
  intake: null,
  questionSet: null,
  questionSetError: null,
  answers: {},
  evaluation: null,
  analyzeError: null,
};

type Action =
  | { type: "UPDATE_FIELD"; key: keyof State["form"]; value: string }
  | { type: "SUBMIT_START" }
  | { type: "INTAKE_DONE"; payload: IntakeResponseData }
  | { type: "INTAKE_ERROR"; message: string }
  | { type: "REGEN_QUESTIONS_DONE"; payload: AdmissionsQuestionSet }
  | { type: "REGEN_QUESTIONS_ERROR"; message: string }
  | { type: "UPDATE_ANSWER"; questionId: string; value: string }
  | { type: "ANALYZE_START" }
  | { type: "ANALYZE_DONE"; payload: AdmissionsEvaluation }
  | { type: "ANALYZE_ERROR"; message: string }
  | { type: "RESET" };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "UPDATE_FIELD":
      return { ...state, form: { ...state.form, [action.key]: action.value } };
    case "SUBMIT_START":
      return { ...state, submitting: true, intakeError: null };
    case "INTAKE_DONE": {
      const hasQuestions = !!action.payload.questionSet;
      return {
        ...state,
        submitting: false,
        intake: action.payload,
        questionSet: action.payload.questionSet,
        questionSetError: action.payload.questionSetError?.message ?? null,
        step: hasQuestions ? "questions" : "questions", // same step, UI will show retry
      };
    }
    case "INTAKE_ERROR":
      return { ...state, submitting: false, intakeError: action.message };
    case "REGEN_QUESTIONS_DONE":
      return {
        ...state,
        submitting: false,
        questionSet: action.payload,
        questionSetError: null,
      };
    case "REGEN_QUESTIONS_ERROR":
      return { ...state, submitting: false, questionSetError: action.message };
    case "UPDATE_ANSWER":
      return {
        ...state,
        answers: { ...state.answers, [action.questionId]: action.value },
      };
    case "ANALYZE_START":
      return { ...state, step: "analyzing", submitting: true, analyzeError: null };
    case "ANALYZE_DONE":
      return {
        ...state,
        submitting: false,
        evaluation: action.payload,
        step: "certificate",
      };
    case "ANALYZE_ERROR":
      return {
        ...state,
        submitting: false,
        analyzeError: action.message,
        step: "questions",
      };
    case "RESET":
      return INITIAL;
    default:
      return state;
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────

export function KioskPage() {
  const [state, dispatch] = useReducer(reducer, INITIAL);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Header step={state.step} />

      {state.step === "intake" ? (
        <IntakeStep state={state} dispatch={dispatch} />
      ) : state.step === "questions" ? (
        <QuestionsStep state={state} dispatch={dispatch} />
      ) : state.step === "analyzing" ? (
        <AnalyzingStep />
      ) : state.evaluation ? (
        <CertificateStep evaluation={state.evaluation} onReset={() => dispatch({ type: "RESET" })} />
      ) : null}
    </div>
  );
}

// ─── Step 0: Header / progress ────────────────────────────────────────────

function Header({ step }: { step: Step }) {
  const steps: Array<{ id: Step; label: string }> = [
    { id: "intake", label: "Intake" },
    { id: "questions", label: "Questions" },
    { id: "analyzing", label: "Analyze" },
    { id: "certificate", label: "Certificate" },
  ];
  const idx = steps.findIndex((s) => s.id === step);
  return (
    <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
      <div>
        <Link to="/" className="text-xs font-semibold tracking-widest text-slate-500 hover:text-slate-700">
          ← HOME
        </Link>
        <h1 className="mt-2 text-3xl font-semibold text-slate-900">
          Admissions Kiosk — Phase 2
        </h1>
      </div>
      <ol className="flex items-center gap-2">
        {steps.map((s, i) => {
          const active = i === idx;
          const done = i < idx;
          return (
            <li
              key={s.id}
              className={`flex items-center gap-2 text-xs font-medium ${
                active ? "text-slate-900" : done ? "text-emerald-700" : "text-slate-400"
              }`}
            >
              <span
                className={`grid h-6 w-6 place-items-center rounded-full text-[11px] ${
                  active
                    ? "bg-slate-900 text-white"
                    : done
                    ? "bg-emerald-600 text-white"
                    : "bg-slate-100 text-slate-500"
                }`}
              >
                {done ? "✓" : i + 1}
              </span>
              {s.label}
              {i < steps.length - 1 ? <span className="text-slate-300">›</span> : null}
            </li>
          );
        })}
      </ol>
    </header>
  );
}

// ─── Step 1: Intake ───────────────────────────────────────────────────────

function IntakeStep({
  state,
  dispatch,
}: {
  state: State;
  dispatch: React.Dispatch<Action>;
}) {
  const errors = useMemo(() => validateForm(state.form), [state.form]);

  // Lookup data: schools load on mount; grades re-load whenever the
  // selected school changes. A "grade" is a distinct value of
  // `classrooms.name` in that school — picking it auto-enrolls the
  // student in every subject classroom under that grade.
  const [schools, setSchools] = useState<SchoolOption[] | null>(null);
  const [schoolsError, setSchoolsError] = useState<string | null>(null);
  const [grades, setGrades] = useState<GradeOption[] | null>(null);
  const [gradesLoading, setGradesLoading] = useState(false);
  const [gradesError, setGradesError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listSchools().then((r) => {
      if (cancelled) return;
      if (!r.success) {
        setSchoolsError(r.error.message);
        return;
      }
      setSchools(r.data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const id = Number.parseInt(state.form.schoolId, 10);
    if (!Number.isFinite(id) || id <= 0) {
      setGrades(null);
      return;
    }
    let cancelled = false;
    setGradesLoading(true);
    setGradesError(null);
    listGradesForSchool(id).then((r) => {
      if (cancelled) return;
      setGradesLoading(false);
      if (!r.success) {
        setGradesError(r.error.message);
        setGrades([]);
        return;
      }
      setGrades(r.data);
      // If the previously-picked grade isn't in this school's list,
      // clear it so the user must pick again.
      const stillValid = r.data.some((g) => g.grade === state.form.grade);
      if (!stillValid) {
        dispatch({ type: "UPDATE_FIELD", key: "grade", value: "" });
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.form.schoolId]);

  const selectedGrade = useMemo(
    () => grades?.find((g) => g.grade === state.form.grade) ?? null,
    [grades, state.form.grade],
  );

  const canSubmit = Object.keys(errors).length === 0 && !state.submitting;

  async function onSubmit() {
    const body = buildIntakeBody(state.form);
    dispatch({ type: "SUBMIT_START" });
    const res = await submitAdmissionsIntake(body);
    if (!res.success) {
      dispatch({ type: "INTAKE_ERROR", message: `${res.error.code}: ${res.error.message}` });
      return;
    }
    dispatch({ type: "INTAKE_DONE", payload: res.data });
  }

  return (
    <Card>
      <CardHeader
        title="Student + parent intake"
        subtitle="We create the user records, link parent to student, enroll in classroom, and generate a baseline question set."
      />

      {state.intakeError ? (
        <div className="mb-4">
          <Banner kind="error" title="Intake failed" message={state.intakeError} />
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <FieldWrapper
          label="School"
          hint={schoolsError ? `Could not load schools: ${schoolsError}` : "Pick from existing schools"}
          error={errors.schoolId}
        >
          <Select
            value={state.form.schoolId}
            onChange={(e) =>
              dispatch({ type: "UPDATE_FIELD", key: "schoolId", value: e.target.value })
            }
            invalid={!!errors.schoolId}
            disabled={!schools}
          >
            <option value="">{schools ? "Select a school…" : "Loading schools…"}</option>
            {schools?.map((s) => (
              <option key={s.id} value={String(s.id)}>
                {s.name} (#{s.id})
              </option>
            ))}
          </Select>
        </FieldWrapper>
        <FieldWrapper
          label="Grade"
          hint={
            gradesError
              ? `Could not load grades: ${gradesError}`
              : !state.form.schoolId
              ? "Pick a school first"
              : selectedGrade
              ? `Will enroll in ${selectedGrade.classroomCount} classes (${selectedGrade.subjects.join(", ")})`
              : "Pick the student's grade"
          }
          error={errors.grade}
        >
          <Select
            value={state.form.grade}
            onChange={(e) =>
              dispatch({ type: "UPDATE_FIELD", key: "grade", value: e.target.value })
            }
            invalid={!!errors.grade}
            disabled={!state.form.schoolId || gradesLoading || !grades}
          >
            <option value="">
              {!state.form.schoolId
                ? "Select a school first"
                : gradesLoading
                ? "Loading grades…"
                : grades && grades.length === 0
                ? "No grades configured for this school yet"
                : "Select a grade…"}
            </option>
            {grades?.map((g) => (
              <option key={g.grade} value={g.grade}>
                {g.grade} — {g.classroomCount} class{g.classroomCount === 1 ? "" : "es"}
              </option>
            ))}
          </Select>
        </FieldWrapper>
        <FieldWrapper label="Student name" error={errors.studentName}>
          <Input
            value={state.form.studentName}
            placeholder="Aarav Kumar"
            onChange={(e) => dispatch({ type: "UPDATE_FIELD", key: "studentName", value: e.target.value })}
            invalid={!!errors.studentName}
          />
        </FieldWrapper>
        <FieldWrapper label="Parent name" error={errors.parentName}>
          <Input
            value={state.form.parentName}
            placeholder="Neha Kumar"
            onChange={(e) => dispatch({ type: "UPDATE_FIELD", key: "parentName", value: e.target.value })}
            invalid={!!errors.parentName}
          />
        </FieldWrapper>
        <FieldWrapper
          label="Parent phone (E.164)"
          hint="+country + digits, e.g. +919876543210"
          error={errors.parentPhoneE164}
        >
          <Input
            value={state.form.parentPhoneE164}
            onChange={(e) => dispatch({ type: "UPDATE_FIELD", key: "parentPhoneE164", value: e.target.value })}
            invalid={!!errors.parentPhoneE164}
            inputMode="tel"
            autoComplete="tel"
          />
        </FieldWrapper>
        <FieldWrapper
          label="Student phone (E.164)"
          hint="Required for kiosk intake"
          error={errors.studentPhoneE164}
        >
          <Input
            value={state.form.studentPhoneE164}
            onChange={(e) => dispatch({ type: "UPDATE_FIELD", key: "studentPhoneE164", value: e.target.value })}
            invalid={!!errors.studentPhoneE164}
            inputMode="tel"
          />
        </FieldWrapper>
        <FieldWrapper label="Current class" error={errors.currentClass}>
          <Input
            value={state.form.currentClass}
            onChange={(e) => dispatch({ type: "UPDATE_FIELD", key: "currentClass", value: e.target.value })}
            invalid={!!errors.currentClass}
          />
        </FieldWrapper>
        <FieldWrapper label="School name (optional)">
          <Input
            value={state.form.schoolName}
            onChange={(e) => dispatch({ type: "UPDATE_FIELD", key: "schoolName", value: e.target.value })}
          />
        </FieldWrapper>
        <FieldWrapper label="Preferred language (optional)">
          <Input
            value={state.form.preferredLanguage}
            onChange={(e) => dispatch({ type: "UPDATE_FIELD", key: "preferredLanguage", value: e.target.value })}
          />
        </FieldWrapper>
      </div>

      <div className="mt-6 flex items-center justify-end gap-3">
        <Button onClick={onSubmit} loading={state.submitting} disabled={!canSubmit}>
          Save intake & generate questions
        </Button>
      </div>
    </Card>
  );
}

// ─── Step 2: Questions ────────────────────────────────────────────────────

function QuestionsStep({
  state,
  dispatch,
}: {
  state: State;
  dispatch: React.Dispatch<Action>;
}) {
  const intake = state.intake?.intake;
  const qs = state.questionSet;

  async function regenerate() {
    if (!intake) return;
    dispatch({ type: "SUBMIT_START" });
    const profile = buildProfile(state.form);
    const res = await generateAdmissionsQuestions({
      profile,
      questionCount: Number(state.form.questionCount) || undefined,
      schoolId: intake.schoolId,
      studentId: intake.studentUserId,
    });
    if (!res.success) {
      dispatch({
        type: "REGEN_QUESTIONS_ERROR",
        message: `${res.error.code}: ${res.error.message}`,
      });
      return;
    }
    dispatch({ type: "REGEN_QUESTIONS_DONE", payload: res.data });
  }

  async function analyze(overrideAnswers?: Record<string, string>) {
    if (!qs || !intake) return;
    const answers = overrideAnswers ?? state.answers;
    const responses: CandidateResponse[] = qs.questions.map((q) => ({
      questionId: q.id,
      question: q.question,
      competency: q.competency,
      answer: (answers[q.id] ?? "").trim(),
    }));
    if (responses.some((r) => r.answer.length === 0)) {
      dispatch({
        type: "ANALYZE_ERROR",
        message: "Please answer every question before submitting.",
      });
      return;
    }
    dispatch({ type: "ANALYZE_START" });
    const profile = buildProfile(state.form);
    const res = await analyzeAdmissionsResponses({
      profile,
      responses,
      schoolId: intake.schoolId,
      studentId: intake.studentUserId,
      questionSetId: qs.questionSetId,
    });
    if (!res.success) {
      dispatch({
        type: "ANALYZE_ERROR",
        message: `${res.error.code}: ${res.error.message}`,
      });
      return;
    }
    dispatch({ type: "ANALYZE_DONE", payload: res.data });
  }

  // Demo shortcut: fill every question with a plausible, non-empty
  // response so the kiosk flow can be driven end-to-end (intake →
  // analysis → PDF → WhatsApp) without 8 manual answers. Gemini still
  // does the analysis against whatever we submit, so the resulting
  // report is realistic-looking for the demo.
  async function simulateAndSubmit() {
    if (!qs || !intake) return;
    const simulated: Record<string, string> = {};
    for (const q of qs.questions) {
      if (q.answerType === "number") {
        simulated[q.id] = "5";
      } else if (q.answerType === "mcq") {
        // Admissions questions don't ship options; the student just
        // writes the letter/label they believe is right. A plausible
        // demo answer is an attempt phrased like a student.
        simulated[q.id] = `I would pick the first option. ${q.rubricHint}`;
      } else {
        simulated[q.id] = `Sample answer demonstrating familiarity with ${q.competency}. ${q.rubricHint}`;
      }
    }
    // Reflect the simulated answers in the UI so the teacher can see
    // what was submitted before we flip to the analyzing step.
    for (const [id, val] of Object.entries(simulated)) {
      dispatch({ type: "UPDATE_ANSWER", questionId: id, value: val });
    }
    await analyze(simulated);
  }

  if (!intake) {
    return (
      <Card>
        <Banner kind="error" message="Intake state missing — please restart." />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <IntakeSummary data={intake} renamed={intake.renamed} />

      {state.questionSetError ? (
        <Banner
          kind="warn"
          title="Intake saved, but questions failed to generate"
          message={state.questionSetError}
          action={
            <Button variant="secondary" onClick={regenerate} loading={state.submitting}>
              Retry questions
            </Button>
          }
        />
      ) : null}

      {state.analyzeError ? (
        <Banner kind="error" title="Analysis failed" message={state.analyzeError} />
      ) : null}

      {!qs ? (
        <Card>
          <CardHeader
            title="Questions not generated yet"
            subtitle="The intake is saved. Retry question generation to continue."
          />
          <Button onClick={regenerate} loading={state.submitting}>
            Generate questions
          </Button>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader
              title="Baseline questions"
              subtitle={qs.rationale}
            />
            <div className="mb-4 flex flex-wrap gap-1.5">
              <Pill tone="slate">grade band: {qs.gradeBand}</Pill>
              <Pill tone="slate">model: {qs.model}</Pill>
              <Pill tone="slate">set id: {qs.questionSetId.slice(0, 8)}…</Pill>
            </div>
          </Card>

          {qs.questions.map((q, idx) => (
            <QuestionCard
              key={q.id}
              question={q}
              index={idx}
              value={state.answers[q.id] ?? ""}
              onChange={(v) => dispatch({ type: "UPDATE_ANSWER", questionId: q.id, value: v })}
            />
          ))}

          <div className="flex items-center justify-between gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={simulateAndSubmit}
              loading={state.submitting}
              title="Auto-fill every question with a sample answer and submit — for demos"
            >
              🎲 Simulate test
            </Button>
            <Button onClick={() => analyze()} loading={state.submitting}>
              Submit for Learning DNA
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function QuestionCard({
  question,
  index,
  value,
  onChange,
}: {
  question: AdmissionQuestion;
  index: number;
  value: string;
  onChange: (v: string) => void;
}) {
  const competencyTone = {
    numeracy: "blue",
    reasoning: "violet",
    language: "emerald",
    observation: "amber",
    "learning-readiness": "slate",
  } as const;
  const difficultyTone = {
    easy: "emerald",
    medium: "amber",
    hard: "red",
  } as const;
  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-xs font-semibold tracking-widest text-slate-400">
            Q{index + 1} · {question.id}
          </div>
          <p className="mt-1 text-base font-medium text-slate-900">{question.question}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Pill tone={competencyTone[question.competency]}>{question.competency}</Pill>
          <Pill tone={difficultyTone[question.difficulty]}>{question.difficulty}</Pill>
        </div>
      </div>
      {question.answerType === "number" ? (
        <Input
          type="number"
          placeholder="Your answer"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <Textarea
          placeholder="Your answer"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
        />
      )}
    </Card>
  );
}

function IntakeSummary({
  data,
  renamed,
}: {
  data: NonNullable<IntakeResponseData["intake"]>;
  renamed: IntakeResponseData["intake"]["renamed"];
}) {
  return (
    <Card className="border-emerald-200 bg-emerald-50/40">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold tracking-widest text-emerald-700">
            INTAKE SAVED
          </div>
          <h3 className="mt-1 text-lg font-semibold text-slate-900">
            {data.schoolName} · {data.grade}
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            Parent user #{data.parentUserId}
            {data.parentCreated ? " (new)" : ""} · Student user #{data.studentUserId}
            {data.studentCreated ? " (new)" : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {data.parentStudentLinkCreated ? (
            <Pill tone="emerald">link created</Pill>
          ) : (
            <Pill tone="slate">link existed</Pill>
          )}
          {data.classroomEnrollmentsCreated > 0 ? (
            <Pill tone="emerald">
              enrolled in {data.classroomEnrollmentsCreated} class
              {data.classroomEnrollmentsCreated === 1 ? "" : "es"}
            </Pill>
          ) : (
            <Pill tone="slate">already enrolled</Pill>
          )}
        </div>
      </div>
      {renamed.length > 0 ? (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {renamed.map((r) => (
            <div key={`${r.role}-${r.userId}`}>
              Renamed <strong>{r.role}</strong> from “{r.from}” to “{r.to}”.
            </div>
          ))}
        </div>
      ) : null}
    </Card>
  );
}

// ─── Step 3: Analyzing spinner ────────────────────────────────────────────

function AnalyzingStep() {
  return (
    <Card className="text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slate-900 text-white">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      </div>
      <h2 className="text-lg font-semibold text-slate-900">Analyzing responses…</h2>
      <p className="mt-1 text-sm text-slate-500">
        Running Learning DNA analysis. This usually takes 3–8 seconds.
      </p>
    </Card>
  );
}

// ─── Step 4: Certificate ──────────────────────────────────────────────────

function CertificateStep({
  evaluation,
  onReset,
}: {
  evaluation: AdmissionsEvaluation;
  onReset: () => void;
}) {
  const { analysis, profile } = evaluation;
  const bandTone =
    analysis.readinessBand === "Advanced"
      ? "violet"
      : analysis.readinessBand === "Proficient"
      ? "emerald"
      : analysis.readinessBand === "Developing"
      ? "amber"
      : "red";

  return (
    <div className="space-y-4">
      <Card className="bg-gradient-to-br from-slate-900 to-slate-700 text-white">
        <div className="text-xs font-semibold tracking-widest text-slate-300">
          LEARNING DNA — {profile.studentName}
        </div>
        <h2 className="mt-2 text-3xl font-semibold">{analysis.certificateHeadline}</h2>
        <div className="mt-5 grid grid-cols-3 gap-4">
          <Stat label="Overall" value={`${analysis.overallScore}`} suffix="/100" />
          <Stat label="Readiness" value={analysis.readinessBand} />
          <Stat label="Confidence" value={`${analysis.confidence}`} suffix="%" />
        </div>
      </Card>

      <DeliveryCard evaluation={evaluation} />


      <Card>
        <CardHeader title="Summary" />
        <p className="text-slate-700">{analysis.summary}</p>
        <div className="mt-4">
          <Pill tone={bandTone}>{analysis.readinessBand}</Pill>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <ListCard title="Strengths" items={analysis.strengths} tone="emerald" />
        <ListCard title="Growth areas" items={analysis.growthAreas} tone="amber" />
      </div>

      <Card>
        <CardHeader title="Recommended actions" />
        <ol className="list-decimal space-y-2 pl-5 text-slate-700">
          {analysis.recommendedActions.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ol>
      </Card>

      <Card>
        <CardHeader
          title="Skill breakdown"
          subtitle={`${analysis.skillBreakdown.length} competencies scored 0–100`}
        />
        <div className="space-y-3">
          {analysis.skillBreakdown.map((s) => (
            <SkillBar key={s.competency} skill={s} />
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title="Metadata" />
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm text-slate-600">
          <dt className="font-medium text-slate-800">Evaluation ID</dt>
          <dd className="font-mono text-xs">{evaluation.evaluationId}</dd>
          <dt className="font-medium text-slate-800">Evaluated at</dt>
          <dd>{new Date(evaluation.evaluatedAtIso).toLocaleString()}</dd>
          <dt className="font-medium text-slate-800">Model</dt>
          <dd>{evaluation.model}</dd>
          <dt className="font-medium text-slate-800">Responses</dt>
          <dd>{evaluation.responseCount}</dd>
        </dl>
      </Card>

      <div className="flex flex-wrap justify-end gap-3">
        <Button variant="secondary" onClick={onReset}>
          Start a new intake
        </Button>
        {evaluation.certificateUrl ? (
          <a
            href={evaluation.certificateUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button>Download PDF certificate</Button>
          </a>
        ) : (
          <Button disabled>PDF unavailable</Button>
        )}
      </div>
    </div>
  );
}

function DeliveryCard({ evaluation }: { evaluation: AdmissionsEvaluation }) {
  const { certificateUrl, whatsappDelivery, whatsappError, profile } = evaluation;

  const whatsapp = {
    sent: {
      tone: "emerald" as const,
      title: "Sent to parent on WhatsApp",
      note: `A message with the certificate link was delivered to ${profile.parentPhoneE164}.`,
    },
    dry_run: {
      tone: "slate" as const,
      title: "Dry-run — not actually sent",
      note: "Twilio credentials are not configured, so nothing was sent. Set TWILIO_* env vars to enable.",
    },
    skipped: {
      tone: "amber" as const,
      title: "WhatsApp notification skipped",
      note: certificateUrl
        ? `No parent phone on file to notify.`
        : "Certificate wasn't generated, so no notification was sent.",
    },
    error: {
      tone: "red" as const,
      title: "WhatsApp send failed",
      note: whatsappError ?? "Unknown Twilio error; check server logs.",
    },
  }[whatsappDelivery];

  return (
    <Card>
      <CardHeader title="Delivery" />
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-widest text-slate-500">
              Certificate PDF
            </div>
            {certificateUrl ? (
              <a
                href={certificateUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="break-all text-sm text-slate-800 underline underline-offset-2 hover:text-slate-900"
              >
                {certificateUrl}
              </a>
            ) : (
              <div className="text-sm text-slate-600">
                Certificate PDF wasn't uploaded. Confirm{" "}
                <code className="rounded bg-slate-100 px-1 font-mono text-xs">
                  SUPABASE_URL
                </code>{" "}
                and{" "}
                <code className="rounded bg-slate-100 px-1 font-mono text-xs">
                  SUPABASE_SERVICE_ROLE_KEY
                </code>{" "}
                are set on the backend.
              </div>
            )}
          </div>
          {certificateUrl ? (
            <Pill tone="emerald">uploaded</Pill>
          ) : (
            <Pill tone="slate">not uploaded</Pill>
          )}
        </div>

        <div className="h-px bg-slate-100" />

        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-widest text-slate-500">
              WhatsApp → parent
            </div>
            <div className="text-sm font-medium text-slate-900">{whatsapp.title}</div>
            <div className="mt-0.5 text-sm text-slate-600">{whatsapp.note}</div>
          </div>
          <Pill tone={whatsapp.tone}>{whatsappDelivery}</Pill>
        </div>
      </div>
    </Card>
  );
}

function Stat({
  label,
  value,
  suffix,
}: {
  label: string;
  value: string | number;
  suffix?: string;
}) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-widest text-slate-300">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold">
        {value}
        {suffix ? <span className="ml-1 text-sm text-slate-300">{suffix}</span> : null}
      </div>
    </div>
  );
}

function ListCard({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "emerald" | "amber";
}) {
  return (
    <Card>
      <div className="mb-2 flex items-center gap-2">
        <h3 className="font-semibold text-slate-900">{title}</h3>
        <Pill tone={tone}>{items.length}</Pill>
      </div>
      <ul className="space-y-1.5 text-sm text-slate-700">
        {items.map((it) => (
          <li key={it} className="before:mr-2 before:content-['–']">
            {it}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function SkillBar({ skill }: { skill: SkillBreakdown }) {
  const tone =
    skill.score >= 80
      ? "bg-emerald-500"
      : skill.score >= 60
      ? "bg-blue-500"
      : skill.score >= 40
      ? "bg-amber-500"
      : "bg-red-500";
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="font-medium capitalize text-slate-800">
          {skill.competency.replace("-", " ")}
        </span>
        <span className="font-mono text-xs text-slate-600">{skill.score}/100</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full ${tone}`} style={{ width: `${skill.score}%` }} />
      </div>
      <div className="mt-1 text-xs text-slate-500">{skill.evidence}</div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function validateForm(form: State["form"]): Partial<Record<keyof State["form"], string>> {
  const errors: Partial<Record<keyof State["form"], string>> = {};
  if (!form.schoolId || Number.isNaN(Number(form.schoolId)) || Number(form.schoolId) <= 0)
    errors.schoolId = "positive integer required";
  if (!form.grade.trim()) errors.grade = "pick a grade";
  if (!form.studentName.trim()) errors.studentName = "required";
  if (!form.parentName.trim()) errors.parentName = "required";
  if (!isValidE164(form.parentPhoneE164)) errors.parentPhoneE164 = "E.164 format, e.g. +919876543210";
  if (!isValidE164(form.studentPhoneE164)) errors.studentPhoneE164 = "E.164 format, e.g. +919876543211";
  if (!form.currentClass.trim()) errors.currentClass = "required";
  const qc = Number(form.questionCount);
  if (!Number.isNaN(qc) && qc && (qc < 5 || qc > 12))
    errors.questionCount = "must be between 5 and 12";
  return errors;
}

function buildProfile(form: State["form"]): AdmissionProfile {
  return {
    studentName: form.studentName.trim(),
    parentName: form.parentName.trim(),
    parentPhoneE164: form.parentPhoneE164.trim(),
    studentPhoneE164: form.studentPhoneE164.trim() || undefined,
    currentClass: form.currentClass.trim(),
    schoolName: form.schoolName.trim() || undefined,
    preferredLanguage: form.preferredLanguage.trim() || undefined,
  };
}

function buildIntakeBody(form: State["form"]) {
  const profile = buildProfile(form);
  return {
    schoolId: Number(form.schoolId),
    grade: form.grade.trim(),
    profile: {
      ...profile,
      studentPhoneE164: form.studentPhoneE164.trim(),
    },
    questionCount: Number(form.questionCount) || undefined,
    generateQuestions: true,
  };
}
