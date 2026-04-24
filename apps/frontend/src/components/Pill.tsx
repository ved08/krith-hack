import type { HTMLAttributes } from "react";

type Tone = "slate" | "blue" | "emerald" | "amber" | "red" | "violet";

const TONES: Record<Tone, string> = {
  slate: "bg-slate-100 text-slate-700",
  blue: "bg-blue-100 text-blue-800",
  emerald: "bg-emerald-100 text-emerald-800",
  amber: "bg-amber-100 text-amber-900",
  red: "bg-red-100 text-red-800",
  violet: "bg-violet-100 text-violet-800",
};

export function Pill({
  tone = "slate",
  className = "",
  ...rest
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${TONES[tone]} ${className}`}
      {...rest}
    />
  );
}
