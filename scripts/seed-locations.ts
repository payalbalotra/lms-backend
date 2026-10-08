import * as dotenv from 'dotenv';
dotenv.config({ path: 'development.env' });
import { sql, closeDb } from '../src/db/client.ts';

const LOCATIONS = ['Mexicana Main', 'Downtown Express', 'Almentria Mexicana'];

async function seedLocations() {
  console.log('Seeding locations...');
  for (const name of LOCATIONS) {
    const existing = await sql`SELECT id FROM locations WHERE name = ${name}`;
    if (existing.length === 0) {
      const res = await sql`
        INSERT INTO locations (name)
        VALUES (${name})
        RETURNING id
      `;
      const locId = res[0].id;
      console.log(`location: ${locId} (${name}) - created`);
    } else {
      const locId = existing[0].id;
      console.log(`location: ${locId} (${name}) - exists`);
    }
  }
  console.log('Locations seeded successfully.');
}

seedLocations()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await closeDb();
  });
