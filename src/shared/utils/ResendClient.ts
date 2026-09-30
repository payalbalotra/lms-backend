import { Resend } from 'resend';
import config from '../../config/index.ts';

export const resend = new Resend(config.resendApiKey);
