import { useNavigate } from "react-router-dom";
import { Button } from "../components/Button.js";
import { Navigation } from "../components/Navigation.js";

const cardData = [
  {
    title: "Teacher",
    description:
      "Open class tools, announcements, attendance, and quick grading.",
    route: "/teacher/login",
    image:
      "https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=900&q=80",
  },
  {
    title: "Student",
    description:
      "Sign in with your school username or use the kiosk if you are new.",
    route: "/student",
    image:
      "https://images.unsplash.com/photo-1503676260728-1c00da094a0b?auto=format&fit=crop&w=900&q=80",
  },
];

// Stat tiles shown on the hero. These are showcase figures — wire them up
// to a real /stats endpoint when one exists. Keeping `statsData` and the
// `counts` fallback here at module scope so the page never crashes when
// the backend is unavailable.
const statsData = [
  { label: "Active students" },
  { label: "Quizzes created" },
  { label: "Schools" },
] as const;

const counts = {
  students: 1200,
  quizzes: 480,
  schools: 12,
} as const;

export function HomePage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <Navigation />

      <main className="relative mx-auto flex max-w-6xl flex-col gap-10 pt-24 pb-20 px-4">
        {/* Hero */}
        <section className="mx-auto w-full max-w-3xl rounded-[2rem] border border-slate-200 bg-white p-10 shadow-soft">
          <div className="mb-8 text-center">
            <p className="text-sm uppercase tracking-[0.35em] text-slate-500">
              Campus Cortex
            </p>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
              A calm, polished gateway for teachers and students.
            </h1>
            <p className="mt-4 max-w-2xl mx-auto text-base leading-7 text-slate-600 sm:text-lg">
              Simple navigation, subtle motion, and a clean entry point for
              school communication. Designed to feel modern without overwhelming
              the user.
            </p>
          </div>

          <div className="grid gap-4 rounded-[1.75rem] border border-slate-200 bg-slate-50 p-6 shadow-sm sm:grid-cols-3">
            {statsData.map((stat) => {
              const value =
                stat.label === "Active students"
                  ? counts.students
                  : stat.label === "Quizzes created"
                    ? counts.quizzes
                    : counts.schools;

              return (
                <div
                  key={stat.label}
                  className="rounded-3xl bg-white p-5 text-center shadow-sm transition-transform duration-400 hover:-translate-y-1"
                >
                  <div className="text-4xl font-semibold text-slate-900">
                    {value.toLocaleString()}+
                  </div>
                  <div className="mt-2 text-sm uppercase tracking-[0.25em] text-slate-500">
                    {stat.label}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Navigation Cards */}
        <section className="mx-auto w-full max-w-3xl">
          <div className="grid gap-4">
            <div
              onClick={() => navigate("/kiosk")}
              className="group cursor-pointer rounded-[1.5rem] border border-slate-200 bg-white p-6 shadow-sm transition-all duration-300 hover:shadow-md hover:border-slate-300"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-semibold text-slate-900">
                    Admissions Kiosk
                  </h3>
                  <p className="mt-1 text-sm text-slate-600">
                    New-student intake → baseline questions → Learning DNA
                    certificate.
                  </p>
                  <div className="mt-3 flex gap-2">
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800">
                      intake
                    </span>
                    <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-800">
                      questions
                    </span>
                    <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-medium text-violet-800">
                      analyze
                    </span>
                  </div>
                </div>
                <span className="text-2xl text-slate-400 group-hover:text-slate-600 transition-colors">
                  →
                </span>
              </div>
            </div>

            <div
              onClick={() => navigate("/teacher/login")}
              className="group cursor-pointer rounded-[1.5rem] border border-slate-200 bg-white p-6 shadow-sm transition-all duration-300 hover:shadow-md hover:border-slate-300"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-semibold text-slate-900">
                    Teacher Dashboard
                  </h3>
                  <p className="mt-1 text-sm text-slate-600">
                    Sign in to view students, upload attendance + marks, and
                    create AI quizzes.
                  </p>
                  <div className="mt-3 flex gap-2">
                    <span className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                      students
                    </span>
                    <span className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                      attendance
                    </span>
                    <span className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                      quizzes
                    </span>
                  </div>
                </div>
                <span className="text-2xl text-slate-400 group-hover:text-slate-600 transition-colors">
                  →
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Access Cards */}
        <section className="grid gap-6 lg:grid-cols-2">
          {cardData.map((card) => (
            <div
              key={card.title}
              className="group relative overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-soft"
            >
              <div
                className="absolute inset-0 bg-cover bg-center"
                style={{ backgroundImage: `url(${card.image})` }}
              />
              <div className="absolute inset-0 bg-slate-950/50 transition-opacity duration-500 group-hover:bg-slate-950/60" />
              <div className="relative flex min-h-[360px] flex-col justify-between p-8 text-white">
                <div>
                  <span className="text-sm uppercase tracking-[0.35em] text-slate-200/80">
                    {card.title}
                  </span>
                  <h2 className="mt-4 text-3xl font-semibold tracking-tight text-white">
                    {card.title} access
                  </h2>
                  <p className="mt-4 max-w-xl text-sm leading-6 text-slate-200/90">
                    {card.description}
                  </p>
                </div>

                <Button
                  variant="primary"
                  size="lg"
                  className="w-full text-white hover:bg-slate-800"
                  onClick={() => navigate(card.route)}
                >
                  Go to {card.title}
                </Button>
              </div>
            </div>
          ))}
        </section>

        {/* About */}
        <section className="rounded-[2rem] border border-slate-200 bg-white p-10 shadow-soft">
          <div className="grid gap-6 lg:grid-cols-[1fr_0.9fr] lg:items-center">
            <div>
              <p className="text-sm uppercase tracking-[0.35em] text-slate-500">
                About the project
              </p>
              <h2 className="mt-4 text-3xl font-semibold text-slate-900">
                Built for fast school routines.
              </h2>
            </div>
            <p className="text-base leading-7 text-slate-600">
              Campus Cortex is a focused entry page for schools: teachers get a
              clean dashboard path, students get a simple username sign-in, and
              new learners are guided to the kiosk. The design stays calm with
              soft motion, muted tones, and subtle background movement.
            </p>
          </div>
        </section>

        {/* Footer */}
        <footer className="rounded-[2rem] border border-slate-200 bg-white p-8 text-slate-700 shadow-soft">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.35em] text-slate-500">
                Crafted by
              </p>
              <h3 className="mt-2 text-xl font-semibold text-slate-900">
                The development team
              </h3>
            </div>
            <div className="grid gap-2 text-sm sm:grid-cols-2 text-slate-600">
              <span>Murali Samant</span>
              <span>Vedvardhan</span>
              <span>Mani Shankar</span>
              <span>Shashipreetham</span>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
