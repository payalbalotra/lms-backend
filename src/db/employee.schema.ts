import {
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  index,
  uuid,
} from 'drizzle-orm/pg-core';
// Note: employees.userId is `text` (not uuid) because it references user.id
// which Better Auth generates as a nanoid text string, not a UUID.
import { sql as drizzleSql } from 'drizzle-orm';
export * from './auth.schema.ts';

import { user } from './auth.schema.ts';

// ============================================================================
// Locations, roles, stations
// ============================================================================

export const locations = pgTable('locations', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const roles = pgTable('roles', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const jobs = pgTable('jobs', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const stations = pgTable('stations', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// Manager-defined categories (Recipes, Equipment, Station, Cleaning, Admin,
// Delivery by default; the manager adds/renames/archives more). Slug is the
// stable URL-safe handle and is unique per active row in the same location.
// No icon column — icon lives in the frontend as a slug->ri-* map. No
// sort_order column — display order = (created_at ASC, slug ASC).

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
    id: uuid('id').defaultRandom().primaryKey(),

    userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
    // LOGIN identifier. Compared case-insensitively at the route layer.
    name: text('name').notNull(),
    employeeCode: text('employee_code'),
    locationId: uuid('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'restrict' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'restrict' }),
    email: text('email'),
    jobIds: uuid('job_ids')
      .array()
      .default(drizzleSql`'{}'::uuid[]`),
    stationIds: uuid('station_ids')
      .array()
      .default(drizzleSql`'{}'::uuid[]`),
    languagePref: text('language_pref')
      .$type<LanguagePref>()
      .notNull()
      .default('en'),
    status: text('status').$type<EmployeeStatus>().notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
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
// Employee Junction Tables (Jobs, Stations)
// ============================================================================

export const employeeJobs = pgTable(
  'employee_jobs',
  {
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
  },
  (t) => ({
    pk: uniqueIndex('employee_jobs_pk').on(t.employeeId, t.jobId),
  }),
);

export const employeeStations = pgTable(
  'employee_stations',
  {
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    stationId: uuid('station_id')
      .notNull()
      .references(() => stations.id, { onDelete: 'cascade' }),
  },
  (t) => ({
    pk: uniqueIndex('employee_stations_pk').on(t.employeeId, t.stationId),
  }),
);

// ============================================================================
// Invites (admin issues → employee activates)
// ============================================================================

export const invites = pgTable(
  'invites',
  {
    id: text('id').primaryKey(),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    // SHA-256 of the opaque token sent in the activation URL.
    tokenHash: text('token_hash').notNull(),
    // bcrypt hash of the 5-digit activation code.
    codeHash: text('code_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    tokenHashUnique: uniqueIndex('invites_token_hash_uniq').on(t.tokenHash),
    byEmployee: index('invites_employee_idx').on(t.employeeId),
  }),
);

// ============================================================================
// Inferred types
// ============================================================================

export type Location = typeof locations.$inferSelect;
export type NewLocation = typeof locations.$inferInsert;
export type Role = typeof roles.$inferSelect;
export type NewRole = typeof roles.$inferInsert;
export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
export type Station = typeof stations.$inferSelect;
export type NewStation = typeof stations.$inferInsert;
export type Employee = typeof employees.$inferSelect;
export type NewEmployee = typeof employees.$inferInsert;
export type Invite = typeof invites.$inferSelect;
export type NewInvite = typeof invites.$inferInsert;

export type EmployeeJob = typeof employeeJobs.$inferSelect;
export type NewEmployeeJob = typeof employeeJobs.$inferInsert;
export type EmployeeStation = typeof employeeStations.$inferSelect;
export type NewEmployeeStation = typeof employeeStations.$inferInsert;

// Re-export auth schema so consumers only need to import from this file
export * from './auth.schema.ts';
