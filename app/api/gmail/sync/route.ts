import { NextResponse } from 'next/server';
import { ensureSchema, getD1 } from '@/db';
import { fetchFinancialMessages, gmailConfiguration, gmailIsConfigured, parseGmailTransaction, refreshAccessToken } from '@/lib/gmail';
import { decryptSecret } from '@/lib/secure-store';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    if (!gmailIsConfigured()) {
      return NextResponse.json({ error: 'Primero hay que configurar el acceso de Google.' }, { status: 409 });
    }

    await ensureSchema();
    const d1 = getD1();
    const saved = await d1
      .prepare(`SELECT value FROM app_settings WHERE key = 'gmail_refresh_token'`)
      .first<{ value: string }>();

    if (!saved) {
      return NextResponse.json({ error: 'Conecta tu cuenta de Gmail primero.' }, { status: 409 });
    }

    const encryptionKey = gmailConfiguration().encryptionKey!;
    const refreshToken = await decryptSecret(saved.value, encryptionKey);
    const accessToken = await refreshAccessToken(refreshToken);
    const messages = await fetchFinancialMessages(accessToken);
    const transactions = messages.flatMap((message) => {
      const transaction = parseGmailTransaction(message);
      return transaction ? [transaction] : [];
    });

    let imported = 0;
    for (let offset = 0; offset < transactions.length; offset += 50) {
      const batch = transactions.slice(offset, offset + 50).map((transaction) =>
        d1.prepare(
          `INSERT OR IGNORE INTO transactions
            (external_id, source, type, description, counterparty, amount_cents, currency, category, transaction_date)
           SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
           WHERE NOT EXISTS (
             SELECT 1 FROM ignored_external_transactions WHERE external_id = ?
           )`,
        ).bind(
          transaction.externalId,
          transaction.source,
          transaction.type,
          transaction.description,
          transaction.counterparty ?? null,
          transaction.amountCents,
          transaction.currency ?? 'PEN',
          transaction.category,
          transaction.transactionDate,
          transaction.externalId,
        ),
      );
      const results = await d1.batch(batch);
      imported += results.filter((result) => (result.meta.changes ?? 0) > 0).length;
    }

    await d1
      .prepare(
        `INSERT INTO app_settings (key, value, updated_at)
         VALUES ('gmail_last_sync', ?, CURRENT_TIMESTAMP)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
      )
      .bind(new Date().toISOString())
      .run();

    return NextResponse.json({ imported, scanned: messages.length });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'No se pudo sincronizar Gmail.' },
      { status: 500 },
    );
  }
}
