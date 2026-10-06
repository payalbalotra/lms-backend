import { z } from 'zod';

/**
 * Kept in sync with the `emailAndPassword` block in src/config/auth.ts.
 * Better-auth re-checks the password length itself, so a mismatch here would
 * surface as a confusing second-stage rejection instead of a field error.
 */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 200;

const NAME_MAX_LENGTH = 120;
/**
 * Bounded but otherwise unvalidated: the only job here is to stop an unbounded
 * string from reaching the password hasher.
 */
const existingPasswordField = z
  .string({ error: 'Password is required' })
  .min(1, 'Password is required')
  .max(
    PASSWORD_MAX_LENGTH,
    `Password must not exceed ${PASSWORD_MAX_LENGTH} characters`,
  );

/**
 * Only enforced on account activation. Sign-in deliberately skips complexity
 * rules so we don't lock out accounts created under an older policy.
 */
const newPasswordField = z
  .string({ error: 'Password is required' })
  .min(
    PASSWORD_MIN_LENGTH,
    `Password must be at least ${PASSWORD_MIN_LENGTH} characters`,
  )
  .max(
    PASSWORD_MAX_LENGTH,
    `Password must not exceed ${PASSWORD_MAX_LENGTH} characters`,
  )
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(
    /[^a-zA-Z0-9]/,
    'Password must contain at least one special character',
  );

/**
 * `strictObject` rejects unknown keys, blocking mass-assignment — extra fields
 * on the body are never forwarded to better-auth or the DB.
 */

export const setPasswordSchema = z.strictObject({
  password: newPasswordField,
});

export const signUpSchema = z.strictObject({
  name: z
    .string({ error: 'Name is required' })
    .min(1, 'Name is required')
    .max(NAME_MAX_LENGTH, `Name must not exceed ${NAME_MAX_LENGTH} characters`),
  email: z
    .string({ error: 'Email is required' })
    .email('Invalid email address'),
  password: newPasswordField,
});

export const loginSchema = z.strictObject({
  email: z
    .string({ error: 'Email is required' })
    .email('Invalid email address'),
  password: existingPasswordField,
});

export const forgotPasswordSchema = z.strictObject({
  email: z
    .string({ error: 'Email is required' })
    .email('Invalid email address'),
});

export const resetPasswordWithOtpSchema = z.strictObject({
  email: z
    .string({ error: 'Email is required' })
    .email('Invalid email address'),
  otp: z
    .string({ error: 'OTP is required' })
    .length(6, 'OTP must be exactly 6 digits')
    .regex(/^[0-9]+$/, 'OTP must contain only digits'),
  password: newPasswordField,
});

export type LoginInput = z.infer<typeof loginSchema>;
export type SetPasswordInput = z.infer<typeof setPasswordSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordWithOtpInput = z.infer<
  typeof resetPasswordWithOtpSchema
>;
