import { asc, eq, inArray, sql, count, ilike } from 'drizzle-orm';
import {
  formatPaginatedResult,
  type PaginatedResult,
} from '../../shared/pagination.ts';
import { db } from '../../db/client.ts';
import { jobs, stations, employees } from '../../db/schema/index.ts';
import ApiError from '../../shared/api-error.ts';

export interface PublicJob {
  id: string;
  name: string;
  createdAt: string;
  stationIds?: string[];
}

export function publicJob(r: Readonly<typeof jobs.$inferSelect>): PublicJob {
  return {
    id: r.id,
    name: r.name,
    createdAt: r.createdAt.toISOString(),
    stationIds: r.stationIds || [],
  };
}

export interface JobCreateInput {
  name: string;
  stationIds?: string[];
}

export interface JobPatchInput {
  name?: string | undefined;
  stationIds?: string[] | undefined;
}

export async function listJobs(
  page: number = 1,
  limit: number = 10,
  search?: string,
): Promise<PaginatedResult<PublicJob>> {
  const offset = (page - 1) * limit;
  const whereClause = search ? ilike(jobs.name, `%${search}%`) : undefined;
  // Page query and count are independent, so run them in parallel. The
  // explicit order keeps pages stable between requests.
  const [rows, [countRes]] = await Promise.all([
    db
      .select()
      .from(jobs)
      .where(whereClause)
      .orderBy(asc(jobs.createdAt), asc(jobs.id))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(jobs).where(whereClause),
  ]);
  return formatPaginatedResult(
    rows.map((r) => publicJob(r)),
    countRes?.total ?? 0,
    page,
    limit,
  );
}

// ---------------------------------------------------------------------------
// getJobStations
// ---------------------------------------------------------------------------
// Returns the stations linked to any of the given jobs (each station once).
// Used by the employee form when the user selects jobs and the frontend needs
// to show only the stations for those jobs.
// ---------------------------------------------------------------------------
export async function getJobStations(
  jobIds: string[],
): Promise<Array<{ id: string; name: string }>> {
  if (jobIds.length === 0) return [];

  // One query: join each job's station_ids array to the stations table.
  return db
    .selectDistinct({ id: stations.id, name: stations.name })
    .from(jobs)
    .innerJoin(stations, sql`${stations.id} = ANY(${jobs.stationIds})`)
    .where(inArray(jobs.id, jobIds))
    .orderBy(asc(stations.name), asc(stations.id));
}

/**
 * Lowercases and de-duplicates station ids, then checks every one exists.
 * job.station_ids is a uuid[] without a foreign key, so an unknown id would
 * otherwise be stored and later break employee updates ("unknown stations").
 */
async function normalizeStationIds(ids: string[]): Promise<string[]> {
  const unique = [...new Set(ids.map((id) => id.toLowerCase()))];
  if (unique.length === 0) return unique;
  const found = await db
    .select({ id: stations.id })
    .from(stations)
    .where(inArray(stations.id, unique));
  if (found.length !== unique.length) {
    throw Object.assign(new ApiError('One or more unknown stations', 400), {
      errorCode: 'STATION_NOT_FOUND',
    });
  }
  return unique;
}

export async function createJob(input: JobCreateInput): Promise<PublicJob> {
  const stationIds = await normalizeStationIds(input.stationIds ?? []);
  const [row] = await db
    .insert(jobs)
    .values({ name: input.name, stationIds })
    .returning();
  if (!row) {
    throw Object.assign(new ApiError('Inserted role not found', 500), {
      errorCode: 'INTERNAL_ERROR',
    });
  }

  return publicJob(row);
}

export async function updateJob(
  id: string,
  patch: JobPatchInput,
): Promise<PublicJob> {
  if (Object.keys(patch).length === 0) {
    throw Object.assign(
      new ApiError('Patch must include at least one field', 400),
      { errorCode: 'INVALID_INPUT' },
    );
  }

  const updatePayload: Partial<JobPatchInput> = {};
  if (patch.name !== undefined) updatePayload.name = patch.name;
  if (patch.stationIds !== undefined)
    updatePayload.stationIds = await normalizeStationIds(patch.stationIds);

  // One round trip: update and read back; no row means the id is unknown.
  const [updated] = await db
    .update(jobs)
    .set(updatePayload)
    .where(eq(jobs.id, id))
    .returning();
  if (!updated) {
    throw Object.assign(new ApiError('Job not found', 404), {
      errorCode: 'ROLE_NOT_FOUND',
    });
  }

  return publicJob(updated);
}

export async function deleteJob(id: string): Promise<void> {
  // A job that does not exist cannot be referenced, so check references
  // first and then delete: two queries instead of three.
  const refs = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(employees)
    .where(sql`${employees.jobIds} @> ARRAY[${id}::uuid]`);
  const refCount = refs[0]?.c ?? 0;
  if (refCount > 0) {
    throw Object.assign(
      new ApiError(
        `Cannot delete: ${refCount} employee(s) still reference this role.`,
        409,
      ),
      { errorCode: 'ROLE_IN_USE' },
    );
  }
  const deleted = await db
    .delete(jobs)
    .where(eq(jobs.id, id))
    .returning({ id: jobs.id });
  if (deleted.length === 0) {
    throw Object.assign(new ApiError('Job not found', 404), {
      errorCode: 'ROLE_NOT_FOUND',
    });
  }
}
