import type { Employee } from '../../db/schema/index.ts';

// ============================================================================
// Employee response shapes
// ============================================================================
// The single place that decides which employee fields leave the API. Any
// module that returns an employee uses one of these.

/** Full admin view, returned by the employees endpoints and /set-password. */
export function publicEmployee(e: Readonly<Employee>) {
  return {
    id: e.id,
    name: e.name,
    email: e.email,
    employeeCode: e.employeeCode,
    locationId: e.locationId,
    role: e.role,
    jobIds: e.jobIds,
    stationIds: e.stationIds,
    languagePref: e.languagePref,
    status: e.status,
    createdAt: e.createdAt.toISOString(),
    deactivatedAt: e.deactivatedAt ? e.deactivatedAt.toISOString() : null,
  };
}

export interface SessionEmployee {
  id: string;
  name: string;
  locationId: string;
  role: string;
  jobIds: string[] | null;
  stationIds: string[] | null;
  email: string;
  languagePref: Employee['languagePref'];
}

/** The signed-in employee, returned by GET /auth/me. */
export function sessionEmployee(e: Readonly<Employee>): SessionEmployee {
  return {
    id: e.id,
    name: e.name,
    locationId: e.locationId,
    role: e.role,
    jobIds: e.jobIds,
    stationIds: e.stationIds,
    email: e.email,
    languagePref: e.languagePref,
  };
}
