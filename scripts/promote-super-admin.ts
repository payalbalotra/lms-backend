// ============================================================================
// Grant (or revoke) super admin access for an existing user.
//
//   pnpm admin:promote <email>            grant
//   pnpm admin:promote <email> --revoke   revoke
//
// Super admin = a Better Auth user with role 'super_admin' and no employee
// row. The role can only be set here (or by SQL), never through sign-up.
// ============================================================================

import { eq } from 'drizzle-orm';
import { db, closeDb } from '../src/db/client.ts';
import {
  user,
  employees,
  SUPER_ADMIN_USER_ROLE,
} from '../src/db/schema/index.ts';

async function run(): Promise<void> {
  const email = process.argv[2]?.trim().toLowerCase();
  const revoke = process.argv.includes('--revoke');
  if (!email) {
    console.error('Usage: pnpm admin:promote <email> [--revoke]');
    process.exitCode = 1;
    return;
  }

  const [row] = await db
    .select({ id: user.id, role: user.role, employeeId: employees.id })
    .from(user)
    .leftJoin(employees, eq(employees.userId, user.id))
    .where(eq(user.email, email))
    .limit(1);

  if (!row) {
    console.error(`No user found with email ${email}`);
    process.exitCode = 1;
    return;
  }
  if (row.employeeId && !revoke) {
    console.error(
      `${email} is linked to employee ${row.employeeId}. Employees get their access from employees.role, not this script.`,
    );
    process.exitCode = 1;
    return;
  }

  const role = revoke ? 'user' : SUPER_ADMIN_USER_ROLE;
  await db.update(user).set({ role }).where(eq(user.id, row.id));
  console.log(`${email}: role ${row.role} -> ${role}`);
}

run()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb();
  });
