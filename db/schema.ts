import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const transactions = sqliteTable(
  'transactions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    externalId: text('external_id').unique(),
    source: text('source').notNull().default('manual'),
    type: text('type', { enum: ['income', 'expense'] }).notNull(),
    description: text('description').notNull(),
    counterparty: text('counterparty'),
    amountCents: integer('amount_cents').notNull(),
    currency: text('currency').notNull().default('PEN'),
    category: text('category').notNull().default('Otros'),
    transactionDate: text('transaction_date').notNull(),
    createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index('idx_transactions_date').on(table.transactionDate),
    index('idx_transactions_type_date').on(table.type, table.transactionDate),
    index('idx_transactions_category_date').on(table.category, table.transactionDate),
  ],
);

export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const ignoredExternalTransactions = sqliteTable('ignored_external_transactions', {
  externalId: text('external_id').primaryKey(),
  ignoredAt: text('ignored_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});
