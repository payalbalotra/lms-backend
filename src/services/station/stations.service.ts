import crypto from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '../../db/client.ts';
import { stations } from '../../db/employee.schema.ts';
import ApiError from '../../shared/utils/ApiError.ts';

export interface PublicStation {
  id: string;
  name: string;
  isArchived: boolean;
}

export function publicStation(
  s: Readonly<typeof stations.$inferSelect>,
): PublicStation {
  return {
    id: s.id,
    name: s.name,
    isArchived: s.isArchived,
  };
}

export interface StationCreateInput {
  name: string;
}

export interface StationPatchInput {
  name?: string;
  isArchived?: boolean;
}

export async function listStations(opts: {
  includeArchived: boolean;
}): Promise<PublicStation[]> {
  const { includeArchived } = opts;
  const conditions = [];
  if (!includeArchived) {
    conditions.push(eq(stations.isArchived, false));
  }
  const rows = await db
    .select()
    .from(stations)
    .where(conditions.length > 0 ? and(...conditions) : undefined);
  return rows.map(publicStation);
}

export async function createStation(
  input: StationCreateInput,
): Promise<PublicStation> {
  const id = crypto.randomUUID();
  await db.insert(stations).values({
    id,
    name: input.name,
    isArchived: false,
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
    throw Object.assign(new ApiError('Station not found', 404), {
      errorCode: 'STATION_NOT_FOUND',
    });
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
    throw Object.assign(new ApiError('Updated station not found', 500), {
      errorCode: 'INTERNAL_ERROR',
    });
  }
  return publicStation(updated);
}
