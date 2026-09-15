import type { Request, Response } from 'express';
import { z } from 'zod';
import { loginEmployee } from '../../services/auth-login';
import { ServiceError } from '../../services/errors';

// ============================================================================
// POST /api/auth/login
// ============================================================================
// HTTP shell around services/auth-login. The service does the lookup +
// signInEmail dance; this file does only:
//   - zod validation of req.body
//   - forward Better Auth's Set-Cookie header back to the browser
//   - translate ServiceError → status + JSON error shape
//
// Login is name + locationId + password — see loginEmployee for why we
// don't go straight to /api/auth/sign-in/email (Better Auth's built-in
// route only knows about emails, and our synthetic emails are derived
// from the employee row).
//
// Lockout responses include `lockedUntil` so the frontend can show a
// countdown instead of just "try again later."
// ============================================================================

const loginSchema = z.object({
  name: z.string().min(1).max(120),
  locationId: z.string().min(1).max(64),
  password: z.string().min(1).max(200),
  // deviceMode is advisory here — /me is the canonical source. Accepted
  // so the frontend can send it in one shot when the form has it set.
  deviceMode: z.enum(['personal', 'shared']).optional(),
});

export async function login(req: Request, res: Response): Promise<void> {
  const parsed = loginSchema.safeParse(req.body);
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

  try {
    const result = await loginEmployee({
      name: parsed.data.name,
      locationId: parsed.data.locationId,
      password: parsed.data.password,
    });

    // fetch's Headers#get joins multi-value cookies with ', ' — split on
    // commas NOT followed by '<key>=' so cookie attributes with commas
    // (Expires=Wed, 01 Jan...) survive intact.
    res.setHeader(
      'Set-Cookie',
      result.setCookie.split(/,(?=\s*[A-Za-z0-9_-]+=)/),
    );

    res.json({ employee: result.employee });
  } catch (err) {
    if (err instanceof ServiceError) {
      // ACCOUNT_LOCKED carries a lockedUntil; the other codes don't.
      if (err.code === 'ACCOUNT_LOCKED') {
        res.status(err.status).json({
          error: { code: err.code, message: err.message },
          // No lockedUntil here because the service throws without it
          // on the initial check — the controller lockout UX is coarse
          // ("try again later") until we add per-attempt timestamps.
        });
        return;
      }
      res.status(err.status).json({
        error: { code: err.code, message: err.message },
      });
      return;
    }
    throw err;
  }
}