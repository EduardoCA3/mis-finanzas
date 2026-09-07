import { NextRequest, NextResponse } from 'next/server';
import { ensureSchema, getD1 } from '@/db';
import { exchangeCode, gmailConfiguration } from '@/lib/gmail';
import { encryptSecret } from '@/lib/secure-store';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const state = request.nextUrl.searchParams.get('state');
  const savedState = request.cookies.get('gmail_oauth_state')?.value;

  if (!code || !state || !savedState || state !== savedState) {
    return NextResponse.redirect(new URL('/?gmail=invalid-state', request.url));
  }

  try {
    const tokens = await exchangeCode(code, request.nextUrl.origin);
    const encryptionKey = gmailConfiguration().encryptionKey;
    if (!tokens.refresh_token || !encryptionKey) throw new Error('Google no devolvió un permiso permanente.');
    const encrypted = await encryptSecret(tokens.refresh_token, encryptionKey);

    await ensureSchema();
    await getD1()
      .prepare(
        `INSERT INTO app_settings (key, value, updated_at)
         VALUES ('gmail_refresh_token', ?, CURRENT_TIMESTAMP)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
      )
      .bind(encrypted)
      .run();

    const response = NextResponse.redirect(new URL('/?gmail=connected', request.url));
    response.cookies.delete('gmail_oauth_state');
    return response;
  } catch (error) {
    console.error(error);
    return NextResponse.redirect(new URL('/?gmail=error', request.url));
  }
}

