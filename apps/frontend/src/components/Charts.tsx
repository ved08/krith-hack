import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  AttendanceTimelineEntry,
  AttendanceTrendDay,
  StudentAssignmentResult,
  StudentQuizResult,
  SubjectAverage,
} from "../lib/api.js";

/**
 * Small, opinionated chart wrappers used across the teacher + student
 * dashboards. Each wrapper fixes the height, palette, and legend so the
 * calling pages just pass raw data.
 */

const COLORS = {
  present: "#10b981", // emerald-500
  late: "#f59e0b", // amber-500
  absent: "#ef4444", // red-500
  primary: "#0f172a", // slate-900
  accent: "#6366f1", // indigo-500
  muted: "#94a3b8", // slate-400
} as const;

// ─── Stat tile ────────────────────────────────────────────────────────────

export function StatTile({
  label,
  value,
  sub,
  tone = "slate",
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  tone?: "slate" | "emerald" | "amber" | "red" | "indigo";
}) {
  const toneClass = {
    slate: "border-slate-200 bg-white",
    emerald: "border-emerald-200 bg-emerald-50/60",
    amber: "border-amber-200 bg-amber-50/60",
    red: "border-red-200 bg-red-50/60",
    indigo: "border-indigo-200 bg-indigo-50/60",
  }[tone];
  return (
    <div
      className={`rounded-xl border ${toneClass} px-4 py-3 shadow-sm`}
    >
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </div>
      <div className="mt-0.5 text-2xl font-semibold text-slate-900">{value}</div>
      {sub ? <div className="mt-0.5 text-xs text-slate-500">{sub}</div> : null}
    </div>
  );
}

// ─── Attendance trend (stacked bar, 14 days) ─────────────────────────────

export function AttendanceTrendChart({
  data,
  height = 220,
}: {
  data: AttendanceTrendDay[];
  height?: number;
}) {
  const prepared = data.map((d) => ({
    ...d,
    label: d.date.slice(5), // MM-DD
  }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={prepared}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#64748b" }} />
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="present" stackId="att" fill={COLORS.present} name="Present" />
        <Bar dataKey="late" stackId="att" fill={COLORS.late} name="Late" />
        <Bar dataKey="absent" stackId="att" fill={COLORS.absent} name="Absent" />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Attendance mix (donut of present/late/absent %) ─────────────────────

export function AttendanceDonut({
  presentPct,
  latePct,
  absentPct,
  height = 180,
}: {
  presentPct: number;
  latePct: number;
  absentPct: number;
  height?: number;
}) {
  const data = [
    { name: "Present", value: presentPct, fill: COLORS.present },
    { name: "Late", value: latePct, fill: COLORS.late },
    { name: "Absent", value: absentPct, fill: COLORS.absent },
  ];
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius={45}
          outerRadius={70}
          paddingAngle={2}
        >
          {data.map((d, i) => (
            <Cell key={i} fill={d.fill} />
          ))}
        </Pie>
        <Tooltip formatter={(v) => `${v}%`} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

// ─── Subject average (horizontal bar) ────────────────────────────────────

export function SubjectAveragesChart({
  data,
  height = 220,
}: {
  data: SubjectAverage[];
  height?: number;
}) {
  if (data.length === 0) {
    return (
      <div className="flex h-[160px] items-center justify-center text-xs text-slate-500">
        No subject data yet.
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ left: 30 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis
          type="number"
          domain={[0, 100]}
          tick={{ fontSize: 11, fill: "#64748b" }}
          unit="%"
        />
        <YAxis
          type="category"
          dataKey="subject"
          tick={{ fontSize: 12, fill: "#334155" }}
          width={80}
        />
        <Tooltip formatter={(v) => `${v}%`} />
        <Bar dataKey="avgPercentage" fill={COLORS.accent} name="Avg %" />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Score timeline (line chart of quiz + assignment %) ──────────────────

type TimelinePoint = {
  label: string;
  submittedAt: string;
  percentage: number;
  kind: "quiz" | "marks";
  subject: string;
};

export function ScoreTimelineChart({
  quizzes,
  assignments,
  height = 240,
}: {
  quizzes: StudentQuizResult[];
  assignments: StudentAssignmentResult[];
  height?: number;
}) {
  const points: TimelinePoint[] = [
    ...quizzes.map((q) => ({
      label: `${q.quizTitle.slice(0, 14)}${q.quizTitle.length > 14 ? "…" : ""}`,
      submittedAt: q.submittedAt,
      percentage: q.percentage,
      kind: "quiz" as const,
      subject: q.subject,
    })),
    ...assignments.map((a) => ({
      label: `${a.title.slice(0, 14)}${a.title.length > 14 ? "…" : ""}`,
      submittedAt: a.submittedAt,
      percentage: a.percentage,
      kind: "marks" as const,
      subject: a.subject,
    })),
  ].sort((a, b) => (a.submittedAt < b.submittedAt ? -1 : 1));

  if (points.length === 0) {
    return (
      <div className="flex h-[160px] items-center justify-center text-xs text-slate-500">
        No submissions yet.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={points} margin={{ bottom: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 10, fill: "#64748b" }}
          angle={-20}
          textAnchor="end"
          height={50}
        />
        <YAxis
          domain={[0, 100]}
          tick={{ fontSize: 11, fill: "#64748b" }}
          unit="%"
        />
        <Tooltip
          formatter={(v) => `${Number(v).toFixed(1)}%`}
          labelFormatter={(label, payload) => {
            const p = payload?.[0]?.payload as TimelinePoint | undefined;
            return p ? `${label} · ${p.subject} (${p.kind})` : String(label);
          }}
        />
        <Line
          type="monotone"
          dataKey="percentage"
          stroke={COLORS.accent}
          strokeWidth={2}
          dot={{ r: 4 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ─── Attendance strip (colored dots for the last 30 days) ────────────────

export function AttendanceStrip({
  entries,
}: {
  entries: AttendanceTimelineEntry[];
}) {
  // Deduplicate to one tile per day, preferring a marked status if any.
  const byDate = new Map<string, AttendanceTimelineEntry>();
  for (const e of entries) {
    const prior = byDate.get(e.date);
    if (!prior || (!prior.status && e.status)) byDate.set(e.date, e);
  }
  const sorted = [...byDate.values()].sort((a, b) =>
    a.date < b.date ? -1 : 1,
  );
  if (sorted.length === 0) {
    return (
      <div className="text-xs text-slate-500">
        No class sessions in the last 30 days.
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-1" aria-label="Attendance last 30 days">
      {sorted.map((e) => {
        const cls = e.status === "PRESENT"
          ? "bg-emerald-500"
          : e.status === "LATE"
          ? "bg-amber-500"
          : e.status === "ABSENT"
          ? "bg-red-500"
          : "bg-slate-200";
        const title = `${e.date} · ${e.status ?? "not marked"} · ${e.classroomName}`;
        return (
          <span
            key={`${e.date}-${e.classroomName}`}
            title={title}
            className={`h-4 w-4 rounded-sm ${cls}`}
          />
        );
      })}
    </div>
  );
}

// ─── Per-question scoring bar (used on quiz result) ──────────────────────

type ScoredPoint = {
  id: string;
  awarded: number;
  max: number;
  missed: number;
};

export function PerQuestionBar({
  scored,
  questions,
  height = 180,
}: {
  scored: Array<{ questionId: string; awardedPoints: number; correct: boolean }>;
  questions: Array<{ id: string; points: number }>;
  height?: number;
}) {
  const maxById = new Map(questions.map((q) => [q.id, q.points]));
  const data: ScoredPoint[] = [];
  for (const s of scored) {
    const max = maxById.get(s.questionId) ?? s.awardedPoints;
    data.push({
      id: s.questionId,
      awarded: s.awardedPoints,
      max,
      missed: Math.max(0, max - s.awardedPoints),
    });
  }
  if (data.length === 0) return null;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="id" tick={{ fontSize: 11, fill: "#64748b" }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#64748b" }} />
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="awarded" stackId="pts" fill={COLORS.present} name="Awarded" />
        <Bar dataKey="missed" stackId="pts" fill="#e2e8f0" name="Missed" />
      </BarChart>
    </ResponsiveContainer>
  );
}
