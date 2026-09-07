import { env } from 'cloudflare:workers';
import { guessCategory, normalizeMoney, type TransactionInput } from '@/lib/finance';

type RuntimeEnv = Cloudflare.Env;

type GmailMessage = {
  id: string;
  snippet?: string;
  internalDate?: string;
  payload?: GmailPart;
};

type GmailPart = {
  mimeType?: string;
  body?: { data?: string };
  headers?: Array<{ name: string; value: string }>;
  parts?: GmailPart[];
};

function runtimeEnv() {
  return env as unknown as RuntimeEnv;
}

export function gmailConfiguration() {
  const values = runtimeEnv();
  return {
    clientId: values.GOOGLE_CLIENT_ID,
    clientSecret: values.GOOGLE_CLIENT_SECRET,
    encryptionKey: values.GMAIL_TOKEN_ENCRYPTION_KEY,
  };
}

export function gmailIsConfigured() {
  const config = gmailConfiguration();
  return Boolean(config.clientId && config.clientSecret && config.encryptionKey);
}

export function gmailAuthorizationUrl(origin: string, state: string) {
  const { clientId } = gmailConfiguration();
  if (!clientId) throw new Error('Falta configurar Google Client ID.');

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${origin}/api/gmail/callback`,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/gmail.readonly',
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function exchangeCode(code: string, origin: string) {
  const { clientId, clientSecret } = gmailConfiguration();
  if (!clientId || !clientSecret) throw new Error('Gmail no está configurado.');

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: `${origin}/api/gmail/callback`,
      grant_type: 'authorization_code',
    }),
  });

  if (!response.ok) throw new Error('Google no pudo completar la conexión.');
  return response.json() as Promise<{ access_token: string; refresh_token?: string; expires_in: number }>;
}

export async function refreshAccessToken(refreshToken: string) {
  const { clientId, clientSecret } = gmailConfiguration();
  if (!clientId || !clientSecret) throw new Error('Gmail no está configurado.');

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) throw new Error('La autorización de Gmail venció. Conecta tu cuenta nuevamente.');
  const body = await response.json() as { access_token: string };
  return body.access_token;
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = atob(padded);
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}

function collectText(part?: GmailPart): string {
  if (!part) return '';
  const ownText = part.body?.data ? decodeBase64Url(part.body.data) : '';
  const childText = part.parts?.map(collectText).join('\n') ?? '';
  return `${ownText}\n${childText}`;
}

function cleanText(value: string) {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function header(message: GmailMessage, name: string) {
  return message.payload?.headers?.find((item) => item.name.toLowerCase() === name.toLowerCase())?.value ?? '';
}

function detectSource(text: string) {
  const value = text.toLowerCase();
  if (value.includes('yape')) return 'Yape';
  if (value.includes('plin')) return 'Plin';
  if (value.includes('bcp') || value.includes('viabcp')) return 'BCP';
  return 'Gmail';
}

function detectType(text: string): 'income' | 'expense' {
  return /recibiste|recibido|abono|depósito|deposito|te transfiri|ingreso|a tu favor/i.test(text)
    ? 'income'
    : 'expense';
}

function findAmount(text: string) {
  const matches = [...text.matchAll(/(?:S\/?\.?|PEN)\s*([0-9]{1,3}(?:[.,][0-9]{3})*(?:[.,][0-9]{2})|[0-9]+(?:[.,][0-9]{2})?)/gi)];
  return matches.map((match) => normalizeMoney(match[1])).find((amount) => amount > 0) ?? 0;
}

function findCounterparty(text: string) {
  const patterns = [
    /(?:yapeaste|pagaste|enviaste|transferiste)(?:\s+(?:a|con))?\s+([^,.]{2,60})/i,
    /(?:recibiste|recibido)(?:\s+(?:de|por))?\s+([^,.]{2,60})/i,
    /(?:comercio|establecimiento|destinatario)\s*:?\s*([^,.]{2,60})/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }

  return null;
}

function isRecognizedFinancialSender(source: string, sender: string) {
  const value = sender.toLowerCase();
  if (source === 'Yape') {
    return value.includes('yape') || value.includes('bcp') || value.includes('viabcp') || value.includes('credicorp');
  }
  if (source === 'BCP') return value.includes('bcp') || value.includes('viabcp') || value.includes('credicorp');
  if (source === 'Plin') {
    return /plin|interbank|bbva|scotiabank|banbif|caja arequipa/i.test(value);
  }
  return false;
}

function isLikelyTransaction(source: string, subject: string, sender: string, text: string) {
  if (/cu[eé]ntanos|experiencia|encuesta|calif[ií]ca|opini[oó]n|promoci[oó]n|publicidad/i.test(subject)) {
    return false;
  }

  if (!isRecognizedFinancialSender(source, sender)) return false;

  const transactionLanguage = /yapeaste|yapeo (?:realizado|recibido)|recibiste (?:un )?yapeo|plin(?:easte| recibido)|realizaste (?:un|una) (?:consumo|pago|compra)|consumo con tu tarjeta|transferencia (?:realizada|recibida)|transferiste|enviaste|dep[oó]sito|retiro|abono|constancia de pago|pago (?:realizado|exitoso)|compra realizada|recarga realizada|operaci[oó]n (?:realizada|exitosa)/i;
  return transactionLanguage.test(text);
}

export function parseGmailTransaction(message: GmailMessage): TransactionInput | null {
  const subject = header(message, 'subject');
  const sender = header(message, 'from');
  const body = cleanText(collectText(message.payload));
  const text = `${subject} ${sender} ${message.snippet ?? ''} ${body}`;
  const source = detectSource(text);

  if (source === 'Gmail') return null;
  if (!isLikelyTransaction(source, subject, sender, text)) return null;
  const amountCents = findAmount(text);
  if (!amountCents) return null;

  const type = detectType(text);
  const counterparty = findCounterparty(text);
  const rawDate = header(message, 'date');
  const date = rawDate ? new Date(rawDate) : new Date(Number(message.internalDate ?? Date.now()));
  const transactionDate = Number.isNaN(date.getTime()) ? new Date().toISOString().slice(0, 10) : date.toISOString().slice(0, 10);
  const description = counterparty || subject || `Movimiento de ${source}`;

  return {
    externalId: `gmail:${message.id}`,
    source,
    type,
    description: description.slice(0, 120),
    counterparty,
    amountCents,
    currency: 'PEN',
    category: guessCategory(text, type),
    transactionDate,
  };
}

export async function fetchFinancialMessages(accessToken: string) {
  const headers = { authorization: `Bearer ${accessToken}` };
  const query = new URLSearchParams({
    q: 'newer_than:120d {Yape Plin BCP viabcp}',
    maxResults: '100',
  });
  const listResponse = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?${query}`, { headers });
  if (!listResponse.ok) throw new Error('No se pudieron leer los mensajes de Gmail.');
  const list = await listResponse.json() as { messages?: Array<{ id: string }> };

  const messages = await Promise.all(
    (list.messages ?? []).map(async ({ id }) => {
      const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`, { headers });
      if (!response.ok) return null;
      return response.json() as Promise<GmailMessage>;
    }),
  );

  return messages.filter((message): message is GmailMessage => Boolean(message));
}
