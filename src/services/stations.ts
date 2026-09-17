import crypto from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/client';
import { locations, stations } from '../db/schema';
import { ServiceError } from './errors';

export interface PublicStation {
  id: string;
  name: string;
  locationId: string;
  sortOrder: number;
  isArchived: boolean;
}

export function publicStation(
  s: Readonly<typeof stations.$inferSelect>,
): PublicStation {
  return {
    id: s.id,
    name: s.name,
    locationId: s.locationId,
    sortOrder: s.sortOrder,
    isArchived: s.isArchived,
  };
}

export interface StationCreateInput {
  name: string;
  locationId: string;
  sortOrder?: number;
}

export interface StationPatchInput {
  name?: string;
  sortOrder?: number;
  isArchived?: boolean;
}

export async function listStations(opts: {
  locationId: string;
  includeArchived: boolean;
}): Promise<PublicStation[]> {
  const { locationId, includeArchived } = opts;
  const conditions = [eq(stations.locationId, locationId)];
  if (!includeArchived) {
    conditions.push(eq(stations.isArchived, false));
  }
  const rows = await db
    .select()
    .from(stations)
    .where(and(...conditions));
  return rows.map(publicStation);
}

export async function createStation(
  input: StationCreateInput,
): Promise<PublicStation> {
  // Stations don't have a separate "id" UI field — backend generates a UUID
  // so the admin only has to type the display name. Existing seeded rows
  // keep their slug ids for backward compatibility with employees.station_id FKs.
  const [loc] = await db
    .select({ id: locations.id })
    .from(locations)
    .where(eq(locations.id, input.locationId))
    .limit(1);
  if (!loc) {
    throw new ServiceError(400, 'LOCATION_NOT_FOUND', 'Unknown location');
  }
  const id = crypto.randomUUID();
  await db.insert(stations).values({
    id,
    name: input.name,
    locationId: input.locationId,
    sortOrder: input.sortOrder ?? 0,
    isArchived: false,
  });
  const [row] = await db
    .select()
    .from(stations)
    .where(eq(stations.id, id))
    .limit(1);
  if (!row) {
    throw new ServiceError(500, 'INTERNAL_ERROR', 'Inserted station not found');
  }
  return publicStation(row);
}

export async function updateStation(
  id: string,
  patch: StationPatchInput,
): Promise<PublicStation> {
  if (Object.keys(patch).length === 0) {
    throw new ServiceError(
      400,
      'INVALID_INPUT',
      'Patch must include at least one field',
    );
  }
  const [existing] = await db
    .select()
    .from(stations)
    .where(eq(stations.id, id))
    .limit(1);
  if (!existing) {
    throw new ServiceError(404, 'STATION_NOT_FOUND', 'Station not found');
  }
  await db.update(stations).set(patch).where(eq(stations.id, id));
  const [updated] = await db
    .select()
    .from(stations)
    .where(eq(stations.id, id))
    .limit(1);
  if (!updated) {
    throw new ServiceError(500, 'INTERNAL_ERROR', 'Updated station not found');
  }
  return publicStation(updated);
}

// Soft delete — flips isArchived=true. FK references from employees.station_id
// are preserved (set null would lose history). To restore, call updateStation
// with { isArchived: false }.
export async function archiveStation(id: string): Promise<PublicStation> {
  const [existing] = await db
    .select()
    .from(stations)
    .where(eq(stations.id, id))
    .limit(1);
  if (!existing) {
    throw new ServiceError(404, 'STATION_NOT_FOUND', 'Station not found');
  }
  await db
    .update(stations)
    .set({ isArchived: true })
    .where(eq(stations.id, id));
  const [updated] = await db
    .select()
    .from(stations)
    .where(eq(stations.id, id))
    .limit(1);
  if (!updated) {
    throw new ServiceError(500, 'INTERNAL_ERROR', 'Updated station not found');
  }
  return publicStation(updated);
}