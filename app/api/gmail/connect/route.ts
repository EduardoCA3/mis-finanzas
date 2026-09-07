import { NextRequest, NextResponse } from 'next/server';
import { gmailAuthorizationUrl, gmailIsConfigured } from '@/lib/gmail';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  if (!gmailIsConfigured()) {
    return NextResponse.redirect(new URL('/?gmail=setup-required', request.url));
  }

  const state = crypto.randomUUID();
  const response = NextResponse.redirect(gmailAuthorizationUrl(request.nextUrl.origin, state));
  response.cookies.set('gmail_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: request.nextUrl.protocol === 'https:',
    maxAge: 600,
    path: '/',
  });
  return response;
}

