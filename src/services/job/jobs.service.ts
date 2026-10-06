import crypto from 'node:crypto';
import { eq, inArray, sql } from 'drizzle-orm';
import { db } from '../../db/client.ts';
import { jobs, jobStations, stations, employeeJobs } from '../../db/index.ts';
import type { Role } from '../../db/index.ts';
import ApiError from '../../shared/utils/ApiError.ts';

export interface PublicJob {
  id: string;
  name: string;
  createdAt: string;
}

export function publicJob(r: Readonly<typeof jobs.$inferSelect>): PublicJob {
  return {
    id: r.id,
    name: r.name,
    createdAt: r.createdAt.toISOString(),
  };
}

export interface JobCreateInput {
  name: string;
}

export interface JobPatchInput {
  name?: string | undefined;
}

export async function listJobs(): Promise<PublicJob[]> {
  const rows = await db.select().from(jobs);
  return rows.map(publicJob);
}

// ---------------------------------------------------------------------------
// listJobsWithStations
// ---------------------------------------------------------------------------
// Used by the employee creation form:
//   1. Caller passes optional roleId → only jobs for that role are returned.
//   2. Each job carries its linked stations so the frontend can populate the
//      station picker client-side once the user picks a job — no second call.
// ---------------------------------------------------------------------------
export interface PublicJobWithStations extends PublicJob {
  roleId: string | null;
  stations: Array<{ id: string; name: string }>;
}

export async function listJobsWithStations(
  role?: Role,
): Promise<PublicJobWithStations[]> {
  // 1. Fetch jobs (filtered by role when provided)
  const jobRows = role
    ? await db.select().from(jobs).where(eq(jobs.role, role))
    : await db.select().from(jobs);

  if (jobRows.length === 0) return [];

  // 2. Fetch all job_station links for those jobs in one query
  const jobIds = jobRows.map((j) => j.id);
  const links = await db
    .select({
      jobId: jobStations.jobId,
      stationId: jobStations.stationId,
      stationName: stations.name,
    })
    .from(jobStations)
    .innerJoin(stations, eq(stations.id, jobStations.stationId))
    .where(inArray(jobStations.jobId, jobIds));

  // 3. Group stations per job
  const stationsByJob = new Map<string, Array<{ id: string; name: string }>>();
  for (const link of links) {
    const list = stationsByJob.get(link.jobId) ?? [];
    list.push({ id: link.stationId, name: link.stationName });
    stationsByJob.set(link.jobId, list);
  }

  return jobRows.map((j) => ({
    id: j.id,
    name: j.name,
    roleId: j.role ?? null,
    createdAt: j.createdAt.toISOString(),
    stations: stationsByJob.get(j.id) ?? [],
  }));
}

// ---------------------------------------------------------------------------
// getJobStations
// ---------------------------------------------------------------------------
// Returns the stations linked to a single job by its UUID.
// Used by the employee form when the user selects a specific job and the
// frontend needs to show only the stations for that job.
// ---------------------------------------------------------------------------
export async function getJobStations(
  jobId: string,
): Promise<Array<{ id: string; name: string }>> {
  // 1. Verify the job exists.
  const [job] = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(eq(jobs.id, jobId))
    .limit(1);

  if (!job) {
    throw new ApiError('Job not found', 404, true, '', {
      code: 'JOB_NOT_FOUND',
    });
  }

  // 2. Fetch linked stations.
  const rows = await db
    .select({ id: stations.id, name: stations.name })
    .from(jobStations)
    .innerJoin(stations, eq(stations.id, jobStations.stationId))
    .where(eq(jobStations.jobId, jobId));

  return rows;
}

export async function createJob(input: JobCreateInput): Promise<PublicJob> {
  // Jobs don't have a separate "id" UI field — backend generates a UUID so
  // the admin only has to type the display name. Existing seeded rows keep
  // their slug ids for backward compatibility with employees.role_id FKs.
  const id = crypto.randomUUID();
  await db.insert(jobs).values({
    id,
    name: input.name,
  });
  const [row] = await db.select().from(jobs).where(eq(jobs.id, id)).limit(1);
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
  const [existing] = await db
    .select()
    .from(jobs)
    .where(eq(jobs.id, id))
    .limit(1);
  if (!existing) {
    throw Object.assign(new ApiError('Job not found', 404), {
      errorCode: 'ROLE_NOT_FOUND',
    });
  }
  await db.update(jobs).set(patch).where(eq(jobs.id, id));
  const [updated] = await db
    .select()
    .from(jobs)
    .where(eq(jobs.id, id))
    .limit(1);
  if (!updated) {
    throw Object.assign(new ApiError('Updated role not found', 500), {
      errorCode: 'INTERNAL_ERROR',
    });
  }
  return publicJob(updated);
}

// Hard delete — refused when any employee still references the role.
// employees.role_id has ON DELETE restrict, so the DB would also refuse; we
// surface a friendly 409 instead of a raw FK violation.
export async function deleteJob(id: string): Promise<void> {
  const [existing] = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(eq(jobs.id, id))
    .limit(1);
  if (!existing) {
    throw Object.assign(new ApiError('Job not found', 404), {
      errorCode: 'ROLE_NOT_FOUND',
    });
  }
  const refs = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(employeeJobs)
    .where(eq(employeeJobs.jobId, id));
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
  await db.delete(jobs).where(eq(jobs.id, id));
}
