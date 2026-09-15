import { defineConfig } from 'drizzle-kit';
import { config } from 'dotenv';

config();

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error('DATABASE_URL is not set in .env');
}

export default defineConfig({
  schema: ['./src/db/schema.ts','./src/db/auth-schema.ts'],
  out: './drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: { url },
  strict: true,
  verbose: true,
});