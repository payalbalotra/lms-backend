import {
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  boolean as pgBoolean,
} from 'drizzle-orm/pg-core';
// Note: employees.userId is `text` (not uuid) because it references user.id
// which Better Auth generates as a nanoid text string, not a UUID.
import { sql as drizzleSql } from 'drizzle-orm';
export * from './auth.schema.ts';

import { user } from './auth.schema.ts';
import { locations } from './locations.schema.ts';
import { jobs } from './jobs.schema.ts';
import { stations } from './stations.schema.ts';

// ============================================================================
// Role enum — defined here, shared across employees and jobs
// ============================================================================
export const ROLES = ['super_admin', 'manager', 'employee'] as const;
export type Role = (typeof ROLES)[number];

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
    // Role is now a plain text enum — no FK to a roles table needed.
    role: text('role').$type<Role>().notNull().default('employee'),
    email: text('email').notNull(),
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
    requirePasswordChange: pgBoolean('require_password_change')
      .notNull()
      .default(true),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    deactivatedAt: timestamp('deactivated_at', { withTimezone: true }),
  },
  (t) => ({
    nameLocationUnique: uniqueIndex('employees_name_location_uniq').on(
      t.locationId,
      drizzleSql`lower(${t.name})`,
    ),
    codeUnique: uniqueIndex('employees_code_uniq')
      .on(t.employeeCode)
      .where(drizzleSql`${t.employeeCode} IS NOT NULL`),
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
// Inferred types
// ============================================================================

export type Employee = typeof employees.$inferSelect;
export type NewEmployee = typeof employees.$inferInsert;

export type EmployeeJob = typeof employeeJobs.$inferSelect;
export type NewEmployeeJob = typeof employeeJobs.$inferInsert;
export type EmployeeStation = typeof employeeStations.$inferSelect;
export type NewEmployeeStation = typeof employeeStations.$inferInsert;

// Re-export auth schema so consumers only need to import from this file
export * from './auth.schema.ts';
