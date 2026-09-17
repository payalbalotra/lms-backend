import 'dotenv/config';
import { sql, closeDb } from '../src/db/client.js';

async function run(): Promise<void> {
  console.log('=== BETTER AUTH users ===');
  const users = await sql<{ id: string; email: string; name: string; created_at: string }[]>`
    SELECT id, email, name, created_at::text FROM "user" ORDER BY created_at
  `;
  console.log(`  count: ${users.length}`);
  for (const u of users) console.log(`  ${u.id} | ${u.email} | ${u.name} | ${u.created_at}`);

  console.log('\n=== BETTER AUTH accounts (password hashes) ===');
  const accts = await sql<{ id: string; user_id: string; provider_id: string; has_password: boolean; created_at: string }[]>`
    SELECT id, user_id, provider_id, (password IS NOT NULL) AS has_password, created_at::text
    FROM "account" ORDER BY created_at
  `;
  console.log(`  count: ${accts.length}`);
  for (const a of accts) console.log(`  ${a.id} | user=${a.user_id} | provider=${a.provider_id} | pw=${a.has_password} | ${a.created_at}`);

  console.log('\n=== PENDING invite (latest) ===');
  const inv = await sql<{ id: string; employee_id: string; token_hash: string; expires_at: string }[]>`
    SELECT id, employee_id, substring(token_hash, 1, 12) AS token_hash, expires_at::text
    FROM invites WHERE used_at IS NULL AND cancelled_at IS NULL
    ORDER BY created_at DESC LIMIT 1
  `;
  console.log(`  ${JSON.stringify(inv[0] ?? null)}`);

  console.log('\n=== Activation status per employee ===');
  const x = await sql<{
    eid: string; ename: string; estatus: string; euid: string | null;
    buid: string | null; buemail: string | null; created: string | null;
  }[]>`
    SELECT e.id AS eid, e.name AS ename, e.status AS estatus, e.user_id AS euid,
           u.id AS buid, u.email AS buemail, u.created_at::text AS created
    FROM employees e
    LEFT JOIN "user" u ON u.email = (e.id || '@lms.internal')
    ORDER BY e.created_at
  `;
  for (const r of x) {
    console.log(`  ${r.eid} | ${r.ename} | emp.status=${r.estatus} | emp.userId=${r.euid ?? 'null'} | BA.user=${r.buid ?? 'NULL'} (${r.buemail ?? '-'}) since ${r.created ?? '-'}`);
  }
}

run().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => closeDb());