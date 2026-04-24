import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "../components/Card.js";
import { Pill } from "../components/Pill.js";
import { checkHealth } from "../lib/api.js";

export function HomePage() {
  const [health, setHealth] = useState<"unknown" | "ok" | "down">("unknown");

  useEffect(() => {
    let cancelled = false;
    checkHealth().then((r) => {
      if (cancelled) return;
      setHealth(r.success ? "ok" : "down");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto max-w-3xl px-4 py-14">
      <header className="mb-12">
        <div className="mb-4 flex items-center gap-2">
          <span className="text-xs font-semibold tracking-widest text-slate-500">
            CAMPUS CORTEX AI
          </span>
          {health === "ok" ? (
            <Pill tone="emerald">backend online</Pill>
          ) : health === "down" ? (
            <Pill tone="red">backend offline</Pill>
          ) : (
            <Pill tone="slate">checking…</Pill>
          )}
        </div>
        <h1 className="text-4xl font-semibold tracking-tight text-slate-900">
          Admissions kiosk
        </h1>
        <p className="mt-3 max-w-xl text-slate-600">
          Run the Phase 2 admissions flow for new students: intake, baseline
          questions, Learning DNA analysis, and certificate.
        </p>
      </header>

      <div className="grid gap-4">
        <NavCard
          to="/kiosk"
          title="Admissions Kiosk"
          subtitle="New-student intake → baseline questions → Learning DNA certificate."
          tone="emerald"
          pills={["intake", "questions", "analyze"]}
        />
      </div>

      <footer className="mt-16 border-t border-slate-200 pt-6 text-xs text-slate-500">
        Backend:{" "}
        <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono">
          {import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000"}
        </code>
      </footer>
    </div>
  );
}

function NavCard({
  to,
  title,
  subtitle,
  pills,
  tone,
}: {
  to: string;
  title: string;
  subtitle: string;
  pills: string[];
  tone: "emerald" | "blue";
}) {
  return (
    <Link to={to} className="block focus-visible:outline-none">
      <Card className="cursor-pointer transition hover:border-slate-400 hover:shadow-md">
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {pills.map((p) => (
            <Pill key={p} tone={tone}>
              {p}
            </Pill>
          ))}
        </div>
      </Card>
    </Link>
  );
}
