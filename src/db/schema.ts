import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  uniqueIndex,
  index,
  primaryKey,
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

export const clearanceLevels = ['general', 'station', 'confidential', 'master'] as const;
export type ClearanceLevel = (typeof clearanceLevels)[number];

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
    clearanceLevel: text('clearance_level').$type<ClearanceLevel>().notNull(),
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
  },
  (t) => ({
    slugUnique: uniqueIndex('procedures_slug_uniq').on(t.slug),
    byCategory: index('procedures_category_idx').on(t.categoryId),
    byStatus: index('procedures_status_idx').on(t.status),
    byQuiz: index('procedures_quiz_id_idx').on(t.quizId),
  }),
);

// ============================================================================
// Library: procedure access (junction tables)
//
// A published procedure is visible to a cook when ANY of these is true:
//   - the cook's locationId is in procedure_locations for the SOP, OR
//   - the cook's roleId     is in procedure_roles     for the SOP, OR
//   - the cook's stationId  is in procedure_stations  for the SOP, OR
//   - the cook's own id     is in procedure_employees for the SOP.
// A procedure with zero rows across all four junction tables is open to
// every active employee at the location (the manager's "Everyone" choice
// on the Access step). Cook-read queries always layer
// status='published' AND is_archived=false on top of this OR join.
//
// Each junction table pairs the procedure with one dimension id; the
// composite PK prevents duplicate assignments, and the reverse index
// makes "which procedures does this employee/role/station/location see"
// a single index lookup. CASCADE on every FK keeps the junction rows
// in sync when a procedure is deleted (admin-side) or when an employee
// is deactivated (employee-side).
// ============================================================================

export const procedureLocations = pgTable(
  'procedure_locations',
  {
    procedureId: text('procedure_id')
      .notNull()
      .references(() => procedures.id, { onDelete: 'cascade' }),
    locationId: text('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'cascade' }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.procedureId, t.locationId] }),
    byLocation: index('procedure_locations_location_idx').on(t.locationId),
  }),
);

export const procedureRoles = pgTable(
  'procedure_roles',
  {
    procedureId: text('procedure_id')
      .notNull()
      .references(() => procedures.id, { onDelete: 'cascade' }),
    roleId: text('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.procedureId, t.roleId] }),
    byRole: index('procedure_roles_role_idx').on(t.roleId),
  }),
);

export const procedureStations = pgTable(
  'procedure_stations',
  {
    procedureId: text('procedure_id')
      .notNull()
      .references(() => procedures.id, { onDelete: 'cascade' }),
    stationId: text('station_id')
      .notNull()
      .references(() => stations.id, { onDelete: 'cascade' }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.procedureId, t.stationId] }),
    byStation: index('procedure_stations_station_idx').on(t.stationId),
  }),
);

export const procedureEmployees = pgTable(
  'procedure_employees',
  {
    procedureId: text('procedure_id')
      .notNull()
      .references(() => procedures.id, { onDelete: 'cascade' }),
    employeeId: text('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.procedureId, t.employeeId] }),
    byEmployee: index('procedure_employees_employee_idx').on(t.employeeId),
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
export type ProcedureLocation = typeof procedureLocations.$inferSelect;
export type NewProcedureLocation = typeof procedureLocations.$inferInsert;
export type ProcedureRole = typeof procedureRoles.$inferSelect;
export type NewProcedureRole = typeof procedureRoles.$inferInsert;
export type ProcedureStation = typeof procedureStations.$inferSelect;
export type NewProcedureStation = typeof procedureStations.$inferInsert;
export type ProcedureEmployee = typeof procedureEmployees.$inferSelect;
export type NewProcedureEmployee = typeof procedureEmployees.$inferInsert;
export type Quiz = typeof quizzes.$inferSelect;
export type NewQuiz = typeof quizzes.$inferInsert;
export type QuizAttempt = typeof quizAttempts.$inferSelect;
export type NewQuizAttempt = typeof quizAttempts.$inferInsert;