import { ReactNode } from "react";

type Status = "success" | "warning" | "error" | "info";

const STATUSES: Record<Status, { bg: string; text: string; emoji: string }> = {
  success: {
    bg: "bg-emerald-50 border-emerald-200",
    text: "text-emerald-800",
    emoji: "✓",
  },
  warning: {
    bg: "bg-amber-50 border-amber-200",
    text: "text-amber-800",
    emoji: "!",
  },
  error: {
    bg: "bg-accent-50 border-accent-200",
    text: "text-accent-700",
    emoji: "✕",
  },
  info: {
    bg: "bg-paper-100 border-slate-200",
    text: "text-slate-700",
    emoji: "i",
  },
};

interface BadgeProps {
  status: Status;
  children: ReactNode;
}

export function StatusBadge({ status, children }: BadgeProps) {
  const config = STATUSES[status];
  return (
    <div
      className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border ${config.bg} ${config.text} font-medium text-xs uppercase tracking-wider`}
    >
      <span className="font-bold">{config.emoji}</span>
      <span>{children}</span>
    </div>
  );
}
