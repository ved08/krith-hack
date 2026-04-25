import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Banner } from "../components/Banner.js";
import { Button } from "../components/Button.js";
import { Card } from "../components/Card.js";
import { FieldWrapper, Input, Select } from "../components/Field.js";
import { loginTeacher, listSchools, type SchoolOption } from "../lib/api.js";
import { useAuth } from "../lib/auth.js";

export function TeacherLoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [schoolId, setSchoolId] = useState("");
  const [schools, setSchools] = useState<SchoolOption[] | null>(null);
  const [schoolsLoading, setSchoolsLoading] = useState(false);
  const [schoolsError, setSchoolsError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSchoolsLoading(true);
    listSchools()
      .then((result) => {
        if (!result.success) {
          setSchoolsError(result.error.message);
          setSchools(null);
          return;
        }
        setSchools(result.data);
      })
      .finally(() => setSchoolsLoading(false));
  }, []);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    if (mode === "signup") {
      if (!fullName.trim()) {
        setError("Please enter your full name.");
        setSubmitting(false);
        return;
      }
      if (!schoolId) {
        setError("Please select your school.");
        setSubmitting(false);
        return;
      }
    }

    const result = await loginTeacher({
      username: username.trim(),
      password,
      fullName: mode === "signup" ? fullName.trim() : undefined,
      schoolId: mode === "signup" ? Number(schoolId) : undefined,
    });
    setSubmitting(false);

    if (!result.success) {
      if (result.error.code === "UNAUTHORIZED") {
        setError("Wrong username or password.");
      } else {
        setError(result.error.message);
      }
      return;
    }

    signIn(result.data.token, result.data.teacher);
    navigate("/teacher", { replace: true });
  }

  function toggleMode() {
    setError(null);
    setMode((current) => (current === "login" ? "signup" : "login"));
  }

  return (
    <div className="mx-auto min-h-screen max-w-md px-4 py-24 bg-white text-slate-900">
      <header className="mb-8 text-center">
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
          Teacher Access
        </p>
        <h1 className="mt-4 text-4xl font-semibold text-slate-900">
          {mode === "login" ? "Teacher Login" : "Teacher Sign Up"}
        </h1>
        <p className="mt-3 text-sm text-slate-600">
          {mode === "login"
            ? "Sign in with your school username and password."
            : "Create a new teacher account by choosing your school and entering your full name."}
        </p>
      </header>

      <Card className="bg-white text-slate-900 border border-slate-200 shadow-soft">
        <form onSubmit={onSubmit} className="grid gap-4">
          {mode === "signup" ? (
            <>
              <FieldWrapper label="Full name" labelClassName="text-slate-900">
                <Input
                  autoFocus
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Aarav Kumar"
                  required
                  minLength={1}
                  maxLength={120}
                  className="bg-white text-slate-900 placeholder:text-slate-400 border-slate-300 focus:border-slate-500 focus:ring-slate-200"
                />
              </FieldWrapper>

              <FieldWrapper
                label="School"
                labelClassName="text-slate-900"
                hint={
                  schoolsLoading
                    ? "Loading schools…"
                    : schoolsError
                      ? `Could not load schools: ${schoolsError}`
                      : "Select the school where you teach."
                }
              >
                <Select
                  value={schoolId}
                  onChange={(e) => setSchoolId(e.target.value)}
                  required
                  invalid={mode === "signup" && !schoolId}
                  className="bg-white text-slate-900 placeholder:text-slate-400 border-slate-300 focus:border-slate-500 focus:ring-slate-200"
                >
                  <option value="">
                    {schoolsLoading
                      ? "Loading schools…"
                      : schools && schools.length > 0
                        ? "Select a school…"
                        : "No schools available"}
                  </option>
                  {schools?.map((school) => (
                    <option key={school.id} value={String(school.id)}>
                      {school.name}
                    </option>
                  ))}
                </Select>
              </FieldWrapper>
            </>
          ) : null}

          <FieldWrapper label="Username" labelClassName="text-slate-900">
            <Input
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              minLength={1}
              maxLength={64}
              className="bg-white text-slate-900 placeholder:text-slate-400 border-slate-300 focus:border-slate-500 focus:ring-slate-200"
            />
          </FieldWrapper>

          <FieldWrapper label="Password" labelClassName="text-slate-900">
            <Input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="bg-white text-slate-900 placeholder:text-slate-400 border-slate-300 focus:border-slate-500 focus:ring-slate-200"
            />
          </FieldWrapper>

          {error ? <Banner kind="error" message={error} /> : null}

          <Button type="submit" disabled={submitting}>
            {submitting
              ? mode === "signup"
                ? "Creating account…"
                : "Signing in…"
              : mode === "signup"
                ? "Create account"
                : "Sign in"}
          </Button>
        </form>
      </Card>

      <div className="mt-6 flex flex-col gap-3 text-center text-sm">
        <button
          type="button"
          onClick={toggleMode}
          className="mx-auto rounded-full border border-slate-300 bg-slate-100 px-4 py-2 text-slate-900 hover:bg-slate-200 transition-colors"
        >
          {mode === "login"
            ? "I am a new teacher"
            : "I already have an account"}
        </button>

        {mode === "login" ? (
          <p className="text-slate-600">
            New teacher? Create your account here.
          </p>
        ) : (
          <p className="text-slate-600">
            After signup, you can sign in immediately with the same username and
            password.
          </p>
        )}
      </div>

      <p className="mt-3 text-center text-xs text-slate-500">
        <Link to="/" className="underline text-slate-700">
          ← Back to home
        </Link>
      </p>
    </div>
  );
}
