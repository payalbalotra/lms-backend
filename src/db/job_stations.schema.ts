import { pgTable, uuid, primaryKey } from 'drizzle-orm/pg-core';
import { jobs } from './jobs.schema.ts';
import { stations } from './stations.schema.ts';

export const jobStations = pgTable(
  'job_stations',
  {
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    stationId: uuid('station_id')
      .notNull()
      .references(() => stations.id, { onDelete: 'cascade' }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.jobId, t.stationId] }),
  }),
);

export type JobStation = typeof jobStations.$inferSelect;
export type NewJobStation = typeof jobStations.$inferInsert;
