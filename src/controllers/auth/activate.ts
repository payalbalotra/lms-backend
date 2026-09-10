import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  consumeInvite,
  validateInviteCode,
} from '../../auth/invites';
import { hashPassword } from '../../auth/password';
import { createSession } from '../../auth/session';
import { setSessionCookie } from '../../auth/cookies';
import {
  isLocked,
  recordFailedLogin,
  recordSuccessfulLogin,
} from '../../auth/ratelimit';
import type { DeviceMode } from '../../auth/session';

const activateSchema = z.object({
  token: z.string().min(16).max(128),
  code: z.string().regex(/^\d{5}$/),
  password: z.string().min(8).max(200),
  deviceMode: z.enum(['personal', 'shared']).optional().default('personal'),
});

export async function activate(req: Request, res: Response): Promise<void> {
  const parsed = activateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: {
        code: 'INVALID_INPUT',
        message: 'Invalid input',
        details: parsed.error.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      },
    });
    return;
  }

  const { token, code, password, deviceMode } = parsed.data;

  const validation = await validateInviteCode(token, code);

  // Wrong code on an existing invite → rate-limit on the invite id.
  if (!validation.ok && validation.reason === 'INVALID_CODE' && validation.inviteId) {
    const lockKey = `invite:${validation.inviteId}`;
    const lock = recordFailedLogin(lockKey);
    if (lock.locked) {
      res.status(423).json({
        error: {
          code: 'ACCOUNT_LOCKED',
          message: 'Too many failed attempts.',
        },
        lockedUntil: lock.lockedUntil,
      });
      return;
    }
    res.status(401).json({
      error: { code: 'INVALID_CODE', message: 'That code does not match.' },
    });
    return;
  }

  if (!validation.ok) {
    let status = 404;
    let code: 'INVITE_NOT_FOUND' | 'INVITE_EXPIRED' | 'INVITE_ALREADY_USED' | 'INVITE_CANCELLED' =
      'INVITE_NOT_FOUND';
    if (validation.reason === 'EXPIRED') {
      status = 410;
      code = 'INVITE_EXPIRED';
    } else if (validation.reason === 'USED') {
      status = 410;
      code = 'INVITE_ALREADY_USED';
    } else if (validation.reason === 'CANCELLED') {
      status = 410;
      code = 'INVITE_CANCELLED';
    }
    res.status(status).json({
      error: { code, message: 'Invite is not usable.' },
    });
    return;
  }

  // Pre-lock check before consume.
  const lockKey = `invite:${validation.invite.id}`;
  const preLock = isLocked(lockKey);
  if (preLock.locked) {
    res.status(423).json({
      error: { code: 'ACCOUNT_LOCKED', message: 'Too many failed attempts.' },
      lockedUntil: preLock.lockedUntil,
    });
    return;
  }

  const passwordHash = await hashPassword(password);
  let employee;
  try {
    employee = await consumeInvite(token, passwordHash);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'UNKNOWN';
    if (message === 'INVITE_ALREADY_USED') {
      res.status(410).json({
        error: { code: 'INVITE_ALREADY_USED', message: 'Invite already used.' },
      });
      return;
    }
    if (message === 'INVITE_EXPIRED') {
      res.status(410).json({
        error: { code: 'INVITE_EXPIRED', message: 'Invite has expired.' },
      });
      return;
    }
    throw err;
  }

  recordSuccessfulLogin(lockKey);

  const ip = req.ip;
  const userAgent = req.get('user-agent') ?? undefined;
  const { token: sessionToken, maxAgeMs } = await createSession({
    employeeId: employee.id,
    ip,
    userAgent,
    deviceMode: deviceMode as DeviceMode,
  });
  setSessionCookie(res, sessionToken, maxAgeMs);

  res.json({
    employee: {
      id: employee.id,
      name: employee.name,
      locationId: employee.locationId,
      roleId: employee.roleId,
      stationId: employee.stationId,
      clearanceLevel: employee.clearanceLevel,
      languagePref: employee.languagePref,
    },
  });
}