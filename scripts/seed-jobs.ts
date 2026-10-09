import * as dotenv from 'dotenv';
dotenv.config({ path: 'development.env' });
import crypto from 'node:crypto';
import { sql, closeDb } from '../src/db/client.ts';

// Jobs are now linked to a role string, not a roles table FK
const JOBS = [
  { name: 'Line Cook', role: 'employee' },
  { name: 'Prep Cook', role: 'employee' },
  { name: 'Dishwasher', role: 'employee' },
];

async function seedJobs() {
  console.log('Seeding jobs...');
  for (const job of JOBS) {
    const existing = await sql`SELECT id FROM jobs WHERE name = ${job.name}`;
    if (existing.length === 0) {
      const newId = crypto.randomUUID();
      await sql`INSERT INTO jobs (id, name) VALUES (${newId}, ${job.name})`;
    }
    // No UPDATE needed since we only care about name which is the lookup key
  }

  // Delete jobs not in the list
  const jobNames = JOBS.map((j) => j.name);
  await sql`DELETE FROM jobs WHERE name != ALL(${jobNames})`;

  console.log('Jobs seeded successfully.');
}

seedJobs()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await closeDb();
  });
