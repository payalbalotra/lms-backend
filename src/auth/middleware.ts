import type { Request, Response, NextFunction } from 'express';
import { validateSession, type DeviceMode, type Session } from './session';
import { readSessionCookie } from './cookies';

export interface AuthedRequest extends Request {
  session?: Pick<Session, 'id' | 'employeeId'>;
  deviceMode?: DeviceMode;
}


export async function requireAuth(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
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

  req.session = { id: session.id, employeeId: session.employeeId };
  req.deviceMode = deviceMode;
  next();
}