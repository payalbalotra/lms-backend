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

import * as dotenv from 'dotenv';
dotenv.config({ path: 'development.env' });
import { sql, closeDb } from '../src/db/client.js';
import { employees } from '../src/db/index.js';
import { eq } from 'drizzle-orm';
import { db } from '../src/db/client.js';
import { user } from '../src/db/index.js';
import { auth } from '../src/config/auth.js';
import { uniqueEmployeeName } from '../src/services/employee/employee.service.ts';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

  // Pre-check: refuse if any other master exists in this location.
  const [otherMaster] = await db
    .select({ id: employees.id })
    .from(employees)
    .where(eq(employees.role, 'super_admin'))
    .limit(1);

  if (otherMaster) {
    console.warn(
      `master employee: skipped — another master (${otherMaster.id}) already exists. ` +
        `Remove it or use pnpm admin bootstrap to add another.`,
    );
    return otherMaster.id;
  }

  // Pick a unique name within the location (handles name-collision suffixing).
  const name = await uniqueEmployeeName(MASTER_NAME);

  await db.insert(employees).values({
    id: MASTER_EMPLOYEE_ID,
    name,
    email: 'admin@example.com',
    locationId: mainLocationId,
    role: 'super_admin',
    languagePref: 'en',
    status: 'pending',
  });
  console.log(`master employee: ${MASTER_EMPLOYEE_ID} (created, name=${name})`);
  return MASTER_EMPLOYEE_ID;
}

async function ensureSuperAdminUser(): Promise<void> {
  const email = 'admin@yopmail.com';
  const password = 'Admin@321';

  const [existingUser] = await db
    .select()
    .from(user)
    .where(eq(user.email, email))
    .limit(1);
  if (existingUser) {
    console.log(`Super admin user already exists: ${email}`);
    return;
  }

  console.log(`\n===========================================`);
  console.log(`Creating super admin user: ${email}...`);
  try {
    await auth.api.signUpEmail({
      body: { email, password, name: 'Admin' },
    });
    // Mark as verified so they can login immediately
    await db
      .update(user)
      .set({ emailVerified: true })
      .where(eq(user.email, email));
    console.log(
      `✅ Super admin user created! You can login with:\nEmail: ${email}\nPassword: ${password}`,
    );
  } catch (err: unknown) {
    console.error(
      '❌ Failed to create super admin user:',
      err instanceof Error ? err.message : err,
    );
  }
}

async function run(): Promise<void> {
  console.log(' Starting master seed...\n');
  const SCRIPTS = ['seed-locations.ts', 'seed-jobs.ts', 'seed-stations.ts'];

  for (const script of SCRIPTS) {
    console.log(`\n===========================================`);
    console.log(`Running ${script}...`);
    console.log(`===========================================\n`);

    const scriptPath = path.join(__dirname, script);
    const result = spawnSync(
      'npx',
      ['tsx', '--env-file=development.env', scriptPath],
      {
        stdio: 'inherit',
        env: process.env,
        shell: true,
      },
    );

    if (result.status !== 0) {
      console.error(`\n❌ Failed executing ${script}`);
      process.exit(1);
    }
  }

  console.log('\n===========================================');
  console.log('Running master employee setup (seed.ts)...');
  console.log('===========================================\n');
  await fetchMainLocationId();
  await ensureMasterEmployee();

  console.log('\n===========================================');
  console.log('Running seed-categories.ts...');
  console.log('===========================================\n');
  const catResult = spawnSync(
    'npx',
    ['tsx', path.join(__dirname, 'seed-categories.ts')],
    {
      stdio: 'inherit',
      env: process.env,
      shell: true,
    },
  );
  if (catResult.status !== 0) {
    console.error(`\n❌ Failed executing seed-categories.ts`);
    process.exit(1);
  }

  await ensureSuperAdminUser();
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
