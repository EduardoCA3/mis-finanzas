export const CATEGORY_COLORS: Record<string, string> = {
  Alimentación: '#eb6b5e',
  Transporte: '#5c76df',
  Servicios: '#8b64d8',
  Compras: '#e5a441',
  Vivienda: '#45a17b',
  Salud: '#dd6898',
  Entretenimiento: '#26a0ab',
  Educación: '#8a765f',
  Ingresos: '#2f7c59',
  Otros: '#98a19c',
};

export const CATEGORIES = Object.keys(CATEGORY_COLORS);

export type TransactionInput = {
  externalId?: string | null;
  source: string;
  type: 'income' | 'expense';
  description: string;
  counterparty?: string | null;
  amountCents: number;
  currency?: string;
  category: string;
  transactionDate: string;
};

export function normalizeMoney(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.round(Math.abs(value) * 100);
  }

  const raw = String(value ?? '')
    .replace(/\s/g, '')
    .replace(/[^\d,.-]/g, '');

  if (!raw) return 0;

  const lastComma = raw.lastIndexOf(',');
  const lastDot = raw.lastIndexOf('.');
  let normalized = raw;

  if (lastComma > lastDot) {
    normalized = raw.replace(/\./g, '').replace(',', '.');
  } else {
    normalized = raw.replace(/,/g, '');
  }

  const number = Number.parseFloat(normalized);
  return Number.isFinite(number) ? Math.round(Math.abs(number) * 100) : 0;
}

export function guessCategory(text: string, type: 'income' | 'expense') {
  if (type === 'income') return 'Ingresos';

  const normalized = text.toLocaleLowerCase('es');
  const rules: Array<[string, string[]]> = [
    ['Alimentación', ['restaurante', 'tambo', 'plaza vea', 'vivanda', 'metro', 'wong', 'rappi', 'pedidosya', 'comida', 'café', 'cafetería']],
    ['Transporte', ['uber', 'cabify', 'taxi', 'metropolitano', 'gasolina', 'grifo', 'pasaje']],
    ['Servicios', ['luz', 'agua', 'internet', 'movistar', 'claro', 'entel', 'netflix', 'spotify', 'suscripción']],
    ['Compras', ['falabella', 'ripley', 'mercado libre', 'amazon', 'tienda']],
    ['Vivienda', ['alquiler', 'mantenimiento', 'hipoteca']],
    ['Salud', ['farmacia', 'inkafarma', 'mifarma', 'clínica', 'doctor']],
    ['Entretenimiento', ['cine', 'teatro', 'entrada', 'juego']],
    ['Educación', ['curso', 'universidad', 'instituto', 'libro']],
  ];

  return rules.find(([, words]) => words.some((word) => normalized.includes(word)))?.[0] ?? 'Otros';
}

export function isValidDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00Z`));
}

export function monthBounds(month: string) {
  const safeMonth = /^\d{4}-\d{2}$/.test(month) ? month : new Date().toISOString().slice(0, 7);
  const [year, monthNumber] = safeMonth.split('-').map(Number);
  const next = monthNumber === 12
    ? `${year + 1}-01-01`
    : `${year}-${String(monthNumber + 1).padStart(2, '0')}-01`;

  return { start: `${safeMonth}-01`, end: next, month: safeMonth };
}

