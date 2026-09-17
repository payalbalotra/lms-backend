import crypto from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { employees, locations } from '../db/schema';
import { ServiceError } from './errors';

export interface PublicLocation {
  id: string;
  name: string;
}

export function publicLocation(
  l: Readonly<typeof locations.$inferSelect>,
): PublicLocation {
  return {
    id: l.id,
    name: l.name,
  };
}

export interface LocationCreateInput {
  name: string;
}

export interface LocationPatchInput {
  name: string;
}

export async function listLocations(): Promise<PublicLocation[]> {
  const rows = await db.select().from(locations);
  return rows.map(publicLocation);
}

export async function createLocation(
  input: LocationCreateInput,
): Promise<PublicLocation> {
  // Locations don't have a separate "id" UI field — backend generates a UUID
  // so the admin only has to type the display name. Existing seeded rows
  // keep their slug ids for backward compatibility with employees.location_id FKs.
  const id = crypto.randomUUID();
  await db.insert(locations).values({ id, name: input.name });
  const [row] = await db
    .select()
    .from(locations)
    .where(eq(locations.id, id))
    .limit(1);
  if (!row) {
    throw new ServiceError(500, 'INTERNAL_ERROR', 'Inserted location not found');
  }
  return publicLocation(row);
}

export async function updateLocation(
  id: string,
  patch: LocationPatchInput,
): Promise<PublicLocation> {
  const [existing] = await db
    .select()
    .from(locations)
    .where(eq(locations.id, id))
    .limit(1);
  if (!existing) {
    throw new ServiceError(404, 'LOCATION_NOT_FOUND', 'Location not found');
  }
  await db.update(locations).set(patch).where(eq(locations.id, id));
  const [updated] = await db
    .select()
    .from(locations)
    .where(eq(locations.id, id))
    .limit(1);
  if (!updated) {
    throw new ServiceError(500, 'INTERNAL_ERROR', 'Updated location not found');
  }
  return publicLocation(updated);
}

// Hard delete — refused when any employee still references the location.
// employees.location_id has ON DELETE restrict.
export async function deleteLocation(id: string): Promise<void> {
  const [existing] = await db
    .select({ id: locations.id })
    .from(locations)
    .where(eq(locations.id, id))
    .limit(1);
  if (!existing) {
    throw new ServiceError(404, 'LOCATION_NOT_FOUND', 'Location not found');
  }
  const refs = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(employees)
    .where(eq(employees.locationId, id));
  const refCount = refs[0]?.c ?? 0;
  if (refCount > 0) {
    throw new ServiceError(
      409,
      'LOCATION_IN_USE',
      `Cannot delete: ${refCount} employee(s) still reference this location.`,
    );
  }
  await db.delete(locations).where(eq(locations.id, id));
}