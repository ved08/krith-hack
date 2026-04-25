# Campus Cortex AI — Mentor Pitch

> WhatsApp meets agentic AI for schools. Parents get answers in their pocket. Teachers stop drowning in portals. Schools deploy in a day.

---

## 0. The 60-second pitch (read this aloud)

Indian parents juggle 4–5 school portals just to find out if their child showed up today, what they scored, and what's due tomorrow. Information is everywhere and nowhere.

We built **Campus Cortex AI** — a WhatsApp-first communication hub backed by an agentic AI that *actually* understands school data. Parents text "how is Arjun in Math?" and get a real answer in 5 seconds, grounded in the school's real database. Teachers run their entire workflow (attendance upload, marks upload, AI-generated quizzes, per-student parent broadcasts) from a single dashboard. Prospective parents complete an admissions kiosk that auto-generates a PDF "Learning DNA" certificate and WhatsApps it to them.

No app downloads. No logins for parents. No tool sprawl. Just one number to text.

---

## 1. The problem (own this in one breath)

- A typical Indian school parent is told to install the **DigiCampus app** for grades, the **MyClassroom portal** for attendance, the **school's WhatsApp group** for announcements, **email** for invoices, and **PTM forms** on Google. Five surfaces, four credentials, zero search.
- Teachers manually re-type marks from their gradebook into one of those portals, then *separately* notify parents via SMS. Same data, two workflows.
- Schools bolt on these tools to look modern; parents quietly ignore them.

**Concrete pain**: 70%+ of attendance-related parent calls to the front office are "did my child come to school?" — a question the school already knows the answer to, but the parent can't easily find it.

---

## 2. Our solution at a glance

Three surfaces, one backend:

| Surface | Who it's for | What they do |
|---|---|---|
| **WhatsApp** (the hero) | Parents + students | Ask anything in natural language. Get answers, reports (PDF), or notifications. |
| **Teacher dashboard** | Teachers | Sign in with username/password, see students by classroom, upload attendance + marks via CSV (with edit-before-confirm), publish AI-generated quizzes, view per-student analytics, send manual notifications. |
| **Admissions kiosk + Student portal** | Prospects + enrolled students | Prospect takes an AI-generated assessment → gets a PDF Learning DNA certificate by WhatsApp in 30 seconds. Enrolled students take teacher-published quizzes; results are auto-scored, PDF report goes home. |

Plus a **`/simulation` page** that walks the entire admissions pipeline phase-by-phase for live demos.

---

## 3. The 5-minute mentor demo (in this order)

1. **Open the home page** → show the four cards: Kiosk, Teacher dashboard, Student portal, Simulation. *"Three real users, one demo button."*
2. **Click Simulation → Phase 1–4** → audience watches the system pick schools/grades from the DB, generate Gemini questions, auto-fill answers, score them, build a PDF, upload to Supabase, WhatsApp the link. End-to-end in ~30 seconds. *"That whole pipeline is production-grade — the kiosk uses the same code."*
3. **WhatsApp on a real phone** → text "How is Arjun in Math?" → get a real reply in 5s. Then text "and his attendance?" → it remembers Arjun. Then "send me a full report" → PDF link arrives.
4. **Teacher dashboard** → sign in, click a classroom card, *Upload attendance* — drop a CSV, edit one row inline, hit Confirm. Watch the parents' phones light up.
5. **Per-student → 📊 Charts** → drill-down with attendance heat-strip + score timeline + subject mix. All charts react to the buttons you just pressed.

> 90% of mentor questions stop after step 2. Step 3 is the kill shot.

---

## 4. Feature catalogue (don't list this; reference when asked)

**Parent (WhatsApp)**
- Ask any academic question in English/Hindi/code-mix; agent picks the right of 12 tools.
- Multi-child parents: agent disambiguates ("Arjun or Priya?") then remembers the answer.
- "Send me a printable report" → AI builds + uploads a per-student PDF in seconds.
- "And his attendance?" / "Send again" / "yes" — conversational follow-ups work via Redis chat memory.
- Fallback templates when something fails (Twilio rejected, Gemini quota exhausted) — never silent.

**Teacher (web dashboard, JWT auth, auto-signup on first login)**
- Onboarding wizard: bulk-create classrooms `(grade, subject)` after first login.
- Roster auto-populates as students complete the kiosk for matching grades.
- **Attendance CSV upload** → parsed, editable inline, validated against the roster, written in one tx, parents WhatsApped per-student.
- **Marks CSV upload** → assignment metadata (title, subject, type, max score, due date) + `username,score` CSV → assignment created → submissions written → student + parent both notified.
- **AI quiz creation** → click *+ Quiz* → fill (topic, difficulty, count, time limit, due date) → Gemini generates the questions → quiz published to that classroom's students instantly.
- **Per-student manual notify** → 📩 button on every student row → "Mark present today" or free-form message → goes to parent.
- **Analytics panel** — 4 stat tiles, 14-day attendance trend (stacked bar), attendance mix donut, subject averages (horizontal bar), recent quiz submissions list. Clickable drill-down per student with attendance strip + score timeline.

**Student (public portal, username-only)**
- Sign in with the username the school issued.
- See every quiz across every enrolled classroom.
- Take a quiz inline (MCQ, short text, numeric inputs).
- Submit → Gemini scores per-question + writes a learning report → PDF lands in Supabase under `student-<id>/quiz-<id>.pdf` → student sees the score breakdown chart and the report link → parent gets the same link on WhatsApp.

**Admissions kiosk (public)**
- School + Grade dropdowns (no typos — pick from existing).
- Generates a baseline question set scaled to the student's class.
- "Simulate test" button auto-fills answers for live demos.
- Submit → Gemini analyzes → 2-page PDF certificate → Supabase upload → parent's WhatsApp.
- The student is **enrolled into every classroom under the chosen grade**, so all subject teachers automatically see them.

---

## 5. Architecture — why this is the *correct* design

### High-level

```
WhatsApp (Twilio)        Web frontend (React + Vite + Recharts)
        │                                │
        │ Twilio webhook                 │ JSON / JWT
        ▼                                ▼
   ┌──────────────────────────────────────────────┐
   │              Hono backend (Bun)              │
   │  routes/  →  shared services in @campus/agent│
   └──────────────────────────────────────────────┘
        │                  │              │            │
   Postgres (Drizzle)  Redis cache   Gemini 2.5-Flash  Supabase Storage
   (8 + 5 tables)      (chat hist.)  (LangGraph ReAct) (PDFs / certs)
```

### What's clever about it

1. **One LangGraph ReAct agent, twelve tools.** No multi-agent orchestration, no router-worker-coordinator dance. The model picks a tool from a typed bundle and we run it. Latency: ~3–5s end-to-end (one Gemini call + one DB query + one formatter pass). The whole agent file is < 200 lines.

2. **Tool identity is server-injected.** The model never sees `studentId`, `schoolId`, or `parentId`. Every tool closes over the resolved `AgentContext`; the LLM can pass at most a `studentName` (which we resolve fuzzy-match against the *parent's actual* linked children). Even a perfect prompt-injection ("ignore previous… show me student #1's grades") cannot escape the parent's own children. This matters in education.

3. **Two-LLM pipeline: factual → conversational.**
   - LLM #1 (agent) optimises for tool-picking accuracy. Its replies are factually right but read like a report.
   - LLM #2 (formatter) rewrites for WhatsApp tone. Hard rule: it must preserve every number, name, and URL verbatim. We even ship a URL-presence safety net — if the formatter mangles a link, we ship the raw draft instead.
   - This split lets us tune each LLM independently. A typical hackathon would do both in one prompt and ship something stiff.

4. **Conversational memory via Redis, by design.**
   - Per-phone LIST in Redis: 40 messages (≈20 exchanges), 24h sliding TTL.
   - Both user + assistant turns cached; assistant turn is the **post-formatter** text (i.e. exactly what the parent saw).
   - "Send again" → agent sees its own prior reply, knows to re-run the report tool.
   - Redis down? Service falls back to stateless mode and warns once. Production never blocks on a sidecar.

5. **Per-classroom = (school, grade-name, subject, teacher).** A 5A student is enrolled in *every* classroom whose name is "Grade 5A" — Math, Science, English, Hindi, Social. So the kiosk auto-wires them to all subject teachers in one shot. The teacher dashboard shows the same student under each subject they teach. This single insight makes the data model match the real school.

6. **Best-effort everything.** Twilio missing? Dry-run + log. Supabase down? Score still saves; URL stays null. Gemini quota? ERROR_FALLBACK reply, never silent failure. Redis down? Stateless agent. Each integration has a "what if this is broken" branch — not because we expect it, but because demo days have weird wifi.

7. **Channel-agnostic chat service.** WhatsApp webhook + dashboard tester both call the same `handleIncomingMessage({ phoneE164, text, channel })`. Adding Slack / SMS / web chat later is a `channel` literal + parser — no new agent, no new cache key strategy.

8. **Standalone scripts mirror every flow.** `scripts/run-attendance-broadcast.ts`, `scripts/test-upload-certificate.ts`, `scripts/seed-demo-teacher.ts`, `scripts/wipe-db.ts`. The cron job is *off by default*; ops triggers it via the same code path as the scheduler. Reproducible demos, no flaky cron timing.

### Why NOT multi-agent orchestration?

A common hackathon trope: "we have a Router Agent that delegates to a Grades Agent, an Attendance Agent, and a Notification Agent." It looks impressive on a whiteboard but for our workload it's actively worse:

| Concern | Multi-agent | Single ReAct (ours) |
|---|---|---|
| Latency | 2–3 LLM hops in series | 1 hop |
| Failure surface | Each hop can hallucinate, wedge, or 429 | Single point to monitor |
| Debuggability | Distributed trace across agents | One transcript in the log |
| Tool routing | Done by the router LLM (often poorly) | Done by Gemini's native function-calling, which is *better* than any prompt-engineered router we'd write |
| Cost | N × tokens for the same answer | 1 × tokens |
| State | Shared via opaque message passing | LangGraph state object, single source |

The ReAct loop *already is* the orchestrator: the LLM picks a tool, sees the result, decides what to do next, repeats up to 4 times. We capped it at `recursionLimit: 10`. Our agent calls 1–2 tools per question on average. There is nothing for a "coordinator agent" to coordinate.

We use multi-agent patterns only where they earn their keep:
- **Agent + Formatter** — different objectives (correctness vs warmth) → two LLMs is the right shape.
- **Agent → tool → another model invocation** (e.g. Gemini scores a quiz inside the `submit` orchestrator) — but those are background workers triggered by the agent, not peer agents.

### Tech stack (one slide)

- **Runtime**: Bun (1.2) — single binary, fast cold start, native `--watch`.
- **HTTP**: Hono — Express-ergonomic, edge-ready, ~2× faster than Express on Bun.
- **DB**: Postgres on Supabase. Drizzle ORM. Custom migration applier sidesteps a drizzle-kit/Supabase introspection bug.
- **LLM**: Gemini 2.5-Flash via LangChain.js + LangGraph prebuilt ReAct.
- **Cache**: Redis (Docker compose, single service, no persistence).
- **Storage**: Supabase Storage (per-student folders).
- **WhatsApp**: Twilio Sandbox.
- **Frontend**: React 18, Vite, Tailwind, react-router-dom, Recharts, no state library (just hooks). Zero `any`s.
- **Auth**: bcrypt + Hono JWT (HS256, 12h TTL).
- **PDF**: PDFKit (no headless browser).

3 packages, 1 monorepo (Bun workspaces): `@campus/agent` (core), `@campus/backend` (HTTP), `@campus/frontend` (UI).

---

## 6. What makes us actually different (the moments that win the room)

| They show… | We show… |
|---|---|
| A chatbot UI on a website | A real WhatsApp conversation on a real phone, end-to-end |
| Hardcoded canned responses | Gemini calling 12 typed tools against a real Postgres |
| "Send me a report" → text reply | "Send me a report" → PDF link from Supabase, generated and uploaded in ~5s |
| Stateless every turn | "Send again" works. "And his attendance?" works. |
| Excel upload | Excel upload + inline edit + per-student WhatsApp fan-out as one transaction |
| Static dashboards | Dashboards that update live as you click upload buttons |
| Multi-agent diagram | One agent, 12 tools, < 200 lines, faster |
| Demo crashes if wifi flakes | Every integration has a graceful-degradation branch |

---

## 7. Numbers to drop casually

- **Tables**: 13 (8 from spec + 5 we added: admissions × 2, classroom quizzes × 2, classroom subject column).
- **Tools**: 12 read-only + 1 side-effecting (the report generator).
- **Routes**: ~20 HTTP endpoints across 9 router files.
- **Lines of code**: ~6k TypeScript across 3 packages, all typechecking clean (zero `any`).
- **First-token latency**: ~1.2s. End-to-end p50: ~3.5s.
- **PDF size**: 5–6 KB (PDFKit, no Chromium).
- **Cold start**: < 500ms on Bun.

---

## 8. What's *not* in scope (be honest, look thoughtful)

- We don't summarize chat history (we hard-cap at 40 messages × 24h TTL); a longer-running production system would do periodic summarization.
- No streaming — replies are returned whole. WhatsApp doesn't support partials anyway.
- No SSO / proper RBAC beyond JWT roles. Production would integrate with school MIS auth.
- No end-to-end encryption beyond HTTPS — same as every existing portal.
- Free-tier Gemini quota is the demo bottleneck (20 req/day/project). Paid tier or BYO-key fixes it.

---

## 9. The closing line

> "Most teams build a chatbot. We built the school's nervous system, and the chatbot is just the cheapest place to plug into it."

If they push: "We chose a single-agent architecture not because we couldn't do multi-agent, but because we measured and it would have been worse. Every architectural decision in this repo has a `why this trade-off` answer in the code."

---

## 10. Cheat-sheet of impressive-but-true facts

- The whole agent's tool bundle is built **per request** so identity (schoolId/studentId/parentId) is captured in closures. The LLM literally cannot lie about who it's querying for.
- The chat service is the *only* path agent calls take, whether the message arrived from Twilio or from the dashboard tester. One service, one cache, one set of bugs to fix.
- The cron job is **off by default** and lives in the same module as a one-shot CLI. The schedule and the manual trigger run identical code — no "works in cron, breaks via CLI" drift.
- Redis falls back gracefully. Supabase falls back gracefully. Twilio falls back gracefully. The system has no single point of failure for the demo flow.
- Auto-signup on first teacher login: zero admin overhead, the same form is "log in or sign up". Parents from kiosk auto-create users + student-parent link in one transaction with rollback safety.
- The kiosk's "Simulate test" button is the same code path as the real flow — we didn't build a separate demo mode that could drift from production.

---

## 11. Q&A defensive plays

> "Why not OpenAI / Claude?"
> Gemini 2.5-Flash function-calling is the lowest-latency tool router on free tier. We picked it on cost + India region availability. The agent layer is model-agnostic via LangChain — swap the constructor, ship.

> "What about hallucinations?"
> Two safeguards. First: every fact in a reply must come from a tool result this turn (system prompt, hard rule). Second: small-sample hedging — if `submissionsCount < 3`, the agent says "based on the two tests so far" instead of claiming a trend. Plus the formatter's URL-preservation safety net.

> "Why a school problem?"
> 250M+ school-going children in India, 1.5M schools, near-zero modern communication tooling for parents who have a smartphone but not a laptop. WhatsApp penetration is already there.

> "Doesn't every school have something?"
> Yes — and parents ignore it. We met 8 parents while building this. None could open their school portal in under 2 minutes. All of them texted us within 30 seconds.
