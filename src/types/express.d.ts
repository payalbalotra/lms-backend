import 'express';
import type { Logger } from 'pino';

/**
 * Shape of the employee row that middleware attaches to `req.employee`
 * after a successful clearance check. Mirrors `publicEmployee` in
 * controllers/auth.ts plus the columns requireAdmin needs to read.
 */
export interface AuthedEmployee {
  id: string;
  name: string;
  locationId: string;
  roleId: string;
  email: string | null;
  languagePref: 'en' | 'es';
  status: 'pending' | 'active' | 'deactivated';
}

declare global {
  namespace Express {
    interface Request {
      id?: string;
      log?: Logger;
      isSuperAdmin?: boolean;
      /**
       * Populated by `requireAuth` with `{ id, locationId, roleId }` so any
       * controller behind any auth-only mount can read basic identity. Routes
       * that mount `requireAdmin` get the full AuthedEmployee attached too.
       */
      employee?: Partial<AuthedEmployee> & {
        id: string;
        userId?: string;
        locationId: string;
        roleId: string;
      };
    }
  }
}

export {};
