import crypto from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { db } from '../../db/client.ts';
import { employees, roles } from '../../db/employee.schema.ts';
import ApiError from '../../shared/utils/ApiError.ts';

export interface PublicRole {
  id: string;
  name: string;
  createdAt: string;
}

export function publicRole(r: Readonly<typeof roles.$inferSelect>): PublicRole {
  return {
    id: r.id,
    name: r.name,
    // roles.clearanceLevel was dropped
    createdAt: r.createdAt.toISOString(),
  };
}

export interface RoleCreateInput {
  name: string;
}

export interface RolePatchInput {
  name?: string;
}

export async function listRoles(): Promise<PublicRole[]> {
  const rows = await db.select().from(roles);
  return rows.map(publicRole);
}

export async function createRole(input: RoleCreateInput): Promise<PublicRole> {
  const id = crypto.randomUUID();
  await db.insert(roles).values({
    id,
    name: input.name,
  });
  const [row] = await db.select().from(roles).where(eq(roles.id, id)).limit(1);
  if (!row) {
    throw new ApiError('Inserted role not found', 500, false, '', {
      code: 'INTERNAL_ERROR',
    });
  }
  return publicRole(row);
}

export async function updateRole(
  id: string,
  patch: RolePatchInput,
): Promise<PublicRole> {
  if (Object.keys(patch).length === 0) {
    throw new ApiError(
      'Patch must include at least one field',
      400,
      false,
      '',
      { code: 'INVALID_INPUT' },
    );
  }
  const [existing] = await db
    .select()
    .from(roles)
    .where(eq(roles.id, id))
    .limit(1);
  if (!existing) {
    throw new ApiError('Role not found', 404, false, '', {
      code: 'ROLE_NOT_FOUND',
    });
  }
  await db.update(roles).set(patch).where(eq(roles.id, id));
  const [updated] = await db
    .select()
    .from(roles)
    .where(eq(roles.id, id))
    .limit(1);
  if (!updated) {
    throw new ApiError('Updated role not found', 500, false, '', {
      code: 'INTERNAL_ERROR',
    });
  }
  return publicRole(updated);
}

export async function deleteRole(id: string): Promise<void> {
  const [existing] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.id, id))
    .limit(1);
  if (!existing) {
    throw new ApiError('Role not found', 404, false, '', {
      code: 'ROLE_NOT_FOUND',
    });
  }
  const refs = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(employees)
    .where(eq(employees.roleId, id));
  const refCount = refs[0]?.c ?? 0;
  if (refCount > 0) {
    throw new ApiError(
      `Cannot delete: ${refCount} employee(s) still reference this role.`,
      409,
      false,
      '',
      { code: 'ROLE_IN_USE' },
    );
  }
  await db.delete(roles).where(eq(roles.id, id));
}
