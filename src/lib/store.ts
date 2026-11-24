import type { Db, LedgerRecord } from './types';
import { DEFAULT_MODEL } from './gemini';

// Everything lives in this browser only (localStorage). Nothing is sent to any
// server except the message being parsed, which goes to Gemini.
const DB_KEY = 'daftari.db.v1';
const SETTINGS_KEY = 'daftari.settings.v1';

export const emptyDb = (): Db => ({ version: 1, traders: [], messages: [], records: [], sent: [] });

export type Settings = { apiKey: string; model: string; contact: string };

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function loadDb(): Db {
  const db = read<Db>(DB_KEY);
  return db && db.version === 1 ? { ...emptyDb(), ...db } : emptyDb();
}

/** Returns false if the browser refused to save (storage full or blocked). */
export function saveDb(db: Db): boolean {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
    return true;
  } catch {
    return false;
  }
}

export function loadSettings(): Settings {
  const s = read<Partial<Settings>>(SETTINGS_KEY) ?? {};
  return { apiKey: s.apiKey ?? '', model: s.model || DEFAULT_MODEL, contact: s.contact ?? '' };
}

export function saveSettings(s: Settings): boolean {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
    return true;
  } catch {
    return false;
  }
}

/** Ask the browser not to evict our data under storage pressure. Best effort. */
export async function requestPersistence(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

export const newId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

// ---------- export / import / delete ----------

/** Full backup. The API key is never included. Pass traderId to export one person's data. */
export function exportJson(db: Db, traderId?: string): string {
  const pick = traderId
    ? {
        version: 1 as const,
        traders: db.traders.filter((t) => t.id === traderId),
        messages: db.messages.filter((m) => m.traderId === traderId),
        records: db.records.filter((r) => r.traderId === traderId),
        sent: db.sent.filter((s) => s.traderId === traderId),
      }
    : db;
  return JSON.stringify({ exportedAt: new Date().toISOString(), ...pick }, null, 2);
}

const csvCell = (v: unknown): string => {
  const s = v === null || v === undefined ? '' : String(v);
  // neutralise spreadsheet formulas and quote everything
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

export function exportCsv(db: Db, traderId?: string): string {
  const names = new Map(db.traders.map((t) => [t.id, t.name]));
  const rows: LedgerRecord[] = db.records.filter((r) => !traderId || r.traderId === traderId);
  const header = ['trader', 'day', 'type', 'item', 'quantity', 'amount_tzs', 'person', 'note', 'created_at'];
  const lines = rows
    .sort((a, b) => (a.day + a.createdAt).localeCompare(b.day + b.createdAt))
    .map((r) =>
      [names.get(r.traderId) ?? r.traderId, r.day, r.type, r.item, r.quantity, r.amountTzs, r.person, r.note, r.createdAt]
        .map(csvCell)
        .join(','),
    );
  return [header.join(','), ...lines].join('\n');
}

export function importJson(text: string): Db {
  const data = JSON.parse(text) as Partial<Db>;
  if (data.version !== 1 || !Array.isArray(data.traders) || !Array.isArray(data.records)) {
    throw new Error('This is not a Daftari backup file.');
  }
  return {
    version: 1,
    traders: data.traders,
    messages: Array.isArray(data.messages) ? data.messages : [],
    records: data.records,
    sent: Array.isArray(data.sent) ? data.sent : [],
  };
}

/** Removes one trader and everything about them (their deletion request). */
export function deleteTrader(db: Db, traderId: string): Db {
  return {
    ...db,
    traders: db.traders.filter((t) => t.id !== traderId),
    messages: db.messages.filter((m) => m.traderId !== traderId),
    records: db.records.filter((r) => r.traderId !== traderId),
    sent: db.sent.filter((s) => s.traderId !== traderId),
  };
}

export function download(filename: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
