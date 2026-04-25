import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Banner } from "../components/Banner.js";
import { Button } from "../components/Button.js";
import { Card } from "../components/Card.js";
import { FieldWrapper, Input, Select } from "../components/Field.js";
import { listSchools, loginTeacher, type SchoolOption } from "../lib/api.js";
import { useAuth } from "../lib/auth.js";

/**
 * Teacher sign-in. The backend auto-creates the account on first login,
 * so this single form covers both "log in to existing account" and
 * "create new account":
 *   - Existing user → only `username` + `password` are checked.
 *   - New user      → the form also requires `school` + `fullName`.
 *
 * We always show the extra fields so the user never hits a "you need to
 * register first" wall — but they're only sent if the user opts in.
 */
export function TeacherLoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from =
    (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ??
    "/teacher";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [schoolId, setSchoolId] = useState("");
  const [schools, setSchools] = useState<SchoolOption[] | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listSchools().then((r) => {
      if (cancelled) return;
      if (r.success) setSchools(r.data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setSubmitting(true);

    const trimmedName = fullName.trim();
    const parsedSchool = Number.parseInt(schoolId, 10);
    const hasSignupData =
      Number.isFinite(parsedSchool) && parsedSchool > 0 && trimmedName.length > 0;

    const result = await loginTeacher({
      username: username.trim(),
      password,
      ...(hasSignupData
        ? { schoolId: parsedSchool, fullName: trimmedName }
        : {}),
    });
    setSubmitting(false);

    if (!result.success) {
      if (result.error.code === "INVALID_INPUT") {
        setError(
          "No account with that username yet — pick your school and enter your full name to create one.",
        );
      } else if (result.error.code === "UNAUTHORIZED") {
        setError("Wrong username or password.");
      } else {
        setError(result.error.message);
      }
      return;
    }
    signIn(result.data.token, result.data.teacher);
    navigate(from, { replace: true });
  }

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col px-4 py-14">
      <header className="mb-8">
        <span className="text-xs font-semibold tracking-widest text-slate-500">
          CAMPUS CORTEX AI
        </span>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
          Teacher sign in
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          New here? Just fill in all four fields — your account will be created
          on the first sign-in.
        </p>
      </header>

      <Card>
        <form onSubmit={onSubmit} className="grid gap-4">
          <FieldWrapper label="Username">
            <Input
              autoFocus
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              minLength={1}
              maxLength={64}
            />
          </FieldWrapper>
          <FieldWrapper label="Password" hint="At least 6 characters">
            <Input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </FieldWrapper>

          <div className="border-t border-slate-200 pt-4">
            <p className="mb-3 text-xs font-medium uppercase tracking-wider text-slate-500">
              First time? (ignored when signing in)
            </p>
            <div className="grid gap-4">
              <FieldWrapper label="Full name">
                <Input
                  autoComplete="name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Anita Sharma"
                  maxLength={120}
                />
              </FieldWrapper>
              <FieldWrapper
                label="School"
                hint={schools ? "Pick your school" : "Loading schools…"}
              >
                <Select
                  value={schoolId}
                  onChange={(e) => setSchoolId(e.target.value)}
                  disabled={!schools}
                >
                  <option value="">Select a school…</option>
                  {schools?.map((s) => (
                    <option key={s.id} value={String(s.id)}>
                      {s.name} (#{s.id})
                    </option>
                  ))}
                </Select>
              </FieldWrapper>
            </div>
          </div>

          {error ? <Banner kind="error" message={error} /> : null}
          {info ? <Banner kind="info" message={info} /> : null}

          <Button type="submit" disabled={submitting}>
            {submitting ? "Signing in…" : "Sign in / Create account"}
          </Button>
        </form>
      </Card>

      <p className="mt-6 text-center text-xs text-slate-500">
        <Link to="/" className="underline">
          ← Back to home
        </Link>
      </p>
    </div>
  );
}
