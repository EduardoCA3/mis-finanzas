import { NextRequest, NextResponse } from 'next/server';
import { ensureSchema, getD1 } from '@/db';
import { CATEGORIES, isValidDate, normalizeMoney } from '@/lib/finance';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    await ensureSchema();
    const body = await request.json() as Record<string, unknown>;
    const type = body.type === 'income' ? 'income' : body.type === 'expense' ? 'expense' : null;
    const description = String(body.description ?? '').trim();
    const amountCents = body.amountCents
      ? Math.round(Number(body.amountCents))
      : normalizeMoney(body.amount);
    const category = CATEGORIES.includes(String(body.category)) ? String(body.category) : 'Otros';
    const transactionDate = body.transactionDate;

    if (!type || !description || !amountCents || !isValidDate(transactionDate)) {
      return NextResponse.json({ error: 'Revisa el monto, la fecha y la descripción.' }, { status: 400 });
    }

    const result = await getD1()
      .prepare(
        `INSERT INTO transactions
          (source, type, description, counterparty, amount_cents, currency, category, transaction_date)
         VALUES (?, ?, ?, ?, ?, 'PEN', ?, ?)`,
      )
      .bind('manual', type, description.slice(0, 120), description.slice(0, 120), amountCents, category, transactionDate)
      .run();

    return NextResponse.json({ id: result.meta.last_row_id }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'No se pudo guardar el movimiento.' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await ensureSchema();
    const id = Number(request.nextUrl.searchParams.get('id'));
    if (!Number.isInteger(id) || id < 1) {
      return NextResponse.json({ error: 'Movimiento inválido.' }, { status: 400 });
    }

    const d1 = getD1();
    const transaction = await d1
      .prepare('SELECT external_id FROM transactions WHERE id = ?')
      .bind(id)
      .first<{ external_id: string | null }>();

    if (!transaction) {
      return NextResponse.json({ error: 'El movimiento ya no existe.' }, { status: 404 });
    }

    if (transaction.external_id) {
      await d1.batch([
        d1.prepare(
          `INSERT OR IGNORE INTO ignored_external_transactions (external_id)
           VALUES (?)`,
        ).bind(transaction.external_id),
        d1.prepare('DELETE FROM transactions WHERE id = ?').bind(id),
      ]);
    } else {
      await d1.prepare('DELETE FROM transactions WHERE id = ?').bind(id).run();
    }

    return NextResponse.json({ ok: true, ignored: Boolean(transaction.external_id) });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'No se pudo eliminar el movimiento.' }, { status: 500 });
  }
}
