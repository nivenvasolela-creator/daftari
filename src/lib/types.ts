export const RECORD_TYPES = ['sale', 'expense', 'debt_given', 'debt_paid'] as const;
export type RecordType = (typeof RECORD_TYPES)[number];

/** Version of the consent message sent to traders (see src/lib/consent.ts). */
export type Trader = {
  id: string;
  name: string;
  /** Digits only, international format without "+", e.g. 255712345678 */
  phone: string;
  sells: string;
  /** Local day (YYYY-MM-DD) the 2-week test started for this trader. */
  startedOn: string;
  consentAt: string; // ISO timestamp when the trader replied "NAKUBALI"
  consentVersion: string;
  consentPurpose: string;
};

/** One message (voice note or text) received from a trader. Content is NOT stored. */
export type Message = {
  id: string;
  traderId: string;
  day: string; // YYYY-MM-DD the message is counted for
  at: string; // ISO time it was processed
  source: 'voice' | 'text';
  recordCount: number;
};

export type LedgerRecord = {
  id: string;
  traderId: string;
  messageId: string;
  day: string;
  type: RecordType;
  item: string;
  quantity: number | null;
  amountTzs: number; // integer shillings, never float
  person: string | null;
  note: string | null;
  createdAt: string;
};

export type SummarySent = { traderId: string; day: string; at: string };

export type Db = {
  version: 1;
  traders: Trader[];
  messages: Message[];
  records: LedgerRecord[];
  sent: SummarySent[];
};

/** What the AI returns per record (before the founder confirms it). */
export type ParsedRecord = {
  type: RecordType;
  item: string;
  quantity: number | null;
  amount_tzs: number;
  person: string | null;
  note: string | null;
  confidence: number;
};

export type ParseResult = {
  transcript: string;
  records: ParsedRecord[];
  needs_clarification: string | null;
};
