import 'dotenv/config';
import crypto from 'node:crypto';
import { sql, closeDb } from '../src/db/client.ts';

// Dynamic real v4 UUIDs generated on the fly
const ROLES = [
  { name: 'super_admin' },
  { name: 'manager' },
  { name: 'employee' },
];

async function seedRoles() {
  console.log('Seeding roles...');
  for (const role of ROLES) {
    const existing = await sql`SELECT id FROM roles WHERE name = ${role.name}`;
    if (existing.length === 0) {
      const newId = crypto.randomUUID();
      await sql`
        INSERT INTO roles (id, name)
        VALUES (${newId}, ${role.name})
      `;
    }
  }
  console.log('Roles seeded successfully.');
}

seedRoles()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await closeDb();
  });
