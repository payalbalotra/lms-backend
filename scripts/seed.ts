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
import { sql, closeDb } from '../src/db/client.js';
import { employees, roles } from '../src/db/schema.js';
import { eq } from 'drizzle-orm';
import { db } from '../src/db/client.js';
import { createInvite } from '../src/auth/invites.js';
import { uniqueEmployeeName } from '../src/services/employee/employee.service.ts';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PUBLIC_WEB_BASE_URL =
  process.env.PUBLIC_WEB_BASE_URL ?? 'http://localhost:3000';

// We still keep a reference to the main location ID for seeding stations and the master user
const MAIN_LOCATION_NAME = 'Mexicana Main';
let mainLocationId = '';

async function fetchMainLocationId(): Promise<void> {
  const existing =
    await sql`SELECT id FROM locations WHERE name = ${MAIN_LOCATION_NAME}`;
  if (existing.length === 0) {
    throw new Error(
      `Location '${MAIN_LOCATION_NAME}' not found. Please run seed-locations.ts first.`,
    );
  }
  mainLocationId = existing[0].id;
}

const MASTER_NAME = 'admin';
const MASTER_EMPLOYEE_ID = '00000000-0000-0000-0000-000000000000';

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

  // Find super_admin role
  const [superAdminRole] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.name, 'super_admin'))
    .limit(1);

  if (!superAdminRole) {
    throw new Error('super_admin role not found. Run seed-roles first.');
  }

  // Pre-check: refuse if any other master exists in this location.
  const [otherMaster] = await db
    .select({ id: employees.id })
    .from(employees)
    .where(eq(employees.roleId, superAdminRole.id))
    .limit(1);

  if (otherMaster) {
    console.warn(
      `master employee: skipped — another master (${otherMaster.id}) already exists. ` +
        `Remove it or use pnpm admin bootstrap to add another.`,
    );
    return otherMaster.id;
  }

  // Pick a unique name within the location (handles name-collision suffixing).
  const name = await uniqueEmployeeName(mainLocationId, MASTER_NAME);

  await db.insert(employees).values({
    id: MASTER_EMPLOYEE_ID,
    name,
    locationId: mainLocationId,
    roleId: superAdminRole.id,
    languagePref: 'en',
    status: 'pending',
  });
  console.log(`master employee: ${MASTER_EMPLOYEE_ID} (created, name=${name})`);
  return MASTER_EMPLOYEE_ID;
}

async function printInvite(
  employeeId: string,
  languagePref: 'en' | 'es',
): Promise<void> {
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
  console.log('🌱 Starting master seed...\n');
  const SCRIPTS = [
    'seed-locations.ts',
    'seed-roles.ts',
    'seed-jobs.ts',
    'seed-stations.ts',
  ];

  for (const script of SCRIPTS) {
    console.log(`\n===========================================`);
    console.log(`Running ${script}...`);
    console.log(`===========================================\n`);

    const scriptPath = path.join(__dirname, script);
    const result = spawnSync('npx', ['tsx', scriptPath], {
      stdio: 'inherit',
      env: process.env,
      shell: true,
    });

    if (result.status !== 0) {
      console.error(`\n❌ Failed executing ${script}`);
      process.exit(1);
    }
  }

  console.log('\n===========================================');
  console.log('Running master employee setup (seed.ts)...');
  console.log('===========================================\n');
  await fetchMainLocationId();
  const masterId = await ensureMasterEmployee();
  await printInvite(masterId, 'en');
  console.log('\n✅ All seeds completed successfully!');
}

run()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await closeDb();
  });
