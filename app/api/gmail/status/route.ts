import { NextResponse } from 'next/server';
import { ensureSchema, getD1 } from '@/db';
import { gmailIsConfigured } from '@/lib/gmail';

export const dynamic = 'force-dynamic';

export async function GET() {
  await ensureSchema();
  const token = await getD1()
    .prepare(`SELECT value FROM app_settings WHERE key = 'gmail_refresh_token'`)
    .first<{ value: string }>();

  return NextResponse.json({
    configured: gmailIsConfigured(),
    connected: Boolean(token),
  });
}

