# Campus Cortex

**WhatsApp meets agentic AI for schools.** Parents text questions in plain English and get answers. Teachers upload attendance and marks; parents and students get a WhatsApp message seconds later. No portals, no app downloads, no logins.

> _"How is Arjun doing in Math?"_ — typed into WhatsApp, answered by an LLM agent that queries the school database, scopes results by school + role, and replies in conversational English.

---

## Why this exists

Schools push information across SMS, email, three different portals, and a parent app no one logs into. Parents end up chasing data instead of receiving it. Campus Cortex collapses every channel into the one app every parent already uses — **WhatsApp** — and puts an agent in front of the school's database so the conversation feels natural.

## What WhatsApp actually does here

WhatsApp is **not just a notification pipe**. It is the primary read+write surface for parents and students:

| Direction | What happens | Trigger |
|---|---|---|
| **Inbound (reactive)** | Parent texts a question. Twilio webhook → Hono `/webhook` → LangGraph agent. Agent classifies intent, resolves child names → DB ids, calls structured query tools (`getAttendance`, `getGrades`, `getStudentSummary`, …), composes a natural reply, returns TwiML. Twilio auto-sends it back. | User-initiated message |
| **Outbound · attendance** | Teacher saves attendance from the dashboard → backend writes `attendance` rows → fans out a WhatsApp message to the linked parent + student for each row. | Teacher action |
| **Outbound · marks** | Teacher uploads grades / publishes a quiz → backend computes percentages → WhatsApps every affected parent and student with the score. | Teacher action |
| **Outbound · admissions** | Kiosk submission completes → Gemini generates a Learning DNA certificate PDF → uploaded to Supabase Storage → URL sent to the parent's WhatsApp. | Kiosk completion |
| **Outbound · scheduled** | 8 AM attendance check, 6 PM daily summary, weekly grade report. Cron-driven. | Time |

Every outbound path uses the same `notifications/whatsapp` module so phone-number normalization, dry-run mode, retry, and delivery accounting (`sent / dry_run / skipped / failed`) live in one place.

### Inbound flow

```
Parent's phone
   │  "how is Arjun in math?"
   ▼
Twilio WhatsApp Sandbox
   │  POST x-www-form-urlencoded {From, Body, …}
   ▼
Hono /webhook  ──→  signature check (TWILIO_AUTH_TOKEN, optional)
   │
   ▼
Resolve sender by E.164 in `users.phone_number`
   │      └─ unknown → canned reply, return TwiML
   ▼
LangGraph agent (Gemini)
   ├─ intent classification     (academic / result / support)
   ├─ entity extraction          ("Arjun", "math")
   ├─ child resolution           parent_student_link → student_id
   ├─ tool call                  getStudentSummary({studentId, subject:"math"})
   └─ response synthesis         → friendly Indian-English reply
   │
   ▼
TwiML  <Response><Message>Hi! Arjun's last math quiz was 18/20…</Message></Response>
   │
   ▼
Twilio sends the reply on WhatsApp.
```

### Outbound delivery contract

Every action that writes to the DB and notifies users returns a delivery summary:

```jsonc
{
  "written": 24,           // rows persisted
  "whatsappSent": 22,      // delivered via Twilio
  "whatsappFailed": 1,     // Twilio returned an error
  "whatsappSkipped": 1,    // user has no phone or DRY_RUN=true
}
```

Set `MOCK_WHATSAPP=true` in `.env` to log messages locally without burning Twilio quota — useful for `bun run dev:backend` against a real database.

---

## Architecture

```
campus-cortex/
├── packages/
│   └── agent/                       # @campus/agent — all domain logic
│       └── src/
│           ├── agent/               # LangGraph workflow + Gemini prompts
│           ├── chat/                # WhatsApp dialogue + canned replies
│           ├── notifications/       # Twilio client, templates, dry-run
│           ├── classroom/           # attendance + grades + quiz scoring
│           ├── admissions/          # kiosk intake → Learning DNA → PDF
│           ├── reports/             # PDF generation (puppeteer)
│           ├── storage/             # Supabase Storage uploads
│           ├── db/                  # Drizzle schema + queries + analytics
│           └── llm/                 # Gemini wrapper, MOCK_LLM mode
│
├── apps/
│   ├── backend/                     # @campus/backend — Hono HTTP service
│   │   └── src/routes/
│   │       ├── webhook.ts           # Twilio inbound (form → TwiML)
│   │       ├── agent.ts             # JSON /agent/message
│   │       ├── teacher.ts           # classroom CRUD
│   │       ├── teacher-uploads.ts   # attendance + marks → fanout WhatsApp
│   │       ├── quizzes.ts           # AI quiz publish + student submit
│   │       ├── admissions.ts        # kiosk intake / questions / analyze
│   │       ├── analytics.ts         # teacher + student dashboards
│   │       ├── auth.ts              # teacher JWT login + signup
│   │       └── lookups.ts           # schools, grades
│   │
│   └── frontend/                    # React + Vite + Tailwind
│       └── src/
│           ├── pages/               # Home, Kiosk, Student, Chat, Teacher…
│           └── components/          # Card, Button, Pill, Charts, Banner…
│
└── docker-compose.yml               # local Redis (rate limit + queue)
```

`@campus/agent` is workspace-shared, importable from anywhere:

```ts
import { runAgent } from "@campus/agent";
import { sendWhatsApp } from "@campus/agent/notifications";
import { insertAttendanceBatch } from "@campus/agent/db";
```

---

## Setup

```bash
# 1. clone, copy env
cp .env.example .env
# fill DATABASE_URL, GEMINI_API_KEY, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN,
# TWILIO_WHATSAPP_FROM, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

# 2. install workspace
bun install

# 3. apply schema + seed
bun run db:apply
bun run db:seed

# 4. run services
bun run dev:backend     # :3000  Hono + agent + webhook
bun run dev:frontend    # :5173  React dashboard + kiosk
docker compose up -d    # Redis (queue + dedupe)
```

### Connecting to Twilio WhatsApp

1. Grab a **WhatsApp sandbox** number from the Twilio console.
2. Expose `:3000` with ngrok: `ngrok http 3000`.
3. In Twilio sandbox settings, set _"When a message comes in"_ → `POST https://<ngrok>/webhook`.
4. Join the sandbox by sending the code (e.g. `join able-tiger`) from your phone.
5. Text `"how is my child doing?"` from a seeded number — agent replies on WhatsApp.

For production, swap the sandbox for a Twilio business sender or hook the same `notifications/whatsapp` module to Meta Cloud API / Evolution API — the contract is one method, `sendText({toE164, body})`.

---

## Endpoints

| Method | Path | Purpose | Caller |
|---|---|---|---|
| `GET` | `/health` | Liveness | anyone |
| `POST` | `/webhook` | **Twilio WhatsApp inbound.** Form-encoded. Returns TwiML. | Twilio |
| `POST` | `/agent/message` | JSON peer of `/webhook` for dashboards / curl | Frontend chat page |
| `POST` | `/auth/teacher/login` | Teacher login — returns JWT | Dashboard |
| `POST` | `/auth/teacher/signup` | Teacher signup | Dashboard |
| `GET` | `/teacher/classrooms` | Classes for the logged-in teacher | Dashboard (JWT) |
| `POST` | `/teacher/classrooms` | Bulk-create classrooms | Dashboard (JWT) |
| `GET` | `/teacher/students` | Roster across classrooms | Dashboard (JWT) |
| `POST` | `/teacher/uploads/attendance` | Save attendance + WhatsApp parents | Dashboard (JWT) |
| `POST` | `/teacher/uploads/marks` | Save marks + WhatsApp parents | Dashboard (JWT) |
| `POST` | `/teacher/students/:id/notify` | Per-student manual WhatsApp | Dashboard (JWT) |
| `POST` | `/quizzes` | Publish AI-generated quiz | Dashboard (JWT) |
| `POST` | `/student/:id/quizzes/:quizId/submit` | Submit quiz → score → WhatsApp | Student page |
| `POST` | `/admissions/phase2/intake` | Kiosk intake + question generation | Kiosk |
| `POST` | `/admissions/phase2/analyze` | Score answers + Learning DNA + PDF + WhatsApp | Kiosk |
| `GET` | `/teacher/analytics` | Dashboard overview (JWT) | Dashboard |
| `GET` | `/student/:id/analytics` | Per-student detail | Student page |

---

## Database

8 tables, plain Postgres, no ORM magic at the schema level (Drizzle is read/write only). Every query that returns parent/student data filters by `school_id` to enforce school isolation, plus the calling teacher's `teacher_id` to enforce ownership.

```
schools
users                  (role: student | parent | teacher)
parent_student_link
classrooms
classroom_membership
class_session
attendance             (status: PRESENT | LATE | ABSENT)
assignments + assignment_submission
classroom_quizzes + classroom_quiz_submissions
admissions_question_sets + admissions_evaluations
```

**Business rules:**
- `attendance % = (PRESENT + LATE) / total_sessions × 100`
- `grade % = AVG(assignment_submission.percentage)` per subject
- Parent must verify with child's username + password to create a `parent_student_link`
- Students cannot read parent views (RBAC enforced at query layer)

---

## Demo seeded numbers

These map to rows in `users.phone_number`. Replace one with your real WhatsApp number to test live.

| Phone | Who | Linked students |
|---|---|---|
| `+912222222222` | Parent Kumar | Arjun + Priya (multi-child) |
| `+913333333333` | Parent Sen | Rahul |
| `+914444444444` | Parent Iyer | Meera |
| `+915555555555` | Student Arjun | self |

Try (from any of those numbers):

```
how is my child doing?
what is the attendance?
how is Arjun in math?
any tests coming up this week?
any pending homework?
```

---

## Environment variables

| Var | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Postgres / Supabase pooler connection string |
| `GEMINI_API_KEY` | unless `MOCK_LLM=true` | Google Generative AI key |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_WHATSAPP_FROM` | for live WhatsApp | Twilio credentials + sender |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | for PDF uploads | Storage bucket for certificates |
| `MOCK_LLM` | no | `true` → deterministic stub agent replies |
| `MOCK_WHATSAPP` | no | `true` → log messages instead of sending |
| `PORT` | no | Backend HTTP port (default 3000) |

---

## Common workspace commands

```bash
bun run dev:backend          # start Hono + agent
bun run dev:frontend         # start Vite frontend
bun run db:generate          # drizzle: schema.ts → SQL migration
bun run db:apply             # apply migrations to Supabase
bun run db:seed              # load demo schools + parents + students
bun run typecheck            # typecheck every workspace
bun run build                # build backend + frontend
```

---

## Team

| Person | Owns |
|---|---|
| Murali Samant | Database schema + Python query tools |
| Mani Shankar | WhatsApp / Twilio integration + templates |
| Vedvardhan | Agentic backend (LangGraph + Gemini + scheduler) |
| Shashipreetham | Dashboard + kiosk frontend |
