import * as cookie from 'cookie';
import type { Request, Response } from 'express';


const DEFAULT_COOKIE_NAME =
  process.env.NODE_ENV === 'production' ? '__Host-session' : 'al-session';

export const COOKIE_NAME: string = process.env.COOKIE_NAME || DEFAULT_COOKIE_NAME;

export function setSessionCookie(res: Response, token: string, maxAgeMs: number): void {
  res.setHeader(
    'Set-Cookie',
    cookie.serialize(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: Math.floor(maxAgeMs / 1000),
    }),
  );
}

export function clearSessionCookie(res: Response): void {
  res.setHeader(
    'Set-Cookie',
    cookie.serialize(COOKIE_NAME, '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    }),
  );
}

export function readSessionCookie(req: Request): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  const parsed = cookie.parse(header);
  return parsed[COOKIE_NAME] ?? null;
}