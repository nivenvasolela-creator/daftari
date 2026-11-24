import { describe, expect, it } from 'vitest';
import { amountAppearsIn, extractAmounts, formatTzs } from './amounts';

const v = (text: string) => extractAmounts(text).map((a) => a.value);

// Real-style seller messages -> amounts that must be found (in order).
const CASES: Array<[string, number[]]> = [
  ['nimeuza viatu 3 elfu 45', [45_000]],
  ['nimelipa kodi 200k', [200_000]],
  ['Juma ninamdai 20,000', [20_000]],
  ['nimeuza shati 2 elfu 30 na nimelipa usafiri 3000', [30_000, 3_000]],
  ['mzigo laki 2', [200_000]],
  ['nimenunua mzigo laki 2 na nusu', [250_000]],
  ['nauli buku 5', [5_000]],
  ['nimelipa buku mbili ya chai', [2_000]],
  ['vocha jero', [500]],
  ['umeme 15,500', [15_500]],
  ['nimeuza kwa 45k', [45_000]],
  ['sold 2 dresses 60k', [60_000]],
  ['paid rent 150,000/=', [150_000]],
  ['tsh 3,000 maji', [3_000]],
  ['nimeuza simu milioni 1.5', [1_500_000]],
  ['nimeuza tv 1.5m', [1_500_000]],
  ['elfu kumi na tano', [15_000]],
  ['nimeuza chapati 10 kwa elfu 2 na mia 5', [2_500]],
  ['mia tano ya mkaa', [500]],
  ['laki moja na elfu 20', [120_000]],
  ['nimelipa mshahara elfu mia tano', [500_000]],
  ['200.000 kodi ya duka', [200_000]],
  ['sold shoes 45 thousand', [45_000]],
  ['Neema amechukua vitenge 2 kwa mkopo elfu ishirini', [20_000]],
  ['nimeuza vipodozi 3,500 na sabuni 1500', [3_500, 1_500]],
  ['3000tsh usafiri', [3_000]],
  ['nimeuza elfu 45 cash', [45_000]],
  ['Juma amelipa deni lake 10k', [10_000]],
];

describe('extractAmounts', () => {
  it.each(CASES)('%s', (text, expected) => {
    expect(v(text)).toEqual(expected);
  });

  it('treats small bare numbers as quantities, not money', () => {
    expect(v('nimeuza viatu 3')).toEqual([]);
    expect(v('mteja amechukua shati 2')).toEqual([]);
  });

  it('ignores phone numbers', () => {
    expect(v('mpigie 0712345678 amenidai 5000')).toEqual([5_000]);
  });

  it('returns nothing when there is no amount', () => {
    expect(v('leo sijauza kitu')).toEqual([]);
  });
});

describe('amountAppearsIn', () => {
  it('accepts an amount written in the text', () => {
    expect(amountAppearsIn(45_000, 'nimeuza viatu 3 elfu 45')).toBe(true);
  });
  it('accepts unit price x quantity', () => {
    expect(amountAppearsIn(45_000, 'nimeuza viatu 3 kila kimoja elfu 15')).toBe(true);
  });
  it('rejects an amount that is not in the text', () => {
    expect(amountAppearsIn(4_500, 'nimeuza viatu 3 elfu 45')).toBe(false);
  });
});

describe('formatTzs', () => {
  it('adds thousands separators', () => {
    expect(formatTzs(1500000)).toBe('TSh 1,500,000');
  });
});
