import type { Request, Response } from 'express';
import { lookupInvite } from '../../auth/invites';

// Public read-only: tells the activation page whether the token is valid
// and shows the employee's name. Never returns the code or any hash.
export async function lookupInviteController(
  req: Request,
  res: Response,
): Promise<void> {
  const token = String(req.params.token ?? '');
  if (token.length < 16 || token.length > 128) {
    res.status(404).json({
      error: { code: 'INVITE_NOT_FOUND', message: 'Invite not found' },
    });
    return;
  }

  const result = await lookupInvite(token);
  if (!result.ok) {
    res.status(404).json({
      error: { code: 'INVITE_NOT_FOUND', message: 'Invite not found' },
      reason: result.reason,
    });
    return;
  }

  res.json({
    employeeName: result.lookup.employeeName,
    expiresAt: result.lookup.expiresAt.toISOString(),
    employeeStatus: result.lookup.employeeStatus,
  });
}
