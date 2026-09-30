import ApiError from '../../shared/utils/ApiError.ts';

import { employees } from '../../db/employee.schema.ts';
import { auth } from '../../auth/betterauth.ts';

type Employee = typeof employees.$inferSelect;

// ============================================================================
// publicEmployeeShape helper
// ============================================================================

export interface PublicEmployeeShape {
  id: string;
  name: string;
  locationId: string;
  roleId: string;
  jobIds: string[] | null;
  stationIds: string[] | null;
  languagePref: Employee['languagePref'];
}

export function publicEmployeeShape(e: Employee): PublicEmployeeShape {
  return {
    id: e.id,
    name: e.name,
    locationId: e.locationId,
    roleId: e.roleId,
    jobIds: e.jobIds,
    stationIds: e.stationIds,
    languagePref: e.languagePref,
  };
}

export interface LoginServiceInput {
  email: string;
  password: string;
}

export interface LoginServiceResult {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  user: any;
  // Raw session token — client stores and sends as: Authorization: Bearer <token>
  token: string;
}

export async function loginUser(
  input: LoginServiceInput,
): Promise<LoginServiceResult> {
  const signInResponse = await auth.api.signInEmail({
    body: { email: input.email, password: input.password },
    asResponse: true,
  });

  if (!signInResponse.ok) {
    const error = await signInResponse.json().catch(() => ({}));
    throw new ApiError(
      error.message || 'Invalid email or password',
      signInResponse.status || 401,
      true,
      '',
      { code: 'INVALID_CREDENTIALS' },
    );
  }

  // better-auth returns { token, user } where token is the raw opaque
  // session token the client can send as: Authorization: Bearer <token>
  const data = await signInResponse.json();
  const token: string | undefined = data?.token;

  if (!token) {
    throw new ApiError('Sign-in failed; please try again.', 401, true, '', {
      code: 'SIGN_IN_FAILED',
    });
  }

  return {
    user: data.user,
    token,
  };
}
