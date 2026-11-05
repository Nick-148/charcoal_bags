/**
 * Real local D1 (workerd via wrangler's platform proxy), in-memory, with migrations applied.
 * One instance per test file; `resetDb` restores the seeded state between tests.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getPlatformProxy } from 'wrangler';

const MIGRATIONS_DIR = join(import.meta.dirname, '../../migrations');

function statements(sql: string): string[] {
  return sql
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n')
    .split(/;\s*(?:\n|$)/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

export async function createTestDb() {
  const proxy = await getPlatformProxy<{ DB: D1Database }>({ configPath: 'wrangler.jsonc', persist: false });
  const db = proxy.env.DB;
  for (const file of migrationFiles()) {
    for (const sql of statements(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'))) {
      await db.prepare(sql).run();
    }
  }
  return { db, dispose: () => proxy.dispose() };
}

const TABLES = [
  'order_items',
  'orders',
  'inventory',
  'inquiries',
  'processed_webhook_events',
  'admin_audit_log',
];

export async function resetDb(db: D1Database): Promise<void> {
  await db.batch(TABLES.map((t) => db.prepare(`DELETE FROM ${t}`)));
  const seed = migrationFiles().filter((f) => f.includes('seed'));
  for (const file of seed) {
    for (const sql of statements(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'))) {
      await db.prepare(sql).run();
    }
  }
}
