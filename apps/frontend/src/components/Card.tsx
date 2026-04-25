import type { HTMLAttributes } from "react";

type CardVariant = "default" | "elevated" | "bordered" | "gradient";

const VARIANTS: Record<CardVariant, string> = {
  default:
    "bg-white text-slate-900 rounded-2xl border border-slate-200/80 shadow-subtle",
  elevated:
    "bg-white text-slate-900 rounded-2xl shadow-soft border border-slate-200/70",
  bordered:
    "bg-white text-slate-900 rounded-2xl border border-slate-200",
  gradient:
    "bg-gradient-to-br from-paper-100 via-white to-paper-50 rounded-2xl border border-slate-200/70 shadow-subtle text-slate-900",
};

export function Card({
  className = "",
  variant = "default",
  ...rest
}: HTMLAttributes<HTMLDivElement> & { variant?: CardVariant }) {
  return (
    <div
      className={`p-6 md:p-8 transition-all duration-300 ${VARIANTS[variant]} ${className}`}
      {...rest}
    />
  );
}

export function CardHeader({
  title,
  subtitle,
  icon,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
}) {
  return (
    <header className="mb-6 flex items-start gap-3">
      {icon && <div className="text-2xl text-primary-600">{icon}</div>}
      <div className="flex-1">
        <h2 className="font-display text-2xl text-slate-900 tracking-editorial">
          {title}
        </h2>
        {subtitle ? (
          <p className="mt-1.5 text-sm text-slate-500 leading-relaxed text-pretty">
            {subtitle}
          </p>
        ) : null}
      </div>
    </header>
  );
}
