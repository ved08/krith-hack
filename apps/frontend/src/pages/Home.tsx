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

// Three system descriptors shown on the hero — replace fake counters
// with what actually makes the product distinctive.
const pillars = [
  {
    word: "End-to-end",
    note: "Intake to certificate, in one continuous flow.",
  },
  {
    word: "Agentic AI",
    note: "Multi-node reasoning — not keyword chatbots.",
  },
  {
    word: "WhatsApp-native",
    note: "Zero apps, zero logins for parents.",
  },
] as const;

export function HomePage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-paper-50 text-slate-900">
      <Navigation />

      <main className="relative mx-auto flex max-w-6xl flex-col gap-10 pt-28 pb-20 px-4">
        {/* Hero */}
        <section className="mx-auto w-full max-w-3xl rounded-[1.75rem] border border-slate-200/80 bg-white p-10 shadow-soft">
          <div className="mb-8 text-center">
            <p className="text-[11px] uppercase tracking-[0.35em] text-slate-500">
              <span className="inline-block h-px w-6 align-middle bg-slate-300 mr-3" />
              Campus Cortex
              <span className="inline-block h-px w-6 align-middle bg-slate-300 ml-3" />
            </p>
            <h1 className="mt-5 font-display text-5xl leading-[1.05] text-slate-900 sm:text-6xl tracking-editorial">
              A <em className="text-primary-700">calm, polished</em> gateway
              for teachers and students.
            </h1>
            <p className="mt-5 max-w-xl mx-auto text-base leading-7 text-slate-600 text-pretty">
              Simple navigation, subtle motion, and a clean entry point for
              school communication. Designed to feel modern without overwhelming
              the user.
            </p>
          </div>

          <div className="grid gap-px rounded-[1.5rem] border border-slate-200 bg-slate-200 overflow-hidden sm:grid-cols-3">
            {pillars.map((pillar, i) => (
              <div
                key={pillar.word}
                className="bg-paper-50 p-6 text-center transition-colors duration-400 hover:bg-white"
              >
                <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-slate-400">
                  0{i + 1}
                </div>
                <div className="mt-2 font-display text-2xl leading-tight text-slate-900 whitespace-nowrap">
                  <em className="text-primary-700">{pillar.word}</em>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-slate-500 text-pretty">
                  {pillar.note}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Navigation Cards */}
        <section className="mx-auto w-full max-w-3xl">
          <div className="grid gap-4">
            <div
              onClick={() => navigate("/kiosk")}
              className="group cursor-pointer rounded-2xl border border-slate-200 bg-white p-6 shadow-subtle transition-all duration-300 hover:shadow-soft hover:border-primary-300 hover:-translate-y-0.5"
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="font-display text-2xl text-slate-900">
                    Admissions <em className="text-primary-700">Kiosk</em>
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                    New-student intake → baseline questions → Learning DNA
                    certificate.
                  </p>
                  <div className="mt-3 flex gap-2">
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[10px] uppercase tracking-wider font-medium text-emerald-800">
                      intake
                    </span>
                    <span className="rounded-full border border-primary-200 bg-primary-50 px-2.5 py-0.5 text-[10px] uppercase tracking-wider font-medium text-primary-700">
                      questions
                    </span>
                    <span className="rounded-full border border-accent-200 bg-accent-50 px-2.5 py-0.5 text-[10px] uppercase tracking-wider font-medium text-accent-700">
                      analyze
                    </span>
                  </div>
                </div>
                <span className="font-display text-3xl text-slate-300 group-hover:text-primary-600 group-hover:translate-x-1 transition-all">
                  →
                </span>
              </div>
            </div>

            <div
              onClick={() => navigate("/teacher/login")}
              className="group cursor-pointer rounded-2xl border border-slate-200 bg-white p-6 shadow-subtle transition-all duration-300 hover:shadow-soft hover:border-primary-300 hover:-translate-y-0.5"
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="font-display text-2xl text-slate-900">
                    Teacher <em className="text-primary-700">Dashboard</em>
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                    Sign in to view students, upload attendance + marks, and
                    create AI quizzes.
                  </p>
                  <div className="mt-3 flex gap-2">
                    <span className="rounded-full border border-slate-200 bg-paper-100 px-2.5 py-0.5 text-[10px] uppercase tracking-wider font-medium text-slate-700">
                      students
                    </span>
                    <span className="rounded-full border border-slate-200 bg-paper-100 px-2.5 py-0.5 text-[10px] uppercase tracking-wider font-medium text-slate-700">
                      attendance
                    </span>
                    <span className="rounded-full border border-slate-200 bg-paper-100 px-2.5 py-0.5 text-[10px] uppercase tracking-wider font-medium text-slate-700">
                      quizzes
                    </span>
                  </div>
                </div>
                <span className="font-display text-3xl text-slate-300 group-hover:text-primary-600 group-hover:translate-x-1 transition-all">
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
                  <span className="text-[11px] uppercase tracking-[0.35em] text-paper-100/80">
                    {card.title}
                  </span>
                  <h2 className="mt-4 font-display text-4xl tracking-editorial text-white">
                    {card.title} <em className="text-paper-50/95">access</em>
                  </h2>
                  <p className="mt-4 max-w-xl text-sm leading-relaxed text-paper-100/85">
                    {card.description}
                  </p>
                </div>

                <Button
                  variant="primary"
                  size="lg"
                  className="w-full bg-white text-slate-900 hover:bg-paper-100"
                  onClick={() => navigate(card.route)}
                >
                  Go to {card.title} →
                </Button>
              </div>
            </div>
          ))}
        </section>

        {/* About */}
        <section className="rounded-[1.75rem] border border-slate-200/80 bg-white p-10 shadow-subtle">
          <div className="grid gap-6 lg:grid-cols-[1fr_0.9fr] lg:items-center">
            <div>
              <p className="text-[11px] uppercase tracking-[0.35em] text-slate-500">
                About the project
              </p>
              <h2 className="mt-4 font-display text-4xl text-slate-900 tracking-editorial">
                Built for <em className="text-primary-700">fast</em> school
                routines.
              </h2>
            </div>
            <p className="text-base leading-7 text-slate-600 text-pretty">
              Campus Cortex is a focused entry page for schools: teachers get a
              clean dashboard path, students get a simple username sign-in, and
              new learners are guided to the kiosk. The design stays calm with
              soft motion, muted tones, and subtle background movement.
            </p>
          </div>
        </section>

        {/* Footer */}
        <footer className="rounded-[1.75rem] border border-slate-200/80 bg-white p-8 text-slate-700 shadow-subtle">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-[0.35em] text-slate-500">
                Crafted by
              </p>
              <h3 className="mt-2 font-display text-xl text-slate-900 italic">
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
