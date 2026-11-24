import { validateParse } from './validate';
import type { ParseResult } from './types';

/** Change here (or in Settings) to swap the model. "gemini-flash-latest" is Google's
 *  alias for the current Flash model; pin a specific version if results drift. */
export const DEFAULT_MODEL = 'gemini-flash-latest';

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

export const SYSTEM_PROMPT = `You turn a small Tanzanian seller's message into bookkeeping records.
The message is a WhatsApp text or voice note in Swahili, English, or mixed Sheng.

Record types:
- "sale": the seller sold something and was paid now (nimeuza, nimepata, mteja amenunua, sold).
- "expense": the seller paid for something (nimelipa, nimenunua mzigo, kodi, nauli, usafiri, umeme, vocha, mshahara, paid).
- "debt_given": a customer took goods or money from the seller on credit and now OWES THE SELLER
  (amechukua kwa mkopo, ninamdai X, X atalipa baadaye, X owes me).
- "debt_paid": a customer paid back money they owed the seller (amelipa deni, amerudisha, paid me back).

Direction of "kudai" (be careful, this is often confused):
- "Ninamdai Juma 20,000" / "Juma anadaiwa na mimi" = Juma owes the seller -> debt_given, person "Juma".
- "Juma ananidai 20,000" / "ninadaiwa na Juma" = THE SELLER owes Juma. This app does not track the
  seller's own debts: return no record for it and set needs_clarification to
  "Je, wewe ndiye unamdai Juma, au Juma anakudai wewe?" (adapt the name).

Money (always integer Tanzanian shillings in amount_tzs):
- "elfu 45" = 45000, "45k" = 45000, "laki 2" = 200000, "laki 2 na nusu" = 250000,
  "buku" = 1000 so "buku 5" = 5000, "jero" = 500, "mia tano" = 500, "milioni 1.5" or "1.5m" = 1500000,
  "200,000" and "200.000" = 200000, "3,000/=" = 3000.
- A small number right after an item is the quantity, not money: "viatu 3 elfu 45" = quantity 3, amount 45000.
- amount_tzs is the TOTAL for the record. If a unit price and quantity are given ("viatu 3 kila kimoja elfu 15"),
  multiply (45000) and mention the unit price in note.
- If no amount is given, set amount_tzs to 0 and confidence below 0.5.

Rules:
- One message can contain several records ("nimeuza shati 2 elfu 30 na nimelipa usafiri 3000" = 2 records).
- item: short, in the seller's language (e.g. "viatu", "kodi", "usafiri").
- person: the customer's name for debts, else null.
- confidence: 0-1, how sure you are about type AND amount together.
- needs_clarification: ONE short question in Swahili if something important is unclear, else null.
- transcript: for a voice note, write what was said, word for word; for text, copy the text.
- Never invent records that are not in the message. Greetings or chit-chat -> records: [].
`;

// Gemini's structured-output schema (OpenAPI subset).
export const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    transcript: { type: 'STRING' },
    records: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          type: { type: 'STRING', enum: ['sale', 'expense', 'debt_given', 'debt_paid'] },
          item: { type: 'STRING' },
          quantity: { type: 'NUMBER', nullable: true },
          amount_tzs: { type: 'INTEGER' },
          person: { type: 'STRING', nullable: true },
          note: { type: 'STRING', nullable: true },
          confidence: { type: 'NUMBER' },
        },
        required: ['type', 'item', 'quantity', 'amount_tzs', 'person', 'note', 'confidence'],
      },
    },
    needs_clarification: { type: 'STRING', nullable: true },
  },
  required: ['transcript', 'records', 'needs_clarification'],
};

export type ParseInput = { kind: 'text'; text: string } | { kind: 'audio'; mimeType: string; base64: string };

export class ParseError extends Error {}

type Fetch = typeof fetch;

async function callOnce(
  input: ParseInput,
  apiKey: string,
  model: string,
  fixHint: string | null,
  fetchFn: Fetch,
): Promise<unknown> {
  const parts: unknown[] =
    input.kind === 'text'
      ? [{ text: `Seller's message:\n${input.text}` }]
      : [{ inlineData: { mimeType: input.mimeType, data: input.base64 } }, { text: "This is the seller's voice note." }];
  if (fixHint) parts.push({ text: `Your previous answer was invalid: ${fixHint}. Return valid JSON matching the schema.` });

  let res: Response;
  try {
    res = await fetchFn(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts }],
        generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA },
      }),
    });
  } catch {
    throw new ParseError('No connection to Gemini. Check your internet and try again.');
  }

  if (res.status === 429) throw new ParseError('Gemini free quota reached. Wait a minute and try again.');
  if (res.status === 400 || res.status === 403) {
    const body = await res.text().catch(() => '');
    if (/API key|PERMISSION|API_KEY/i.test(body)) throw new ParseError('Gemini rejected the API key. Check it in Settings.');
    if (/model/i.test(body)) throw new ParseError(`Gemini did not accept the model "${model}". Change it in Settings.`);
    throw new ParseError(`Gemini refused the request (${res.status}). ${input.kind === 'audio' ? 'The audio format may not be supported.' : ''}`);
  }
  if (!res.ok) throw new ParseError(`Gemini error ${res.status}. Try again in a moment.`);

  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  if (!text) throw new ParseError('Gemini returned an empty answer (it may have been blocked). Try rephrasing.');
  try {
    return JSON.parse(text);
  } catch {
    return { __invalid_json: text };
  }
}

/** Parse a message. Validates the JSON and retries once if it is invalid. */
export async function parseMessage(
  input: ParseInput,
  opts: { apiKey: string; model?: string; fetchFn?: Fetch },
): Promise<ParseResult> {
  if (!opts.apiKey) throw new ParseError('Add your Gemini API key in Settings first.');
  const model = opts.model || DEFAULT_MODEL;
  const fetchFn = opts.fetchFn ?? fetch.bind(globalThis);

  let hint: string | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await callOnce(input, opts.apiKey, model, hint, fetchFn);
    const v = validateParse(raw);
    if (v.ok) {
      if (input.kind === 'text' && !v.value.transcript) v.value.transcript = input.text;
      return v.value;
    }
    hint = v.error;
  }
  throw new ParseError(`Gemini gave an invalid answer twice (${hint}). Try again or enter the record by hand.`);
}

export function fileToBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

/** WhatsApp voice notes are Ogg/Opus; files often arrive with an empty or odd MIME type. */
export function audioMimeType(file: File): string {
  const name = file.name.toLowerCase();
  if (name.endsWith('.opus') || name.endsWith('.ogg') || file.type.startsWith('audio/ogg')) return 'audio/ogg';
  if (name.endsWith('.m4a') || name.endsWith('.aac')) return 'audio/aac';
  if (name.endsWith('.mp3')) return 'audio/mp3';
  if (name.endsWith('.wav')) return 'audio/wav';
  if (name.endsWith('.webm') || file.type.startsWith('audio/webm')) return 'audio/webm';
  return file.type || 'audio/ogg';
}
