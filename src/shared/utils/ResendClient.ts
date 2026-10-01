import { Resend } from 'resend';
import config from '../../config/index.ts';

// If RESEND_API_KEY is not provided (e.g. in dev), we can use a dummy key to prevent the constructor from crashing.
// Note: It will fail at runtime if you actually try to send an email without a valid key.
export const resend = new Resend(config.resendApiKey || 're_dummykey');
