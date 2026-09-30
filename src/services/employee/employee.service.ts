import { and, eq, sql, gt, isNull, inArray } from 'drizzle-orm';
import { db, type Tx } from '../../db/client.ts';
import { employees } from '../../db/employee.schema.ts';
import { locations, roles, stations, jobs } from '../../db/schema.ts';
import ApiError from '../../shared/utils/ApiError.ts';
import type { LanguagePref } from '../../db/schema.ts';

export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').normalize('NFC');
}

export async function uniqueEmployeeName(
  locationId: string,
  baseName: string,
  tx?: Tx,
): Promise<string> {
  const client = tx || db;
  const normalized = normalizeName(baseName);
  const lower = normalized.toLowerCase();

  // First: try the exact base name.
  const exact = await client
    .select({ name: employees.name })
    .from(employees)
    .where(
      and(
        eq(employees.locationId, locationId),
        sql`lower(${employees.name}) = ${lower}`,
      ),
    )
    .limit(1);

  if (exact.length === 0) return normalized;

  // Otherwise: walk "Maria López 2", "Maria López 3", ... until free.
  let n = 2;
  while (true) {
    const candidate = `${normalized} ${n}`;
    const exists = await client
      .select({ name: employees.name })
      .from(employees)
      .where(
        and(
          eq(employees.locationId, locationId),
          sql`lower(${employees.name}) = ${candidate.toLowerCase()}`,
        ),
      )
      .limit(1);
    if (exists.length === 0) return candidate;
    n += 1;
    if (n > 9999) {
      throw new Error(
        `Could not find a free name suffix for "${baseName}" in location ${locationId}`,
      );
    }
  }
}

import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import {
  invites,
  type Invite,
  type Employee,
} from '../../db/employee.schema.ts';
import { generateActivationCode } from '../../auth/generatecode.ts';

// The 5-digit activation code is a low-entropy secret (10^5 ≈ 17 bits).
// Rate-limiting at the route layer is the primary defense — bcrypt just
// keeps the stored value safe at rest. bcrypt is also what was used before
// the Better Auth migration, so existing code hashes stay compatible.
const SALT_ROUNDS = 10;

function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export interface CreatedInvite {
  token: string;
  code: string;
  expiresAt: Date;
  inviteId: string;
}

// Create invite + cancel any prior outstanding invite for the same employee.
export async function createInvite(
  input: {
    employeeId: string;
    createdBy: string;
    ttlMs?: number;
  },
  tx?: Tx,
): Promise<CreatedInvite> {
  const client = tx || db;
  const ttlMs = input.ttlMs ?? DEFAULT_TTL_MS;
  const token = crypto.randomBytes(32).toString('base64url');
  const code = generateActivationCode();
  const codeHash = await hashPassword(code);
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + ttlMs);

  await client
    .update(invites)
    .set({ cancelledAt: new Date() })
    .where(
      and(
        eq(invites.employeeId, input.employeeId),
        isNull(invites.usedAt),
        isNull(invites.cancelledAt),
        gt(invites.expiresAt, sql`now()`),
      ),
    );

  const id = crypto.randomUUID();
  await client.insert(invites).values({
    id,
    employeeId: input.employeeId,
    tokenHash,
    codeHash,
    expiresAt,
    createdBy: input.createdBy,
  });

  return { token, code, expiresAt, inviteId: id };
}

export type ValidateResult =
  | { ok: true; invite: Invite; employee: Employee }
  | {
      ok: false;
      reason: 'NOT_FOUND' | 'EXPIRED' | 'USED' | 'CANCELLED' | 'INVALID_CODE';
      inviteId?: string;
    };

export async function validateInviteCode(
  token: string,
  code: string,
): Promise<ValidateResult> {
  const tokenHash = hashToken(token);
  const [row] = await db
    .select()
    .from(invites)
    .where(eq(invites.tokenHash, tokenHash))
    .limit(1);
  if (!row) return { ok: false, reason: 'NOT_FOUND' };
  if (row.cancelledAt) return { ok: false, reason: 'CANCELLED' };
  if (row.usedAt) return { ok: false, reason: 'USED' };
  if (row.expiresAt.getTime() <= Date.now())
    return { ok: false, reason: 'EXPIRED' };

  const codeOk = await verifyPassword(code, row.codeHash);
  if (!codeOk) return { ok: false, reason: 'INVALID_CODE', inviteId: row.id };

  const [employee] = await db
    .select()
    .from(employees)
    .where(eq(employees.id, row.employeeId))
    .limit(1);
  if (!employee) return { ok: false, reason: 'NOT_FOUND' };

  return { ok: true, invite: row, employee };
}

// Public-only lookup. Returns nothing secret.
//
// We surface the employee's status alongside the invite so the activation
// page can render the right state. An employee can have a perfectly valid
// invite (fresh, not cancelled, not expired, not consumed) and STILL be
// already activated — e.g. admin clicked "Resend invite" after a previous
// activation succeeded. The page needs to know that to skip the form.
export interface InviteLookup {
  inviteId: string;
  employeeName: string;
  expiresAt: Date;
  employeeStatus: 'pending' | 'active' | 'deactivated';
}

export async function lookupInvite(
  token: string,
): Promise<
  | { ok: true; lookup: InviteLookup }
  | { ok: false; reason: 'NOT_FOUND' | 'EXPIRED' | 'USED' | 'CANCELLED' }
> {
  const tokenHash = hashToken(token);
  const [row] = await db
    .select({
      invite: invites,
      employeeName: employees.name,
      employeeStatus: employees.status,
    })
    .from(invites)
    .innerJoin(employees, eq(employees.id, invites.employeeId))
    .where(eq(invites.tokenHash, tokenHash))
    .limit(1);
  if (!row) return { ok: false, reason: 'NOT_FOUND' };
  if (row.invite.cancelledAt) return { ok: false, reason: 'CANCELLED' };
  if (row.invite.usedAt) return { ok: false, reason: 'USED' };
  if (row.invite.expiresAt.getTime() <= Date.now())
    return { ok: false, reason: 'EXPIRED' };

  return {
    ok: true,
    lookup: {
      inviteId: row.invite.id,
      employeeName: row.employeeName,
      expiresAt: row.invite.expiresAt,
      employeeStatus: row.employeeStatus,
    },
  };
}

// Atomically: set password, flip status to active, mark invite used.
export async function consumeInvite(token: string): Promise<Employee> {
  const tokenHash = hashToken(token);
  const now = new Date();

  return await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(invites)
      .where(eq(invites.tokenHash, tokenHash))
      .for('update')
      .limit(1);
    if (!row) throw new Error('INVITE_NOT_FOUND');
    if (row.cancelledAt) throw new Error('INVITE_CANCELLED');
    if (row.usedAt) throw new Error('INVITE_ALREADY_USED');
    if (row.expiresAt.getTime() <= Date.now())
      throw new Error('INVITE_EXPIRED');

    const [updated] = await tx
      .update(employees)
      .set({
        status: 'active',
      })
      .where(eq(employees.id, row.employeeId))
      .returning();
    if (!updated) throw new Error('EMPLOYEE_NOT_FOUND');

    await tx.update(invites).set({ usedAt: now }).where(eq(invites.id, row.id));

    return updated;
  });
}

// Reusable cancel — used by the resend handler.
export async function cancelOutstandingInvites(
  employeeId: string,
): Promise<number> {
  const result = await db
    .update(invites)
    .set({ cancelledAt: new Date() })
    .where(
      and(
        eq(invites.employeeId, employeeId),
        isNull(invites.usedAt),
        isNull(invites.cancelledAt),
        gt(invites.expiresAt, sql`now()`),
      ),
    )
    .returning({ id: invites.id });
  return result.length;
}

export async function createEmployeeTransaction(
  input: {
    name: string;
    email?: string | null;
    locationId: string;
    roleId: string;
    jobIds?: string[];
    stationIds?: string[];
    employeeCode?: string | null;
    languagePref: LanguagePref;
  },
  adminId: string,
) {
  return db.transaction(async (tx) => {
    // 1. Validations
    const [loc] = await tx
      .select({ id: locations.id })
      .from(locations)
      .where(eq(locations.id, input.locationId))
      .limit(1);
    if (!loc)
      throw new ApiError('Unknown location', 400, true, '', {
        code: 'LOCATION_NOT_FOUND',
      });

    const [role] = await tx
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.id, input.roleId))
      .limit(1);
    if (!role)
      throw new ApiError('Unknown role', 400, true, '', {
        code: 'ROLE_NOT_FOUND',
      });

    if (input.stationIds && input.stationIds.length > 0) {
      const st = await tx
        .select({ id: stations.id })
        .from(stations)
        .where(inArray(stations.id, input.stationIds));
      if (st.length !== input.stationIds.length) {
        throw new ApiError('One or more unknown stations', 400, true, '', {
          code: 'STATION_NOT_FOUND',
        });
      }
    }

    if (input.jobIds && input.jobIds.length > 0) {
      const jb = await tx
        .select({ id: jobs.id })
        .from(jobs)
        .where(inArray(jobs.id, input.jobIds));
      if (jb.length !== input.jobIds.length) {
        throw new ApiError('One or more unknown jobs', 400, true, '', {
          code: 'JOB_NOT_FOUND',
        });
      }
    }

    if (input.employeeCode) {
      const [codeHit] = await tx
        .select({ id: employees.id })
        .from(employees)
        .where(eq(employees.employeeCode, input.employeeCode))
        .limit(1);
      if (codeHit)
        throw new ApiError(
          'That employee code is already in use.',
          409,
          true,
          '',
          { code: 'EMPLOYEE_CODE_TAKEN' },
        );
    }

    if (input.email) {
      const [emailHit] = await tx
        .select({ id: employees.id })
        .from(employees)
        .where(eq(employees.email, input.email))
        .limit(1);
      if (emailHit)
        throw new ApiError('That email is already in use.', 409, true, '', {
          code: 'EMAIL_TAKEN',
        });
    }

    // 2. Insert employee
    const employeeName = await uniqueEmployeeName(
      input.locationId,
      input.name,
      tx,
    );
    const employeeId = crypto.randomUUID();
    await tx.insert(employees).values({
      id: employeeId,
      name: employeeName,
      employeeCode: input.employeeCode ?? null,
      email: input.email ?? null,
      locationId: input.locationId,
      roleId: input.roleId,
      jobIds: input.jobIds ?? [],
      stationIds: input.stationIds ?? [],
      languagePref: input.languagePref,
      status: 'pending',
    });

    // 3. Create Invite
    const invite = await createInvite(
      {
        employeeId,
        createdBy: adminId,
      },
      tx,
    );

    const [row] = await tx
      .select()
      .from(employees)
      .where(eq(employees.id, employeeId))
      .limit(1);
    if (!row)
      throw new ApiError('Inserted employee not found', 500, true, '', {
        code: 'INTERNAL_ERROR',
      });

    return { employee: row, invite };
  });
}
