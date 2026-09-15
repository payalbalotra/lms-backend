import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { employees, invites, type Invite, type Employee } from '../db/schema';
import { generateActivationCode } from './code';

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
export async function createInvite(input: {
  employeeId: string;
  createdBy: string;
  ttlMs?: number;
}): Promise<CreatedInvite> {
  const ttlMs = input.ttlMs ?? DEFAULT_TTL_MS;
  const token = crypto.randomBytes(32).toString('base64url');
  const code = generateActivationCode();
  const codeHash = await hashPassword(code);
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + ttlMs);

  await db
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
  await db.insert(invites).values({
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

export async function lookupInvite(token: string): Promise<
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
export async function consumeInvite(
  token: string,
  newPasswordHash: string,
): Promise<Employee> {
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
    if (row.expiresAt.getTime() <= Date.now()) throw new Error('INVITE_EXPIRED');

    const [updated] = await tx
      .update(employees)
      .set({
        passwordHash: newPasswordHash,
        status: 'active',
        mustResetPassword: false,
        failedLoginAttempts: 0,
        lockedUntil: null,
      })
      .where(eq(employees.id, row.employeeId))
      .returning();
    if (!updated) throw new Error('EMPLOYEE_NOT_FOUND');

    await tx
      .update(invites)
      .set({ usedAt: now })
      .where(eq(invites.id, row.id));

    return updated;
  });
}

// Reusable cancel — used by the resend handler.
export async function cancelOutstandingInvites(employeeId: string): Promise<number> {
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