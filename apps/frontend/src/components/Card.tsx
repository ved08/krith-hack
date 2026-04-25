import type { HTMLAttributes } from "react";

type CardVariant = "default" | "elevated" | "bordered" | "gradient";

const VARIANTS: Record<CardVariant, string> = {
  default:
    "bg-white text-slate-900 rounded-3xl border border-slate-200 shadow-card",
  elevated:
    "bg-white text-slate-900 rounded-3xl shadow-soft border border-slate-200",
  bordered: "bg-white text-slate-900 rounded-3xl border-2 border-slate-200",
  gradient:
    "bg-gradient-to-br from-slate-200 via-slate-100 to-white rounded-3xl border border-slate-200 shadow-soft text-slate-900",
};

export function Card({
  className = "",
  variant = "default",
  ...rest
}: HTMLAttributes<HTMLDivElement> & { variant?: CardVariant }) {
  return (
    <div
      className={`p-6 md:p-8 transition-all duration-300 hover:shadow-lg ${VARIANTS[variant]} ${className}`}
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
      {icon && <div className="text-2xl">{icon}</div>}
      <div className="flex-1">
        <h2 className="text-2xl font-bold bg-gradient-to-r from-slate-900 to-slate-600 bg-clip-text text-transparent">
          {title}
        </h2>
        {subtitle ? (
          <p className="mt-2 text-sm text-slate-500 leading-relaxed">
            {subtitle}
          </p>
        ) : null}
      </div>
    </header>
  );
}
