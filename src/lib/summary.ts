import { formatTzs } from './amounts';
import type { Db, LedgerRecord, Trader } from './types';

/** Local calendar day, YYYY-MM-DD (the phone's time zone: EAT for Tanzania). */
export function dayKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d + n));
}

export function daysBetween(from: string, to: string): number {
  const [y1, m1, d1] = from.split('-').map(Number);
  const [y2, m2, d2] = to.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

/** "0712 345 678", "+255 712...", "712345678" -> "255712345678". Returns null if not a TZ mobile. */
export function normalisePhone(input: string): string | null {
  let d = input.replace(/\D/g, '');
  if (d.startsWith('0') && d.length === 10) d = '255' + d.slice(1);
  else if (d.length === 9 && /^[67]/.test(d)) d = '255' + d;
  if (!/^255[67]\d{8}$/.test(d)) return null;
  return d;
}

export type DayTotals = {
  cashSales: number;
  creditSales: number;
  sales: number; // cash + credit
  expenses: number;
  profit: number; // sales - expenses (rough: no cost of goods unless entered as expense)
  debtsCollected: number;
  recordCount: number;
};

export function totalsFor(records: LedgerRecord[]): DayTotals {
  const sum = (t: LedgerRecord['type']) => records.filter((r) => r.type === t).reduce((a, r) => a + r.amountTzs, 0);
  const cashSales = sum('sale');
  const creditSales = sum('debt_given');
  const expenses = sum('expense');
  return {
    cashSales,
    creditSales,
    sales: cashSales + creditSales,
    expenses,
    profit: cashSales + creditSales - expenses,
    debtsCollected: sum('debt_paid'),
    recordCount: records.length,
  };
}

export type Debtor = { person: string; owed: number };

/** Who owes this trader, as of the end of `upToDay`. Names are matched case-insensitively. */
export function debtorsFor(records: LedgerRecord[], upToDay: string): Debtor[] {
  const map = new Map<string, Debtor>();
  for (const r of records) {
    if (r.day > upToDay || !r.person) continue;
    if (r.type !== 'debt_given' && r.type !== 'debt_paid') continue;
    const key = r.person.trim().toLowerCase();
    const cur = map.get(key) ?? { person: r.person.trim(), owed: 0 };
    cur.owed += r.type === 'debt_given' ? r.amountTzs : -r.amountTzs;
    map.set(key, cur);
  }
  return [...map.values()].filter((d) => d.owed > 0).sort((a, b) => b.owed - a.owed);
}

export function recordsOf(db: Db, traderId: string, day?: string): LedgerRecord[] {
  return db.records.filter((r) => r.traderId === traderId && (day === undefined || r.day === day));
}

function swDate(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return `${d}/${m}/${y}`;
}

/** The evening WhatsApp message, in Swahili. */
export function eveningMessage(trader: Trader, db: Db, day: string): string {
  const today = recordsOf(db, trader.id, day);
  const t = totalsFor(today);
  const debtors = debtorsFor(recordsOf(db, trader.id), day);
  const first = trader.name.split(' ')[0];

  const lines = [`Habari ${first}! Hesabu yako ya leo (${swDate(day)}):`, ''];
  lines.push(`Mauzo: ${formatTzs(t.sales)}`);
  if (t.creditSales > 0) lines.push(`  (kati yake, kwa mkopo: ${formatTzs(t.creditSales)})`);
  lines.push(`Matumizi: ${formatTzs(t.expenses)}`);
  lines.push(`Faida: ${formatTzs(t.profit)}`);
  if (t.debtsCollected > 0) lines.push(`Madeni uliyolipwa leo: ${formatTzs(t.debtsCollected)}`);

  if (debtors.length > 0) {
    const total = debtors.reduce((a, d) => a + d.owed, 0);
    lines.push('', `Wanaodaiwa na wewe (${debtors.length}): ${formatTzs(total)}`);
    for (const d of debtors.slice(0, 5)) lines.push(`- ${d.person}: ${formatTzs(d.owed)}`);
    if (debtors.length > 5) lines.push(`- na wengine ${debtors.length - 5}`);
  }
  lines.push('', 'Kama kuna kosa, nijibu nirekebishe. Daftari');
  return lines.join('\n');
}

export function waLink(phone: string, text: string): string {
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}
