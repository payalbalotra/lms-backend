import * as dotenv from 'dotenv';
dotenv.config({ path: 'development.env' });
import crypto from 'node:crypto';
import { sql, closeDb } from '../src/db/client.js';

const STATIONS_DATA = [
  { name: 'Gm station', jobName: 'Line Cook' },
  { name: 'Grill station', jobName: 'Line Cook' },
  { name: 'Expo station', jobName: 'Line Cook' },
  { name: 'prep kitchen station', jobName: 'Prep Cook' },
  { name: 'Dishwasher station', jobName: 'Dishwasher' },
];

async function seedStations() {
  console.log('Seeding stations and job_stations mapping...');

  for (const item of STATIONS_DATA) {
    const jobRes = await sql`SELECT id FROM jobs WHERE name = ${item.jobName}`;
    const jobId = jobRes.length > 0 ? jobRes[0].id : null;

    if (!jobId) {
      console.warn(
        `Job ${item.jobName} not found for station ${item.name}. Skipping job_station map.`,
      );
    }

    const existingStation =
      await sql`SELECT id FROM stations WHERE name = ${item.name}`;
    let stationId;
    if (existingStation.length === 0) {
      stationId = crypto.randomUUID();
      await sql`
        INSERT INTO stations (id, name)
        VALUES (${stationId}, ${item.name})
      `;
    } else {
      stationId = existingStation[0].id;
    }

    if (jobId && stationId) {
      const existingLink =
        await sql`SELECT job_id FROM job_stations WHERE job_id = ${jobId} AND station_id = ${stationId}`;
      if (existingLink.length === 0) {
        await sql`INSERT INTO job_stations (job_id, station_id) VALUES (${jobId}, ${stationId})`;
      }
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
