import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Navigate, useLocation } from "react-router-dom";
import type { AuthTeacher } from "./api.js";

/**
 * Tiny localStorage-backed auth state. Holds the JWT + the teacher
 * record returned by `/auth/teacher/login`. No refresh — when the token
 * expires the next protected fetch returns 401 and we sign the user
 * out (`signOut()`).
 */

type AuthState = { token: string; teacher: AuthTeacher } | null;

type AuthContextValue = {
  state: AuthState;
  signIn: (token: string, teacher: AuthTeacher) => void;
  signOut: () => void;
};

const STORAGE_KEY = "campus.auth";

const AuthContext = createContext<AuthContextValue | null>(null);

function loadState(): AuthState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthState;
    if (!parsed?.token || !parsed?.teacher) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(() => loadState());

  // Keep storage + state in sync if the user opens the app in two tabs.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY) setState(loadState());
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const signIn = useCallback((token: string, teacher: AuthTeacher) => {
    const next: AuthState = { token, teacher };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setState(next);
  }, []);

  const signOut = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setState(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ state, signIn, signOut }),
    [state, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

export function RequireTeacher({ children }: { children: ReactNode }) {
  const { state } = useAuth();
  const location = useLocation();
  if (!state) {
    return <Navigate to="/teacher/login" replace state={{ from: location }} />;
  }
  return <>{children}</>;
}
