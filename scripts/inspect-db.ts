import 'dotenv/config';
import { sql, closeDb } from '../src/db/client.js';

async function run(): Promise<void> {
  console.log('=== TABLES ===');
  const tables = await sql<{ table_name: string }[]>`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' ORDER BY table_name
  `;
  for (const t of tables) console.log('  ' + t.table_name);

  console.log('\n=== LOCATIONS ===');
  const locs = await sql<{ id: string; name: string; created_at: string }[]>`
    SELECT id, name, created_at::text FROM locations ORDER BY created_at
  `;
  console.log(`  count: ${locs.length}`);
  for (const r of locs) console.log(`  ${r.id} | ${r.name} | ${r.created_at}`);

  console.log('\n=== ROLES ===');
  const roles = await sql<{ id: string; clearance_level: string; created_at: string }[]>`
    SELECT id, clearance_level, created_at::text FROM roles ORDER BY created_at
  `;
  console.log(`  count: ${roles.length}`);
  for (const r of roles) console.log(`  ${r.id} | clearance=${r.clearance_level} | ${r.created_at}`);

  console.log('\n=== STATIONS ===');
  const stations = await sql<{ id: string; name: string; location_id: string; sort_order: number; is_archived: boolean }[]>`
    SELECT id, name, location_id, sort_order, is_archived FROM stations ORDER BY sort_order
  `;
  console.log(`  count: ${stations.length}`);
  for (const s of stations) console.log(`  ${s.id} | ${s.name} | loc=${s.location_id} | sort=${s.sort_order} | archived=${s.is_archived}`);

  console.log('\n=== EMPLOYEES ===');
  const emps = await sql<{
    id: string;
    name: string;
    employee_code: string | null;
    location_id: string;
    role_id: string;
    station_id: string | null;
    clearance_level: string;
    language_pref: string;
    status: string;
    has_password: boolean;
    password_hash: string | null;
    must_reset_password: boolean;
    failed_login_attempts: number;
    locked_until: string | null;
    created_at: string;
    deactivated_at: string | null;
  }[]>`
    SELECT id, name, employee_code, location_id, role_id, station_id,
           clearance_level, language_pref, status,
           (password_hash IS NOT NULL) AS has_password,
           password_hash,
           must_reset_password, failed_login_attempts,
           locked_until::text AS locked_until,
           created_at::text AS created_at,
           deactivated_at::text AS deactivated_at
    FROM employees ORDER BY created_at
  `;
  console.log(`  count: ${emps.length}`);
  for (const e of emps) {
    const flags: string[] = [];
    if (e.password_hash === null) flags.push('NULL_HASH');
    if (e.status === 'active' && !e.has_password) flags.push('ACTIVE_BUT_NULL_HASH');
    if (e.status === 'pending' && e.has_password) flags.push('PENDING_BUT_HAS_HASH');
    if (e.deactivated_at === null && e.status === 'deactivated') flags.push('DEACTIVATED_BUT_NULL_DATE');
    if (e.deactivated_at !== null && e.status !== 'deactivated') flags.push('NON_DEACTIVATED_BUT_HAS_DEACT_DATE');
    if (e.locked_until !== null) flags.push('LOCKED');
    const hashPreview = e.password_hash ? `${e.password_hash.slice(0, 14)}...` : null;
    console.log(`  ${e.id} | ${e.name} | code=${e.employee_code ?? '-'} | loc=${e.location_id} | role=${e.role_id} | station=${e.station_id ?? '-'} | clr=${e.clearance_level} | lang=${e.language_pref} | status=${e.status} | hash=${hashPreview} ${flags.length ? '⚠ ' + flags.join(', ') : ''}`);
  }

  console.log('\n=== INVITES ===');
  const invites = await sql<{
    id: string;
    employee_id: string;
    token_hash: string;
    expires_at: string;
    used_at: string | null;
    cancelled_at: string | null;
    created_by: string;
    created_at: string;
  }[]>`
    SELECT id, employee_id, substring(token_hash, 1, 12) AS token_hash,
           expires_at::text AS expires_at,
           used_at::text AS used_at,
           cancelled_at::text AS cancelled_at,
           created_by,
           created_at::text AS created_at
    FROM invites ORDER BY created_at
  `;
  console.log(`  count: ${invites.length}`);
  const now = new Date();
  for (const i of invites) {
    const flags: string[] = [];
    if (i.used_at && i.cancelled_at) flags.push('BOTH_USED_AND_CANCELLED');
    const state = i.used_at ? 'USED' : i.cancelled_at ? 'CANCELLED' : new Date(i.expires_at) < now ? 'EXPIRED' : 'PENDING';
    console.log(`  ${i.id} | emp=${i.employee_id} | token=${i.token_hash} | ${state} | expires=${i.expires_at} | by=${i.created_by} ${flags.length ? '⚠ ' + flags.join(', ') : ''}`);
  }

  console.log('\n=== SESSIONS ===');
  const sessions = await sql<{
    id: string;
    employee_id: string;
    expires_at: string;
    revoked_at: string | null;
    ip: string | null;
    user_agent: string | null;
    created_at: string;
    last_used_at: string;
  }[]>`
    SELECT id, employee_id,
           expires_at::text AS expires_at,
           revoked_at::text AS revoked_at,
           ip,
           substring(user_agent, 1, 40) AS user_agent,
           created_at::text AS created_at,
           last_used_at::text AS last_used_at
    FROM sessions ORDER BY created_at
  `;
  console.log(`  count: ${sessions.length}`);
  for (const s of sessions) {
    const state = s.revoked_at ? 'REVOKED' : new Date(s.expires_at) < now ? 'EXPIRED' : 'ACTIVE';
    console.log(`  ${s.id} | emp=${s.employee_id} | ${state} | expires=${s.expires_at} | ip=${s.ip ?? '-'} | ua=${s.user_agent ?? '-'}`);
  }

  console.log('\n=== INTEGRITY CHECKS ===');
  const fkIssues = await sql<{ table_name: string; constraint_name: string }[]>`
    SELECT conrelid::regclass::text AS table_name, conname AS constraint_name
    FROM pg_constraint WHERE contype = 'f' AND conrelid::regclass::text IN ('employees', 'sessions', 'invites', 'stations')
  `;
  console.log(`  foreign keys defined: ${fkIssues.length}`);

  const orphanEmployees = await sql<{ id: string; location_id: string }[]>`
    SELECT e.id, e.location_id FROM employees e
    LEFT JOIN locations l ON l.id = e.location_id WHERE l.id IS NULL
  `;
  console.log(`  employees with missing location: ${orphanEmployees.length}`);

  const orphanRole = await sql<{ id: string; role_id: string }[]>`
    SELECT e.id, e.role_id FROM employees e
    LEFT JOIN roles r ON r.id = e.role_id WHERE r.id IS NULL
  `;
  console.log(`  employees with missing role: ${orphanRole.length}`);

  const orphanStation = await sql<{ id: string; station_id: string }[]>`
    SELECT e.id, e.station_id FROM employees e
    LEFT JOIN stations s ON s.id = e.station_id
    WHERE e.station_id IS NOT NULL AND s.id IS NULL
  `;
  console.log(`  employees with missing station: ${orphanStation.length}`);

  const orphanInvites = await sql<{ id: string; employee_id: string }[]>`
    SELECT i.id, i.employee_id FROM invites i
    LEFT JOIN employees e ON e.id = i.employee_id WHERE e.id IS NULL
  `;
  console.log(`  invites with missing employee: ${orphanInvites.length}`);

  const orphanSessions = await sql<{ id: string; employee_id: string }[]>`
    SELECT s.id, s.employee_id FROM sessions s
    LEFT JOIN employees e ON e.id = s.employee_id WHERE e.id IS NULL
  `;
  console.log(`  sessions with missing employee: ${orphanSessions.length}`);

  console.log('\n=== COUNTS ===');
  const counts = await sql<{ table_name: string; n: number }[]>`
    SELECT 'locations' AS table_name, count(*)::int AS n FROM locations
    UNION ALL SELECT 'roles', count(*)::int FROM roles
    UNION ALL SELECT 'stations', count(*)::int FROM stations
    UNION ALL SELECT 'employees', count(*)::int FROM employees
    UNION ALL SELECT 'invites', count(*)::int FROM invites
    UNION ALL SELECT 'sessions', count(*)::int FROM sessions
  `;
  for (const c of counts) console.log(`  ${c.table_name}: ${c.n}`);
}

run()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());