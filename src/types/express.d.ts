

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
  stationId: string | null;
  clearanceLevel: 'general' | 'station' | 'confidential' | 'master';
  languagePref: 'en' | 'es';
  status: 'pending' | 'active' | 'deactivated';
}

declare global {
  namespace Express {
    interface Request {
      id?: string;
      log?: Logger;
      /**
       * Populated by `requireAdmin`. Only present on routes that mount the
       * middleware. Front controllers may narrow with `req.employee!.id`.
       */
      employee?: AuthedEmployee;
    }
  }
}

export {};
