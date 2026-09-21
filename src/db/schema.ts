import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { sql as drizzleSql } from 'drizzle-orm';
export * from './auth-schema';

import { user } from './auth-schema';

// ============================================================================
// Locations, roles, stations
// ============================================================================

export const locations = pgTable('locations', {
  id: text('id').primaryKey(),
  name: text('name').notNull(), 
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const roles = pgTable('roles', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  // general | station | confidential | master — enforced at the route layer.
  clearanceLevel: text('clearance_level').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const stations = pgTable(
  'stations',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull().default(''),
    locationId: text('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'restrict' }),
    sortOrder: integer('sort_order').notNull().default(0),
    isArchived: boolean('is_archived').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byLocation: index('stations_location_idx').on(t.locationId),
  }),
);

// Manager-defined categories (Recipes, Equipment, Station, Cleaning, Admin,
// Delivery by default; the manager adds/renames/archives more). Slug is the
// stable URL-safe handle and is unique per active row in the same location.
// No icon column — icon lives in the frontend as a slug->ri-* map. No
// sort_order column — display order = (created_at ASC, slug ASC).
export const categories = pgTable(
  'categories',
  {
    id: text('id').primaryKey(),
    locationId: text('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'restrict' }),
    slug: text('slug').notNull(),
    nameEn: text('name_en').notNull(),
    nameEs: text('name_es').notNull(),
    isArchived: boolean('is_archived').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    createdBy: text('created_by')
      .notNull()
      .references(() => employees.id, { onDelete: 'restrict' }),
  },
  (t) => ({
    byLocation: index('categories_location_idx').on(t.locationId),
    // Slug is unique per active (non-archived) category at the location;
    // archived rows are ignored so a future recycle doesn't trip the index.
    slugUnique: uniqueIndex('categories_location_slug_uniq')
      .on(t.locationId, drizzleSql`lower(${t.slug})`)
      .where(drizzleSql`${t.isArchived} = false`),
  }),
);

// ============================================================================
// Employees, sessions
// ============================================================================

export const employeeStatus = ['pending', 'active', 'deactivated'] as const;
export type EmployeeStatus = (typeof employeeStatus)[number];

export const languagePrefs = ['en', 'es'] as const;
export type LanguagePref = (typeof languagePrefs)[number];

// 'access' = short-lived bearer sent on every API call.
// 'refresh' = long-lived token used only at /api/auth/refresh to mint a new pair.
export const sessionKinds = ['access', 'refresh'] as const;
export type SessionKind = (typeof sessionKinds)[number];

export const employees = pgTable(
  'employees',
  {
    id: text('id').primaryKey(),

    userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
    // LOGIN identifier. Compared case-insensitively at the route layer.
    name: text('name').notNull(),
    employeeCode: text('employee_code'),
    locationId: text('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'restrict' }),
    roleId: text('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'restrict' }),
    stationId: text('station_id').references(() => stations.id, { onDelete: 'set null' }),
    // Admin authority is implied by roleId === 'role-master' (checked at
    // requireAdmin). No separate clearance column — every employee has a
    // role, and one of those roles is the admin role. The field used to
    // exist (clearance_level) and was dropped in migration 0015 because
    // it duplicated information already carried by role membership.
    languagePref: text('language_pref').$type<LanguagePref>().notNull().default('en'),
    status: text('status').$type<EmployeeStatus>().notNull().default('pending'),
    passwordHash: text('password_hash'),
    mustResetPassword: boolean('must_reset_password').notNull().default(false),
    failedLoginAttempts: integer('failed_login_attempts').notNull().default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    deactivatedAt: timestamp('deactivated_at', { withTimezone: true }),
  },
  (t) => ({
    // Login name uniqueness is scoped per location; case-insensitive comparison.
    nameLocationUnique: uniqueIndex('employees_name_location_uniq').on(
      t.locationId,
      drizzleSql`lower(${t.name})`,
    ),
    // Badge code is unique when set; multiple NULLs are allowed.
    codeUnique: uniqueIndex('employees_code_uniq')
      .on(t.employeeCode)
      .where(drizzleSql`${t.employeeCode} IS NOT NULL`),
    // 1:1 with Better Auth's user table.
    userIdUnique: uniqueIndex('employees_user_id_uniq').on(t.userId),
  }),
);


// ============================================================================
// Invites (admin issues → employee activates)
// ============================================================================

export const invites = pgTable(
  'invites',
  {
    id: text('id').primaryKey(),
    employeeId: text('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    // SHA-256 of the opaque token sent in the activation URL.
    tokenHash: text('token_hash').notNull(),
    // bcrypt hash of the 5-digit activation code.
    codeHash: text('code_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    createdBy: text('created_by')
      .notNull()
      .references(() => employees.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    tokenHashUnique: uniqueIndex('invites_token_hash_uniq').on(t.tokenHash),
    byEmployee: index('invites_employee_idx').on(t.employeeId),
  }),
);

// ============================================================================
// Library: procedures (SOPs, recipes, training chapters)
// ============================================================================

export const procedureStatuses = ['draft', 'published'] as const;
export type ProcedureStatus = (typeof procedureStatuses)[number];

export const procedures = pgTable(
  'procedures',
  {
    id: text('id').primaryKey(),
    slug: text('slug').notNull(),
    titleEn: text('title_en').notNull(),
    titleEs: text('title_es').notNull(),
    purposeEn: text('purpose_en').notNull(),
    purposeEs: text('purpose_es').notNull(),
    // FK to categories.id; SET NULL on category archive keeps the procedure
    // reachable (the reader renders "—" instead of the category pill).
    categoryId: text('category_id').references(() => categories.id, {
      onDelete: 'set null',
    }),
    status: text('status').$type<ProcedureStatus>().notNull().default('draft'),
    blocksEn: jsonb('blocks_en').$type<unknown>().notNull(),
    blocksEs: jsonb('blocks_es').$type<unknown>().notNull(),
    createdBy: text('created_by')
      .notNull()
      .references(() => employees.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    // Quiz + training wiring (added 0013).
    quizId: text('quiz_id').references(() => quizzes.id, { onDelete: 'set null' }),
    linkedTrainingId: text('linked_training_id'), // no FK — stage 3
    quizMode: text('quiz_mode').notNull().default('training'),
    // Stage 2 final wiring (added 0014). `version` is the monotonic publish
    // counter stamped on every publish inside a SELECT FOR UPDATE — the QR
    // code on the printed SOP points at procedures.slug?version=N so a
    // re-publish bumps N. `isArchived` is the third state per PROJECT_OVERVIEW
    // §02: draft → published → archived. Cook-side reads filter out archived;
    // admin-side library list surfaces them under an opt-in filter chip.
    version: integer('version').notNull().default(1),
    isArchived: boolean('is_archived').notNull().default(false),
    // Access dimensions (added 0015). One nullable FK per dimension — a
    // procedure is visible to at most ONE location, ONE role, ONE station,
    // and ONE specific employee. NULL on all four = open to everyone at
    // the manager's "Everyone" choice on the Access step. SET NULL on every
    // FK so archiving a location / role / station / employee doesn't hard-
    // delete the procedure row.
    accessLocationId: text('access_location_id').references(() => locations.id, {
      onDelete: 'set null',
    }),
    accessRoleId: text('access_role_id').references(() => roles.id, {
      onDelete: 'set null',
    }),
    accessStationId: text('access_station_id').references(() => stations.id, {
      onDelete: 'set null',
    }),
    accessEmployeeId: text('access_employee_id').references(() => employees.id, {
      onDelete: 'set null',
    }),
  },
  (t) => ({
    slugUnique: uniqueIndex('procedures_slug_uniq').on(t.slug),
    byCategory: index('procedures_category_idx').on(t.categoryId),
    byStatus: index('procedures_status_idx').on(t.status),
    byQuiz: index('procedures_quiz_id_idx').on(t.quizId),
    // Supports the admin library list's "show archived" filter — single
    // index seek for the where clause `is_archived = false|true`.
    byArchived: index('procedures_archived_idx').on(t.isArchived),
    // Cook-read WHERE matches the cook's profile against any of the four
    // access_*_id columns; one b-tree per column makes each match an index
    // seek. status + isArchived layered on top via byStatus / byArchived.
    byAccessLocation: index('procedures_access_location_idx').on(t.accessLocationId),
    byAccessRole: index('procedures_access_role_idx').on(t.accessRoleId),
    byAccessStation: index('procedures_access_station_idx').on(t.accessStationId),
    byAccessEmployee: index('procedures_access_employee_idx').on(t.accessEmployeeId),
  }),
);

// ============================================================================
// Library: quizzes (centralised quiz table)
// One row per quiz. Authored from procedure wizard (stage 2) or training-course
// wizard (stage 3). The procedure's `quizId` FK points here.
// ============================================================================

export const quizzes = pgTable(
  'quizzes',
  {
    id: text('id').primaryKey(),
    questions: jsonb('questions').notNull().default([]),
    attached: boolean('attached').notNull().default(false),
    // null = no passing threshold enforced.
    passingScore: integer('passing_score'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
);

// ============================================================================
// Library: quiz_attempts (one row per submission)
// Multiple attempts per (quiz, employee) allowed (retakes).
// `score` is percent 0..100; `passed` is denormalised against the quiz's
// `passingScore` at submit time so reads don't re-evaluate.
// `answers` is a jsonb map of {questionId: choiceId} for the audit trail.
// ============================================================================

export const quizAttempts = pgTable(
  'quiz_attempts',
  {
    id: text('id').primaryKey(),
    quizId: text('quiz_id')
      .notNull()
      .references(() => quizzes.id, { onDelete: 'cascade' }),
    employeeId: text('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    score: integer('score').notNull(),
    passed: boolean('passed').notNull(),
    answers: jsonb('answers').notNull().default({}),
    attemptedAt: timestamp('attempted_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    quizEmployeeIdx: index('quiz_attempts_quiz_employee_idx').on(
      t.quizId,
      t.employeeId,
      t.attemptedAt,
    ),
    employeeIdx: index('quiz_attempts_employee_idx').on(t.employeeId, t.attemptedAt),
  }),
);

// ============================================================================
// Inferred types
// ============================================================================

export type Location = typeof locations.$inferSelect;
export type Role = typeof roles.$inferSelect;
export type Station = typeof stations.$inferSelect;
export type Employee = typeof employees.$inferSelect;
export type NewEmployee = typeof employees.$inferInsert;
export type Invite = typeof invites.$inferSelect;
export type NewInvite = typeof invites.$inferInsert;
export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
export type Procedure = typeof procedures.$inferSelect;
export type NewProcedure = typeof procedures.$inferInsert;
export type Quiz = typeof quizzes.$inferSelect;
export type NewQuiz = typeof quizzes.$inferInsert;
export type QuizAttempt = typeof quizAttempts.$inferSelect;
export type NewQuizAttempt = typeof quizAttempts.$inferInsert;