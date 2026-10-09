import { asc, eq, count, ilike, sql } from 'drizzle-orm';
import {
  formatPaginatedResult,
  type PaginatedResult,
} from '../../shared/pagination.ts';
import { db } from '../../db/client.ts';
import { employees, jobs, stations } from '../../db/schema/index.ts';
import ApiError from '../../shared/api-error.ts';

export interface PublicStation {
  id: string;
  name: string;
}

export function publicStation(
  s: Readonly<typeof stations.$inferSelect>,
): PublicStation {
  return {
    id: s.id,
    name: s.name,
  };
}

export interface StationCreateInput {
  name: string;
}

export interface StationPatchInput {
  name?: string | undefined;
}

export async function listStations(
  page: number = 1,
  limit: number = 10,
  search?: string,
): Promise<PaginatedResult<PublicStation>> {
  const offset = (page - 1) * limit;
  const whereClause = search ? ilike(stations.name, `%${search}%`) : undefined;
  // Page query and count are independent, so run them in parallel. The
  // explicit order keeps pages stable between requests.
  const [rows, [countRes]] = await Promise.all([
    db
      .select()
      .from(stations)
      .where(whereClause)
      .orderBy(asc(stations.createdAt), asc(stations.id))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(stations).where(whereClause),
  ]);
  return formatPaginatedResult(
    rows.map(publicStation),
    countRes?.total ?? 0,
    page,
    limit,
  );
}

export async function createStation(
  input: StationCreateInput,
): Promise<PublicStation> {
  const [row] = await db
    .insert(stations)
    .values({ name: input.name })
    .returning();
  if (!row) {
    throw Object.assign(new ApiError('Inserted station not found', 500), {
      errorCode: 'INTERNAL_ERROR',
    });
  }
  return publicStation(row);
}

export async function updateStation(
  id: string,
  patch: StationPatchInput,
): Promise<PublicStation> {
  if (Object.keys(patch).length === 0) {
    throw Object.assign(
      new ApiError('Patch must include at least one field', 400),
      { errorCode: 'INVALID_INPUT' },
    );
  }
  // One round trip: update and read back; no row means the id is unknown.
  const [updated] = await db
    .update(stations)
    .set(patch)
    .where(eq(stations.id, id))
    .returning();
  if (!updated) {
    throw Object.assign(new ApiError('Station not found', 404), {
      errorCode: 'STATION_NOT_FOUND',
    });
  }
  return publicStation(updated);
}

// Stations are referenced from uuid[] columns (jobs.station_ids and
// employees.station_ids) that have no foreign key, so remove the id from
// those arrays in the same transaction. Otherwise the stale id stays behind
// and every later update of those employees fails with "unknown stations".
// procedures.station_id is a real FK (ON DELETE SET NULL) and is handled by
// the database.
export async function deleteStation(id: string): Promise<void> {
  await db.transaction(async (tx) => {
    const deleted = await tx
      .delete(stations)
      .where(eq(stations.id, id))
      .returning({ id: stations.id });
    if (deleted.length === 0) {
      throw Object.assign(new ApiError('Station not found', 404), {
        errorCode: 'STATION_NOT_FOUND',
      });
    }

    const stationArray = sql`ARRAY[${id}::uuid]`;
    await tx
      .update(jobs)
      .set({ stationIds: sql`array_remove(${jobs.stationIds}, ${id}::uuid)` })
      .where(sql`${jobs.stationIds} @> ${stationArray}`);
    await tx
      .update(employees)
      .set({
        stationIds: sql`array_remove(${employees.stationIds}, ${id}::uuid)`,
      })
      .where(sql`${employees.stationIds} @> ${stationArray}`);
  });
}
