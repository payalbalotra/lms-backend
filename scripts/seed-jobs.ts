import 'dotenv/config';
import crypto from 'node:crypto';
import { sql, closeDb } from '../src/db/client.js';

// Dynamic IDs, lookup roles by name
const JOBS = [
  // Manager Jobs
  {
    name: 'Head Chef',
    roleName: 'manager',
  },
  {
    name: 'Sous Chef',
    roleName: 'manager',
  },
  // Employee Jobs
  {
    name: 'Line Cook',
    roleName: 'employee',
  },
  {
    name: 'Prep Cook',
    roleName: 'employee',
  },
  {
    name: 'Pastry Chef',
    roleName: 'employee',
  },
  {
    name: 'Dishwasher',
    roleName: 'employee',
  },
];

async function seedJobs() {
  console.log('Seeding jobs...');
  for (const job of JOBS) {
    const roleRes =
      await sql`SELECT id FROM roles WHERE name = ${job.roleName}`;
    if (roleRes.length === 0) {
      console.error(
        `Role ${job.roleName} not found for job ${job.name}. Skip.`,
      );
      continue;
    }
    const roleId = roleRes[0].id;

    const existing = await sql`SELECT id FROM jobs WHERE name = ${job.name}`;
    if (existing.length === 0) {
      const newId = crypto.randomUUID();
      await sql`
        INSERT INTO jobs (id, name, role_id)
        VALUES (${newId}, ${job.name}, ${roleId})
      `;
    } else {
      await sql`
        UPDATE jobs
        SET role_id = ${roleId}
        WHERE id = ${existing[0].id}
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
