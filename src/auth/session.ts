import crypto from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { db } from '../db/client';
import { sessions, type Session } from '../db/schema';



const PERSONAL_IDLE_MS = 30 * 60 * 1000;          // 30 min
const PERSONAL_ABSOLUTE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const SHARED_IDLE_MS = 5 * 60 * 1000;             // 5 min
const SHARED_ABSOLUTE_MS = 4 * 60 * 60 * 1000;     // 4 hours

export type DeviceMode = 'personal' | 'shared';



function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// ============================================================================
// Session lifecycle
// ============================================================================

export interface CreateSessionInput {
  employeeId: string;
  ip?: string | undefined;
  userAgent?: string | undefined;
  deviceMode: DeviceMode;
}


export async function createSession(input: CreateSessionInput): Promise<{
  token: string;
  session: Session;
  maxAgeMs: number;
}> {
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = hashToken(token);
  const absoluteMs = input.deviceMode === 'personal' ? PERSONAL_ABSOLUTE_MS : SHARED_ABSOLUTE_MS;
  const expiresAt = new Date(Date.now() + absoluteMs);

  const [session] = await db
    .insert(sessions)
    .values({
      id: crypto.randomUUID(),
      employeeId: input.employeeId,
      sessionTokenHash: tokenHash,
      expiresAt,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    })
    .returning();

  return { token, session, maxAgeMs: absoluteMs };
}


export async function validateSession(
  token: string,
  deviceMode: DeviceMode,
): Promise<Session | null> {
  if (!token) return null;

  const tokenHash = hashToken(token);
  const idleMs = deviceMode === 'personal' ? PERSONAL_IDLE_MS : SHARED_IDLE_MS;
  const idleCutoff = new Date(Date.now() - idleMs);

  const [row] = await db
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.sessionTokenHash, tokenHash),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!row) return null;

  // Idle check: lastUsedAt must be within idle window
  if (row.lastUsedAt < idleCutoff) {
    await db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.id, row.id));
    return null;
  }

  // Refresh lastUsedAt (sliding window)
  await db
    .update(sessions)
    .set({ lastUsedAt: new Date() })
    .where(eq(sessions.id, row.id));

  return row;
}

/**
 * Revoke a session by token (logout). Idempotent.
 */
export async function revokeSession(token: string): Promise<void> {
  if (!token) return;
  const tokenHash = hashToken(token);
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.sessionTokenHash, tokenHash), isNull(sessions.revokedAt)));
}