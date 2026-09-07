'use client';

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';

type Transaction = {
  id: number;
  externalId?: string | null;
  source: string;
  type: 'income' | 'expense';
  description: string;
  amountCents: number;
  category: string;
  transactionDate: string;
};

type DashboardData = {
  month: string;
  totals: {
    incomeCents: number;
    expenseCents: number;
    balanceCents: number;
    savingsRate: number;
  };
  weekly: number[];
  categories: Array<{ name: string; amountCents: number; percent: number; color: string }>;
  transactions: Transaction[];
  gmailConnected: boolean;
  gmailConfigured: boolean;
};

const CATEGORIES = ['Alimentación', 'Transporte', 'Servicios', 'Compras', 'Vivienda', 'Salud', 'Entretenimiento', 'Educación', 'Ingresos', 'Otros'];
const SOURCE_TONES: Record<string, string> = { Yape: 'coral', Plin: 'blue', BCP: 'mint', manual: 'violet', CSV: 'gold' };
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function currency(cents: number) {
  return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(cents / 100);
}

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function formatMonth(value: string) {
  const [year, month] = value.split('-').map(Number);
  return `${MONTHS[month - 1]} ${year}`;
}

function parseCsvLine(line: string, delimiter: string) {
  const values: string[] = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"' && line[index + 1] === '"') {
      value += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === delimiter && !quoted) {
      values.push(value.trim());
      value = '';
    } else {
      value += character;
    }
  }
  values.push(value.trim());
  return values;
}

function normalizeDate(value: string) {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  return match ? `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}` : '';
}

export default function DashboardClient() {
  const [month, setMonth] = useState(currentMonth);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const autoSyncAttempted = useRef(false);

  const loadDashboard = useCallback(async (selectedMonth: string) => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/dashboard?month=${selectedMonth}`, { cache: 'no-store' });
      const payload = await response.json() as DashboardData & { error?: string };
      if (!response.ok) throw new Error(payload.error || 'No se pudo cargar el dashboard.');
      setData(payload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No se pudo cargar el dashboard.');
    } finally {
      setLoading(false);
    }
  }, []);

  const syncGmail = useCallback(async (quiet = false) => {
    setSyncing(true);
    if (!quiet) setNotice('');
    try {
      const response = await fetch('/api/gmail/sync', { method: 'POST' });
      const payload = await response.json() as { imported?: number; scanned?: number; error?: string };
      if (!response.ok) throw new Error(payload.error || 'No se pudo sincronizar Gmail.');
      if (!quiet) setNotice(`Gmail revisado: ${payload.imported ?? 0} movimientos nuevos.`);
      await loadDashboard(month);
    } catch (syncError) {
      if (!quiet) setError(syncError instanceof Error ? syncError.message : 'No se pudo sincronizar Gmail.');
    } finally {
      setSyncing(false);
    }
  }, [loadDashboard, month]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadDashboard(month), 0);
    return () => window.clearTimeout(timer);
  }, [loadDashboard, month]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const gmail = params.get('gmail');
      if (gmail === 'connected') {
        setNotice('Gmail quedó conectado. Estamos buscando tus movimientos.');
        window.history.replaceState({}, '', '/');
        void syncGmail(true);
      } else if (gmail === 'setup-required') {
        setError('Falta agregar las credenciales privadas de Google para activar Gmail.');
        window.history.replaceState({}, '', '/');
      } else if (gmail === 'error' || gmail === 'invalid-state') {
        setError('No pudimos completar la conexión con Gmail. Inténtalo nuevamente.');
        window.history.replaceState({}, '', '/');
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [syncGmail]);

  useEffect(() => {
    if (data?.gmailConnected && !autoSyncAttempted.current) {
      autoSyncAttempted.current = true;
      const timer = window.setTimeout(() => void syncGmail(true), 0);
      return () => window.clearTimeout(timer);
    }
  }, [data?.gmailConnected, syncGmail]);

  const maxWeek = useMemo(() => Math.max(...(data?.weekly ?? [0]), 1), [data?.weekly]);

  async function addTransaction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: form.get('type'),
          description: form.get('description'),
          amount: form.get('amount'),
          category: form.get('category'),
          transactionDate: form.get('transactionDate'),
        }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || 'No se pudo guardar.');
      setModalOpen(false);
      setNotice('Movimiento guardado.');
      await loadDashboard(month);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteTransaction(id: number) {
    const transaction = data?.transactions.find((item) => item.id === id);
    const importedFromGmail = transaction?.externalId?.startsWith('gmail:');
    const question = importedFromGmail
      ? '¿Eliminar este movimiento? También se ignorará en futuras sincronizaciones de Gmail.'
      : '¿Eliminar este movimiento?';
    if (!window.confirm(question)) return;
    const response = await fetch(`/api/transactions?id=${id}`, { method: 'DELETE' });
    if (response.ok) {
      const payload = await response.json() as { ignored?: boolean };
      setNotice(payload.ignored
        ? 'Movimiento eliminado. No volverá a importarse desde Gmail.'
        : 'Movimiento eliminado.');
      await loadDashboard(month);
    } else {
      setError('No se pudo eliminar el movimiento.');
    }
  }

  async function importCsv(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter(Boolean);
      const delimiter = (lines[0]?.match(/;/g)?.length ?? 0) > (lines[0]?.match(/,/g)?.length ?? 0) ? ';' : ',';
      const headers = parseCsvLine(lines[0] ?? '', delimiter).map((header) => header.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
      const find = (...names: string[]) => headers.findIndex((header) => names.includes(header));
      const dateIndex = find('fecha', 'date', 'transactiondate');
      const descriptionIndex = find('descripcion', 'description', 'detalle', 'concepto');
      const amountIndex = find('monto', 'amount', 'importe');
      const typeIndex = find('tipo', 'type');
      const categoryIndex = find('categoria', 'category');
      const sourceIndex = find('fuente', 'source', 'origen');

      if ([dateIndex, descriptionIndex, amountIndex].some((index) => index < 0)) {
        throw new Error('El CSV necesita columnas de fecha, descripción y monto.');
      }

      const transactions = lines.slice(1).map((line) => {
        const values = parseCsvLine(line, delimiter);
        const rawAmount = values[amountIndex] ?? '';
        const rawType = (values[typeIndex] ?? '').toLowerCase();
        return {
          transactionDate: normalizeDate(values[dateIndex] ?? ''),
          description: values[descriptionIndex],
          amount: rawAmount,
          type: rawType.includes('ingreso') || rawType === 'income' || rawAmount.trim().startsWith('+') ? 'income' : 'expense',
          category: values[categoryIndex] || 'Otros',
          source: values[sourceIndex] || 'CSV',
        };
      });

      const response = await fetch('/api/transactions/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ transactions }),
      });
      const payload = await response.json() as { imported?: number; error?: string };
      if (!response.ok) throw new Error(payload.error || 'No se pudo importar.');
      setNotice(`${payload.imported} movimientos importados.`);
      await loadDashboard(month);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'No se pudo importar el archivo.');
    }
  }

  const transactions = data?.transactions ?? [];
  const categories = data?.categories ?? [];
  const weekly = data?.weekly ?? [0, 0, 0, 0, 0];
  const totals = data?.totals ?? { incomeCents: 0, expenseCents: 0, balanceCents: 0, savingsRate: 0 };

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">M</span><span>Mis Finanzas</span></div>
        <nav aria-label="Navegación principal">
          <a className="nav-item active" href="#resumen"><span>⌂</span> Resumen</a>
          <a className="nav-item" href="#movimientos"><span>↕</span> Movimientos</a>
          <a className="nav-item" href="#categorias"><span>◫</span> Categorías</a>
          <button className="nav-item" onClick={() => fileInput.current?.click()}><span>⇧</span> Importar CSV</button>
        </nav>
        <div className="sidebar-bottom">
          <div className="privacy-note"><span>●</span><div><strong>Todo está protegido</strong><small>Solo tu cuenta puede entrar</small></div></div>
          <button className="nav-item button-reset" onClick={() => window.location.assign('/api/gmail/connect')}><span>✉</span> Configurar Gmail</button>
        </div>
      </aside>

      <section className="content" id="resumen">
        <header className="topbar">
          <div>
            <p className="eyebrow">TU RESUMEN PERSONAL</p>
            <h1>Hola, Eduardo</h1>
            <p className="subtitle">Así van tus finanzas en {formatMonth(month)}.</p>
          </div>
          <div className="top-actions">
            <label className="month-picker">Mes <input aria-label="Seleccionar mes" type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></label>
            <button className={`gmail-button ${data?.gmailConnected ? 'connected' : ''}`} onClick={() => data?.gmailConnected ? void syncGmail(false) : window.location.assign('/api/gmail/connect')} disabled={syncing}>
              <span>{data?.gmailConnected ? '●' : 'G'}</span>
              {syncing ? 'Sincronizando…' : data?.gmailConnected ? 'Gmail conectado' : 'Conectar Gmail'}
            </button>
            <button className="avatar" aria-label="Perfil privado">EC</button>
          </div>
        </header>

        {(notice || error) && (
          <div className={`notice ${error ? 'error' : ''}`} role="status">
            <span>{error ? '!' : '✓'}</span><p>{error || notice}</p>
            <button onClick={() => { setError(''); setNotice(''); }} aria-label="Cerrar aviso">×</button>
          </div>
        )}

        <div className={`dashboard-body ${loading ? 'is-loading' : ''}`}>
          <div className="summary-grid">
            <article className="summary-card balance-card">
              <div className="card-heading"><span>Balance del mes</span><span className="trend">{totals.balanceCents >= 0 ? 'En positivo' : 'Atención'}</span></div>
              <strong>{currency(totals.balanceCents)}</strong><p>Ingresos menos gastos registrados</p>
              <div className="soft-orb one"/><div className="soft-orb two"/>
            </article>
            <article className="summary-card">
              <div className="card-heading"><span>Ingresos</span><span className="mini-icon green">↓</span></div>
              <strong>{currency(totals.incomeCents)}</strong><p>Entradas durante el mes</p>
            </article>
            <article className="summary-card">
              <div className="card-heading"><span>Gastos</span><span className="mini-icon coral">↑</span></div>
              <strong>{currency(totals.expenseCents)}</strong><p>{totals.incomeCents ? Math.round((totals.expenseCents / totals.incomeCents) * 100) : 0}% de tus ingresos</p>
            </article>
            <article className="summary-card">
              <div className="card-heading"><span>Tasa de ahorro</span><span className="mini-icon blue">◇</span></div>
              <strong>{totals.savingsRate}%</strong><p>Lo que queda de tus ingresos</p>
            </article>
          </div>

          <div className="dashboard-grid">
            <article className="panel spending-panel">
              <div className="panel-title"><div><h2>Gastos por semana</h2><p>Tu ritmo de consumo este mes</p></div><button className="ghost-button" onClick={() => setModalOpen(true)}>Agregar</button></div>
              <div className="chart-wrap" aria-label="Gráfico de gastos por semana">
                <div className="y-axis"><span>{currency(maxWeek)}</span><span>{currency(maxWeek / 2)}</span><span>S/ 0</span></div>
                <div className="bars">
                  {weekly.map((amount, index) => (
                    <div className="bar-column" key={index}>
                      <div className={`bar ${amount === maxWeek && amount > 0 ? 'current' : ''}`} style={{height: `${Math.max(amount ? 10 : 2, (amount / maxWeek) * 88)}%`}}><span>{amount > 0 ? currency(amount) : ''}</span></div>
                      <small>Sem {index + 1}</small>
                    </div>
                  ))}
                </div>
              </div>
            </article>

            <article className="panel categories-panel" id="categorias">
              <div className="panel-title"><div><h2>Por categoría</h2><p>Dónde se fue tu dinero</p></div><span className="item-count">{categories.length}</span></div>
              {categories.length ? (
                <div className="category-list">
                  {categories.slice(0, 6).map((category) => (
                    <div className="category-row" key={category.name}>
                      <div className="category-meta"><span>{category.name}</span><strong>{currency(category.amountCents)}</strong></div>
                      <div className="progress"><span style={{width: `${category.percent}%`, background: category.color}}/></div>
                    </div>
                  ))}
                </div>
              ) : <div className="empty-mini"><span>◌</span><p>Aún no hay gastos en este mes.</p></div>}
            </article>
          </div>

          <article className="panel movements-panel" id="movimientos">
            <div className="panel-title">
              <div><h2>Últimos movimientos</h2><p>{data?.gmailConnected ? 'Gmail se revisa al abrir la app' : 'Agrega movimientos o conecta Gmail'}</p></div>
              <div className="panel-actions">
                <button className="ghost-button" onClick={() => fileInput.current?.click()}>Importar CSV</button>
                <button className="primary-button" onClick={() => setModalOpen(true)}>+ Agregar movimiento</button>
              </div>
            </div>
            {transactions.length ? (
              <div className="transactions">
                {transactions.map((transaction) => (
                  <div className="transaction" key={transaction.id}>
                    <span className={`transaction-icon ${SOURCE_TONES[transaction.source] ?? 'gold'}`}>{transaction.source.slice(0, 1).toUpperCase()}</span>
                    <div className="transaction-copy"><strong>{transaction.description}</strong><small>{transaction.category} · {transaction.source}</small></div>
                    <strong className={transaction.type === 'income' ? 'income' : ''}>{transaction.type === 'income' ? '+' : '-'} {currency(transaction.amountCents)}</strong>
                    <small>{new Date(`${transaction.transactionDate}T12:00:00`).toLocaleDateString('es-PE', { day: '2-digit', month: 'short' })}</small>
                    <button className="delete-button" onClick={() => void deleteTransaction(transaction.id)} aria-label={`Eliminar ${transaction.description}`}>×</button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <span className="empty-icon">↕</span><h3>Tu mes empieza aquí</h3>
                <p>Agrega tu primer movimiento, importa un CSV o conecta Gmail para que aparezcan automáticamente.</p>
                <button className="primary-button" onClick={() => setModalOpen(true)}>Agregar primer movimiento</button>
              </div>
            )}
          </article>
        </div>
      </section>

      <input ref={fileInput} className="visually-hidden" type="file" accept=".csv,text/csv" onChange={(event) => void importCsv(event)} />

      {modalOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setModalOpen(false)}>
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
            <div className="modal-header"><div><p className="eyebrow">REGISTRO MANUAL</p><h2 id="modal-title">Nuevo movimiento</h2></div><button onClick={() => setModalOpen(false)} aria-label="Cerrar">×</button></div>
            <form onSubmit={(event) => void addTransaction(event)}>
              <label>Tipo<select name="type" defaultValue="expense"><option value="expense">Gasto</option><option value="income">Ingreso</option></select></label>
              <label>Descripción<input name="description" required maxLength={120} placeholder="Ej. Almuerzo en Tambo" autoFocus /></label>
              <div className="form-row">
                <label>Monto (S/)<input name="amount" required inputMode="decimal" placeholder="0.00" /></label>
                <label>Fecha<input name="transactionDate" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} /></label>
              </div>
              <label>Categoría<select name="category" defaultValue="Otros">{CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></label>
              <div className="modal-actions"><button type="button" className="ghost-button" onClick={() => setModalOpen(false)}>Cancelar</button><button className="primary-button" disabled={saving}>{saving ? 'Guardando…' : 'Guardar movimiento'}</button></div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
