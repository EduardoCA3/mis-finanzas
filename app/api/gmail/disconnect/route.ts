import { NextResponse } from 'next/server';
import { ensureSchema, getD1 } from '@/db';

export const dynamic = 'force-dynamic';

export async function POST() {
  await ensureSchema();
  await getD1().batch([
    getD1().prepare(`DELETE FROM app_settings WHERE key = 'gmail_refresh_token'`),
    getD1().prepare(`DELETE FROM app_settings WHERE key = 'gmail_last_sync'`),
  ]);
  return NextResponse.json({ ok: true });
}
