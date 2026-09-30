import crypto from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { db } from '../../db/client.ts';
import { employees, jobs } from '../../db/employee.schema.ts';
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
  roleId: string;
}

export interface JobPatchInput {
  name?: string;
}

export async function listJobs(): Promise<PublicJob[]> {
  const rows = await db.select().from(jobs);
  return rows.map(publicJob);
}

export async function createJob(input: JobCreateInput): Promise<PublicJob> {
  // Jobs don't have a separate "id" UI field — backend generates a UUID so
  // the admin only has to type the display name. Existing seeded rows keep
  // their slug ids for backward compatibility with employees.role_id FKs.
  const id = crypto.randomUUID();
  await db.insert(jobs).values({
    id,
    name: input.name,
    roleId: input.roleId,
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
    .from(employees)
    .where(eq(employees.roleId, id));
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
