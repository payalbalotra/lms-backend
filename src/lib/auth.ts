import { betterAuth } from 'better-auth';
import { magicLink, bearer } from 'better-auth/plugins';
import { emailOTP } from 'better-auth/plugins/email-otp';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from '../db/client.ts';
import config from '../config/env.ts';
import {
  user,
  session,
  account,
  verification,
  employees,
  locations,
  SUPER_ADMIN_USER_ROLE,
} from '../db/schema/index.ts';
import { eq } from 'drizzle-orm';
import { resend } from './email/resend.ts';
import {
  BRAND_NAME,
  getInviteEmailTemplate,
  getAuthEmailAndResetPasswordTemplate,
  type EmailHeaderInfo,
} from './email/templates.ts';

/**
 * Better Auth instance.
 *
 * - Owns: user/session/account/verification tables, session rotation,
 *   sliding expiry, HttpOnly cookies, scrypt password hashing.
 * - Does NOT own: employees (LMS-specific), invites (5-digit code flow),
 *   rate-limiting (we wrap it externally), employee deactivation (we delete
 *   session rows directly).
 *
 * Required env: BETTER_AUTH_SECRET (32+ random bytes).
 *   Generate one with: openssl rand -base64 48
 */
export const magicLinkUrls = new Map<string, string>();

/**
 * Header lines for an email to `email`: the employee's location and role, the
 * brand name and Admin for the super admin (no employee row), or just the
 * brand name for anyone else. One query.
 */
export async function emailHeaderFor(email: string): Promise<EmailHeaderInfo> {
  const [row] = await db
    .select({
      userRole: user.role,
      employeeRole: employees.role,
      locationName: locations.name,
    })
    .from(user)
    .leftJoin(employees, eq(employees.userId, user.id))
    .leftJoin(locations, eq(locations.id, employees.locationId))
    .where(eq(user.email, email))
    .limit(1);

  return {
    title: row?.locationName ?? BRAND_NAME,
    role:
      row?.employeeRole ??
      (row?.userRole === SUPER_ADMIN_USER_ROLE ? 'super_admin' : undefined),
  };
}

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
  plugins: [
    bearer(),
    magicLink({
      expiresIn: 60 * 60 * 24,
      sendMagicLink: async ({ email, url }) => {
        // The employee (name, language, role) and their location's name for
        // the email header, in one query.
        const [row] = await db
          .select({ emp: employees, locationName: locations.name })
          .from(employees)
          .leftJoin(locations, eq(locations.id, employees.locationId))
          .where(eq(employees.email, email))
          .limit(1);
        const emp = row?.emp;

        if (!row || !emp) {
          console.error(`[MAGIC LINK] No employee found for email: ${email}`);
          return;
        }

        const parsed = new URL(url);
        const token = parsed.searchParams.get('token');
        const invitationUrl = `${config.frontendBaseUrl}/${emp.languagePref}/invite/token?token=${token}`;

        magicLinkUrls.set(email, url); // we can still set the ugly url in cache for Postman tests

        // Send email via Resend
        try {
          const html = getInviteEmailTemplate(emp.name, invitationUrl, {
            title: row.locationName ?? BRAND_NAME,
            role: emp.role,
          });
          await resend.emails.send({
            from: 'Almentria Mexicana <mihpros@mail.logiccloud.in>',
            to: email,
            subject: 'Welcome to Almentria Mexicana LMS',
            html,
          });
          console.log(`[MAGIC LINK] Email sent to ${email}`);
        } catch (error) {
          console.error('[MAGIC LINK] Failed to send email via Resend:', error);
        }
      },
    }),

    // OTP-based password reset — provides:
    //   auth.api.requestPasswordResetEmailOTP({ body: { email } })
    //   auth.api.resetPassword({ body: { email, otp, password } })
    emailOTP({
      otpLength: 6,
      expiresIn: 60 * 10, // 10 minutes
      sendVerificationOTP: async ({ email, otp, type }) => {
        // We only use this plugin for password-reset OTPs.
        if (type !== 'forget-password') return;

        try {
          const html = getAuthEmailAndResetPasswordTemplate(
            'Reset Your Password',
            `We received a request to reset your password. Use the verification code below to proceed. It expires in <strong>10 minutes</strong>.`,
            otp,
            await emailHeaderFor(email),
          );
          await resend.emails.send({
            from: 'Almentria Mexicana <mihpros@mail.logiccloud.in>',
            to: email,
            subject: 'Your Password Reset Code',
            html,
          });
          console.log(`[EMAIL OTP] Reset OTP sent to ${email}`);
        } catch (error) {
          console.error('[EMAIL OTP] Failed to send OTP email:', error);
        }
      },
    }),
  ],
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    minPasswordLength: 8,
    autoSignIn: false, // we sign in explicitly from the activate controller
    // Passwords use Better Auth's default scrypt hashing. Anything that writes
    // a password itself (e.g. /set-password) must use hashPassword from
    // 'better-auth/crypto' so login can verify it.
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
    cookiePrefix: config.env === 'production' ? '__Host-' : undefined,
    useSecureCookies: config.env === 'production',
    defaultCookieAttributes: {
      httpOnly: true,
      sameSite: 'lax',
    },
  },

  // 5. CORS — only the frontend origin can call the auth endpoints.
  trustedOrigins: [config.frontendBaseUrl],

  // 6. Signing secret. Required: config/env.ts refuses to start without it.
  secret: config.betterAuthSecret,
});
