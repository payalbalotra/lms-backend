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

// Re-export Better Auth tables (user/session/account/verification) so the
// rest of the codebase can keep importing everything from `@/db/schema`.
// The auth-schema file is CLI-generated and may be regenerated on upgrade
// — do not hand-edit it.
export * from './auth-schema';
// Named import for the `employees.userId` FK reference — `export *` does not
// create a local binding, so we need this in addition.
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
    // FK to Better Auth's user table. Nullable because the employee row is
    // created first (admin form), and the Better Auth user is provisioned
    // later when the employee activates via the 5-digit code.
    // requireAuth treats a NULL userId as "no active employee" → SESSION_INVALID.
    // onDelete:cascade remains so deleting a Better Auth user removes the LMS row.
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
// Inferred types
// ============================================================================

export type Location = typeof locations.$inferSelect;
export type Role = typeof roles.$inferSelect;
export type Station = typeof stations.$inferSelect;
export type Employee = typeof employees.$inferSelect;
export type NewEmployee = typeof employees.$inferInsert;
export type Invite = typeof invites.$inferSelect;
export type NewInvite = typeof invites.$inferInsert;