// Live test of the AI parser against Gemini. Costs free-tier quota (~30 calls).
// Run:  GEMINI_API_KEY=... npm run eval        (optional: GEMINI_MODEL=...)
// Prints a pass rate; the suite fails if fewer than 90% pass.
import { afterAll, describe, expect, it } from 'vitest';
import { parseMessage } from '../src/lib/gemini';
import type { RecordType } from '../src/lib/types';

type Exp = { type: RecordType; amount: number; person?: string };
type Case = { text: string; expect: Exp[]; clarify?: boolean };

const CASES: Case[] = [
  { text: 'nimeuza viatu 3 elfu 45', expect: [{ type: 'sale', amount: 45000 }] },
  { text: 'nimelipa kodi 200k', expect: [{ type: 'expense', amount: 200000 }] },
  { text: 'ninamdai Juma 20,000', expect: [{ type: 'debt_given', amount: 20000, person: 'Juma' }] },
  { text: 'nimeuza shati 2 elfu 30 na nimelipa usafiri 3000', expect: [{ type: 'sale', amount: 30000 }, { type: 'expense', amount: 3000 }] },
  { text: 'nimenunua mzigo laki 2', expect: [{ type: 'expense', amount: 200000 }] },
  { text: 'mzigo wa vitenge laki 2 na nusu', expect: [{ type: 'expense', amount: 250000 }] },
  { text: 'nauli ya bodaboda buku 5', expect: [{ type: 'expense', amount: 5000 }] },
  { text: 'chai na maandazi buku mbili', expect: [{ type: 'expense', amount: 2000 }] },
  { text: 'vocha jero', expect: [{ type: 'expense', amount: 500 }] },
  { text: 'nimelipa umeme 15,500', expect: [{ type: 'expense', amount: 15500 }] },
  { text: 'sold 2 dresses 60k', expect: [{ type: 'sale', amount: 60000 }] },
  { text: 'paid shop rent 150,000/=', expect: [{ type: 'expense', amount: 150000 }] },
  { text: 'nimeuza simu milioni 1.5', expect: [{ type: 'sale', amount: 1500000 }] },
  { text: 'nimeuza chapati 10 kwa elfu 2 na mia 5', expect: [{ type: 'sale', amount: 2500 }] },
  { text: 'Neema amechukua vitenge 2 kwa mkopo elfu ishirini', expect: [{ type: 'debt_given', amount: 20000, person: 'Neema' }] },
  { text: 'Juma amelipa deni lake 10k', expect: [{ type: 'debt_paid', amount: 10000, person: 'Juma' }] },
  { text: 'mama Rehema amerudisha elfu 5 ya deni', expect: [{ type: 'debt_paid', amount: 5000, person: 'Rehema' }] },
  { text: 'nimeuza viatu 3 kila kimoja elfu 15', expect: [{ type: 'sale', amount: 45000 }] },
  { text: 'leo nimeuza vipodozi 3,500 na sabuni 1500', expect: [{ type: 'sale', amount: 3500 }, { type: 'sale', amount: 1500 }] },
  { text: 'nimelipa mshahara wa dada wa duka elfu mia moja', expect: [{ type: 'expense', amount: 100000 }] },
  { text: 'mteja amenunua earphones 25k cash', expect: [{ type: 'sale', amount: 25000 }] },
  { text: 'delivery boda 4k kwa order ya Kinondoni', expect: [{ type: 'expense', amount: 4000 }] },
  { text: 'nimeuza mchele kilo 5 elfu 15 na mafuta lita 2 elfu 12', expect: [{ type: 'sale', amount: 15000 }, { type: 'sale', amount: 12000 }] },
  { text: 'Baraka atalipa kesho, amechukua kiatu cha 35k', expect: [{ type: 'debt_given', amount: 35000, person: 'Baraka' }] },
  { text: 'nimelipa kodi ya meza sokoni 2000 na usafi 500', expect: [{ type: 'expense', amount: 2000 }, { type: 'expense', amount: 500 }] },
  { text: 'IG order: dress 1, 45k, paid via M-Pesa', expect: [{ type: 'sale', amount: 45000 }] },
  { text: 'nimeuza mandazi', expect: [], clarify: true }, // no amount: must ask, not guess
  { text: 'habari za asubuhi', expect: [] },
  { text: 'Juma ananidai 20,000', expect: [], clarify: true }, // seller owes Juma: not tracked, must ask
  { text: 'nimenunua vocha 1000, nimeuza juice 6 kwa 6000, Ali bado anadaiwa 3000', expect: [{ type: 'expense', amount: 1000 }, { type: 'sale', amount: 6000 }, { type: 'debt_given', amount: 3000, person: 'Ali' }] },
];

const key = process.env.GEMINI_API_KEY ?? '';
const results: { text: string; pass: boolean; why: string }[] = [];

function check(c: Case, got: Awaited<ReturnType<typeof parseMessage>>): string | null {
  const real = got.records.filter((r) => r.amount_tzs > 0);
  if (c.expect.length === 0) {
    if (real.length > 0) return `expected no records, got ${JSON.stringify(real)}`;
    if (c.clarify && !got.needs_clarification && got.records.length === 0) return 'expected a clarifying question';
    return null;
  }
  if (real.length !== c.expect.length) return `expected ${c.expect.length} records, got ${JSON.stringify(got.records)}`;
  for (const e of c.expect) {
    const hit = real.find(
      (r) => r.type === e.type && r.amount_tzs === e.amount && (!e.person || (r.person ?? '').toLowerCase().includes(e.person.toLowerCase())),
    );
    if (!hit) return `missing ${JSON.stringify(e)} in ${JSON.stringify(got.records)}`;
  }
  return null;
}

describe.skipIf(!key)('Gemini parsing (live)', () => {
  for (const c of CASES) {
    it(c.text, { timeout: 60_000 }, async () => {
      let why: string | null;
      try {
        const got = await parseMessage({ kind: 'text', text: c.text }, { apiKey: key, model: process.env.GEMINI_MODEL });
        why = check(c, got);
      } catch (e) {
        why = `error: ${(e as Error).message}`;
      }
      results.push({ text: c.text, pass: why === null, why: why ?? '' });
      // individual cases don't fail the run; the 90% bar below does
    });
  }

  afterAll(() => {
    const passed = results.filter((r) => r.pass).length;
    const rate = passed / Math.max(results.length, 1);
    console.log(`\nPARSE PASS RATE: ${passed}/${results.length} (${Math.round(rate * 100)}%)`);
    for (const r of results.filter((x) => !x.pass)) console.log(`FAIL  "${r.text}"  -> ${r.why}`);
    expect(rate).toBeGreaterThanOrEqual(0.9);
  });
});

describe.runIf(!key)('Gemini parsing (live)', () => {
  it.skip('skipped: set GEMINI_API_KEY to run the live parsing test', () => {});
});
