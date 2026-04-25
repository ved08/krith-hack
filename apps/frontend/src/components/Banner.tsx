type Kind = "error" | "warn" | "info" | "success";

const STYLES: Record<Kind, string> = {
  error: "bg-accent-50 text-accent-800 border-accent-200",
  warn: "bg-amber-50 text-amber-900 border-amber-200",
  info: "bg-paper-100 text-slate-700 border-slate-200",
  success: "bg-emerald-50 text-emerald-900 border-emerald-200",
};

const ICONS: Record<Kind, string> = {
  error: "✕",
  warn: "!",
  info: "i",
  success: "✓",
};

export function Banner({
  kind = "info",
  title,
  message,
  action,
}: {
  kind?: Kind;
  title?: string;
  message: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      className={`flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm animate-fade-in ${STYLES[kind]}`}
      role={kind === "error" ? "alert" : undefined}
    >
      <div className="flex items-start gap-3 min-w-0">
        <span
          aria-hidden
          className="mt-0.5 grid h-5 w-5 flex-none place-items-center rounded-full bg-white/60 text-[11px] font-semibold"
        >
          {ICONS[kind]}
        </span>
        <div className="min-w-0">
          {title ? <div className="mb-0.5 font-semibold">{title}</div> : null}
          <div className="leading-relaxed text-pretty">{message}</div>
        </div>
      </div>
      {action ? <div className="flex-none">{action}</div> : null}
    </div>
  );
}
