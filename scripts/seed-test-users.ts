// ============================================================================
// lms-backend seed-test-users
// ============================================================================
// Idempotent. Run with:
//
//   pnpm db:seed:test
//
// Creates two stable test users so we can exercise the API from BOTH sides:
//
//   admin-test  (role role-master)   -> /api/admin/* routes
//   cook-test   (role role-general, station stn-hot-line)
//                                  -> /api/procedures/* cook reads
//
// Two things to note about how this differs from scripts/seed.ts:
//   1. The canonical seed (scripts/seed.ts) creates ONE master employee with
//      id emp-master-seed and prints ONE invite URL. This script creates
//      *two* employees with stable IDs (emp-admin-test, emp-cook-test) so we
//      can log in as both halves of the system in parallel during API
//      smoke tests.
//   2. This script ALSO directly activates both users with a known
//      password via Better Auth's signUpEmail, instead of leaving them as
//      'pending' invite-recipients. That way a curl-based smoke test can
//      POST /api/auth/login with name+locationId+password immediately,
//      without opening each URL in a browser. The printed activation URLs
//      are still useful for exercising the activation UI flow end-to-end
//      (note: clicking the printed URL will hit EMPLOYEE_ALREADY_ACTIVE,
//      which is itself a useful smoke check).
//
// Admin authority is role-membership in 'role-master' (migration 0015
// dropped the previous `clearance_level` column). The script doesn't
// touch any clearance field — the role row still carries its own
// clearanceLevel for reporting purposes (PROJECT_OVERVIEW §03), but
// that's on the role table, not the employee table.
//
// Re-running is safe: it cancels any outstanding invite, leaves the
// employee rows alone (stable IDs), and prints fresh URLs + codes.
// ============================================================================

import 'dotenv/config';
import crypto from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { db, closeDb } from '../src/db/client.js';
import { employees, invites, user } from '../src/db/schema.js';
import { auth } from '../src/auth/better-auth.js';
import { createInvite, cancelOutstandingInvites } from '../src/auth/invites.js';

const PUBLIC_WEB_BASE_URL =
  process.env.PUBLIC_WEB_BASE_URL ?? 'http://localhost:3000';

// ---------- Fixture ids (must match scripts/seed.ts) ------------------------
const LOCATION_ID = 'loc-main';
const LOCATION_NAME = 'Mexicana Main';

// Two passwords, one per side. Picked to be obvious and easy to type into
// the activation form if you also want to exercise that UI flow. >= 8 chars
// per Better Auth's minPasswordLength.
const ADMIN_PASSWORD = 'AdminTest1234!';
const COOK_PASSWORD = 'CookTest1234!';

interface RoleFixture {
  id: string;
  name: string;
  clearanceLevel: 'general' | 'station' | 'confidential' | 'master';
}

const ROLES: RoleFixture[] = [
  { id: 'role-general', name: 'General', clearanceLevel: 'general' },
  { id: 'role-station', name: 'Station Cook', clearanceLevel: 'station' },
  { id: 'role-confidential', name: 'Confidential', clearanceLevel: 'confidential' },
  { id: 'role-master', name: 'Master', clearanceLevel: 'master' },
];

interface StationFixture {
  id: string;
  name: string;
  sortOrder: number;
}

const STATIONS: StationFixture[] = [
  { id: 'stn-hot-line', name: 'Hot line', sortOrder: 10 },
  { id: 'stn-cold-prep', name: 'Cold prep', sortOrder: 20 },
  { id: 'stn-tortillas', name: 'Tortilla station', sortOrder: 30 },
  { id: 'stn-sauces', name: 'Sauces & salsas', sortOrder: 40 },
  { id: 'stn-beverages', name: 'Beverage bar', sortOrder: 50 },
  { id: 'stn-dish', name: 'Dish pit', sortOrder: 60 },
];

interface TestEmployeeSpec {
  id: string;
  name: string;
  roleId: string;
  stationId: string | null;
  languagePref: 'en' | 'es';
  password: string;
  label: string;
}

const ADMIN: TestEmployeeSpec = {
  id: 'emp-admin-test',
  name: 'admin-test',
  roleId: 'role-master',
  stationId: null,
  languagePref: 'en',
  password: ADMIN_PASSWORD,
  label: 'ADMIN',
};

const COOK: TestEmployeeSpec = {
  id: 'emp-cook-test',
  name: 'cook-test',
  roleId: 'role-general',
  stationId: 'stn-hot-line',
  languagePref: 'en',
  password: COOK_PASSWORD,
  label: 'COOK',
};

// ============================================================================
// Fixture + employee upsert
// ============================================================================

async function ensureLocation(): Promise<void> {
  await sql`
    INSERT INTO locations (id, name)
    VALUES (${LOCATION_ID}, ${LOCATION_NAME})
    ON CONFLICT (id) DO NOTHING
  `;
}

async function ensureRoles(): Promise<void> {
  for (const role of ROLES) {
    await sql`
      INSERT INTO roles (id, name, clearance_level)
      VALUES (${role.id}, ${role.name}, ${role.clearanceLevel})
      ON CONFLICT (id) DO NOTHING
    `;
  }
}

async function ensureStations(): Promise<void> {
  for (const st of STATIONS) {
    await sql`
      INSERT INTO stations (id, name, location_id, sort_order, is_archived)
      VALUES (${st.id}, ${st.name}, ${LOCATION_ID}, ${st.sortOrder}, false)
      ON CONFLICT (id) DO NOTHING
    `;
  }
}

// Upsert the employee row. We don't use ON CONFLICT because the role /
// station / status might have been edited between runs and we want to reset
// to the spec on every run. Returns true if we created it fresh, false if it
// already existed (we only flip it back to pending if the password / role
// changed and we have to re-provision).
async function ensureTestEmployee(spec: TestEmployeeSpec): Promise<void> {
  const [existing] = await db
    .select({ id: employees.id, status: employees.status })
    .from(employees)
    .where(eq(employees.id, spec.id))
    .limit(1);

  if (!existing) {
    await db.insert(employees).values({
      id: spec.id,
      name: spec.name,
      locationId: LOCATION_ID,
      roleId: spec.roleId,
      stationId: spec.stationId,
      languagePref: spec.languagePref,
      status: 'pending',
      mustResetPassword: false,
    });
    return;
  }

  // Already exists — refresh role/station to match the spec, and reset to
  // pending so the activation flow can re-fire cleanly. We do NOT touch
  // userId / passwordHash here; activateDirectUser below handles the Better
  // Auth user + password side.
  await db
    .update(employees)
    .set({
      roleId: spec.roleId,
      stationId: spec.stationId,
      languagePref: spec.languagePref,
    })
    .where(eq(employees.id, spec.id));
}

// ============================================================================
// Direct activation — provision a Better Auth user and link the employee
// ============================================================================
//
// Mirrors the body of controllers/auth/activate.ts but skips the invite
// lookup + code check (those are the UI-flow path; here we already know
// the password). The result is the same: employees.status='active' +
// employees.userId set + a working Better Auth user/account with a
// bcrypt-scrypt hash that POST /api/auth/login can resolve.
//
// If the BA user already exists (script ran twice on the same id), we
// throw — Better Auth's signUpEmail silently no-ops on duplicate email,
// which would leave activation half-done. Re-running this script is fine
// for fresh databases, but if you've manually poked at the BA tables,
// drop the user row first.

async function activateDirectUser(spec: TestEmployeeSpec): Promise<void> {
  const syntheticEmail = `${spec.id}@lms.internal`;

  const [existingUser] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, syntheticEmail))
    .limit(1);

  if (existingUser) {
    // Already activated. Just re-link the employee (idempotent if userId
    // is already correct) and make sure status is active.
    await db
      .update(employees)
      .set({
        userId: existingUser.id,
        status: 'active',
        mustResetPassword: false,
        failedLoginAttempts: 0,
        lockedUntil: null,
      })
      .where(eq(employees.id, spec.id));
    return;
  }

  await auth.api.signUpEmail({
    body: {
      email: syntheticEmail,
      password: spec.password,
      name: spec.name,
    },
  });

  const [u] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, syntheticEmail))
    .limit(1);
  if (!u) {
    throw new Error(
      `signUpEmail succeeded but no Better Auth user found for ${syntheticEmail}`,
    );
  }

  await db
    .update(employees)
    .set({
      userId: u.id,
      status: 'active',
      mustResetPassword: false,
      failedLoginAttempts: 0,
      lockedUntil: null,
    })
    .where(eq(employees.id, spec.id));
}

// ============================================================================
// Invite generation — used for the printed activation URLs
// ============================================================================
//
// We always cancel any outstanding invite first so the printed URL is
// the only one valid for this employee. Self-invite (createdBy = employee
// itself) matches scripts/seed.ts and src/cli/admin.ts.

async function freshInvite(employeeId: string): Promise<{
  token: string;
  code: string;
  expiresAt: Date;
}> {
  await cancelOutstandingInvites(employeeId);
  return await createInvite({ employeeId, createdBy: employeeId });
}

// ============================================================================
// Run
// ============================================================================

async function run(): Promise<void> {
  console.log('Seeding test users (admin + cook) for API smoke tests...\n');

  await ensureLocation();
  await ensureRoles();
  await ensureStations();
  console.log(`fixtures: location=${LOCATION_ID}, 4 roles, 6 stations`);

  for (const spec of [ADMIN, COOK]) {
    await ensureTestEmployee(spec);
    await activateDirectUser(spec);
    console.log(`  ${spec.label.padEnd(5)} ${spec.id}  (${spec.name}) -> active, password set`);
  }

  // Cancel any prior invites and mint fresh ones for printing.
  const adminInvite = await freshInvite(ADMIN.id);
  const cookInvite = await freshInvite(COOK.id);

  // Note: invites are still 'open' (usedAt=null) even though the employees
  // are already active — opening the printed URL would now hit
  // EMPLOYEE_ALREADY_ACTIVE in the activate controller. That's intentional
  // and useful: it's the smoke check that proves the controller's
  // already-active guard works.
  //
  // If you want to exercise the full activation UI instead, drop the
  // employee rows first:
  //   DELETE FROM employees WHERE id IN ('emp-admin-test', 'emp-cook-test');

  const adminUrl = `${PUBLIC_WEB_BASE_URL}/en/activate/${adminInvite.token}`;
  const cookUrl = `${PUBLIC_WEB_BASE_URL}/en/activate/${cookInvite.token}`;

  const divider = '='.repeat(78);

  console.log('\n' + divider);
  console.log('TEST LOGINS  (use these with POST /api/auth/login for curl tests)');
  console.log(divider);
  console.log(`  ADMIN   name=admin-test   locationId=${LOCATION_ID}   password=${ADMIN_PASSWORD}`);
  console.log(`  COOK    name=cook-test    locationId=${LOCATION_ID}   password=${COOK_PASSWORD}`);
  console.log('');
  console.log('  Example:');
  console.log(`    curl -c admin.jar -X POST http://localhost:3000/api/auth/login \\`);
  console.log(`      -H 'Content-Type: application/json' \\`);
  console.log(`      -d '{"name":"admin-test","locationId":"${LOCATION_ID}","password":"${ADMIN_PASSWORD}"}'`);
  console.log('');
  console.log(`    curl -b admin.jar http://localhost:3000/api/me`);
  console.log(`    curl -b admin.jar http://localhost:3000/api/admin/library/procedures`);
  console.log(`    curl -b admin.jar -X POST http://localhost:3000/api/admin/library/procedures \\`);
  console.log(`      -H 'Content-Type: application/json' -d '{...}'`);
  console.log('');
  console.log(`    curl -c cook.jar -X POST http://localhost:3000/api/auth/login \\`);
  console.log(`      -H 'Content-Type: application/json' \\`);
  console.log(`      -d '{"name":"cook-test","locationId":"${LOCATION_ID}","password":"${COOK_PASSWORD}"}'`);
  console.log('');
  console.log(`    curl -b cook.jar http://localhost:3000/api/procedures`);
  console.log(divider);

  console.log('\n' + divider);
  console.log('ACTIVATION URLS  (employees are already active — these will hit');
  console.log('  EMPLOYEE_ALREADY_ACTIVE if opened. Useful as a smoke check, or');
  console.log('  to exercise the activation UI after deleting the employee rows.)');
  console.log(divider);
  console.log(`  ADMIN   ${adminUrl}`);
  console.log(`          code: ${adminInvite.code}`);
  console.log(`          expires: ${adminInvite.expiresAt.toISOString()}`);
  console.log('');
  console.log(`  COOK    ${cookUrl}`);
  console.log(`          code: ${cookInvite.code}`);
  console.log(`          expires: ${cookInvite.expiresAt.toISOString()}`);
  console.log(divider);
  console.log('');

  // Suppress unused-import lint: crypto is reserved for future spec
  // extensions (rotating test passwords) without changing the public
  // shape of this script.
  void crypto;
}

run()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await closeDb();
  });
