import { betterAuth } from 'better-auth';
import { emailOTP } from 'better-auth/plugins';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from '../db/client.ts';
import config from '../config/index.ts';
import { user, session, account, verification } from '../db/schema.ts';
import { resend } from '../shared/utils/ResendClient.ts';
import { getAuthEmailTemplate } from '../shared/utils/emailTemplates.ts';
import { logger } from '../config/logger.ts';
import ApiError from '../shared/utils/ApiError.ts';

/**
 * Better Auth instance.
 *
 * - Owns: user/session/account/verification tables, session rotation,
 *   sliding expiry, HttpOnly cookies, bcrypt password hashing.
 * - Does NOT own: employees (LMS-specific), invites (5-digit code flow),
 *   rate-limiting (we wrap it externally), employee deactivation (we delete
 *   session rows directly).
 *
 * Required env: BETTER_AUTH_SECRET (32+ random bytes).
 *   Generate one with: openssl rand -base64 48
 */
export const auth = betterAuth({
  // 1. Drizzle adapter — points at the existing Postgres pool in db/client.ts.
  //    Tables are referenced via the schema barrel so we don't depend on
  //    auth-schema.ts being imported directly elsewhere.
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: { user, session, account, verification },
  }),

  // 2. Email + password provider — the only credential type we use.
  //    Email is a synthetic `<employeeId>@lms.internal` and never sent anywhere,
  //    so email verification stays disabled.
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    minPasswordLength: 8,
    autoSignIn: false, // we sign in explicitly from the activate controller
  },

  // 3. Session shape — kept conservative. Sliding refresh, no cookie cache:
  //    the in-memory cache previously caused two near-simultaneous reads on
  //    the same cookie to return different verdicts (one from cache, one
  //    fresh from the DB), which made /api/auth/me succeed and requireAuth
  //    reject the same cookie inside one SSR render. With one tenant and a
  //    handful of seats the per-request DB hit is negligible.
  session: {
    expiresIn: 60 * 60 * 8, // 8 hours absolute
    updateAge: 60 * 15, // sliding: extend expiry every 15 min of activity
  },

  // 4. Cookie hardening — match the existing __Host- convention in production.
  advanced: {
    generateId: () => crypto.randomUUID(),
    cookiePrefix: process.env.NODE_ENV === 'production' ? '__Host-' : undefined,
    useSecureCookies: process.env.NODE_ENV === 'production',
    defaultCookieAttributes: {
      httpOnly: true,
      sameSite: 'lax',
    },
  },

  // 5. CORS — only the frontend origin can call the auth endpoints.
  trustedOrigins: [config.frontendBaseUrl],

  // 6. Signing secret. MUST be set in .env for any non-dev environment.
  secret:
    process.env.BETTER_AUTH_SECRET ??
    'dev-only-secret-do-not-use-in-prod-32+chars',

  // 7. Plugins
  plugins: [
    emailOTP({
      async sendVerificationOTP({ email, otp, type }) {
        const subject =
          type === 'sign-in'
            ? 'Your sign-in code'
            : type === 'email-verification'
              ? 'Your security verification code'
              : 'Reset your password';

        const title =
          type === 'sign-in'
            ? 'Sign in to your account.'
            : type === 'email-verification'
              ? 'Verify your email.'
              : 'Reset your password.';

        const bodyText =
          type === 'sign-in'
            ? `We sent a six-digit code to <strong style="color:#333333;">${email}</strong>. Enter it to sign in to your account.`
            : type === 'email-verification'
              ? `We sent a six-digit code to <strong style="color:#333333;">${email}</strong>. Enter it to confirm your address.`
              : `We sent a six-digit code to <strong style="color:#333333;">${email}</strong>. Enter it to securely reset your password.`;

        const { data, error } = await resend.emails.send({
          from: 'LMS <noreply@mosaiceffect.in>',
          to: email,
          subject,
          html: getAuthEmailTemplate(title, bodyText, otp),
        });

        if (error) {
          logger.error({ resendError: error }, 'Failed to send OTP email');
          throw new ApiError(
            'Failed to send verification email. Please try again.',
            503,
            true,
          );
        } else {
          logger.info(`OTP email sent successfully to emailId: ${data?.id}`);
        }
      },
      expiresIn: 300,
    }),
  ],
});
