// Deterministic reader for money amounts in Swahili / English / Sheng text.
// Used to double-check the AI: if the AI returns an amount that does not appear
// in the seller's text, the confirm card is flagged for a human check.
//
// Handles: "elfu 45", "45k", "laki 2", "laki 2 na nusu", "200,000", "200.000",
// "buku 5", "buku mbili", "jero", "mia tano", "elfu kumi na tano",
// "elfu 2 na mia 5", "milioni 1.5", "1.5m", "3,000/=", "tsh 15,500", "45 thousand".
//
// Bare numbers below 100 with no money word are treated as quantities
// ("viatu 3"), not money. Phone-number-like digit strings are ignored.

const UNITS: Record<string, number> = {
  sifuri: 0, moja: 1, mbili: 2, tatu: 3, nne: 4, tano: 5, sita: 6, saba: 7, nane: 8, tisa: 9,
  // noun-class forms used with "mabuku", "maelfu" etc.
  mawili: 2, matatu: 3, manne: 4, matano: 5,
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
};

const TENS: Record<string, number> = {
  kumi: 10, ishirini: 20, thelathini: 30, arobaini: 40, hamsini: 50,
  sitini: 60, sabini: 70, themanini: 80, tisini: 90,
  ten: 10, twenty: 20, thirty: 30, forty: 40, fifty: 50,
};

// Swahili-style multipliers come BEFORE the count: "elfu 45" = 45,000.
const PREFIX_MULT: Record<string, number> = {
  mia: 100,
  elfu: 1_000,
  buku: 1_000, // slang
  mabuku: 1_000,
  laki: 100_000,
  milioni: 1_000_000,
  mil: 1_000_000,
};

// English-style multipliers come AFTER the count: "45 thousand", "2 million".
const POSTFIX_MULT: Record<string, number> = {
  thousand: 1_000,
  k: 1_000,
  million: 1_000_000,
};

const FIXED: Record<string, number> = {
  jero: 500, // slang for 500
};

const CURRENCY_WORDS = new Set(['tsh', 'tshs', 'tzs', 'sh', 'shs', 'shilingi', 'shillings', 'bob', 'mark']);

export type FoundAmount = { value: number; currency: boolean };

type Tok = string;

function normalise(text: string): Tok[] {
  let t = text.toLowerCase();
  // thousands separators: 1,500,000 / 1.500.000 -> 1500000 (but keep 1.5)
  let prev = '';
  while (prev !== t) {
    prev = t;
    t = t.replace(/(\d)[,.](\d{3})(?!\d)/g, '$1$2');
  }
  // "/=" and "/-" after a number mean shillings
  t = t.replace(/\/[=-]/g, ' mark ');
  // split currency glued to digits: "tsh3000", "3000tsh"
  t = t.replace(/\b(tshs|tsh|tzs|shs|sh)(\d)/g, '$1 $2');
  t = t.replace(/(\d)(tshs|tsh|tzs|shs|sh)\b/g, '$1 $2');
  const toks = t.match(/\d+(?:\.\d+)?(?:k|m|mil)?(?![a-z0-9])|[a-z]+/g);
  return toks ?? [];
}

function digitValue(tok: Tok): { value: number; suffixMult: number } | null {
  const m = tok.match(/^(\d+(?:\.\d+)?)(k|m|mil)?$/);
  if (!m) return null;
  // ignore phone numbers / IDs: leading zero and long
  if (/^0\d{8,}$/.test(m[1])) return null;
  const suffixMult = m[2] === 'k' ? 1_000 : m[2] ? 1_000_000 : 1;
  return { value: parseFloat(m[1]), suffixMult };
}

// Parses a count below 1000: "45", "1.5", "kumi na tano", "mia tano", "ishirini".
// Returns null if nothing numeric at i.
function parseCount(toks: Tok[], i: number): { value: number; next: number } | null {
  const tok = toks[i];
  if (tok === undefined) return null;

  const d = digitValue(tok);
  if (d && d.suffixMult === 1) return { value: d.value, next: i + 1 };

  if (tok === 'mia') {
    const u = parseCount(toks, i + 1);
    let value = (u ? u.value : 1) * 100;
    let next = u ? u.next : i + 1;
    // "mia tano na hamsini"
    if (toks[next] === 'na' && (TENS[toks[next + 1]] !== undefined || UNITS[toks[next + 1]] !== undefined)) {
      const rest = parseCount(toks, next + 1);
      if (rest) { value += rest.value; next = rest.next; }
    }
    return { value, next };
  }

  if (TENS[tok] !== undefined) {
    let value = TENS[tok];
    let next = i + 1;
    if (toks[next] === 'na' && UNITS[toks[next + 1]] !== undefined) {
      value += UNITS[toks[next + 1]];
      next += 2;
    }
    return { value, next };
  }

  if (UNITS[tok] !== undefined) return { value: UNITS[tok], next: i + 1 };
  return null;
}

// Starting at a prefix multiplier, parse "elfu 2 na mia 5", "laki 2 na nusu",
// "laki moja na elfu 20" etc.
function parsePrefixChain(toks: Tok[], i: number): { value: number; next: number } | null {
  let total = 0;
  let pos = i;
  let matched = false;
  for (;;) {
    const mult = PREFIX_MULT[toks[pos]];
    if (mult === undefined) break;
    matched = true;
    const c = parseCount(toks, pos + 1);
    let count = c ? c.value : 1;
    pos = c ? c.next : pos + 1;
    if (toks[pos] === 'na' && toks[pos + 1] === 'nusu') {
      count += 0.5;
      pos += 2;
    }
    total += count * mult;
    // continue only on "na <multiplier>" or "na <number word>" (e.g. "elfu 2 na mia 5")
    if (toks[pos] === 'na' && PREFIX_MULT[toks[pos + 1]] !== undefined) {
      pos += 1;
      continue;
    }
    break;
  }
  return matched ? { value: total, next: pos } : null;
}

export function extractAmounts(text: string): FoundAmount[] {
  const toks = normalise(text);
  const out: FoundAmount[] = [];
  let i = 0;
  while (i < toks.length) {
    const tok = toks[i];
    const currencyBefore = i > 0 && CURRENCY_WORDS.has(toks[i - 1]);

    if (FIXED[tok] !== undefined) {
      out.push({ value: FIXED[tok], currency: true });
      i += 1;
      continue;
    }

    if (PREFIX_MULT[tok] !== undefined) {
      // "mia" alone in normal text can be ambiguous, but "mia tano" is 500: money.
      const r = parsePrefixChain(toks, i);
      if (r) {
        out.push({ value: Math.round(r.value), currency: true });
        i = r.next;
        continue;
      }
    }

    const d = digitValue(tok);
    if (d) {
      let value = d.value * d.suffixMult;
      let next = i + 1;
      let isMoney = d.suffixMult > 1 || currencyBefore;
      const post = POSTFIX_MULT[toks[next]];
      if (d.suffixMult === 1 && post !== undefined) {
        value *= post;
        next += 1;
        isMoney = true;
      }
      if (CURRENCY_WORDS.has(toks[next])) {
        isMoney = true;
      }
      if (value >= 100) isMoney = true;
      if (isMoney) out.push({ value: Math.round(value), currency: true });
      i = next;
      continue;
    }
    i += 1;
  }
  return out;
}

/** True if `amount` is one of the amounts written in `text`, or a sum/product a
 *  human would reasonably write (e.g. "viatu 3 kila kimoja elfu 15" = 45,000). */
export function amountAppearsIn(amount: number, text: string): boolean {
  const found = extractAmounts(text).map((a) => a.value);
  if (found.includes(amount)) return true;
  // unit price x small quantity
  const qty = normalise(text)
    .map((t) => digitValue(t)?.value ?? UNITS[t])
    .filter((n): n is number => n !== undefined && n > 0 && n < 100);
  return found.some((f) => qty.some((q) => f * q === amount));
}

export function formatTzs(n: number): string {
  return 'TSh ' + Math.round(n).toLocaleString('en-US');
}
