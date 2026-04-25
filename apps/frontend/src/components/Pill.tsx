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
  slate: "bg-slate-100 text-slate-700 border border-slate-200",
  blue: "bg-blue-100 text-blue-800 border border-blue-200",
  emerald: "bg-emerald-100 text-emerald-800 border border-emerald-200",
  amber: "bg-amber-100 text-amber-900 border border-amber-200",
  red: "bg-red-100 text-red-800 border border-red-200",
  violet: "bg-violet-100 text-violet-800 border border-violet-200",
  pink: "bg-pink-100 text-pink-800 border border-pink-200",
  cyan: "bg-cyan-100 text-cyan-800 border border-cyan-200",
};

const SIZES: Record<Size, string> = {
  sm: "px-2 py-0.5 text-xs",
  md: "px-3 py-1 text-xs",
  lg: "px-4 py-1.5 text-sm",
};

export function Pill({
  tone = "slate",
  size = "md",
  className = "",
  ...rest
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone; size?: Size }) {
  return (
    <span
      className={`inline-flex items-center rounded-full font-semibold transition-all ${SIZES[size]} ${TONES[tone]} ${className}`}
      {...rest}
    />
  );
}
