import type { HTMLAttributes } from "react";

type Tone =
  | "slate"
  | "blue"
  | "emerald"
  | "amber"
  | "red"
  | "violet"
  | "pink"
  | "cyan";
type Size = "sm" | "md" | "lg";

const TONES: Record<Tone, string> = {
  slate: "bg-slate-100/80 text-slate-700 border border-slate-200",
  blue: "bg-primary-50 text-primary-700 border border-primary-200",
  emerald: "bg-emerald-50 text-emerald-800 border border-emerald-200",
  amber: "bg-amber-50 text-amber-900 border border-amber-200",
  red: "bg-accent-50 text-accent-700 border border-accent-200",
  violet: "bg-paper-100 text-slate-700 border border-slate-200",
  pink: "bg-accent-50 text-accent-700 border border-accent-200",
  cyan: "bg-primary-50 text-primary-700 border border-primary-200",
};

const SIZES: Record<Size, string> = {
  sm: "px-2 py-0.5 text-[10px] tracking-wider uppercase",
  md: "px-2.5 py-0.5 text-[11px] tracking-wider uppercase",
  lg: "px-3 py-1 text-xs tracking-wider uppercase",
};

export function Pill({
  tone = "slate",
  size = "md",
  className = "",
  ...rest
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone; size?: Size }) {
  return (
    <span
      className={`inline-flex items-center rounded-full font-medium transition-all ${SIZES[size]} ${TONES[tone]} ${className}`}
      {...rest}
    />
  );
}
