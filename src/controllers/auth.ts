import type { Request, Response } from 'express';
import { z } from 'zod';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { employees, type Employee } from '../db/schema';
import { verifyPassword } from '../auth/password';
import {
  createSession,
  validateSession,
  revokeSession,
  type DeviceMode,
} from '../auth/session';
import {
  setSessionCookie,
  clearSessionCookie,
  readSessionCookie,
} from '../auth/cookies';
import {
  isLocked,
  recordFailedLogin,
  recordSuccessfulLogin,
} from '../auth/ratelimit';

// ============================================================================
// POST /api/auth/login
// ============================================================================

const loginSchema = z.object({
  name: z.string().min(1).max(120),
  password: z.string().min(1).max(200),
  locationId: z.string().min(1).max(64),
  deviceMode: z.enum(['personal', 'shared']).optional().default('personal'),
});

export async function login(req: Request, res: Response): Promise<void> {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: { code: 'INVALID_INPUT', message: 'Invalid input' },
    });
    return;
  }

  const { name, password, locationId, deviceMode } = parsed.data;
  const rateKey = `${locationId}:${name.toLowerCase()}`;

  const lockCheck = isLocked(rateKey);
  if (lockCheck.locked) {
    res.status(423).json({
      error: {
        code: 'ACCOUNT_LOCKED',
        message: 'Too many failed attempts. Try again later.',
      },
      lockedUntil: lockCheck.lockedUntil,
    });
    return;
  }

  const [employee] = await db
    .select()
    .from(employees)
    .where(
      and(
        eq(employees.locationId, locationId),
        sql`lower(${employees.name}) = ${name.toLowerCase()}`,
        eq(employees.status, 'active'),
      ),
    )
    .limit(1);

  // Always run verifyPassword even if employee missing, to keep timing constant.
  const hashToCheck =
    employee?.passwordHash ??
    '$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinva';
  const ok = await verifyPassword(password, hashToCheck);

  if (!employee || !employee.passwordHash || !ok) {
    recordFailedLogin(rateKey);
    res.status(401).json({
      error: { code: 'INVALID_CREDENTIALS', message: 'Invalid name or password' },
    });
    return;
  }

  recordSuccessfulLogin(rateKey);

  const ip = req.ip;
  const userAgent = req.get('user-agent') ?? undefined;
  const { token, maxAgeMs } = await createSession({
    employeeId: employee.id,
    ip,
    userAgent,
    deviceMode: deviceMode as DeviceMode,
  });

  setSessionCookie(res, token, maxAgeMs);
  res.json({ employee: publicEmployee(employee) });
}

// ============================================================================
// POST /api/auth/logout
// ============================================================================

export async function logout(req: Request, res: Response): Promise<void> {
  const token = readSessionCookie(req);
  if (token) await revokeSession(token);
  clearSessionCookie(res);
  res.json({ ok: true });
}

// ============================================================================
// GET /api/auth/me
// ============================================================================

export async function me(req: Request, res: Response): Promise<void> {
  const token = readSessionCookie(req);
  if (!token) {
    res.status(401).json({
      error: { code: 'UNAUTHENTICATED', message: 'Not authenticated' },
    });
    return;
  }

  const deviceMode: DeviceMode =
    req.headers['x-device-mode'] === 'shared' ? 'shared' : 'personal';

  const session = await validateSession(token, deviceMode);
  if (!session) {
    res.status(401).json({
      error: { code: 'SESSION_INVALID', message: 'Session expired or invalid' },
    });
    return;
  }

  const [employee] = await db
    .select()
    .from(employees)
    .where(eq(employees.id, session.employeeId))
    .limit(1);

  if (!employee) {
    res.status(401).json({
      error: { code: 'EMPLOYEE_NOT_FOUND', message: 'Employee not found' },
    });
    return;
  }

  res.json({ employee: publicEmployee(employee) });
}

// ============================================================================
// Helpers
// ============================================================================

function publicEmployee(e: Employee) {
  return {
    id: e.id,
    name: e.name,
    locationId: e.locationId,
    roleId: e.roleId,
    stationId: e.stationId,
    clearanceLevel: e.clearanceLevel,
    languagePref: e.languagePref,
  };
}