# Campus Cortex

WhatsApp-first school communication hub. Parents and students ask academic
questions via WhatsApp; an AI agent answers using structured queries over a
Postgres school database.

## Layout

Bun workspace.

```
campus-cortex/
├── .env                  # shared env: DATABASE_URL, GEMINI_API_KEY, MOCK_LLM
├── package.json          # workspace root (runs filtered scripts)
├── packages/
│   └── agent/            # @campus/agent — LangChain agent, DB queries, tools
│       ├── src/
│       │   ├── agent/    # LangGraph + Gemini + tools + prompts
│       │   ├── db/       # Drizzle schema, queries, analytics, seed
│       │   └── config/
│       └── drizzle/      # generated SQL migrations
└── apps/
    └── backend/          # @campus/backend — WhatsApp-facing Hono service
        └── src/
            ├── routes/
            │   ├── webhook.ts  # Twilio WhatsApp inbound (form-encoded → TwiML)
            │   └── agent.ts    # JSON /agent/message for dashboards / curl
            ├── env.ts          # PORT, TWILIO_AUTH_TOKEN
            └── index.ts        # Hono bootstrap
```

The `@campus/agent` package is importable from anywhere in the workspace:

```ts
import { runAgent } from "@campus/agent";
import { insertAttendanceBatch } from "@campus/agent/db";
```

## Setup

1. Copy env: `cp .env.example .env`, fill `DATABASE_URL` + `GEMINI_API_KEY`.
2. Install: `bun install` (from workspace root).
3. Apply schema: `bun run db:apply`.
4. Seed data: `bun run db:seed`.
5. Run backend: `bun run dev:backend` → listens on `:3000`.

## Endpoints

| Path | Method | Input | Response | Caller |
|---|---|---|---|---|
| `/health` | GET | — | JSON | anyone |
| `/webhook` | POST | `application/x-www-form-urlencoded` (Twilio: `From`, `Body`, …) | TwiML (`text/xml`) | Twilio WhatsApp |
| `/agent/message` | POST | `{fromPhoneE164, messageText}` JSON | `{success, data:{reply, canned}}` | dashboard, curl |
| `/admissions/phase2/intake` | POST | `{schoolId, classroomId, profile, parentUsername?, studentUsername?, generateQuestions?, questionCount?}` JSON | `{success, data:{intake, questionSet?}}` | admissions kiosk frontend |
| `/admissions/phase2/questions` | POST | `{profile, questionCount?}` JSON | `{success, data:{questionSetId, generatedAtIso, model, profile, gradeBand, rationale, questions[]}}` | admissions kiosk frontend |
| `/admissions/phase2/analyze` | POST | `{profile, responses[]}` JSON | `{success, data:{evaluatedAtIso, model, profile, responseCount, analysis}}` | admissions kiosk frontend |

`/webhook` returns TwiML so Twilio auto-sends the reply back to the user — no Twilio API credentials required on the reply path.

## Admissions kiosk payload examples

### 1) Save admissions intake and generate question set

```json
{
    "schoolId": 1,
    "classroomId": 1,
    "profile": {
        "studentName": "Aarav Kumar",
        "parentName": "Neha Kumar",
        "parentPhoneE164": "+919876543210",
        "studentPhoneE164": "+919876543211",
        "currentClass": "Class 6",
        "schoolName": "Sunrise Public School",
        "preferredLanguage": "English"
    },
    "generateQuestions": true,
    "questionCount": 8
}
```

This call writes to `users`, `parent_student_link`, and `classroom_membership` using idempotent upserts.

### 2) Generate class-based questions only (no DB write)

```json
{
    "profile": {
        "studentName": "Aarav Kumar",
        "parentName": "Neha Kumar",
        "parentPhoneE164": "+919876543210",
        "studentPhoneE164": "+919876543211",
        "currentClass": "Class 6",
        "schoolName": "Sunrise Public School",
        "preferredLanguage": "English"
    },
    "questionCount": 8
}
```

### 3) Submit answers for Learning DNA analysis

```json
{
    "profile": {
        "studentName": "Aarav Kumar",
        "parentName": "Neha Kumar",
        "parentPhoneE164": "+919876543210",
        "studentPhoneE164": "+919876543211",
        "currentClass": "Class 6",
        "schoolName": "Sunrise Public School",
        "preferredLanguage": "English"
    },
    "responses": [
        {
            "questionId": "Q1",
            "question": "What is 18 + 7?",
            "competency": "numeracy",
            "answer": "25"
        },
        {
            "questionId": "Q2",
            "question": "Which one is different: mango, banana, carrot, apple? Explain briefly.",
            "competency": "reasoning",
            "answer": "Carrot is different because others are fruits."
        }
    ]
}
```

All admissions endpoints support `MOCK_LLM=true` for deterministic offline outputs during integration.

## Useful commands (from workspace root)

```
bun run dev:backend          # start the HTTP service
bun run db:generate          # schema.ts → SQL
bun run db:apply             # apply SQL to Supabase
bun run db:seed              # deterministic fixtures
bun run typecheck            # typecheck all workspaces
```

## Twilio WhatsApp sandbox wiring

1. In the Twilio console, grab a WhatsApp sandbox number.
2. Expose local port via ngrok: `ngrok http 3000`.
3. Set sandbox "When a message comes in" to `https://<ngrok>/webhook` (POST, HTTP).
4. Join the sandbox by sending the join code from your phone.
5. Ask "what is my sons attendance?" from a seeded phone to see the agent reply.

## Demo phone numbers (seeded)

| Phone | Who | Linked students |
|---|---|---|
| `+912222222222` | Parent Kumar | Arjun + Priya (multi-child) |
| `+913333333333` | Parent Sen | Rahul |
| `+914444444444` | Parent Iyer | Meera |
| `+915555555555` | Student Arjun | self |

These are fake numbers stored in `users.phone_number`. To test with your real WhatsApp number, update the corresponding user row in Supabase.

## Env flags

- `MOCK_LLM=true` — skip Gemini, use deterministic keyword-routed fake LLM
- `GEMINI_API_KEY=...` — required when `MOCK_LLM=false`
- `TWILIO_AUTH_TOKEN=...` — optional, enables signature verification
- `PORT=3000` — backend HTTP port
