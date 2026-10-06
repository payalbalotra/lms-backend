import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client.ts';
import { stations } from '../../db/index.ts';
import ApiError from '../../shared/utils/ApiError.ts';

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

export async function listStations(): Promise<PublicStation[]> {
  const rows = await db.select().from(stations);
  return rows.map(publicStation);
}

export async function createStation(
  input: StationCreateInput,
): Promise<PublicStation> {
  const id = crypto.randomUUID();
  await db.insert(stations).values({
    id,
    name: input.name,
  });
  const [row] = await db
    .select()
    .from(stations)
    .where(eq(stations.id, id))
    .limit(1);
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
  const [existing] = await db
    .select()
    .from(stations)
    .where(eq(stations.id, id))
    .limit(1);
  if (!existing) {
    throw Object.assign(new ApiError('Station not found', 404), {
      errorCode: 'STATION_NOT_FOUND',
    });
  }
  await db.update(stations).set(patch).where(eq(stations.id, id));
  const [updated] = await db
    .select()
    .from(stations)
    .where(eq(stations.id, id))
    .limit(1);
  if (!updated) {
    throw Object.assign(new ApiError('Updated station not found', 500), {
      errorCode: 'INTERNAL_ERROR',
    });
  }
  return publicStation(updated);
}

export async function deleteStation(id: string): Promise<void> {
  const [existing] = await db
    .select({ id: stations.id })
    .from(stations)
    .where(eq(stations.id, id))
    .limit(1);
  if (!existing) {
    throw Object.assign(new ApiError('Station not found', 404), {
      errorCode: 'STATION_NOT_FOUND',
    });
  }
  await db.delete(stations).where(eq(stations.id, id));
}
