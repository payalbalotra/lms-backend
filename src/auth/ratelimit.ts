
const MAX_ATTEMPTS = 5;
const LOCK_MS = 15 * 60 * 1000;

interface Entry {
  count: number;
  lockedUntil?: number;
}

const store = new Map<string, Entry>();

function purgeExpired(): void {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.lockedUntil && entry.lockedUntil <= now) {
      store.delete(key);
    }
  }
}

export interface LockState {
  locked: boolean;
  lockedUntil?: Date;
}

export function isLocked(key: string): LockState {
  purgeExpired();
  const entry = store.get(key);
  if (!entry || !entry.lockedUntil) return { locked: false };
  if (entry.lockedUntil > Date.now()) {
    return { locked: true, lockedUntil: new Date(entry.lockedUntil) };
  }
  store.delete(key);
  return { locked: false };
}

export function recordFailedLogin(key: string): LockState {
  const now = Date.now();
  const entry: Entry = store.get(key) ?? { count: 0 };

  if (entry.lockedUntil && entry.lockedUntil > now) {
    return { locked: true, lockedUntil: new Date(entry.lockedUntil) };
  }

  entry.count += 1;
  if (entry.count >= MAX_ATTEMPTS) {
    entry.lockedUntil = now + LOCK_MS;
    entry.count = 0;
  }
  store.set(key, entry);

  return {
    locked: !!entry.lockedUntil && entry.lockedUntil > now,
    lockedUntil: entry.lockedUntil ? new Date(entry.lockedUntil) : undefined,
  };
}

export function recordSuccessfulLogin(key: string): void {
  store.delete(key);
}