import { NextRequest, NextResponse } from 'next/server';
import { ensureSchema, getD1 } from '@/db';
import { CATEGORIES, isValidDate, normalizeMoney } from '@/lib/finance';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    await ensureSchema();
    const body = await request.json() as { transactions?: Array<Record<string, unknown>> };
    const rows = (body.transactions ?? []).slice(0, 500).flatMap((row) => {
      const transactionDate = row.transactionDate;
      const description = String(row.description ?? '').trim();
      const type = row.type === 'income' ? 'income' : 'expense';
      const amountCents = normalizeMoney(row.amount);
      if (!description || !amountCents || !isValidDate(transactionDate)) return [];

      return [{
        transactionDate,
        description: description.slice(0, 120),
        type,
        amountCents,
        category: CATEGORIES.includes(String(row.category)) ? String(row.category) : 'Otros',
        source: String(row.source ?? 'CSV').slice(0, 30),
      }];
    });

    if (!rows.length) {
      return NextResponse.json({ error: 'No encontramos filas válidas en el archivo.' }, { status: 400 });
    }

    const d1 = getD1();
    await d1.batch(rows.map((row) =>
      d1.prepare(
        `INSERT INTO transactions
          (source, type, description, counterparty, amount_cents, currency, category, transaction_date)
         VALUES (?, ?, ?, ?, ?, 'PEN', ?, ?)`,
      ).bind(row.source, row.type, row.description, row.description, row.amountCents, row.category, row.transactionDate),
    ));

    return NextResponse.json({ imported: rows.length }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'No se pudo importar el archivo.' }, { status: 500 });
  }
}
