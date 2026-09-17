import 'dotenv/config';
import crypto from 'node:crypto';
import { Command } from 'commander';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../db/client';
import { employees, stations, type ClearanceLevel } from '../db/schema';
import { createInvite } from '../auth/invites';
import { uniqueEmployeeName } from '../services/employee-name';

// ============================================================================
// Almentria Mexicana LMS — admin CLI
// ============================================================================
// Two flows:
//   1. bootstrap — first-time setup. Creates a single master-clearance
//      employee and an invite for them. There is no prior admin to issue
//      the invite, so the invite's createdBy points at the bootstrapping
//      employee themselves (self-invite). The operator opens the printed
//      URL, enters the 5-digit code, and sets a password.
//   2. add-employee — admin creates an employee and prints the invite URL
//      + code for the new hire. Same flow as the admin form.
//
// CLI does NOT set passwords. Passwords are provisioned via the activation
// flow (POST /api/auth/activate) so we have one canonical password-creation
// path that uses Better Auth's signUpEmail + scrypt hashing.
// ============================================================================

const PUBLIC_WEB_BASE_URL =
  process.env.PUBLIC_WEB_BASE_URL ?? 'http://localhost:3000';

function requireBootstrapToken(cmdToken: string | undefined): void {
  const expected = process.env.ADMIN_BOOTSTRAP_TOKEN;
  if (!expected) {
    console.error('Error: ADMIN_BOOTSTRAP_TOKEN env var is not set.');
    process.exit(1);
  }
  if (cmdToken !== expected) {
    console.error('Error: invalid --token.');
    process.exit(1);
  }
}

function printInviteBlock(opts: {
  languagePref: 'en' | 'es';
  token: string;
  code: string;
  expiresAt: Date;
  employeeName: string;
}): void {
  const url = `${PUBLIC_WEB_BASE_URL}/${opts.languagePref}/activate/${opts.token}`;
  console.log('');
  console.log('Employee created.');
  console.log(`  Name:        ${opts.employeeName}`);
  console.log(`  Activate:    ${url}`);
  console.log(`  Code:        ${opts.code}`);
  console.log(`  Expires:     ${opts.expiresAt.toISOString()}`);
  console.log('');
}

const program = new Command();
program
  .name('admin')
  .description('Almentria Mexicana LMS — admin CLI')
  .version('0.1.0');


program
  .command('bootstrap')
  .description(
    'Create the first master-clearance employee + invite. Refuses to run if a master employee already exists.',
  )
  .requiredOption('--token <token>', 'Must match ADMIN_BOOTSTRAP_TOKEN env var')
  .requiredOption('--name <name>', 'Display name (login identifier)')
  .requiredOption('--location <id>', 'Location ID')
  .requiredOption('--role <id>', 'Role ID (should have clearance_level=master)')
  .option('--language <en|es>', 'Language preference', 'en')
  .action(async (opts) => {
    requireBootstrapToken(opts.token);

    const existing = await db
      .select({ id: employees.id })
      .from(employees)
      .where(eq(employees.clearanceLevel, 'master'))
      .limit(1);

    if (existing.length > 0) {
      console.error(
        'Error: A master employee already exists. Use `add-employee --clearance=master` to add more.',
      );
      process.exit(1);
    }

    const name = await uniqueEmployeeName(opts.location, opts.name);
    const employeeId = crypto.randomUUID();
    const languagePref = opts.language === 'es' ? 'es' : 'en';

    await db.insert(employees).values({
      id: employeeId,
      name,
      locationId: opts.location,
      roleId: opts.role,
      clearanceLevel: 'master',
      languagePref,
      status: 'pending',
      mustResetPassword: false,
    });

    // Self-invite: no prior admin exists, so the invite's createdBy points
    // at the bootstrapping employee. The activate flow sets the password
    // via Better Auth's signUpEmail, then the userId is linked.
    const invite = await createInvite({
      employeeId,
      createdBy: employeeId,
    });

    printInviteBlock({
      languagePref,
      token: invite.token,
      code: invite.code,
      expiresAt: invite.expiresAt,
      employeeName: name,
    });
  });


const CLEARANCE_LEVELS: ClearanceLevel[] = [
  'general',
  'station',
  'confidential',
  'master',
];

program
  .command('add-employee')
  .description(
    'Create a new employee + invite. Prints the activation URL and 5-digit code.',
  )
  .requiredOption('--token <token>', 'Must match ADMIN_BOOTSTRAP_TOKEN env var')
  .requiredOption('--name <name>', 'Display name (login identifier)')
  .requiredOption('--location <id>', 'Location ID')
  .requiredOption('--role <id>', 'Role ID')
  .option('--station <id>', 'Station ID (optional)')
  .option('--clearance <level>', 'general|station|confidential|master', 'general')
  .option('--language <en|es>', 'Language preference', 'en')
  .action(async (opts) => {
    requireBootstrapToken(opts.token);

    const clearance = opts.clearance as ClearanceLevel;
    if (!CLEARANCE_LEVELS.includes(clearance)) {
      console.error(
        `Error: --clearance must be one of: ${CLEARANCE_LEVELS.join('|')}`,
      );
      process.exit(1);
    }

    const languagePref = opts.language === 'es' ? 'es' : 'en';

    const name = await uniqueEmployeeName(opts.location, opts.name);
    const employeeId = crypto.randomUUID();

    await db.insert(employees).values({
      id: employeeId,
      name,
      locationId: opts.location,
      roleId: opts.role,
      stationId: opts.station ?? null,
      clearanceLevel: clearance,
      languagePref,
      status: 'pending',
      mustResetPassword: false,
    });

    // The CLI operator is acting on behalf of an admin; reuse the bootstrap
    // token's authority. For a real audit trail, replace this with an
    // --admin <employeeId> flag once the operator is itself an employee.
    const invite = await createInvite({
      employeeId,
      createdBy: employeeId,
    });

    printInviteBlock({
      languagePref,
      token: invite.token,
      code: invite.code,
      expiresAt: invite.expiresAt,
      employeeName: name,
    });
  });



const SEED_STATIONS: Array<{ id: string; name: string; sortOrder: number }> = [
  { id: 'stn-hot-line', name: 'Hot line', sortOrder: 10 },
  { id: 'stn-cold-prep', name: 'Cold prep', sortOrder: 20 },
  { id: 'stn-tortillas', name: 'Tortilla station', sortOrder: 30 },
  { id: 'stn-sauces', name: 'Sauces & salsas', sortOrder: 40 },
  { id: 'stn-beverages', name: 'Beverage bar', sortOrder: 50 },
  { id: 'stn-dish', name: 'Dish pit', sortOrder: 60 },
];

program
  .command('seed-stations')
  .description(
    'Insert the default Mexican-restaurant station fixtures for the given location. Idempotent (ON CONFLICT DO NOTHING).',
  )
  .requiredOption('--token <token>', 'Must match ADMIN_BOOTSTRAP_TOKEN env var')
  .requiredOption('--location <id>', 'Location ID to attach stations to')
  .action(async (opts) => {
    requireBootstrapToken(opts.token);

    const seedIds = SEED_STATIONS.map((s) => s.id);
    const before = await db
      .select({ id: stations.id })
      .from(stations)
      .where(inArray(stations.id, seedIds));

    await db
      .insert(stations)
      .values(
        SEED_STATIONS.map((s) => ({
          id: s.id,
          name: s.name,
          locationId: opts.location,
          sortOrder: s.sortOrder,
          isArchived: false,
        })),
      )
      .onConflictDoNothing();

    const after = await db
      .select({ id: stations.id, name: stations.name, sortOrder: stations.sortOrder })
      .from(stations)
      .where(inArray(stations.id, seedIds))
      .orderBy(stations.sortOrder);

    const inserted = after.length - before.length;
    console.log(`location=${opts.location} requested=${SEED_STATIONS.length} already_present=${before.length} inserted=${inserted}`);
    for (const row of after) {
      console.log(`  ${row.id} | ${row.name} (sort=${row.sortOrder})`);
    }
  });



program.parseAsync().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
