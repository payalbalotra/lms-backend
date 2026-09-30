import 'dotenv/config';
import crypto from 'node:crypto';
import { sql, closeDb } from '../src/db/client.js';

const STATIONS = [
  { name: 'Hot line' },
  { name: 'Cold prep' },
  { name: 'Tortilla station' },
  { name: 'Sauces & salsas' },
  { name: 'Beverage bar' },
  { name: 'Dish pit' },
];

async function seedStations() {
  console.log('Seeding stations...');
  for (const station of STATIONS) {
    const existing =
      await sql`SELECT id FROM stations WHERE name = ${station.name}`;
    if (existing.length === 0) {
      const newId = crypto.randomUUID();
      await sql`
        INSERT INTO stations (id, name, is_archived)
        VALUES (${newId}, ${station.name}, false)
      `;
    }
  }
  console.log('Stations seeded successfully.');
}

seedStations()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await closeDb();
  });
