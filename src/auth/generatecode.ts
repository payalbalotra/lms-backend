import crypto from 'node:crypto';

export function generateActivationCode(): string {
  return crypto.randomInt(0, 100000).toString().padStart(5, '0');
}
