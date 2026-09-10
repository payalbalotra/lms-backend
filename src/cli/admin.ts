import 'dotenv/config';
import crypto from 'node:crypto';
import { Command } from 'commander';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../db/client';
import { employees, stations, type ClearanceLevel } from '../db/schema';
import { hashPassword } from '../auth/password';
import { uniqueEmployeeName } from '../services/employee-name';



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



const program = new Command();
program
  .name('admin')
  .description('Alimentaria Mexicana LMS — admin CLI')
  .version('0.1.0');


program
  .command('bootstrap')
  .description(
    'Create the first master-clearance employee. Refuses to run if one already exists.',
  )
  .requiredOption('--token <token>', 'Must match ADMIN_BOOTSTRAP_TOKEN env var')
  .requiredOption('--name <name>', 'Display name (login identifier)')
  .requiredOption('--location <uuid>', 'Location ID')
  .requiredOption('--role <uuid>', 'Role ID (should have clearance_level=master)')
  .requiredOption('--password <password>', 'Initial password (will be bcrypt-hashed)')
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
    const passwordHash = await hashPassword(opts.password);
    const id = crypto.randomUUID();

    await db.insert(employees).values({
      id,
      name,
      locationId: opts.location,
      roleId: opts.role,
      clearanceLevel: 'master',
      languagePref: opts.language === 'es' ? 'es' : 'en',
      status: 'active',
      passwordHash,
      mustResetPassword: false,
    });

    console.log(`Created master employee: ${name} (id=${id})`);
  });



const CLEARANCE_LEVELS: ClearanceLevel[] = [
  'general',
  'station',
  'confidential',
  'master',
];

program
  .command('add-employee')
  .description('Create a new employee with a known password')
  .requiredOption('--token <token>', 'Must match ADMIN_BOOTSTRAP_TOKEN env var')
  .requiredOption('--name <name>', 'Display name (login identifier)')
  .requiredOption('--location <uuid>', 'Location ID')
  .requiredOption('--role <uuid>', 'Role ID')
  .requiredOption('--password <password>', 'Initial password (will be bcrypt-hashed)')
  .option('--station <uuid>', 'Station ID (optional)')
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
    const passwordHash = await hashPassword(opts.password);
    const id = crypto.randomUUID();

    await db.insert(employees).values({
      id,
      name,
      locationId: opts.location,
      roleId: opts.role,
      stationId: opts.station ?? null,
      clearanceLevel: clearance,
      languagePref,
      status: 'active',
      passwordHash,
      mustResetPassword: false,
    });

    console.log(`Created employee: ${name} (id=${id}, clearance=${clearance})`);
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