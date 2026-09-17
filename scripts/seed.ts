// ============================================================================
// lms-backend seed
// ============================================================================
// Idempotent setup for a fresh dev environment. Run with:
//
//   pnpm db:seed
//
// What it does:
//   1. Inserts one location (loc-main) — ON CONFLICT DO NOTHING.
//   2. Inserts four roles (general, station, confidential, master).
//   3. Inserts the six default Mexican-restaurant stations for loc-main.
//   4. Ensures a master-clearance employee exists (idempotent — if one
//      already exists, leaves it alone).
//   5. Generates a fresh invite for the master employee and prints the
//      activation URL + 5-digit code.
//
// The seed NEVER sets a password. To log in as the master, open the printed
// URL, enter the code, and choose a password. Better Auth's signUpEmail then
// creates the user row at activation time.
// ============================================================================

import 'dotenv/config';
import crypto from 'node:crypto';
import { sql, closeDb } from '../src/db/client.js';
import { employees } from '../src/db/schema.js';
import { eq } from 'drizzle-orm';
import { db } from '../src/db/client.js';
import { createInvite } from '../src/auth/invites.js';
import { uniqueEmployeeName } from '../src/services/employee-name.js';

const PUBLIC_WEB_BASE_URL =
  process.env.PUBLIC_WEB_BASE_URL ?? 'http://localhost:3000';

const LOCATION_ID = 'loc-main';
const LOCATION_NAME = 'Mexicana Main';

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

const MASTER_NAME = 'admin';
const MASTER_EMPLOYEE_ID = 'emp-master-seed';

async function ensureLocation(): Promise<void> {
  await sql`
    INSERT INTO locations (id, name)
    VALUES (${LOCATION_ID}, ${LOCATION_NAME})
    ON CONFLICT (id) DO NOTHING
  `;
  console.log(`location: ${LOCATION_ID} (${LOCATION_NAME})`);
}

async function ensureRoles(): Promise<void> {
  for (const role of ROLES) {
    await sql`
      INSERT INTO roles (id, name, clearance_level)
      VALUES (${role.id}, ${role.name}, ${role.clearanceLevel})
      ON CONFLICT (id) DO NOTHING
    `;
  }
  console.log(`roles: ${ROLES.length} (${ROLES.map((r) => r.clearanceLevel).join(', ')})`);
}

async function ensureStations(): Promise<void> {
  for (const st of STATIONS) {
    await sql`
      INSERT INTO stations (id, name, location_id, sort_order, is_archived)
      VALUES (${st.id}, ${st.name}, ${LOCATION_ID}, ${st.sortOrder}, false)
      ON CONFLICT (id) DO NOTHING
    `;
  }
  console.log(`stations: ${STATIONS.length} (under ${LOCATION_ID})`);
}

async function ensureMasterEmployee(): Promise<string> {
  // Idempotent master — stable id so reseeding doesn't churn.
  // If the master is already active, leave them and just print a fresh invite.
  const [existing] = await db
    .select({ id: employees.id, status: employees.status })
    .from(employees)
    .where(eq(employees.id, MASTER_EMPLOYEE_ID))
    .limit(1);

  if (existing) {
    console.log(
      `master employee: ${MASTER_EMPLOYEE_ID} (already seeded, status=${existing.status})`,
    );
    return existing.id;
  }

  // Pre-check: refuse if any other master exists in this location.
  const [otherMaster] = await db
    .select({ id: employees.id })
    .from(employees)
    .where(eq(employees.clearanceLevel, 'master'))
    .limit(1);

  if (otherMaster) {
    console.warn(
      `master employee: skipped — another master (${otherMaster.id}) already exists. ` +
        `Remove it or use pnpm admin bootstrap to add another.`,
    );
    return otherMaster.id;
  }

  // Pick a unique name within the location (handles name-collision suffixing).
  const name = await uniqueEmployeeName(LOCATION_ID, MASTER_NAME);

  await db.insert(employees).values({
    id: MASTER_EMPLOYEE_ID,
    name,
    locationId: LOCATION_ID,
    roleId: 'role-master',
    clearanceLevel: 'master',
    languagePref: 'en',
    status: 'pending',
    mustResetPassword: false,
  });
  console.log(`master employee: ${MASTER_EMPLOYEE_ID} (created, name=${name})`);
  return MASTER_EMPLOYEE_ID;
}

async function printInvite(employeeId: string, languagePref: 'en' | 'es'): Promise<void> {
  // Self-invite: seed operator has no prior admin, same pattern as the CLI.
  const invite = await createInvite({ employeeId, createdBy: employeeId });
  const url = `${PUBLIC_WEB_BASE_URL}/${languagePref}/activate/${invite.token}`;
  console.log('');
  console.log('=== Master invite (fresh each `pnpm db:seed`) ===');
  console.log(`  URL:   ${url}`);
  console.log(`  Code:  ${invite.code}`);
  console.log(`  Until: ${invite.expiresAt.toISOString()}`);
  console.log('');
  console.log('Open the URL, enter the code, set a password — that activates');
  console.log('Better Auth (signUpEmail creates the user row at that moment).');
  console.log('');
}

async function run(): Promise<void> {
  console.log('Seeding lms-backend fixtures...\n');
  await ensureLocation();
  await ensureRoles();
  await ensureStations();
  const masterId = await ensureMasterEmployee();
  await printInvite(masterId, 'en');
}

run()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await closeDb();
  });
