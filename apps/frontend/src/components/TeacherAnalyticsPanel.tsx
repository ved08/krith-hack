import { useEffect, useState } from "react";
import {
  fetchTeacherOverview,
  fetchTeacherStudentDetail,
  type StudentDetail,
  type TeacherOverview,
} from "../lib/api.js";
import { Banner } from "./Banner.js";
import { Button } from "./Button.js";
import { Card } from "./Card.js";
import {
  AttendanceDonut,
  AttendanceStrip,
  AttendanceTrendChart,
  ScoreTimelineChart,
  StatTile,
  SubjectAveragesChart,
} from "./Charts.js";
import { Pill } from "./Pill.js";

/**
 * Overview panel rendered at the top of the teacher dashboard.
 * Four stat tiles + attendance trend + subject averages + recent quiz
 * submissions. Always-on (there's nothing to hide — teacher sees only
 * their own students by construction).
 */
export function TeacherAnalyticsPanel({ token }: { token: string }) {
  const [data, setData] = useState<TeacherOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openStudentId, setOpenStudentId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchTeacherOverview(token).then((r) => {
      if (cancelled) return;
      if (!r.success) {
        setError(r.error.message);
        return;
      }
      setData(r.data);
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (error) return <Banner kind="error" message={error} />;
  if (!data) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
        Loading analytics…
      </div>
    );
  }

  const attendanceSub =
    data.attendance.overallPresentPct > 0
      ? `${data.attendance.overallPresentPct}% present · ${data.attendance.overallLatePct}% late · ${data.attendance.overallAbsentPct}% absent`
      : "no attendance logged in the last 14 days";

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          label="Students"
          value={data.totals.students}
          sub={`${data.totals.classrooms} class${data.totals.classrooms === 1 ? "" : "es"}`}
        />
        <StatTile
          label="Attendance (14d)"
          value={`${data.attendance.overallPresentPct.toFixed(0)}%`}
          sub={attendanceSub}
          tone="emerald"
        />
        <StatTile
          label="Avg quiz score"
          value={`${data.avgQuizPct.toFixed(0)}%`}
          sub={`${data.totals.quizzesPublished} published · ${data.totals.quizSubmissions} submissions`}
          tone="indigo"
        />
        <StatTile
          label="Avg marks"
          value={`${data.avgAssignmentPct.toFixed(0)}%`}
          sub="across HOMEWORK / QUIZ / TEST"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-800">
              Attendance — last 14 days
            </h3>
            <Pill tone="slate">stacked by status</Pill>
          </div>
          <AttendanceTrendChart data={data.attendance.last14Days} />
        </Card>

        <Card>
          <h3 className="mb-2 text-sm font-semibold text-slate-800">
            Attendance mix
          </h3>
          <AttendanceDonut
            presentPct={data.attendance.overallPresentPct}
            latePct={data.attendance.overallLatePct}
            absentPct={data.attendance.overallAbsentPct}
          />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="mb-2 text-sm font-semibold text-slate-800">
            Subject averages
          </h3>
          <SubjectAveragesChart data={data.subjectBreakdown} />
        </Card>

        <Card>
          <h3 className="mb-2 text-sm font-semibold text-slate-800">
            Recent quiz submissions
          </h3>
          {data.recentQuizSubmissions.length === 0 ? (
            <p className="text-xs text-slate-500">
              No quiz submissions yet. Publish a quiz from a class card below.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.recentQuizSubmissions.map((r) => (
                <li
                  key={r.submissionId}
                  className="flex items-center justify-between py-2"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-slate-900">
                      {r.studentName}{" "}
                      <span className="ml-1 text-xs font-normal text-slate-500">
                        · {r.subject} · {r.quizTitle}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500">
                      {new Date(r.submittedAt).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Pill
                      tone={
                        r.percentage >= 70
                          ? "emerald"
                          : r.percentage >= 40
                          ? "amber"
                          : "red"
                      }
                    >
                      {r.score}/{r.maxScore} · {r.percentage.toFixed(0)}%
                    </Pill>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setOpenStudentId(r.studentId)}
                    >
                      View
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {openStudentId != null ? (
        <StudentDetailModal
          token={token}
          studentId={openStudentId}
          onClose={() => setOpenStudentId(null)}
        />
      ) : null}
    </div>
  );
}

// ─── Per-student drill-down modal ────────────────────────────────────────

export function StudentDetailModal({
  token,
  studentId,
  onClose,
}: {
  token: string;
  studentId: number;
  onClose: () => void;
}) {
  const [data, setData] = useState<StudentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchTeacherStudentDetail(token, studentId).then((r) => {
      if (cancelled) return;
      if (!r.success) {
        setError(r.error.message);
        return;
      }
      setData(r.data);
    });
    return () => {
      cancelled = true;
    };
  }, [token, studentId]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 py-10">
      <div className="w-full max-w-4xl rounded-2xl bg-white p-6 shadow-xl">
        <header className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">
              {data?.student.fullName ?? "Loading…"}
            </h2>
            {data ? (
              <p className="mt-1 text-sm text-slate-600">
                @{data.student.username} · {data.student.phoneNumber}
              </p>
            ) : null}
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

        {error ? (
          <Banner kind="error" message={error} />
        ) : !data ? (
          <p className="text-sm text-slate-500">Loading student analytics…</p>
        ) : (
          <StudentAnalyticsInner detail={data} />
        )}
      </div>
    </div>
  );
}

// ─── Shared inner layout used by modal + public student page ─────────────

export function StudentAnalyticsInner({ detail }: { detail: StudentDetail }) {
  const latestQuiz = detail.quizResults.at(-1);
  const latestAssignment = detail.assignmentResults.at(-1);
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          label="Attendance"
          value={`${detail.attendance.presentPct.toFixed(0)}%`}
          sub={`${detail.attendance.absentPct.toFixed(0)}% absent · ${detail.attendance.latePct.toFixed(0)}% late`}
          tone="emerald"
        />
        <StatTile
          label="Quizzes taken"
          value={detail.quizResults.length}
          sub={
            latestQuiz
              ? `latest ${latestQuiz.percentage.toFixed(0)}% · ${latestQuiz.subject}`
              : "none yet"
          }
          tone="indigo"
        />
        <StatTile
          label="Marks recorded"
          value={detail.assignmentResults.length}
          sub={
            latestAssignment
              ? `latest ${latestAssignment.percentage.toFixed(0)}% · ${latestAssignment.subject}`
              : "none yet"
          }
        />
        <StatTile
          label="Classes"
          value={detail.classrooms.length}
          sub={detail.classrooms.map((c) => c.subject).join(", ") || "—"}
        />
      </div>

      <Card>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800">
            Last 30 days attendance
          </h3>
          <Pill tone="slate">green=present · amber=late · red=absent</Pill>
        </div>
        <AttendanceStrip entries={detail.attendance.last30Days} />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="mb-2 text-sm font-semibold text-slate-800">
            Score timeline
          </h3>
          <ScoreTimelineChart
            quizzes={detail.quizResults}
            assignments={detail.assignmentResults}
          />
        </Card>
        <Card>
          <h3 className="mb-2 text-sm font-semibold text-slate-800">
            Subject averages
          </h3>
          <SubjectAveragesChart data={detail.subjectBreakdown} />
        </Card>
      </div>

      {detail.quizResults.length > 0 || detail.assignmentResults.length > 0 ? (
        <Card>
          <h3 className="mb-2 text-sm font-semibold text-slate-800">
            All submissions
          </h3>
          <ul className="divide-y divide-slate-100 text-sm">
            {[...detail.quizResults, ...detail.assignmentResults]
              .sort((a, b) => (a.submittedAt < b.submittedAt ? 1 : -1))
              .map((r) => {
                const isQuiz = "quizId" in r;
                const label = isQuiz ? (r as typeof detail.quizResults[number]).quizTitle : (r as typeof detail.assignmentResults[number]).title;
                return (
                  <li
                    key={`${isQuiz ? "q" : "a"}:${
                      isQuiz
                        ? (r as typeof detail.quizResults[number]).submissionId
                        : (r as typeof detail.assignmentResults[number]).submissionId
                    }`}
                    className="flex items-center justify-between py-2"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium text-slate-900">
                        {label}{" "}
                        <span className="ml-1 text-xs font-normal text-slate-500">
                          · {r.subject} · {isQuiz ? "quiz" : "marks"}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500">
                        {new Date(r.submittedAt).toLocaleDateString()}
                      </div>
                    </div>
                    <Pill
                      tone={
                        r.percentage >= 70
                          ? "emerald"
                          : r.percentage >= 40
                          ? "amber"
                          : "red"
                      }
                    >
                      {r.score}/{r.maxScore} · {r.percentage.toFixed(0)}%
                    </Pill>
                  </li>
                );
              })}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
