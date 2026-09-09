import 'dotenv/config';
import crypto from 'node:crypto';
import { Command } from 'commander';
import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { employees, type ClearanceLevel } from '../db/schema';
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



program.parseAsync().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});