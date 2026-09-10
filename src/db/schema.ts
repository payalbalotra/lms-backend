import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { sql as drizzleSql } from 'drizzle-orm';

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
  // general | station | confidential | master — enforced at the route layer.
  clearanceLevel: text('clearance_level').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const stations = pgTable(
  'stations',
  {
    id: text('id').primaryKey(),
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

// ============================================================================
// Employees, sessions
// ============================================================================

export const employeeStatus = ['pending', 'active', 'deactivated'] as const;
export type EmployeeStatus = (typeof employeeStatus)[number];

export const clearanceLevels = ['general', 'station', 'confidential', 'master'] as const;
export type ClearanceLevel = (typeof clearanceLevels)[number];

export const languagePrefs = ['en', 'es'] as const;
export type LanguagePref = (typeof languagePrefs)[number];

export const employees = pgTable(
  'employees',
  {
    id: text('id').primaryKey(),
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
  }),
);

export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    employeeId: text('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    // Argon2id hash of the opaque session token sent in the cookie.
    sessionTokenHash: text('session_token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    ip: text('ip'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    tokenHashUnique: uniqueIndex('sessions_token_hash_uniq').on(t.sessionTokenHash),
    byEmployee: index('sessions_employee_idx').on(t.employeeId),
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
// Inferred types
// ============================================================================

export type Location = typeof locations.$inferSelect;
export type Role = typeof roles.$inferSelect;
export type Station = typeof stations.$inferSelect;
export type Employee = typeof employees.$inferSelect;
export type NewEmployee = typeof employees.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type Invite = typeof invites.$inferSelect;
export type NewInvite = typeof invites.$inferInsert;