import { defineConfig } from 'drizzle-kit';
import { config } from 'dotenv';

config({ path: 'development.env' });

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error('DATABASE_URL is not set in development.env');
}

export default defineConfig({
  schema: ['./src/db/schema/index.ts'],
  out: './drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: { url },
  strict: false,
  verbose: true,
});
