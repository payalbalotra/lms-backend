import 'dotenv/config';
import crypto from 'node:crypto';
import { sql, closeDb } from '../src/db/client.js';

// Dynamic IDs
const JOBS = [
  { name: 'Head Chef' },
  { name: 'Sous Chef' },
  { name: 'Line Cook' },
  { name: 'Prep Cook' },
  { name: 'Pastry Chef' },
  { name: 'Dishwasher' },
];

async function seedJobs() {
  console.log('Seeding jobs...');
  for (const job of JOBS) {
    const existing = await sql`SELECT id FROM jobs WHERE name = ${job.name}`;
    if (existing.length === 0) {
      const newId = crypto.randomUUID();
      await sql`
        INSERT INTO jobs (id, name)
        VALUES (${newId}, ${job.name})
      `;
    }
  }
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
