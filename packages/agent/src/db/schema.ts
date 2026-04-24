import {
  bigserial,
  pgEnum,
  pgTable,
  text,
  timestamp,
  bigint,
  uniqueIndex,
  index,
  date,
  numeric,
  jsonb,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const userRoleEnum = pgEnum("user_role", ["student", "parent", "teacher"]);

export const attendanceStatusEnum = pgEnum("attendance_status", [
  "PRESENT",
  "ABSENT",
  "LATE",
]);

export const assignmentTypeEnum = pgEnum("assignment_type", [
  "HOMEWORK",
  "QUIZ",
  "TEST",
]);

// ---------------------------------------------------------------------------
// Core identity: schools, users, parent_student_link
// ---------------------------------------------------------------------------

export const schools = pgTable("schools", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable(
  "users",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    schoolId: bigint("school_id", { mode: "number" })
      .notNull()
      .references(() => schools.id, { onDelete: "restrict" }),
    username: text("username").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: userRoleEnum("role").notNull(),
    phoneNumber: text("phone_number").notNull(),
    fullName: text("full_name").notNull(),
    // NULL = the user has no real password yet (kiosk-created). Whenever a
    // login flow is added, mark this timestamp the moment the parent/student
    // sets a credential. `isPasswordSet(user)` in queries/students.ts is the
    // idiomatic check.
    passwordSetAt: timestamp("password_set_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    usernamePerSchool: uniqueIndex("users_school_username_unique").on(t.schoolId, t.username),
    phoneLookup: index("users_school_phone_idx").on(t.schoolId, t.phoneNumber),
    roleLookup: index("users_school_role_idx").on(t.schoolId, t.role),
  }),
);

export const parentStudentLink = pgTable(
  "parent_student_link",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    parentId: bigint("parent_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    studentId: bigint("student_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    parentStudentUnique: uniqueIndex("parent_student_link_unique").on(t.parentId, t.studentId),
    parentLookup: index("parent_student_link_parent_idx").on(t.parentId),
    studentLookup: index("parent_student_link_student_idx").on(t.studentId),
  }),
);

// ---------------------------------------------------------------------------
// Classrooms & enrollment
// ---------------------------------------------------------------------------

export const classrooms = pgTable(
  "classrooms",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    schoolId: bigint("school_id", { mode: "number" })
      .notNull()
      .references(() => schools.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    teacherId: bigint("teacher_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    schoolLookup: index("classrooms_school_idx").on(t.schoolId),
    teacherLookup: index("classrooms_teacher_idx").on(t.teacherId),
  }),
);

export const classroomMembership = pgTable(
  "classroom_membership",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    classroomId: bigint("classroom_id", { mode: "number" })
      .notNull()
      .references(() => classrooms.id, { onDelete: "cascade" }),
    studentId: bigint("student_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    enrolledAt: timestamp("enrolled_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqueMembership: uniqueIndex("classroom_membership_unique").on(t.classroomId, t.studentId),
    studentLookup: index("classroom_membership_student_idx").on(t.studentId),
  }),
);

// ---------------------------------------------------------------------------
// Attendance: one session per classroom per day
// ---------------------------------------------------------------------------

export const classSession = pgTable(
  "class_session",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    classroomId: bigint("classroom_id", { mode: "number" })
      .notNull()
      .references(() => classrooms.id, { onDelete: "cascade" }),
    sessionDate: date("session_date").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqueSession: uniqueIndex("class_session_classroom_date_unique").on(
      t.classroomId,
      t.sessionDate,
    ),
    dateLookup: index("class_session_date_idx").on(t.sessionDate),
  }),
);

export const attendance = pgTable(
  "attendance",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    studentId: bigint("student_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sessionId: bigint("session_id", { mode: "number" })
      .notNull()
      .references(() => classSession.id, { onDelete: "cascade" }),
    status: attendanceStatusEnum("status").notNull(),
    markedBy: bigint("marked_by", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    markedAt: timestamp("marked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqueAttendance: uniqueIndex("attendance_student_session_unique").on(
      t.studentId,
      t.sessionId,
    ),
    studentLookup: index("attendance_student_idx").on(t.studentId),
    sessionLookup: index("attendance_session_idx").on(t.sessionId),
  }),
);

// ---------------------------------------------------------------------------
// Assignments & submissions
// ---------------------------------------------------------------------------

export const assignments = pgTable(
  "assignments",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    classroomId: bigint("classroom_id", { mode: "number" })
      .notNull()
      .references(() => classrooms.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    subject: text("subject").notNull(),
    type: assignmentTypeEnum("type").notNull(),
    maxScore: numeric("max_score", { precision: 8, scale: 2 }).notNull(),
    dueDate: timestamp("due_date", { withTimezone: true }).notNull(),
    createdBy: bigint("created_by", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    classroomLookup: index("assignments_classroom_idx").on(t.classroomId),
    dueDateLookup: index("assignments_due_date_idx").on(t.dueDate),
    subjectLookup: index("assignments_subject_idx").on(t.subject),
  }),
);

export const assignmentSubmission = pgTable(
  "assignment_submission",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    assignmentId: bigint("assignment_id", { mode: "number" })
      .notNull()
      .references(() => assignments.id, { onDelete: "cascade" }),
    studentId: bigint("student_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    score: numeric("score", { precision: 8, scale: 2 }).notNull(),
    percentage: numeric("percentage", { precision: 6, scale: 2 }).notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqueSubmission: uniqueIndex("assignment_submission_unique").on(
      t.assignmentId,
      t.studentId,
    ),
    studentLookup: index("assignment_submission_student_idx").on(t.studentId),
    assignmentLookup: index("assignment_submission_assignment_idx").on(t.assignmentId),
  }),
);

// ---------------------------------------------------------------------------
// Admissions Phase 2 — persisted question sets + Learning DNA evaluations.
//
// Both tables use text-typed UUID primary keys (generated in app code via
// crypto.randomUUID()). student_id / school_id are nullable so "anonymous
// preview" flows can still persist history if desired — and so cascading
// user deletions don't wipe audit trails.
// ---------------------------------------------------------------------------

export const admissionsQuestionSets = pgTable(
  "admissions_question_sets",
  {
    id: text("id").primaryKey(), // UUID v4
    schoolId: bigint("school_id", { mode: "number" }).references(() => schools.id, {
      onDelete: "set null",
    }),
    studentId: bigint("student_id", { mode: "number" }).references(() => users.id, {
      onDelete: "set null",
    }),
    parentPhoneE164: text("parent_phone_e164"),
    studentName: text("student_name").notNull(),
    profile: jsonb("profile").notNull(), // full AdmissionProfile snapshot
    gradeBand: text("grade_band").notNull(),
    rationale: text("rationale").notNull(),
    questions: jsonb("questions").notNull(), // array of AdmissionQuestion
    model: text("model").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    studentLookup: index("admissions_question_sets_student_idx").on(t.studentId),
    phoneLookup: index("admissions_question_sets_parent_phone_idx").on(t.parentPhoneE164),
    createdLookup: index("admissions_question_sets_created_idx").on(t.createdAt),
  }),
);

export const admissionsEvaluations = pgTable(
  "admissions_evaluations",
  {
    id: text("id").primaryKey(), // UUID v4
    schoolId: bigint("school_id", { mode: "number" }).references(() => schools.id, {
      onDelete: "set null",
    }),
    studentId: bigint("student_id", { mode: "number" }).references(() => users.id, {
      onDelete: "set null",
    }),
    questionSetId: text("question_set_id").references(() => admissionsQuestionSets.id, {
      onDelete: "set null",
    }),
    parentPhoneE164: text("parent_phone_e164"),
    studentName: text("student_name").notNull(),
    profile: jsonb("profile").notNull(),
    responses: jsonb("responses").notNull(), // array of CandidateResponse
    analysis: jsonb("analysis").notNull(), // full LearningDnaAnalysis
    // Mirrored scalars for cheap dashboards / sort / filter without jsonb digs.
    overallScore: numeric("overall_score", { precision: 5, scale: 2 }).notNull(),
    readinessBand: text("readiness_band").notNull(),
    model: text("model").notNull(),
    // Public URL of the generated Learning DNA certificate PDF. Populated
    // post-evaluation when PDF generation + upload succeeds; stays NULL on
    // failure (evaluation is still valid, just without a certificate link).
    certificateUrl: text("certificate_url"),
    evaluatedAt: timestamp("evaluated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    studentLookup: index("admissions_evaluations_student_idx").on(t.studentId),
    phoneLookup: index("admissions_evaluations_parent_phone_idx").on(t.parentPhoneE164),
    evaluatedLookup: index("admissions_evaluations_evaluated_idx").on(t.evaluatedAt),
    questionSetLookup: index("admissions_evaluations_question_set_idx").on(t.questionSetId),
  }),
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const schoolsRelations = relations(schools, ({ many }) => ({
  users: many(users),
  classrooms: many(classrooms),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  school: one(schools, { fields: [users.schoolId], references: [schools.id] }),
  linkedChildren: many(parentStudentLink, { relationName: "parent" }),
  linkedParents: many(parentStudentLink, { relationName: "student" }),
  memberships: many(classroomMembership),
}));

export const parentStudentLinkRelations = relations(parentStudentLink, ({ one }) => ({
  parent: one(users, {
    fields: [parentStudentLink.parentId],
    references: [users.id],
    relationName: "parent",
  }),
  student: one(users, {
    fields: [parentStudentLink.studentId],
    references: [users.id],
    relationName: "student",
  }),
}));

export const classroomsRelations = relations(classrooms, ({ one, many }) => ({
  school: one(schools, { fields: [classrooms.schoolId], references: [schools.id] }),
  teacher: one(users, { fields: [classrooms.teacherId], references: [users.id] }),
  memberships: many(classroomMembership),
  sessions: many(classSession),
  assignments: many(assignments),
}));

export const classroomMembershipRelations = relations(classroomMembership, ({ one }) => ({
  classroom: one(classrooms, {
    fields: [classroomMembership.classroomId],
    references: [classrooms.id],
  }),
  student: one(users, {
    fields: [classroomMembership.studentId],
    references: [users.id],
  }),
}));

export const classSessionRelations = relations(classSession, ({ one, many }) => ({
  classroom: one(classrooms, {
    fields: [classSession.classroomId],
    references: [classrooms.id],
  }),
  attendance: many(attendance),
}));

export const attendanceRelations = relations(attendance, ({ one }) => ({
  student: one(users, { fields: [attendance.studentId], references: [users.id] }),
  session: one(classSession, {
    fields: [attendance.sessionId],
    references: [classSession.id],
  }),
  markedByUser: one(users, { fields: [attendance.markedBy], references: [users.id] }),
}));

export const assignmentsRelations = relations(assignments, ({ one, many }) => ({
  classroom: one(classrooms, {
    fields: [assignments.classroomId],
    references: [classrooms.id],
  }),
  createdByUser: one(users, { fields: [assignments.createdBy], references: [users.id] }),
  submissions: many(assignmentSubmission),
}));

export const assignmentSubmissionRelations = relations(assignmentSubmission, ({ one }) => ({
  assignment: one(assignments, {
    fields: [assignmentSubmission.assignmentId],
    references: [assignments.id],
  }),
  student: one(users, {
    fields: [assignmentSubmission.studentId],
    references: [users.id],
  }),
}));

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type School = typeof schools.$inferSelect;
export type NewSchool = typeof schools.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type ParentStudentLink = typeof parentStudentLink.$inferSelect;
export type NewParentStudentLink = typeof parentStudentLink.$inferInsert;
export type Classroom = typeof classrooms.$inferSelect;
export type NewClassroom = typeof classrooms.$inferInsert;
export type ClassroomMembership = typeof classroomMembership.$inferSelect;
export type NewClassroomMembership = typeof classroomMembership.$inferInsert;
export type ClassSession = typeof classSession.$inferSelect;
export type NewClassSession = typeof classSession.$inferInsert;
export type Attendance = typeof attendance.$inferSelect;
export type NewAttendance = typeof attendance.$inferInsert;
export type Assignment = typeof assignments.$inferSelect;
export type NewAssignment = typeof assignments.$inferInsert;
export type AssignmentSubmission = typeof assignmentSubmission.$inferSelect;
export type NewAssignmentSubmission = typeof assignmentSubmission.$inferInsert;

// Renamed to *Row to avoid colliding with the richer domain types exported
// from packages/agent/src/admissions/phase2.ts (AdmissionsQuestionSet,
// AdmissionsEvaluation).
export type AdmissionsQuestionSetRow = typeof admissionsQuestionSets.$inferSelect;
export type NewAdmissionsQuestionSetRow = typeof admissionsQuestionSets.$inferInsert;
export type AdmissionsEvaluationRow = typeof admissionsEvaluations.$inferSelect;
export type NewAdmissionsEvaluationRow = typeof admissionsEvaluations.$inferInsert;
