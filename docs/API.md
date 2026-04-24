# Campus Cortex — Backend API Reference

Single source of truth for every HTTP endpoint exposed by `@campus/backend`
([apps/backend](../apps/backend)). Use this doc to build the kiosk, teacher
dashboard, or any other frontend client.

- **Last updated** for backend at commit matching: schema + tools + admissions
  Phase 2 (question sets + Learning DNA persistence)
- **Stability**: hackathon MVP — shape will not silently change; anything
  breaking will be called out in this document

---

## 1. Base URL & setup

| Environment | URL |
|---|---|
| Local dev   | `http://localhost:3000` |
| Staging / prod | _TBD — ask backend team_ |

### CORS
Dev server allows **all origins** (`Access-Control-Allow-Origin: *`). Methods:
`GET, POST, OPTIONS`. Headers: `Content-Type, Authorization`. Production will
tighten this to the deployed frontend origin.

### Auth
**None yet.** No tokens, no session cookies, no API keys required on the FE
side. Treat every endpoint as publicly reachable for now. An auth layer will
be added before production — when that happens, every endpoint gets an
`Authorization: Bearer <token>` header (this doc will be updated).

### Content types
| Endpoint | Request `Content-Type` | Response `Content-Type` |
|---|---|---|
| `POST /agent/message` | `application/json` | `application/json` |
| `POST /admissions/phase2/*` | `application/json` | `application/json` |
| `POST /webhook` | `application/x-www-form-urlencoded` (Twilio only) | `application/json` |
| `GET /` / `GET /health` | — | `application/json` |

### Latency budgets
| Endpoint | Typical | Worst case | Why |
|---|---|---|---|
| `GET /health` | <10 ms | <50 ms | DB not touched |
| `POST /agent/message` | 5–10 s | 20 s | 2 LLM calls (tool picker + formatter) + 1–3 SQL roundtrips |
| `POST /admissions/phase2/intake` | 3–8 s | 15 s | DB writes + 1 LLM call for questions |
| `POST /admissions/phase2/questions` | 3–6 s | 12 s | 1 LLM call |
| `POST /admissions/phase2/analyze` | 3–6 s | 12 s | 1 LLM call |

Always render a loading state. If a request exceeds ~20 s, treat as failed and show a retry.

---

## 2. Response envelope

Every JSON endpoint (except `GET /`, `GET /health`, and `POST /webhook`)
follows one of these shapes:

```ts
// Success
{ "success": true, "data": { /* endpoint-specific */ } }

// Failure
{ "success": false, "error": { "code": "<ERROR_CODE>", "message": "<human readable>" } }
```

The outliers:

```ts
// GET /
{ "service": "campus-cortex-backend", "status": "ok" }

// GET /health
{ "success": true, "data": { "status": "ok" } }

// POST /webhook  (Twilio consumes this, but the shape is)
{ "status": "ok" | "ignored", "reply": "<string>", "send": { "kind": "SENT" | "DRY_RUN" | "ERROR", ... } }
```

---

## 3. Error codes

| Code             | Typical HTTP | Meaning | What the FE should do |
|---|---|---|---|
| `INVALID_INPUT`  | 400 | Request body failed Zod validation | Surface the `message` verbatim next to the form field |
| `NOT_FOUND`      | 404 | Referenced school / classroom / student doesn't exist | Show "this school/classroom isn't registered" |
| `UNAUTHORIZED`   | 403 | Classroom belongs to another school, or wrong role | Show "you don't have access to that" |
| `NOT_LINKED`     | 400 | Parent-student link mismatch (internal; bubble up rarely) | Ask user to re-check the child name |
| `AMBIGUOUS_NAME` | 400 | Same name matches multiple linked children | The agent also handles this; show the disambiguation reply |
| `DB_ERROR`       | 500 | Database unreachable or constraint violation | Show "something went wrong, try again"; backoff + retry once |
| `CONFIG_ERROR`   | 500 | Backend missing `GEMINI_API_KEY` | Show generic error; not the user's problem |
| `LLM_ERROR`      | 502 | Gemini returned an error (quota, bad JSON) | Show "AI temporarily unavailable"; allow retry |

All codes are string literals. The FE should treat unknown codes as a generic
500-class error and log them.

---

## 4. Shared types (paste into your FE repo)

These mirror the backend's Zod schemas. Copy verbatim into a `types/api.ts`
file in the frontend.

```ts
// ─── Envelope ───────────────────────────────────────────────────────────────

export type ErrorCode =
  | "INVALID_INPUT"
  | "NOT_FOUND"
  | "UNAUTHORIZED"
  | "NOT_LINKED"
  | "AMBIGUOUS_NAME"
  | "DB_ERROR"
  | "CONFIG_ERROR"
  | "LLM_ERROR";

export type ApiError = { code: ErrorCode; message: string };

export type ApiResult<T> =
  | { success: true; data: T }
  | { success: false; error: ApiError };

// ─── Admissions domain ──────────────────────────────────────────────────────

export type Competency =
  | "numeracy"
  | "reasoning"
  | "language"
  | "observation"
  | "learning-readiness";

export type Difficulty = "easy" | "medium" | "hard";
export type AnswerType = "short_text" | "mcq" | "number";
export type ReadinessBand = "Foundational" | "Developing" | "Proficient" | "Advanced";

/** Student + parent metadata captured by the kiosk intake form. */
export type AdmissionProfile = {
  studentName: string;                // 1–120 chars
  parentName: string;                 // 1–120 chars
  parentPhoneE164: string;            // "+<country><digits>" E.164
  studentPhoneE164?: string;          // optional; required when calling /intake
  currentClass: string;               // e.g. "Class 6"
  schoolName?: string;
  preferredLanguage?: string;         // e.g. "English", "Hindi"
};

/** A single generated admissions question. */
export type AdmissionQuestion = {
  id: string;                         // "Q1", "Q2", ... deterministic within a set
  question: string;                   // 8–400 chars
  competency: Competency;
  difficulty: Difficulty;
  answerType: AnswerType;
  rubricHint: string;                 // guidance for scorers, can be shown to student
};

/** A candidate's answer, submitted back for analysis. */
export type CandidateResponse = {
  questionId: string;                 // must match an AdmissionQuestion.id
  question: string;                   // include the question text for LLM grounding
  competency?: Competency;            // optional; inferred if absent
  answer: string;                     // 1–2000 chars
};

/** The full response from /admissions/phase2/questions (and nested in /intake). */
export type AdmissionsQuestionSet = {
  questionSetId: string;              // UUID v4
  generatedAtIso: string;             // ISO 8601
  model: string;                      // "gemini-2.5-flash" | "mock-admissions-v1"
  profile: AdmissionProfile;
  gradeBand: string;                  // e.g. "middle-school"
  rationale: string;                  // why this set suits this profile
  questions: AdmissionQuestion[];     // 5–12 items
};

/** Per-competency breakdown of a student's performance. */
export type SkillBreakdown = {
  competency: Competency;
  score: number;                      // 0–100
  evidence: string;
};

/** The Learning DNA output that powers the certificate screen. */
export type LearningDnaAnalysis = {
  overallScore: number;               // 0–100
  readinessBand: ReadinessBand;
  summary: string;                    // 24–1000 chars, safe to render as prose
  strengths: string[];                // 2–6 items
  growthAreas: string[];              // 2–6 items
  recommendedActions: string[];       // 3–8 items
  skillBreakdown: SkillBreakdown[];   // 3–5 items
  confidence: number;                 // 0–100
  certificateHeadline: string;        // 6–120 chars; suitable for PDF/certificate hero text
};

/** Response from /admissions/phase2/analyze. */
export type AdmissionsEvaluation = {
  evaluationId: string;               // UUID v4
  evaluatedAtIso: string;             // ISO 8601
  model: string;
  profile: AdmissionProfile;
  responseCount: number;
  analysis: LearningDnaAnalysis;
};

/** DB result from /admissions/phase2/intake (wrapped inside `data.intake`). */
export type UpsertAdmissionsIntakeOutput = {
  schoolId: number;
  schoolName: string;
  classroomId: number;
  classroomName: string;
  parentUserId: number;
  studentUserId: number;
  parentCreated: boolean;             // true = brand new user, false = existing match
  studentCreated: boolean;
  parentStudentLinkCreated: boolean;  // false = link already existed
  classroomEnrollmentCreated: boolean;
  /** Parent/student name changes detected during intake. Kiosk may want to
   *  confirm with the user: "We updated 'Arjun Kumar' to 'Arjun Kapoor'." */
  renamed: Array<{
    userId: number;
    role: "parent" | "student";
    from: string;
    to: string;
  }>;
};

// ─── Agent chat ─────────────────────────────────────────────────────────────

export type AgentCannedReason = "UNKNOWN_SENDER" | "TEACHER_ON_WHATSAPP" | "ERROR" | null;

export type AgentMessageResponse = {
  reply: string;                      // natural-language reply, ready to render
  canned: AgentCannedReason;          // non-null = backend skipped LLM, used a templated refusal
};
```

---

## 5. Endpoints

### 5.1 `GET /`

Service info. Use as a smoke test.

**Response (200):**
```json
{ "service": "campus-cortex-backend", "status": "ok" }
```

---

### 5.2 `GET /health`

Health check. Returns immediately; does not touch the database.

**Response (200):**
```json
{ "success": true, "data": { "status": "ok" } }
```

**FE integration:** use as a reachability probe before boot; if it fails, skip
any API calls and show a "backend offline" banner.

---

### 5.3 `POST /agent/message`

The primary entry point for asking the AI agent about students. Accepts a
phone number + free-form question, returns a natural-language reply.

Used by the **teacher dashboard's test-query widget** and for curl-based
development. WhatsApp itself uses `/webhook` instead (see §5.7).

#### Request

`Content-Type: application/json`

| Field | Type | Required | Constraint | Description |
|---|---|---|---|---|
| `fromPhoneE164` | string | ✓ | E.164 regex `^\+[1-9]\d{7,14}$` | The sender's phone. Must match a `users.phone_number` row — unknown phones get the canned refusal. |
| `messageText`   | string | ✓ | 1–2000 chars | The parent/student's free-form question. |

```json
{
  "fromPhoneE164": "+913333333333",
  "messageText": "how is Rahul doing in math?"
}
```

#### Response

**200 OK** — always, even for unknown senders or out-of-scope questions. Look
at `data.canned` to distinguish.

```ts
ApiResult<AgentMessageResponse>
```

Successful AI answer:
```json
{
  "success": true,
  "data": {
    "reply": "Rahul's Math average is 49% based on the three assessments so far.",
    "canned": null
  }
}
```

Unknown phone:
```json
{
  "success": true,
  "data": {
    "reply": "This number isn't registered with the school. If you believe this is a mistake, please contact the school office.",
    "canned": "UNKNOWN_SENDER"
  }
}
```

#### Error responses
| Status | Code | When |
|---|---|---|
| 400 | `INVALID_INPUT` | Bad phone format or missing `messageText` |

#### cURL
```bash
curl -sX POST http://localhost:3000/agent/message \
  -H 'content-type: application/json' \
  -d '{"fromPhoneE164":"+913333333333","messageText":"how is he in math"}'
```

#### FE integration notes
- Render `data.reply` verbatim in the chat bubble. Do **not** attempt to parse it.
- If `data.canned !== null`, you can style the message differently (e.g. greyed out) since the backend didn't run the real agent.
- Multi-child disambiguation: for a parent linked to multiple children, if they don't name one, the reply will naturally be "Are you asking about Arjun or Priya?" — render it as a normal reply; no special handling needed.
- `MOCK_LLM=true` on the backend prefixes replies with `[mock]` followed by the tool-call JSON. Useful for local dev; don't ship to prod.

---

### 5.4 `POST /admissions/phase2/intake`

Kiosk admissions step 1. Writes (or upserts) the parent + student user rows,
the parent-student link, and classroom enrollment. **Optionally** also
generates a question set bound to the new student.

Atomic: if any DB write fails after a previous write, the whole transaction
rolls back. No orphan rows.

#### Request

`Content-Type: application/json`

| Field | Type | Required | Constraint | Description |
|---|---|---|---|---|
| `schoolId`          | number  | ✓ | positive int | Must exist in `schools` table |
| `classroomId`       | number  | ✓ | positive int | Must belong to the school above |
| `profile.studentName` | string | ✓ | 1–120 chars | |
| `profile.parentName`  | string | ✓ | 1–120 chars | |
| `profile.parentPhoneE164` | string | ✓ | E.164 | |
| `profile.studentPhoneE164` | string | ✓ | E.164 | Required on this endpoint (optional elsewhere) |
| `profile.currentClass` | string | ✓ | 1–40 chars | e.g. "Class 6" |
| `profile.schoolName`   | string | ○ | 1–200 chars | |
| `profile.preferredLanguage` | string | ○ | 2–40 chars | |
| `parentUsername`    | string  | ○ | 3–64 chars | Optional; backend auto-generates slug otherwise |
| `studentUsername`   | string  | ○ | 3–64 chars | |
| `questionCount`     | number  | ○ | 5–12 | Defaults to 8 |
| `generateQuestions` | boolean | ○ | default `true` | Set `false` to skip the LLM question generation |

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
    "schoolName": "Springfield Public School",
    "preferredLanguage": "English"
  },
  "questionCount": 8,
  "generateQuestions": true
}
```

#### Response

**Success path** — intake saved + questions generated:
```ts
ApiResult<{
  intake: UpsertAdmissionsIntakeOutput;
  questionSet: AdmissionsQuestionSet;
}>
```

**Partial success** — intake saved but LLM failed (quota hit, model down):
```ts
ApiResult<{
  intake: UpsertAdmissionsIntakeOutput;
  questionSet: null;
  questionSetError: { code: "LLM_ERROR" | "CONFIG_ERROR"; message: string };
}>
```

Still HTTP 200. **This is the most important partial-success pattern in the API** — the kiosk should check `questionSet === null` and offer a "Retry questions" button that hits §5.5.

**Skipped questions** (`generateQuestions: false`):
```json
{
  "success": true,
  "data": {
    "intake": { ... },
    "questionSet": null
  }
}
```

#### Error responses
| Status | Code | When |
|---|---|---|
| 400 | `INVALID_INPUT` | Zod validation failed, or parent/student name blank, or phone already used by a different role |
| 404 | `NOT_FOUND` | `schoolId` or `classroomId` doesn't exist |
| 403 | `UNAUTHORIZED` | Classroom belongs to a different school |
| 500 | `DB_ERROR` | Unexpected drizzle/Postgres error |

#### cURL
```bash
curl -sX POST http://localhost:3000/admissions/phase2/intake \
  -H 'content-type: application/json' \
  -d '{
    "schoolId": 1,
    "classroomId": 1,
    "profile": {
      "studentName": "Aarav Kumar",
      "parentName": "Neha Kumar",
      "parentPhoneE164": "+919876543210",
      "studentPhoneE164": "+919876543211",
      "currentClass": "Class 6"
    }
  }'
```

#### FE integration notes
- Capture `data.intake.studentUserId` and `data.intake.schoolId` — you'll pass them into §5.5 / §5.6 for persistence.
- Show the renamed buffer: if `data.intake.renamed.length > 0`, display "We updated the name from 'X' to 'Y'." so the parent can catch typos.
- Treat `questionSetError` as non-fatal: the intake is saved, so the kiosk can let the family continue and retry questions later.

---

### 5.5 `POST /admissions/phase2/questions`

Generates a question set for a given profile. Use when you already did intake
(or want a preview without intake) and want a fresh set of questions.

#### Request

`Content-Type: application/json`

| Field | Type | Required | Description |
|---|---|---|---|
| `profile` | `AdmissionProfile` | ✓ | Same shape as §5.4, but `studentPhoneE164` is optional here |
| `questionCount` | number | ○ | 5–12, default 8 |
| `schoolId` | number | ○ | Supply with `studentId` to persist the set to DB |
| `studentId` | number | ○ | Supply with `schoolId` to persist the set to DB |

**Persistence rule:** the set is written to `admissions_question_sets` only
if **both** `schoolId` and `studentId` are present. If either is missing the
questions are returned in memory only.

```json
{
  "profile": {
    "studentName": "Aarav Kumar",
    "parentName": "Neha Kumar",
    "parentPhoneE164": "+919876543210",
    "currentClass": "Class 6"
  },
  "questionCount": 6,
  "schoolId": 1,
  "studentId": 42
}
```

#### Response

**200 OK**
```ts
ApiResult<AdmissionsQuestionSet>
```

Example `data`:
```json
{
  "questionSetId": "a3896398-1d5d-4077-9673-2f63ec3cb541",
  "generatedAtIso": "2026-04-25T04:32:11.987Z",
  "model": "gemini-2.5-flash",
  "profile": { ... },
  "gradeBand": "middle-school",
  "rationale": "Questions cover arithmetic, reasoning, reading comprehension, and learning-readiness with progressive difficulty for a Class 6 intake.",
  "questions": [
    {
      "id": "Q1",
      "question": "If a notebook costs 35 rupees, what is the total cost of 4 notebooks?",
      "competency": "numeracy",
      "difficulty": "easy",
      "answerType": "number",
      "rubricHint": "Checks basic multiplication fluency."
    }
  ]
}
```

#### Error responses
| Status | Code | When |
|---|---|---|
| 400 | `INVALID_INPUT` | Profile invalid, questionCount out of range |
| 500 | `CONFIG_ERROR` | Backend missing `GEMINI_API_KEY` |
| 502 | `LLM_ERROR` | Gemini returned non-200 or malformed JSON |

#### cURL
```bash
curl -sX POST http://localhost:3000/admissions/phase2/questions \
  -H 'content-type: application/json' \
  -d '{
    "profile": {
      "studentName": "Aarav Kumar",
      "parentName": "Neha Kumar",
      "parentPhoneE164": "+919876543210",
      "currentClass": "Class 6"
    }
  }'
```

#### FE integration notes
- Save `questionSetId` in kiosk state — you pass it to §5.6 for linkage.
- Questions are ordered; render them in array order.
- `answerType` tells you which input control to show (text input, multi-choice, number pad).
- `rubricHint` is primarily for scorer context. Do **not** show it to the student — it gives away the answer criteria.

---

### 5.6 `POST /admissions/phase2/analyze`

Runs Learning-DNA analysis on the candidate's answers. Returns a structured
evaluation suitable for a certificate screen.

#### Request

`Content-Type: application/json`

| Field | Type | Required | Description |
|---|---|---|---|
| `profile` | `AdmissionProfile` | ✓ | Same as §5.4/§5.5 |
| `responses` | `CandidateResponse[]` | ✓ | 1–20 items |
| `schoolId` | number | ○ | Together with `studentId`, persists the evaluation |
| `studentId` | number | ○ | Together with `schoolId`, persists the evaluation |
| `questionSetId` | string (UUID) | ○ | Links the evaluation back to the originating set |

```json
{
  "profile": {
    "studentName": "Aarav Kumar",
    "parentName": "Neha Kumar",
    "parentPhoneE164": "+919876543210",
    "currentClass": "Class 6"
  },
  "responses": [
    {
      "questionId": "Q1",
      "question": "If a notebook costs 35 rupees, what is the total cost of 4 notebooks?",
      "competency": "numeracy",
      "answer": "140"
    },
    {
      "questionId": "Q2",
      "question": "Write 3 sentences about your favorite game.",
      "competency": "language",
      "answer": "I love playing cricket on weekends..."
    }
  ],
  "schoolId": 1,
  "studentId": 42,
  "questionSetId": "a3896398-1d5d-4077-9673-2f63ec3cb541"
}
```

#### Response

**200 OK**
```ts
ApiResult<AdmissionsEvaluation>
```

Example `data`:
```json
{
  "evaluationId": "55beb6ce-4c41-4bce-97bc-ed2c1c37a574",
  "evaluatedAtIso": "2026-04-25T04:41:22.123Z",
  "model": "gemini-2.5-flash",
  "profile": { ... },
  "responseCount": 2,
  "analysis": {
    "overallScore": 72,
    "readinessBand": "Proficient",
    "summary": "Aarav shows solid numeracy fundamentals and clear written expression. Reasoning and observation are steady but would benefit from targeted practice.",
    "strengths": [
      "Confident basic arithmetic",
      "Clear sentence construction"
    ],
    "growthAreas": [
      "Multi-step reasoning",
      "Careful observation before answering"
    ],
    "recommendedActions": [
      "Daily 15-minute reasoning-puzzle practice",
      "Weekly short essay on a chosen topic",
      "Observation journal once a week"
    ],
    "skillBreakdown": [
      { "competency": "numeracy", "score": 80, "evidence": "Correctly solved the multiplication problem with clear working." },
      { "competency": "language", "score": 75, "evidence": "Wrote 3 coherent sentences on a familiar topic." },
      { "competency": "reasoning", "score": 62, "evidence": "Partial evidence from the one logic-style question answered." }
    ],
    "confidence": 78,
    "certificateHeadline": "Aarav Kumar: Proficient Learning DNA Profile"
  }
}
```

#### Error responses
| Status | Code | When |
|---|---|---|
| 400 | `INVALID_INPUT` | Empty responses, >20 responses, missing required profile fields |
| 500 | `CONFIG_ERROR` | Missing `GEMINI_API_KEY` |
| 502 | `LLM_ERROR` | Gemini failed or returned malformed JSON |

#### cURL
```bash
curl -sX POST http://localhost:3000/admissions/phase2/analyze \
  -H 'content-type: application/json' \
  -d '{
    "profile": {
      "studentName": "Aarav Kumar",
      "parentName": "Neha Kumar",
      "parentPhoneE164": "+919876543210",
      "currentClass": "Class 6"
    },
    "responses": [
      {"questionId": "Q1", "question": "What is 18 + 7?", "competency": "numeracy", "answer": "25"}
    ]
  }'
```

#### FE integration notes
- `analysis.certificateHeadline` is safe to use as a big hero line on the
  certificate screen / PDF.
- `skillBreakdown` is ideal for a radar chart or horizontal bar chart.
- `confidence` is the model's self-reported confidence in its own analysis —
  consider showing it in a tooltip, not as a primary metric.
- If you want to re-show the evaluation later, keep `evaluationId` locally.
  A "fetch latest evaluation for student" endpoint exists server-side
  (`getLatestAdmissionsEvaluation`) but is not yet exposed over HTTP — ping
  the backend team if you need it.

---

### 5.7 `POST /webhook`  (internal, not for FE)

Twilio's inbound WhatsApp webhook lands here. The FE should **never** call it
directly. Documented only for completeness.

- Content-type: `application/x-www-form-urlencoded`
- Key fields: `From` (`whatsapp:+91...`), `Body` (message text), `ProfileName`, `MessageSid`
- Response: `{ "status": "ok", "reply": "<string>", "send": { "kind": "SENT" | "DRY_RUN" | "ERROR", "sid"?: string, "message"?: string } }`
- Side effects: runs the agent, runs the formatter, sends an outbound Twilio message back to the sender

---

## 6. Frontend integration notes (cross-cutting)

### Phone number validation
Any field the backend labels `E164` must match this regex:

```ts
const E164 = /^\+[1-9]\d{7,14}$/;
```

- Starts with `+`, then a non-zero country code, then 7–14 more digits
- Total length 9–16 characters including the `+`
- **No** spaces, dashes, or parentheses
- Use a phone-input component that normalises user input before submit

### Multi-child parent handling
When a parent is linked to multiple students, the backend is smart about
disambiguation:

- If the parent names a child in the message ("how is Arjun doing?"), the
  agent resolves it against that parent's **own** linked children — no FE
  work required
- If the parent doesn't name a child ("how is my son?"), the agent returns a
  reply asking which child — render it normally. The kiosk / dashboard UI
  doesn't need a custom modal

The LLM cannot be tricked into selecting another parent's child — all
resolution is server-side.

### Partial-success pattern (§5.4)
This is unique among the endpoints. Pseudocode:

```ts
const res = await fetch("/admissions/phase2/intake", { ... }).then(r => r.json());
if (!res.success) { showError(res.error); return; }

showIntakeSuccess(res.data.intake);

if (res.data.questionSet) {
  showQuestions(res.data.questionSet);
} else if (res.data.questionSetError) {
  showRetryButton(() =>
    fetch("/admissions/phase2/questions", {
      method: "POST",
      body: JSON.stringify({
        profile: formProfile,
        schoolId: res.data.intake.schoolId,
        studentId: res.data.intake.studentUserId,
      }),
    })
  );
}
```

### UUIDs
Both `questionSetId` and `evaluationId` are **UUID v4**. Safe to treat as
opaque strings. Don't parse them.

### Enums to mirror in the FE
Copy these into a dropdown / select component as needed:

- `competency`: `numeracy | reasoning | language | observation | learning-readiness`
- `difficulty`: `easy | medium | hard`
- `answerType`: `short_text | mcq | number`
- `readinessBand`: `Foundational | Developing | Proficient | Advanced`

### Mock mode
Backend `.env` supports `MOCK_LLM=true`. When set:

- `POST /agent/message` returns a `[mock] tool_name → {...json...}` string
- `POST /admissions/phase2/*` returns deterministic hand-written questions / scores
- `model` field in responses says `mock-admissions-v1` instead of `gemini-2.5-flash`

Don't try to pretty-print the `[mock]` output on `/agent/message` — the format
is for developers. When `MOCK_LLM=false`, real Gemini replies are already
clean and display-ready.

### Teacher-dashboard write paths (not HTTP)
The teacher-side operations (`insertAttendanceBatch`, `insertGradesBatch`,
`createAssignment`, `createClassroom`, `enrollStudent`) are **not** exposed
over HTTP. They're exported from `@campus/agent/db` for direct import — only
meaningful if the dashboard lives in the same Bun workspace as the backend.
If the dashboard is a separate web app, flag this to the backend team and
they will add the corresponding endpoints.

---

## 7. cURL cookbook

All commands below assume the dev server is running (`bun run dev:backend`
from the workspace root) and the DB is seeded (`bun run db:seed`).

### Smoke tests
```bash
curl -s http://localhost:3000/
curl -s http://localhost:3000/health
```

### Agent — single-child parent
```bash
curl -sX POST http://localhost:3000/agent/message \
  -H 'content-type: application/json' \
  -d '{"fromPhoneE164":"+913333333333","messageText":"how is he in math"}'
```

### Agent — multi-child parent, disambiguation
```bash
curl -sX POST http://localhost:3000/agent/message \
  -H 'content-type: application/json' \
  -d '{"fromPhoneE164":"+912222222222","messageText":"how is my child doing?"}'
```

### Agent — unknown phone (canned reply)
```bash
curl -sX POST http://localhost:3000/agent/message \
  -H 'content-type: application/json' \
  -d '{"fromPhoneE164":"+10000000000","messageText":"hi"}'
```

### Agent — bad input (400)
```bash
curl -sX POST http://localhost:3000/agent/message \
  -H 'content-type: application/json' \
  -d '{"fromPhoneE164":"1234","messageText":""}'
```

### Admissions — full kiosk flow
```bash
# Step 1: intake + generate questions
INTAKE=$(curl -sX POST http://localhost:3000/admissions/phase2/intake \
  -H 'content-type: application/json' \
  -d '{
    "schoolId": 1,
    "classroomId": 1,
    "profile": {
      "studentName": "Aarav Kumar",
      "parentName": "Neha Kumar",
      "parentPhoneE164": "+919999900001",
      "studentPhoneE164": "+919999900002",
      "currentClass": "Class 6"
    }
  }')
echo "$INTAKE" | jq .

STUDENT_ID=$(echo "$INTAKE" | jq -r '.data.intake.studentUserId')
QUESTION_SET_ID=$(echo "$INTAKE" | jq -r '.data.questionSet.questionSetId')

# Step 2 (only if questionSet was null): regenerate questions
# curl -sX POST http://localhost:3000/admissions/phase2/questions ...

# Step 3: submit answers for Learning DNA
curl -sX POST http://localhost:3000/admissions/phase2/analyze \
  -H 'content-type: application/json' \
  -d "{
    \"profile\": {
      \"studentName\": \"Aarav Kumar\",
      \"parentName\": \"Neha Kumar\",
      \"parentPhoneE164\": \"+919999900001\",
      \"currentClass\": \"Class 6\"
    },
    \"responses\": [
      {\"questionId\":\"Q1\",\"question\":\"What is 18 + 7?\",\"competency\":\"numeracy\",\"answer\":\"25\"},
      {\"questionId\":\"Q2\",\"question\":\"Which is different: mango, banana, carrot, apple?\",\"competency\":\"reasoning\",\"answer\":\"Carrot is different because others are fruits.\"}
    ],
    \"schoolId\": 1,
    \"studentId\": $STUDENT_ID,
    \"questionSetId\": \"$QUESTION_SET_ID\"
  }"
```

---

## 8. Seeded phone numbers for quick testing

| Phone | Role | Linked students |
|---|---|---|
| `+911111111111` | teacher (Anita Sharma) | — |
| `+912222222222` | parent (Ramesh Kumar) | Arjun Kumar + Priya Kumar |
| `+913333333333` | parent (Shreya Sen) | Rahul Sen |
| `+914444444444` | parent (Lakshmi Iyer) | Meera Iyer |
| `+915555555555` | student (Arjun Kumar) | self |

Use `+913333333333` for single-child parent demos and `+912222222222` to
trigger the multi-child disambiguation path.

---

## 9. Questions or gaps?

If something in this document doesn't match the backend's actual behaviour,
the backend is the source of truth — file an issue or ping the backend team.
This doc will be updated each time a route changes.
