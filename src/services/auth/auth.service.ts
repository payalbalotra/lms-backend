import ApiError from '../../shared/utils/ApiError.ts';

import { employees } from '../../db/employee.schema.ts';
import { auth } from '../../auth/betterauth.ts';
import { db } from '../../db/client.ts';
import { eq } from 'drizzle-orm';
import crypto from 'node:crypto';
import { user, session } from '../../db/schema.ts';
import type {
  SendOtpInput,
  VerifyEmailOtpInput,
  ForgetPasswordInput,
  VerifyForgetPasswordOtpInput,
  ResetPasswordInput,
} from '../../shared/validations/auth.schema.ts';

// We need a helper to check if error is from better-auth API.
// If isAPIError from better-auth/api isn't easily imported, we check duck typing or status codes.

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

export interface AuthResult<T> {
  data: T;
  headers: Headers;
}

export interface OtpResponse {
  success: boolean;
}

export const sendOtpService = async (
  input: SendOtpInput,
  headers: Headers,
): Promise<AuthResult<OtpResponse>> => {
  try {
    const otpResult = await auth.api.sendVerificationOTP({
      body: { email: input.email, type: 'email-verification' },
      headers,
      asResponse: true,
    });

    if (!otpResult.ok) {
      throw new ApiError('Unable to send OTP', otpResult.status || 400, true);
    }

    const data = (await otpResult.json()) as OtpResponse;
    return { data, headers: otpResult.headers };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError('Unable to send OTP', 500, true);
  }
};

export const verifyEmailOtpService = async (
  input: VerifyEmailOtpInput,
  headers: Headers,
): Promise<AuthResult<unknown>> => {
  try {
    const verifyResult = await auth.api.verifyEmailOTP({
      body: { email: input.email, otp: input.otp },
      headers,
      asResponse: true,
    });

    if (!verifyResult.ok) {
      throw new ApiError('Invalid OTP', 400, true);
    }

    const response = await verifyResult.json();

    // Manually create and return a session token after successful verification
    const [verifiedUser] = await db
      .select()
      .from(user)
      .where(eq(user.email, input.email))
      .limit(1);

    if (verifiedUser) {
      const token = crypto.randomUUID();
      const sessionId = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      await db.insert(session).values({
        id: sessionId,
        token: token,
        expiresAt,
        userId: verifiedUser.id,
      });

      return {
        data: {
          ...response,
          token,
          session: {
            id: sessionId,
            token,
            expiresAt,
            userId: verifiedUser.id,
          },
          user: verifiedUser,
        },
        headers: verifyResult.headers,
      };
    }

    return { data: response, headers: verifyResult.headers };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError('Unable to verify email OTP', 500, true);
  }
};

export const forgetPasswordService = async (
  input: ForgetPasswordInput,
  headers: Headers,
): Promise<AuthResult<OtpResponse>> => {
  try {
    const existingUser = await db.query.user.findFirst({
      where: eq(user.email, input.email),
    });

    if (!existingUser) {
      throw new ApiError('User not found', 404, true);
    }

    const forgetResult = await auth.api.forgetPasswordEmailOTP({
      body: { email: input.email },
      headers,
      asResponse: true,
    });

    if (!forgetResult.ok) {
      throw new ApiError(
        'Unable to send password reset OTP',
        forgetResult.status || 400,
        true,
      );
    }

    const data = (await forgetResult.json()) as OtpResponse;
    return { data, headers: forgetResult.headers };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError('Unable to send password reset OTP', 500, true);
  }
};

export const verifyForgetPasswordOtpService = async (
  input: VerifyForgetPasswordOtpInput,
  headers: Headers,
): Promise<AuthResult<OtpResponse>> => {
  try {
    const verifyOtpResult = await auth.api.checkVerificationOTP({
      body: { email: input.email, type: 'forget-password', otp: input.otp },
      headers,
      asResponse: true,
    });

    if (!verifyOtpResult.ok) {
      throw new ApiError('Invalid OTP', 400, true);
    }

    const data = (await verifyOtpResult.json()) as OtpResponse;
    return { data, headers: verifyOtpResult.headers };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError('Unable to verify password reset OTP', 500, true);
  }
};

export const resetPasswordService = async (
  input: ResetPasswordInput,
  headers: Headers,
): Promise<AuthResult<OtpResponse>> => {
  try {
    const resetResult = await auth.api.resetPasswordEmailOTP({
      body: {
        email: input.email,
        otp: input.otp,
        password: input.password,
      },
      headers,
      asResponse: true,
    });

    if (!resetResult.ok) {
      throw new ApiError('Invalid OTP or unable to reset password', 400, true);
    }

    const data = (await resetResult.json()) as OtpResponse;
    return { data, headers: resetResult.headers };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError('Unable to reset password', 500, true);
  }
};
