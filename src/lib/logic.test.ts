import { describe, expect, it, vi } from 'vitest';
import { clarifyQuestion, validateParse } from './validate';
import { ParseError, parseMessage } from './gemini';
import { daysBetween, debtorsFor, eveningMessage, normalisePhone, totalsFor, waLink, addDays } from './summary';
import { scoreTrader, verdict } from './score';
import { deleteTrader, emptyDb, exportCsv, exportJson, importJson } from './store';
import { consentMessage } from './consent';
import type { Db, LedgerRecord, Trader } from './types';

const good = {
  transcript: 'nimeuza viatu 3 elfu 45',
  records: [{ type: 'sale', item: 'viatu', quantity: 3, amount_tzs: 45000, person: null, note: null, confidence: 0.95 }],
  needs_clarification: null,
};

describe('validateParse', () => {
  it('accepts a valid answer', () => {
    const v = validateParse(good);
    expect(v.ok).toBe(true);
  });
  it.each([
    ['bad type', { ...good, records: [{ ...good.records[0], type: 'loan' }] }],
    ['float amount', { ...good, records: [{ ...good.records[0], amount_tzs: 45000.5 }] }],
    ['negative amount', { ...good, records: [{ ...good.records[0], amount_tzs: -1 }] }],
    ['string amount', { ...good, records: [{ ...good.records[0], amount_tzs: '45000' }] }],
    ['confidence > 1', { ...good, records: [{ ...good.records[0], confidence: 2 }] }],
    ['empty item', { ...good, records: [{ ...good.records[0], item: ' ' }] }],
    ['records missing', { transcript: '' }],
    ['not an object', [1, 2]],
  ])('rejects %s', (_name, raw) => {
    expect(validateParse(raw).ok).toBe(false);
  });
});

describe('clarifyQuestion', () => {
  const base = good.records[0] as Parameters<typeof clarifyQuestion>[0];
  it('asks for a missing amount in Swahili', () => {
    expect(clarifyQuestion({ ...base, amount_tzs: 0 })).toBe('Uliuza viatu kwa shilingi ngapi?');
  });
  it('asks who owes for a debt without a name', () => {
    expect(clarifyQuestion({ ...base, type: 'debt_given', person: null })).toBe('Unamdai nani kwa viatu?');
  });
  it('asks to confirm when confidence is low', () => {
    expect(clarifyQuestion({ ...base, confidence: 0.5 })).toMatch(/Ni sawa\?$/);
  });
  it('returns null when the record is clear', () => {
    expect(clarifyQuestion(base)).toBeNull();
  });
});

const geminiReply = (obj: unknown, status = 200) =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }), { status });

describe('parseMessage', () => {
  it('sends the key in a header, not the URL, and returns records', async () => {
    const fetchFn = vi.fn(async () => geminiReply(good));
    const r = await parseMessage({ kind: 'text', text: 'nimeuza viatu 3 elfu 45' }, { apiKey: 'KEY', fetchFn });
    expect(r.records[0].amount_tzs).toBe(45000);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).not.toContain('KEY');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('KEY');
  });
  it('retries once on invalid JSON, then succeeds', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(geminiReply({ records: 'nope' })).mockResolvedValueOnce(geminiReply(good));
    const r = await parseMessage({ kind: 'text', text: 'x' }, { apiKey: 'K', fetchFn });
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(r.records).toHaveLength(1);
  });
  it('gives up after two invalid answers', async () => {
    const fetchFn = vi.fn(async () => geminiReply({ records: 'nope' }));
    await expect(parseMessage({ kind: 'text', text: 'x' }, { apiKey: 'K', fetchFn })).rejects.toBeInstanceOf(ParseError);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
  it('explains a quota error', async () => {
    const fetchFn = vi.fn(async () => new Response('{}', { status: 429 }));
    await expect(parseMessage({ kind: 'text', text: 'x' }, { apiKey: 'K', fetchFn })).rejects.toThrow(/quota/);
  });
  it('refuses to run without a key', async () => {
    await expect(parseMessage({ kind: 'text', text: 'x' }, { apiKey: '' })).rejects.toThrow(/Settings/);
  });
});

const trader: Trader = {
  id: 't1', name: 'Asha Mohamed', phone: '255712345678', sells: 'Nguo', startedOn: '2026-11-01',
  consentAt: '2026-11-01T08:00:00Z', consentVersion: 'v', consentPurpose: 'p',
};
let n = 0;
const rec = (day: string, type: LedgerRecord['type'], amountTzs: number, person: string | null = null, traderId = 't1'): LedgerRecord => ({
  id: `r${n++}`, traderId, messageId: 'm', day, type, item: 'x', quantity: null, amountTzs, person, note: null, createdAt: `${day}T10:00:00Z`,
});

describe('summaries', () => {
  const records = [
    rec('2026-11-03', 'sale', 145000),
    rec('2026-11-03', 'expense', 30000),
    rec('2026-11-02', 'debt_given', 20000, 'Juma'),
    rec('2026-11-03', 'debt_given', 5000, 'Neema'),
    rec('2026-11-03', 'debt_paid', 5000, 'juma'),
    rec('2026-11-04', 'debt_given', 99000, 'Later'),
  ];
  const db: Db = { ...emptyDb(), traders: [trader], records };

  it('totals a day; credit sales count as sales', () => {
    const t = totalsFor(records.filter((r) => r.day === '2026-11-03'));
    expect(t).toMatchObject({ cashSales: 145000, creditSales: 5000, sales: 150000, expenses: 30000, profit: 120000, debtsCollected: 5000 });
  });
  it('nets debts per person, case-insensitively, up to the day', () => {
    expect(debtorsFor(records, '2026-11-03')).toEqual([
      { person: 'Juma', owed: 15000 },
      { person: 'Neema', owed: 5000 },
    ]);
  });
  it('writes the evening message in Swahili', () => {
    const msg = eveningMessage(trader, db, '2026-11-03');
    expect(msg).toContain('Habari Asha!');
    expect(msg).toContain('Mauzo: TSh 150,000');
    expect(msg).toContain('Faida: TSh 120,000');
    expect(msg).toContain('Wanaodaiwa na wewe (2): TSh 20,000');
    expect(msg).not.toContain('Later');
  });
  it('builds a wa.me link with encoded text', () => {
    expect(waLink('255712345678', 'a b')).toBe('https://wa.me/255712345678?text=a%20b');
  });
});

describe('normalisePhone', () => {
  it.each([
    ['0712 345 678', '255712345678'],
    ['+255 754 123 456', '255754123456'],
    ['712345678', '255712345678'],
    ['255687000111', '255687000111'],
  ])('%s', (input, out) => expect(normalisePhone(input)).toBe(out));
  it('rejects non-Tanzanian or short numbers', () => {
    expect(normalisePhone('12345')).toBeNull();
    expect(normalisePhone('+254712345678')).toBeNull();
  });
});

describe('dates', () => {
  it('adds days across month ends', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(daysBetween('2026-11-01', '2026-11-14')).toBe(13);
  });
});

describe('scoreboard', () => {
  const msg = (day: string) => ({ id: day, traderId: 't1', day, at: `${day}T10:00:00Z`, source: 'text' as const, recordCount: 1 });
  it('counts active days and checkpoints', () => {
    const db: Db = { ...emptyDb(), traders: [trader], messages: ['2026-11-01', '2026-11-02', '2026-11-05', '2026-11-13'].map(msg) };
    const s = scoreTrader(db, trader, '2026-11-14');
    expect(s.dayNumber).toBe(14);
    expect(s.activeDays).toBe(4);
    expect(s.perDay[0]).toBe(1);
    expect(s.checkpoints).toEqual({ day5: true, day10: false, day14: true });
    expect(s.stillSending).toBe(true);
  });
  it('marks checkpoints not yet reached as null', () => {
    const db: Db = { ...emptyDb(), traders: [trader], messages: [msg('2026-11-01')] };
    const s = scoreTrader(db, trader, '2026-11-03');
    expect(s.checkpoints).toEqual({ day5: null, day10: null, day14: null });
    expect(verdict([s]).reached14).toBe(0);
  });
});

describe('export, import, delete', () => {
  const other: Trader = { ...trader, id: 't2', name: 'Baraka' };
  const db: Db = {
    ...emptyDb(),
    traders: [trader, other],
    records: [rec('2026-11-03', 'sale', 1000), rec('2026-11-03', 'sale', 2000, null, 't2')],
  };
  it('exports one trader only', () => {
    const one = JSON.parse(exportJson(db, 't1'));
    expect(one.traders).toHaveLength(1);
    expect(one.records).toHaveLength(1);
    expect(JSON.stringify(one)).not.toContain('Baraka');
  });
  it('round-trips a full backup', () => {
    expect(importJson(exportJson(db)).records).toHaveLength(2);
  });
  it('rejects a file that is not a backup', () => {
    expect(() => importJson('{"hello":1}')).toThrow();
  });
  it('neutralises spreadsheet formulas in CSV', () => {
    const evil: Db = { ...db, records: [{ ...db.records[0], item: '=HYPERLINK("x")' }] };
    expect(exportCsv(evil)).toContain(`"'=HYPERLINK(""x"")"`);
  });
  it('deletes a trader and all their data, leaving others', () => {
    const after = deleteTrader(db, 't1');
    expect(after.traders.map((t) => t.id)).toEqual(['t2']);
    expect(after.records.every((r) => r.traderId === 't2')).toBe(true);
  });
});

describe('consent message', () => {
  it('names the AI provider, the right to delete, and asks for NAKUBALI', () => {
    const m = consentMessage('Asha Mohamed', 'data@example.com');
    expect(m).toContain('Google (Gemini)');
    expect(m).toContain('nizifute');
    expect(m).toContain('data@example.com');
    expect(m.trim().endsWith('NAKUBALI')).toBe(true);
  });
});
