import crypto from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { db } from '../db/client';
import {
  type ClearanceLevel,
  employees,
  roles,
} from '../db/schema';
import { ServiceError } from './errors';

export interface PublicRole {
  id: string;
  name: string;
  clearanceLevel: ClearanceLevel;
  createdAt: string;
}

export function publicRole(
  r: Readonly<typeof roles.$inferSelect>,
): PublicRole {
  return {
    id: r.id,
    name: r.name,
    // roles.clearanceLevel is plain text in the schema; route-layer zod
    // validation guarantees one of the 4 enum values at the API boundary.
    clearanceLevel: r.clearanceLevel as ClearanceLevel,
    createdAt: r.createdAt.toISOString(),
  };
}

export interface RoleCreateInput {
  name: string;
  clearanceLevel: ClearanceLevel;
}

export interface RolePatchInput {
  name?: string;
  clearanceLevel?: ClearanceLevel;
}

export async function listRoles(): Promise<PublicRole[]> {
  const rows = await db.select().from(roles);
  return rows.map(publicRole);
}

export async function createRole(input: RoleCreateInput): Promise<PublicRole> {
  // Roles don't have a separate "id" UI field — backend generates a UUID so
  // the admin only has to type the display name. Existing seeded rows keep
  // their slug ids for backward compatibility with employees.role_id FKs.
  const id = crypto.randomUUID();
  await db.insert(roles).values({
    id,
    name: input.name,
    clearanceLevel: input.clearanceLevel,
  });
  const [row] = await db
    .select()
    .from(roles)
    .where(eq(roles.id, id))
    .limit(1);
  if (!row) {
    throw new ServiceError(500, 'INTERNAL_ERROR', 'Inserted role not found');
  }
  return publicRole(row);
}

export async function updateRole(
  id: string,
  patch: RolePatchInput,
): Promise<PublicRole> {
  if (Object.keys(patch).length === 0) {
    throw new ServiceError(
      400,
      'INVALID_INPUT',
      'Patch must include at least one field',
    );
  }
  const [existing] = await db
    .select()
    .from(roles)
    .where(eq(roles.id, id))
    .limit(1);
  if (!existing) {
    throw new ServiceError(404, 'ROLE_NOT_FOUND', 'Role not found');
  }
  await db.update(roles).set(patch).where(eq(roles.id, id));
  const [updated] = await db
    .select()
    .from(roles)
    .where(eq(roles.id, id))
    .limit(1);
  if (!updated) {
    throw new ServiceError(500, 'INTERNAL_ERROR', 'Updated role not found');
  }
  return publicRole(updated);
}

// Hard delete — refused when any employee still references the role.
// employees.role_id has ON DELETE restrict, so the DB would also refuse; we
// surface a friendly 409 instead of a raw FK violation.
export async function deleteRole(id: string): Promise<void> {
  const [existing] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.id, id))
    .limit(1);
  if (!existing) {
    throw new ServiceError(404, 'ROLE_NOT_FOUND', 'Role not found');
  }
  const refs = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(employees)
    .where(eq(employees.roleId, id));
  const refCount = refs[0]?.c ?? 0;
  if (refCount > 0) {
    throw new ServiceError(
      409,
      'ROLE_IN_USE',
      `Cannot delete: ${refCount} employee(s) still reference this role.`,
    );
  }
  await db.delete(roles).where(eq(roles.id, id));
}