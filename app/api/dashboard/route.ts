import { NextRequest, NextResponse } from 'next/server';
import { ensureSchema, getD1 } from '@/db';
import { CATEGORY_COLORS, monthBounds } from '@/lib/finance';
import { gmailIsConfigured } from '@/lib/gmail';

export const dynamic = 'force-dynamic';

type TransactionRow = {
  id: number;
  external_id: string | null;
  source: string;
  type: 'income' | 'expense';
  description: string;
  counterparty: string | null;
  amount_cents: number;
  currency: string;
  category: string;
  transaction_date: string;
};

export async function GET(request: NextRequest) {
  try {
    await ensureSchema();
    const d1 = getD1();
    const { start, end, month } = monthBounds(request.nextUrl.searchParams.get('month') ?? '');
    const { results = [] } = await d1
      .prepare(
        `SELECT id, external_id, source, type, description, counterparty,
                amount_cents, currency, category, transaction_date
         FROM transactions
         WHERE transaction_date >= ? AND transaction_date < ?
         ORDER BY transaction_date DESC, id DESC`,
      )
      .bind(start, end)
      .all<TransactionRow>();

    const incomeCents = results
      .filter((row) => row.type === 'income')
      .reduce((sum, row) => sum + row.amount_cents, 0);
    const expenseCents = results
      .filter((row) => row.type === 'expense')
      .reduce((sum, row) => sum + row.amount_cents, 0);

    const categoryTotals = new Map<string, number>();
    const weekly = [0, 0, 0, 0, 0];
    results.forEach((row) => {
      if (row.type !== 'expense') return;
      categoryTotals.set(row.category, (categoryTotals.get(row.category) ?? 0) + row.amount_cents);
      const day = Number.parseInt(row.transaction_date.slice(8, 10), 10);
      weekly[Math.min(4, Math.floor((day - 1) / 7))] += row.amount_cents;
    });

    const categories = [...categoryTotals.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, amountCents]) => ({
        name,
        amountCents,
        color: CATEGORY_COLORS[name] ?? CATEGORY_COLORS.Otros,
        percent: expenseCents ? Math.round((amountCents / expenseCents) * 100) : 0,
      }));

    const gmail = await d1.prepare(`SELECT value FROM app_settings WHERE key = 'gmail_refresh_token'`).first<{ value: string }>();

    return NextResponse.json({
      month,
      totals: {
        incomeCents,
        expenseCents,
        balanceCents: incomeCents - expenseCents,
        savingsRate: incomeCents ? Math.round(((incomeCents - expenseCents) / incomeCents) * 100) : 0,
      },
      weekly,
      categories,
      transactions: results.map((row) => ({
        id: row.id,
        externalId: row.external_id,
        source: row.source,
        type: row.type,
        description: row.description,
        counterparty: row.counterparty,
        amountCents: row.amount_cents,
        currency: row.currency,
        category: row.category,
        transactionDate: row.transaction_date,
      })),
      gmailConnected: Boolean(gmail),
      gmailConfigured: gmailIsConfigured(),
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'No se pudo cargar tu información financiera.' }, { status: 500 });
  }
}
