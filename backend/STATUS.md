# Backend status

## Architecture (current)

- **9 raw tables** are the single source of truth. No caching layer, no DNA
  materialised row. Raw inserts at write time, SQL aggregations on read.
- **Write path**: teacher dashboard → `insertAttendanceBatch` / `insertGradesBatch`
  → raw INSERT/UPSERT. That's it — no side effects.
- **Read path**: AI agent intent → one `analytics.ts` function → one
  well-structured SQL query → typed JSON object → LLM composes WhatsApp reply.
- **Always fresh.** Zero sync complexity. The tradeoff is that each parent
  question runs one or two aggregation queries instead of a cached lookup —
  fine at hackathon scale (≤ few thousand students, dozens of QPS).

```
TEACHER WRITES                      AI AGENT READS
  Dashboard                           WhatsApp msg
    |                                     |
    v                                     v
insertAttendanceBatch               graph.invoke(state)
insertGradesBatch                         |
    |                                     v
    v                             analytics.getXxx(...)
  [raw tables] <──── one complex ────┤
                       SQL query
                                      typed object
                                          |
                                          v
                                   LLM composes reply
```

## Tables (9)

| Table | Purpose |
|---|---|
| `schools` | School isolation boundary |
| `users` | Humans (role: student / parent / teacher), phone in E.164 |
| `parent_student_link` | Verified parent↔student (unique per pair) |
| `classrooms` | Teacher-owned classrooms |
| `classroom_membership` | Student↔classroom enrolment |
| `class_session` | One row per classroom per day, unique `(classroom_id, session_date)` |
| `attendance` | One row per `(student_id, session_id)`, status enum |
| `assignments` | Title, subject (text), type enum, max_score, due_date |
| `assignment_submission` | One row per `(assignment_id, student_id)`, score + precomputed % |

## Write layer (faculty actions)

- [src/db/queries/classrooms.ts](src/db/queries/classrooms.ts) — `createClassroom`,
  `enrollStudent`, `getPrimaryClassroomId`, `getStudentsInClassroom`,
  `getTeacherClassrooms`, `classroomBelongsToSchool`
- [src/db/queries/attendance.ts](src/db/queries/attendance.ts) —
  `upsertClassSession`, `insertAttendanceBatch` (validates enrolment + school
  isolation, idempotent upsert)
- [src/db/queries/grades.ts](src/db/queries/grades.ts) — `createAssignment`,
  `insertGradesBatch` (server-side percentage calc, idempotent)
- [src/db/queries/students.ts](src/db/queries/students.ts) —
  `getSenderContextByPhone`, `resolveStudentFromName`, `canCallerAccessStudent`,
  `getStudentIdentity*`

## Read layer (agent-facing analytics) — NEW

One file, one function per question category from `QUESTION_SCENARIOS_DATABASE_ANALYSIS.md`:

[src/db/queries/analytics.ts](src/db/queries/analytics.ts)

| Function | Answers questions like | Complexity |
|---|---|---|
| `getAttendanceToday(studentId)` | "Was Arjun present today?" | LEFT JOIN to today's session |
| `getAttendanceSummary({studentId, from?, to?})` | "attendance %", "last month's attendance" | `COUNT FILTER` aggregate with optional date range |
| `getAttendanceByDateRange({studentId, from, to})` | "Monday", "last week" | Per-day list |
| `getRecentGrades({studentId, limit?})` | "recent scores" | ORDER BY submitted_at DESC |
| `getSubjectPerformance({studentId, subject})` | "how in Math?", "Math average" | Aggregate + recent list, ILIKE on subject |
| `getAllSubjectsPerformance(studentId)` | "best/weakest subject", "grades for all subjects" | GROUP BY subject |
| `getClassComparison({studentId, classroomId, subject?})` | "above class average?", "rank?" | WINDOW RANK() CTE |
| `getGradeTrend({studentId, subject?})` | "is he improving?" | NTILE(2) split, earlier vs recent avg |
| `findSubmissionsByTitle({studentId, titlePattern})` | "Math Quiz 1?" | ILIKE on title |
| `getUpcomingAssignments({studentId, days?, limit?})` | "what's due tomorrow?" | NOT EXISTS join |
| `getPendingAssignments({studentId, includeOverdue?})` | "anything pending?" | NOT EXISTS + overdue calc |
| `getStudentOverview(studentId)` | "how is my son?" (vague/holistic) | **Compound CTE query** covering attendance + academics + pending in one round-trip, plus 3 helper calls for subject breakdown / recent / upcoming |
| `getChildrenSummaryForParent(parentId)` | "how are both my kids?" | Single CTE joining linked children with all metrics |

**Conventions every analytics function follows:**
- Takes `studentId` (and sometimes `classroomId` / subject / date range).
- Returns `Result<T>` with camelCase fields.
- Numbers as `number`, dates as ISO strings, status as enum literal union.
- Zero-data returns sensible nulls (not zeros) where a null is meaningful:
  `attendancePct = null` when `totalSessions = 0`.
- All SQL uses parameterised `sql` template — no string interpolation.

## Edge cases handled across read + write

- Student with no attendance → null percentages (not divide-by-zero)
- Student with no submissions → null averages, empty arrays
- Student not in any classroom → empty pending/upcoming, still returns overview
- Two teachers writing same session/grade → unique + ON CONFLICT UPDATE
- Score > max_score allowed (bonus); score < 0 rejected
- Subject fuzzy match via `ILIKE '%pattern%'`
- School isolation: every write validates school_id; every read takes student_id
  which the agent resolves to school context in `students.ts`
- Trend with < 3 submissions → `direction: "insufficient_data"` instead of noise
- Class comparison when student has no submissions → `rank: null`

## What the agent does with all this

For a parent question, the agent's flow is now:

```
1. loadContext       → getSenderContextByPhone(phone)
                       resolves to userId + linkedStudents
2. classifyIntent    → Gemini: ACADEMIC | ATTENDANCE | RESULT | VAGUE | SUPPORT
3. extractEntities   → Gemini: {childName?, subject?, dateRange?, metricKind}
4. resolveStudent    → resolveStudentFromName(linked, childName)
5. planTools         → map metricKind → one of the analytics.ts functions
6. runTools          → execute the SQL, get typed object
7. compose           → Gemini reads object + question, returns 1-3 sentences
```

The LLM sees structured JSON, never raw SQL or strings. Compose prompt should:
- Never invent numbers not present in the returned object.
- If `submissionsCount` or `totalSessions` is very low, acknowledge early-days data.
- If any field is `null`, say so explicitly ("no data yet") instead of saying "0%".

## Infrastructure / tooling

- Bun + TypeScript strict
- Drizzle ORM 0.45, postgres-js (`prepare: false`, Supabase-pooler safe)
- `bun run db:generate` — schema.ts → SQL under `drizzle/`
- `bun run db:apply` — applies migration SQL directly via postgres-js (bypasses
  drizzle-kit push's introspection bug on Supabase's public schema)
- `bun run typecheck` — **green** ✅
- 9 tables live on Supabase ✅

## What's next

1. **Seed data** — 3 schools, 1 teacher each, 2 classrooms each, ~10 students,
   5 parents with verified links, attendance rows, assignments, submissions.
2. **Agent layer** — LangGraph JS graph with Gemini, nodes from §"What the
   agent does" above, each tool wrapping one analytics function.
3. **HTTP layer** — Hono routes:
   - `POST /agent/message` — WhatsApp webhook entry
   - `POST /triggers/proactive` — 8 AM / 6 PM / weekly scheduler entry
   - dashboard-facing write endpoints
4. **Prompts** — `classifyIntent.md`, `extractEntities.md`, `compose.md`.

## Key files

- [src/db/schema.ts](src/db/schema.ts) — 9 tables, no DNA
- [src/db/queries/analytics.ts](src/db/queries/analytics.ts) — **read-side
  analytics (agent tool surface)**
- [src/db/queries/attendance.ts](src/db/queries/attendance.ts) — write path
- [src/db/queries/grades.ts](src/db/queries/grades.ts) — write path
- [src/db/queries/classrooms.ts](src/db/queries/classrooms.ts) — setup
- [src/db/queries/students.ts](src/db/queries/students.ts) — sender resolution
- [src/db/apply-migrations.ts](src/db/apply-migrations.ts) — drizzle-kit push workaround
