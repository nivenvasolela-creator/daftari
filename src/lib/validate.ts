import { RECORD_TYPES, type ParseResult, type ParsedRecord, type RecordType } from './types';

export type Validation = { ok: true; value: ParseResult } | { ok: false; error: string };

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const optStr = (x: unknown): string | null => (typeof x === 'string' && x.trim() !== '' ? x.trim() : null);

/** Strictly checks the AI's JSON. Anything off is an error so the caller can retry once. */
export function validateParse(raw: unknown): Validation {
  if (!isObj(raw)) return { ok: false, error: 'top level is not an object' };
  if (!Array.isArray(raw.records)) return { ok: false, error: '"records" must be an array' };

  const records: ParsedRecord[] = [];
  for (const [i, r] of raw.records.entries()) {
    if (!isObj(r)) return { ok: false, error: `records[${i}] is not an object` };
    if (!RECORD_TYPES.includes(r.type as RecordType)) {
      return { ok: false, error: `records[${i}].type must be one of ${RECORD_TYPES.join(', ')}` };
    }
    if (typeof r.item !== 'string' || r.item.trim() === '') {
      return { ok: false, error: `records[${i}].item must be a non-empty string` };
    }
    if (typeof r.amount_tzs !== 'number' || !Number.isFinite(r.amount_tzs) || r.amount_tzs < 0) {
      return { ok: false, error: `records[${i}].amount_tzs must be a non-negative number` };
    }
    if (!Number.isInteger(r.amount_tzs)) {
      return { ok: false, error: `records[${i}].amount_tzs must be an integer number of shillings` };
    }
    if (r.quantity !== null && r.quantity !== undefined && (typeof r.quantity !== 'number' || r.quantity <= 0)) {
      return { ok: false, error: `records[${i}].quantity must be a positive number or null` };
    }
    if (typeof r.confidence !== 'number' || r.confidence < 0 || r.confidence > 1) {
      return { ok: false, error: `records[${i}].confidence must be a number from 0 to 1` };
    }
    records.push({
      type: r.type as RecordType,
      item: r.item.trim(),
      quantity: typeof r.quantity === 'number' ? r.quantity : null,
      amount_tzs: r.amount_tzs,
      person: optStr(r.person),
      note: optStr(r.note),
      confidence: r.confidence,
    });
  }

  if (raw.needs_clarification !== null && raw.needs_clarification !== undefined && typeof raw.needs_clarification !== 'string') {
    return { ok: false, error: '"needs_clarification" must be a string or null' };
  }

  return {
    ok: true,
    value: {
      transcript: typeof raw.transcript === 'string' ? raw.transcript : '',
      records,
      needs_clarification: optStr(raw.needs_clarification),
    },
  };
}

export const LOW_CONFIDENCE = 0.7;

/** Swahili question the founder can send the trader when a record is unclear. */
export function clarifyQuestion(r: ParsedRecord): string | null {
  if (r.amount_tzs <= 0) {
    if (r.type === 'expense') return `Ulilipa shilingi ngapi kwa ${r.item}?`;
    if (r.type === 'sale') return `Uliuza ${r.item} kwa shilingi ngapi?`;
    return `Ni shilingi ngapi kwa ${r.item}?`;
  }
  if ((r.type === 'debt_given' || r.type === 'debt_paid') && !r.person) {
    return r.type === 'debt_given' ? `Unamdai nani kwa ${r.item}?` : 'Nani amelipa deni?';
  }
  if (r.confidence < LOW_CONFIDENCE) return `Nimekuelewa hivi: ${r.item}, TSh ${r.amount_tzs.toLocaleString('en-US')}. Ni sawa?`;
  return null;
}
