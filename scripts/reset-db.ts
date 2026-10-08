import * as dotenv from 'dotenv';
dotenv.config({ path: 'development.env' });
import { sql, closeDb } from '../src/db/client.ts';

async function reset() {
  try {
    console.log('Dropping and recreating public schema...');
    await sql`DROP SCHEMA public CASCADE`;
    await sql`CREATE SCHEMA public`;
    await sql`GRANT ALL ON SCHEMA public TO public`;
    console.log('Database wiped successfully.');
  } catch (err) {
    console.error('Failed to reset DB:', err);
  } finally {
    await closeDb();
  }
}

reset();
