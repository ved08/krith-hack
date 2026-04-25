import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth.js";

export function Navigation() {
  const { state } = useAuth();

  return (
    <nav className="fixed top-0 w-full z-50 glass">
      <div className="container mx-auto px-4 lg:px-8 py-4 flex justify-between items-center">
        <Link to="/" className="flex items-center gap-3 group">
          <div className="grid h-9 w-9 place-items-center rounded-full bg-slate-900 text-paper-50 font-display italic text-lg leading-none transition-transform group-hover:rotate-[-6deg]">
            <span className="-translate-y-px">C</span>
          </div>
          <span className="hidden sm:flex items-baseline gap-1 text-lg leading-none text-slate-900">
            <span className="font-medium">Campus</span>
            <span className="font-display italic text-primary-700">
              Cortex
            </span>
          </span>
        </Link>

        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            to="/simulation"
            className="rounded-full border border-slate-200 bg-paper-50 px-3.5 py-1.5 text-xs font-medium tracking-wide text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors"
          >
            Demo
          </Link>
          {state?.teacher ? (
            <Link
              to="/teacher"
              className="px-4 py-2 rounded-full bg-slate-900 text-paper-50 text-sm font-medium hover:bg-slate-800 transition-colors"
            >
              Dashboard
            </Link>
          ) : (
            <Link
              to="/teacher/login"
              className="px-4 py-2 rounded-full border border-slate-200 bg-paper-50 text-slate-900 text-sm font-medium hover:bg-slate-50 hover:border-slate-300 transition-colors"
            >
              Teacher login
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
