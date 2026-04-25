import { ReactNode } from "react";

type Status = "success" | "warning" | "error" | "info";

const STATUSES: Record<Status, { bg: string; text: string; emoji: string }> = {
  success: {
    bg: "bg-emerald-100/80 border-emerald-200",
    text: "text-emerald-800",
    emoji: "✓",
  },
  warning: {
    bg: "bg-amber-100/80 border-amber-200",
    text: "text-amber-800",
    emoji: "⚠",
  },
  error: {
    bg: "bg-red-100/80 border-red-200",
    text: "text-red-800",
    emoji: "✕",
  },
  info: {
    bg: "bg-blue-100/80 border-blue-200",
    text: "text-blue-800",
    emoji: "ℹ",
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
      className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border ${config.bg} ${config.text} font-semibold text-sm`}
    >
      <span>{config.emoji}</span>
      <span>{children}</span>
    </div>
  );
}
