

import 'express';
import type { Logger } from 'pino';

/**
 * Shape of the employee row that middleware attaches to `req.employee`
 * after a successful role-membership check. Mirrors `publicEmployee`
 * in controllers/auth.ts plus the columns requireAdmin needs to read.
 *
 * Admin authority was previously a separate `clearance_level` column on
 * the employee row; migration 0015 dropped that column because admin
 * is just role-membership in 'role-master' (see require-admin.ts).
 */
export interface AuthedEmployee {
  id: string;
  name: string;
  locationId: string;
  roleId: string;
  stationId: string | null;
  languagePref: 'en' | 'es';
  status: 'pending' | 'active' | 'deactivated';
}

declare global {
  namespace Express {
    interface Request {
      id?: string;
      log?: Logger;
      /**
       * Populated by `requireAuth` with `{ id, locationId, roleId }` so any
       * controller behind any auth-only mount can read basic identity. Routes
       * that mount `requireAdmin` get the full AuthedEmployee attached too.
       */
      employee?: Partial<AuthedEmployee> & { id: string; locationId: string; roleId: string };
    }
  }
}

export {};
