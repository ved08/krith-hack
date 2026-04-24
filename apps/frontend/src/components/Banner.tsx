type Kind = "error" | "warn" | "info" | "success";

const STYLES: Record<Kind, string> = {
  error: "bg-red-50 text-red-700 border-red-200",
  warn: "bg-amber-50 text-amber-800 border-amber-200",
  info: "bg-slate-50 text-slate-700 border-slate-200",
  success: "bg-emerald-50 text-emerald-800 border-emerald-200",
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
      className={`flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm animate-fade-in ${STYLES[kind]}`}
      role={kind === "error" ? "alert" : undefined}
    >
      <div>
        {title ? <div className="mb-0.5 font-semibold">{title}</div> : null}
        <div>{message}</div>
      </div>
      {action}
    </div>
  );
}
