import { eq, desc } from 'drizzle-orm';
import { db } from '../../db/client.ts';
import { jobs, type Job } from '../../db/jobs.schema.ts';
import ApiError from '../../shared/utils/ApiError.ts';
import crypto from 'node:crypto';

export async function createJob(input: { name: string }): Promise<Job> {
  const id = crypto.randomUUID();
  const [newJob] = await db
    .insert(jobs)
    .values({
      id,
      name: input.name,
    })
    .returning();

  if (!newJob) {
    throw new ApiError('Failed to create job', 500);
  }
  return newJob;
}

export async function getJobs(): Promise<Job[]> {
  return db.select().from(jobs).orderBy(desc(jobs.createdAt));
}

export async function updateJob(
  id: string,
  input: { name?: string },
): Promise<Job> {
  const [updatedJob] = await db
    .update(jobs)
    .set(input)
    .where(eq(jobs.id, id))
    .returning();

  if (!updatedJob) {
    throw new ApiError('Job not found', 404);
  }
  return updatedJob;
}

export async function deleteJob(id: string): Promise<void> {
  const [deleted] = await db.delete(jobs).where(eq(jobs.id, id)).returning();
  if (!deleted) {
    throw new ApiError('Job not found', 404);
  }
}
