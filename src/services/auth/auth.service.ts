import ApiError from '../../shared/utils/ApiError.ts';

import { employees } from '../../db/index.ts';
import { auth } from '../../config/auth.ts';

type Employee = typeof employees.$inferSelect;

// ============================================================================
// publicEmployeeShape helper
// ============================================================================

export interface PublicEmployeeShape {
  id: string;
  name: string;
  locationId: string;
  role: string;
  jobIds: string[] | null;
  stationIds: string[] | null;
  languagePref: Employee['languagePref'];
}

export function publicEmployeeShape(e: Employee): PublicEmployeeShape {
  return {
    id: e.id,
    name: e.name,
    locationId: e.locationId,
    role: e.role,
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

// ============================================================================
// forgotPasswordService
// Delegates to Better Auth's emailOtp plugin:
//   auth.api.requestPasswordResetEmailOTP({ body: { email } })
// Better Auth handles OTP generation, storage in the verification table,
// and triggers sendVerificationOTP (defined in auth.ts) to send the email.
// ============================================================================

export async function forgotPasswordService(email: string): Promise<void> {
  await auth.api.requestPasswordResetEmailOTP({
    body: { email },
  });
}

// ============================================================================
// resetPasswordWithOtpService
// Delegates to Better Auth's emailOTP plugin:
//   auth.api.resetPasswordEmailOTP({ body: { email, otp, newPassword } })
// Better Auth verifies the OTP against the verification table, hashes the
// new password, and updates the credentials account row — all internally.
// Throws if the OTP is invalid or expired.
// ============================================================================

export async function resetPasswordWithOtpService(
  email: string,
  otp: string,
  newPassword: string,
): Promise<void> {
  const response = await auth.api.resetPasswordEmailOTP({
    body: { email, otp, password: newPassword },
    asResponse: true,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new ApiError(
      error.message || 'Invalid or expired reset code.',
      response.status || 400,
      true,
      '',
      { code: error.code || 'INVALID_OTP' },
    );
  }
}
