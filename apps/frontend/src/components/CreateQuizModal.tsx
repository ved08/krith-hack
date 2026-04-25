import { useState, type FormEvent } from "react";
import {
  createTeacherQuiz,
  type CreateQuizResult,
  type QuizDifficulty,
} from "../lib/api.js";
import { Banner } from "./Banner.js";
import { Button } from "./Button.js";
import { FieldWrapper, Input, Select, Textarea } from "./Field.js";

/**
 * Teacher-side quiz creation. The backend runs Gemini to generate the
 * questions — the form just captures the metadata that steers the prompt.
 */
export function CreateQuizModal({
  token,
  classroomId,
  classroomLabel,
  onClose,
  onCreated,
}: {
  token: string;
  classroomId: number;
  classroomLabel: string;
  onClose: () => void;
  onCreated: (result: CreateQuizResult) => void;
}) {
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [difficulty, setDifficulty] = useState<QuizDifficulty>("medium");
  const [questionCount, setQuestionCount] = useState("8");
  const [timeLimit, setTimeLimit] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [instructions, setInstructions] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const qc = Number.parseInt(questionCount, 10);
    if (!Number.isFinite(qc) || qc < 3 || qc > 20) {
      setError("Question count must be between 3 and 20.");
      return;
    }
    setSubmitting(true);
    const res = await createTeacherQuiz(token, {
      classroomId,
      title: title.trim(),
      topic: topic.trim(),
      difficulty,
      questionCount: qc,
      timeLimitMinutes: timeLimit.trim() ? Number.parseInt(timeLimit, 10) : null,
      instructions: instructions.trim() || null,
      dueDate: dueDate.trim() || undefined,
    });
    setSubmitting(false);
    if (!res.success) {
      setError(
        res.error.code === "LLM_ERROR"
          ? `Gemini couldn't generate the quiz: ${res.error.message}`
          : res.error.message,
      );
      return;
    }
    onCreated(res.data);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 py-10">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl">
        <header className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Create a quiz</h2>
            <p className="mt-1 text-sm text-slate-600">
              {classroomLabel} — Gemini will generate the questions once you hit
              "Generate".
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
          <div className="grid gap-4 sm:grid-cols-2">
            <FieldWrapper label="Title">
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Unit 3 Quiz"
                required
                minLength={1}
                maxLength={120}
              />
            </FieldWrapper>
            <FieldWrapper
              label="Topic"
              hint="What the quiz covers (e.g. Fractions and decimals)"
            >
              <Input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Fractions and decimals"
                required
                minLength={2}
                maxLength={200}
              />
            </FieldWrapper>
            <FieldWrapper label="Difficulty">
              <Select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as QuizDifficulty)}
              >
                <option value="easy">easy</option>
                <option value="medium">medium</option>
                <option value="hard">hard</option>
              </Select>
            </FieldWrapper>
            <FieldWrapper label="Number of questions" hint="3–20">
              <Input
                type="number"
                min={3}
                max={20}
                value={questionCount}
                onChange={(e) => setQuestionCount(e.target.value)}
                required
              />
            </FieldWrapper>
            <FieldWrapper
              label="Time limit (minutes)"
              hint="Leave blank for no limit"
            >
              <Input
                type="number"
                min={1}
                max={240}
                value={timeLimit}
                onChange={(e) => setTimeLimit(e.target.value)}
              />
            </FieldWrapper>
            <FieldWrapper label="Due date" hint="When should students finish by?">
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </FieldWrapper>
          </div>

          <FieldWrapper
            label="Instructions (optional)"
            hint="Special directions for Gemini — e.g. 'focus on word problems' or 'no calculator'"
          >
            <Textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              maxLength={600}
              rows={3}
            />
          </FieldWrapper>

          {error ? <Banner kind="error" message={error} /> : null}

          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Generating…" : "Generate & publish"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
