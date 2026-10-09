import {
  type SQL,
  and,
  asc,
  count,
  eq,
  ilike,
  inArray,
  ne,
  or,
  sql,
} from 'drizzle-orm';
import { db, type Tx } from '../../db/client.ts';
import {
  employees,
  locations,
  stations,
  jobs,
  session,
  user,
} from '../../db/schema/index.ts';
import ApiError from '../../shared/api-error.ts';
import type {
  Employee,
  LanguagePref,
  Role,
  EmployeeStatus,
} from '../../db/schema/index.ts';
import { auth, magicLinkUrls } from '../../lib/auth.ts';
import config from '../../config/env.ts';

export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').normalize('NFC');
}

// Removed uniqueEmployeeName as per user request

// ============================================================================
// Magic link invite
// ============================================================================

/**
 * Sends a Better Auth magic link to the employee email.
 * Returns the invite URL so the caller can also share it manually.
 *
 * Better Auth generates and hashes the token internally, storing it
 * in the verification table. No custom crypto needed here.
 */
export async function sendInviteMagicLink(input: {
  email: string;
  languagePref: LanguagePref;
}): Promise<string> {
  await auth.api.signInMagicLink({
    body: {
      email: input.email,
      newUserCallbackURL: `${config.frontendBaseUrl}/${input.languagePref}/set-password`,
      callbackURL: `${config.frontendBaseUrl}/${input.languagePref}/dashboard`,
    },
    headers: new Headers({ 'Content-Type': 'application/json' }),
  });

  const uglyUrl = magicLinkUrls.get(input.email) || '';
  magicLinkUrls.delete(input.email);

  if (!uglyUrl) return '';

  const parsed = new URL(uglyUrl);
  const token = parsed.searchParams.get('token');

  return `${config.frontendBaseUrl}/${input.languagePref}/invite/token?token=${token}`;
}

// ============================================================================
// Reference checks
// ============================================================================

/**
 * Checks, in a single query, that the location, stations and jobs exist and
 * that the email / employee code are free. Ids arrive lowercased and
 * de-duplicated from the validation schema, so counts can be compared
 * directly. Errors are thrown in the same order as before: location,
 * stations, jobs, employee code, email.
 */
async function assertReferences(
  tx: Tx,
  input: {
    locationId: string;
    stationIds: string[];
    jobIds: string[];
    email: string;
    employeeCode?: string | null | undefined;
    // When updating, the employee being edited does not count as a clash.
    excludeEmployeeId?: string;
  },
): Promise<void> {
  const notSelf = input.excludeEmployeeId
    ? ne(employees.id, input.excludeEmployeeId)
    : undefined;
  const codeTaken = input.employeeCode
    ? sql`exists (select 1 from ${employees} where ${and(eq(employees.employeeCode, input.employeeCode), notSelf)})`
    : sql`false`;
  const [r] = await tx.execute<{
    location_ok: boolean;
    stations_found: number;
    jobs_found: number;
    code_taken: boolean;
    email_taken: boolean;
  }>(sql`
    select
      exists (select 1 from ${locations} where ${eq(locations.id, input.locationId)}) as location_ok,
      (select count(*)::int from ${stations} where ${inArray(stations.id, input.stationIds)}) as stations_found,
      (select count(*)::int from ${jobs} where ${inArray(jobs.id, input.jobIds)}) as jobs_found,
      ${codeTaken} as code_taken,
      exists (select 1 from ${employees} where ${and(eq(employees.email, input.email), notSelf)}) as email_taken
  `);

  if (!r?.location_ok)
    throw new ApiError('Unknown location', 400, true, '', {
      code: 'LOCATION_NOT_FOUND',
    });
  if (r.stations_found !== input.stationIds.length)
    throw new ApiError('One or more unknown stations', 400, true, '', {
      code: 'STATION_NOT_FOUND',
    });
  if (r.jobs_found !== input.jobIds.length)
    throw new ApiError('One or more unknown jobs', 400, true, '', {
      code: 'JOB_NOT_FOUND',
    });
  if (r.code_taken)
    throw new ApiError('That employee code is already in use.', 409, true, '', {
      code: 'EMPLOYEE_CODE_TAKEN',
    });
  if (r.email_taken)
    throw new ApiError('That email is already in use.', 409, true, '', {
      code: 'EMAIL_TAKEN',
    });
}

const employeeNotFound = () =>
  new ApiError('Employee not found', 404, true, '', {
    code: 'EMPLOYEE_NOT_FOUND',
  });

// ============================================================================
// Employee creation transaction
// ============================================================================

export async function createEmployeeTransaction(
  input: {
    name: string;
    email: string;
    locationId: string;
    role: string;
    jobIds?: string[];
    stationIds?: string[];
    employeeCode?: string | null | undefined;
    languagePref: LanguagePref;
  },
  adminId: string,
) {
  void adminId;
  const jobIds = input.jobIds ?? [];
  const stationIds = input.stationIds ?? [];

  return db.transaction(async (tx) => {
    await assertReferences(tx, {
      locationId: input.locationId,
      stationIds,
      jobIds,
      email: input.email,
      employeeCode: input.employeeCode,
    });

    const [row] = await tx
      .insert(employees)
      .values({
        name: normalizeName(input.name),
        employeeCode: input.employeeCode ?? null,
        email: input.email,
        locationId: input.locationId,
        role: (input.role as Role) ?? 'employee',
        jobIds,
        stationIds,
        languagePref: input.languagePref,
        status: 'pending',
      })
      .returning();
    if (!row)
      throw new ApiError('Inserted employee not found', 500, true, '', {
        code: 'INTERNAL_ERROR',
      });

    return { employee: row };
  });
}

// ============================================================================
// Employee update transaction
// ============================================================================

export async function updateEmployeeTransaction(
  id: string,
  input: {
    name: string;
    email: string;
    locationId: string;
    role: string;
    jobIds?: string[];
    stationIds?: string[];
    languagePref: LanguagePref;
    status?: EmployeeStatus | undefined;
  },
  adminId: string,
) {
  void adminId;
  const jobIds = input.jobIds ?? [];
  const stationIds = input.stationIds ?? [];

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({
        id: employees.id,
        email: employees.email,
        userId: employees.userId,
      })
      .from(employees)
      .where(eq(employees.id, id))
      .limit(1);
    if (!existing) throw employeeNotFound();

    await assertReferences(tx, {
      locationId: input.locationId,
      stationIds,
      jobIds,
      email: input.email,
      excludeEmployeeId: id,
    });

    // The login email lives on the Better Auth user. Keep it in step with
    // the employee email, otherwise the employee can only log in with the
    // old address.
    if (existing.userId && input.email !== existing.email) {
      const [clash] = await tx
        .select({ id: user.id })
        .from(user)
        .where(and(eq(user.email, input.email), ne(user.id, existing.userId)))
        .limit(1);
      if (clash)
        throw new ApiError('That email is already in use.', 409, true, '', {
          code: 'EMAIL_TAKEN',
        });
      await tx
        .update(user)
        .set({ email: input.email })
        .where(eq(user.id, existing.userId));
    }

    const [updated] = await tx
      .update(employees)
      .set({
        name: normalizeName(input.name),
        email: input.email,
        locationId: input.locationId,
        role: (input.role as Role) ?? 'employee',
        jobIds,
        stationIds,
        languagePref: input.languagePref,
        ...(input.status && { status: input.status }),
      })
      .where(eq(employees.id, id))
      .returning();
    if (!updated)
      throw new ApiError('Error updating employee', 500, true, '', {
        code: 'INTERNAL_ERROR',
      });

    return { employee: updated };
  });
}

// ============================================================================
// Reads
// ============================================================================

export async function listEmployees(input: {
  limit: number;
  offset: number;
  search?: string | undefined;
  status: EmployeeStatus | 'all';
}): Promise<{
  rows: { employee: Employee; locationName: string | null }[];
  total: number;
}> {
  const conditions: SQL[] = [];
  if (input.status !== 'all') {
    conditions.push(eq(employees.status, input.status));
  }
  if (input.search) {
    conditions.push(
      or(
        ilike(employees.name, `%${input.search}%`),
        ilike(employees.email, `%${input.search}%`),
      )!,
    );
  }
  const whereClause = conditions.length ? and(...conditions) : undefined;

  // Page query and count are independent, so run them in parallel. The
  // explicit order keeps pages stable between requests.
  const [rows, [countRes]] = await Promise.all([
    db
      .select({ employee: employees, locationName: locations.name })
      .from(employees)
      .leftJoin(locations, eq(locations.id, employees.locationId))
      .where(whereClause)
      .orderBy(asc(employees.createdAt), asc(employees.id))
      .limit(input.limit)
      .offset(input.offset),
    db.select({ total: count() }).from(employees).where(whereClause),
  ]);

  return { rows, total: countRes?.total ?? 0 };
}

export async function getEmployee(id: string): Promise<Employee> {
  const [employee] = await db
    .select()
    .from(employees)
    .where(eq(employees.id, id))
    .limit(1);
  if (!employee) throw employeeNotFound();
  return employee;
}

// ============================================================================
// Invites and status changes
// ============================================================================
// These endpoints answer some conflicts with the older
// { error: { code, message } } body instead of the ApiError shape, so the
// service reports them as a `conflict` result and the controller keeps
// sending that exact body.

export interface Conflict {
  conflict: { code: string; message: string };
}

export async function resendInvite(
  id: string,
): Promise<{ inviteUrl: string } | Conflict> {
  const employee = await getEmployee(id);
  if (employee.status !== 'pending') {
    return {
      conflict: {
        code: 'EMPLOYEE_NOT_PENDING',
        message: 'Only pending employees can be re-invited.',
      },
    };
  }

  // Better Auth automatically invalidates the old token when a new
  // magic link is requested for the same email (verification table
  // entries expire; new one replaces semantics via TTL).
  const inviteUrl = await sendInviteMagicLink({
    email: employee.email,
    languagePref: employee.languagePref,
  });
  return { inviteUrl };
}

export async function deactivateEmployee(
  id: string,
): Promise<{ employee: Employee } | Conflict> {
  return db.transaction(async (tx) => {
    // Only flips rows that are not deactivated yet; no row back means the
    // employee is unknown or already deactivated.
    const [updated] = await tx
      .update(employees)
      .set({ status: 'deactivated', deactivatedAt: new Date() })
      .where(and(eq(employees.id, id), ne(employees.status, 'deactivated')))
      .returning();

    if (!updated) {
      await getEmployee(id); // throws 404 when it does not exist
      return {
        conflict: {
          code: 'ALREADY_DEACTIVATED',
          message: 'Employee is already deactivated.',
        },
      };
    }

    // Kill every active Better Auth session for this employee. If the
    // employee never activated, employees.userId is null and this is a no-op.
    if (updated.userId) {
      await tx.delete(session).where(eq(session.userId, updated.userId));
    }
    return { employee: updated };
  });
}

export async function reactivateEmployee(
  id: string,
): Promise<{ employee: Employee } | Conflict> {
  const [updated] = await db
    .update(employees)
    .set({ status: 'active', deactivatedAt: null })
    .where(and(eq(employees.id, id), eq(employees.status, 'deactivated')))
    .returning();

  if (!updated) {
    await getEmployee(id); // throws 404 when it does not exist
    return {
      conflict: {
        code: 'NOT_DEACTIVATED',
        message: 'Employee is not deactivated.',
      },
    };
  }
  return { employee: updated };
}
