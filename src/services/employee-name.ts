import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { employees } from '../db/schema';


export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').normalize('NFC');
}


export async function uniqueEmployeeName(
  locationId: string,
  baseName: string,
): Promise<string> {
  const normalized = normalizeName(baseName);
  const lower = normalized.toLowerCase();

  // First: try the exact base name.
  const exact = await db
    .select({ name: employees.name })
    .from(employees)
    .where(
      and(
        eq(employees.locationId, locationId),
        sql`lower(${employees.name}) = ${lower}`,
      ),
    )
    .limit(1);

  if (exact.length === 0) return normalized;

  // Otherwise: walk "Maria López 2", "Maria López 3", ... until free.
  let n = 2;
  while (true) {
    const candidate = `${normalized} ${n}`;
    const exists = await db
      .select({ name: employees.name })
      .from(employees)
      .where(
        and(
          eq(employees.locationId, locationId),
          sql`lower(${employees.name}) = ${candidate.toLowerCase()}`,
        ),
      )
      .limit(1);
    if (exists.length === 0) return candidate;
    n += 1;
    if (n > 9999) {
      throw new Error(
        `Could not find a free name suffix for "${baseName}" in location ${locationId}`,
      );
    }
  }
}