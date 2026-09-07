import { env } from 'cloudflare:workers';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema';

export function getDb() {
  if (!env.DB) {
    throw new Error(
      'Cloudflare D1 binding `DB` is unavailable. Configure the DB binding in your Cloudflare environment before using the database.',
    );
  }

  return drizzle(env.DB, { schema });
}

export function getD1() {
  if (!env.DB) {
    throw new Error('La base de datos todavía no está disponible.');
  }

  return env.DB;
}

let schemaReady: Promise<void> | null = null;

export function ensureSchema() {
  if (!schemaReady) {
    const d1 = getD1();
    schemaReady = d1
      .batch([
        d1.prepare(`
          CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            external_id TEXT UNIQUE,
            source TEXT NOT NULL DEFAULT 'manual',
            type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
            description TEXT NOT NULL,
            counterparty TEXT,
            amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
            currency TEXT NOT NULL DEFAULT 'PEN',
            category TEXT NOT NULL DEFAULT 'Otros',
            transaction_date TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
          )
        `),
        d1.prepare(`
          CREATE TABLE IF NOT EXISTS app_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
          )
        `),
        d1.prepare(`
          CREATE TABLE IF NOT EXISTS ignored_external_transactions (
            external_id TEXT PRIMARY KEY,
            ignored_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
          )
        `),
        d1.prepare('CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(transaction_date)'),
        d1.prepare('CREATE INDEX IF NOT EXISTS idx_transactions_type_date ON transactions(type, transaction_date)'),
        d1.prepare('CREATE INDEX IF NOT EXISTS idx_transactions_category_date ON transactions(category, transaction_date)'),
      ])
      .then(() => undefined)
      .catch((error) => {
        schemaReady = null;
        throw error;
      });
  }

  return schemaReady;
}
