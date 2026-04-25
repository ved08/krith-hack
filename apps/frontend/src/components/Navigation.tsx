import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth.js";

export function Navigation() {
  const { state } = useAuth();

  return (
    <nav className="fixed top-0 w-full z-50 glass border-b border-slate-200">
      <div className="container mx-auto px-4 lg:px-8 py-4 flex justify-between items-center">
        <Link to="/" className="flex items-center gap-3 group">
          <div className="w-10 h-10 rounded-lg bg-slate-900 flex items-center justify-center text-white font-bold text-lg group-hover:scale-110 transition-transform">
            CC
          </div>
          <span className="font-semibold text-lg hidden sm:inline text-slate-900">
            Campus Cortex
          </span>
        </Link>

        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            to="/simulation"
            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
          >
            Demo
          </Link>
          {state?.teacher ? (
            <Link
              to="/teacher"
              className="px-4 py-2 rounded-lg bg-slate-900 text-white font-semibold hover:bg-slate-800 transition-colors"
            >
              Dashboard
            </Link>
          ) : (
            <Link
              to="/teacher/login"
              className="px-4 py-2 rounded-lg border border-slate-200 bg-white text-slate-900 font-semibold hover:bg-slate-50 transition-colors"
            >
              Teacher Login
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
