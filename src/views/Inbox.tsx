import { useMemo, useRef, useState } from 'react';
import type { Ctx } from '../App';
import { amountAppearsIn, formatTzs } from '../lib/amounts';
import { audioMimeType, fileToBase64, ParseError, parseMessage } from '../lib/gemini';
import { newId } from '../lib/store';
import { dayKey, recordsOf, totalsFor, waLink } from '../lib/summary';
import { RECORD_TYPES, type LedgerRecord, type ParsedRecord, type RecordType } from '../lib/types';
import { clarifyQuestion, LOW_CONFIDENCE } from '../lib/validate';

export const TYPE_LABEL: Record<RecordType, string> = {
  sale: 'Sale',
  expense: 'Expense',
  debt_given: 'On credit',
  debt_paid: 'Debt paid',
};

type Draft = {
  key: string;
  type: RecordType;
  item: string;
  quantity: string;
  amount: string;
  person: string;
  note: string;
  confidence: number;
  question: string | null;
  amountNotInText: boolean;
};

const MAX_AUDIO_BYTES = 15 * 1024 * 1024;

function toDraft(r: ParsedRecord, sourceText: string | null): Draft {
  return {
    key: newId(),
    type: r.type,
    item: r.item,
    quantity: r.quantity === null ? '' : String(r.quantity),
    amount: r.amount_tzs > 0 ? String(r.amount_tzs) : '',
    person: r.person ?? '',
    note: r.note ?? '',
    confidence: r.confidence,
    question: clarifyQuestion(r),
    amountNotInText: sourceText !== null && r.amount_tzs > 0 && !amountAppearsIn(r.amount_tzs, sourceText),
  };
}

const blankDraft = (): Draft => ({
  key: newId(), type: 'sale', item: '', quantity: '', amount: '', person: '', note: '',
  confidence: 1, question: null, amountNotInText: false,
});

function draftProblem(d: Draft): string | null {
  const amt = Number(d.amount.replace(/[,\s]/g, ''));
  if (!d.item.trim()) return 'Add what was sold or paid for.';
  if (!Number.isInteger(amt) || amt <= 0) return 'Amount must be a whole number of shillings above 0.';
  if ((d.type === 'debt_given' || d.type === 'debt_paid') && !d.person.trim()) return 'Debts need the person’s name.';
  if (d.quantity && !(Number(d.quantity) > 0)) return 'Quantity must be a number, or leave it empty.';
  return null;
}

export function Inbox({ db, update, settings, go }: Ctx) {
  const [traderId, setTraderId] = useState(db.traders[0]?.id ?? '');
  const [day, setDay] = useState(dayKey());
  const [mode, setMode] = useState<'text' | 'voice'>('text');
  const [text, setText] = useState('');
  const [audio, setAudio] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [transcript, setTranscript] = useState('');
  const [aiQuestion, setAiQuestion] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const trader = db.traders.find((t) => t.id === traderId) ?? null;
  const dayRecords = useMemo(() => (trader ? recordsOf(db, trader.id, day) : []), [db, trader, day]);
  const totals = totalsFor(dayRecords);
  const dayMessages = db.messages.filter((m) => m.traderId === traderId && m.day === day).length;

  if (db.traders.length === 0) {
    return (
      <div className="card">
        <h2>No traders yet</h2>
        <p className="muted">Add a trader (with their consent) before processing their messages.</p>
        <button className="btn primary block" type="button" onClick={() => go('traders')}>Add a trader</button>
      </div>
    );
  }

  const reset = () => {
    setText('');
    setAudio(null); // the audio exists only in memory; dropping the reference discards it
    if (fileRef.current) fileRef.current.value = '';
    setDrafts(null);
    setTranscript('');
    setAiQuestion(null);
    setError(null);
  };

  const read = async () => {
    setError(null);
    setSaved(null);
    if (!settings.apiKey) {
      setError('Add your Gemini API key in Settings first.');
      return;
    }
    if (mode === 'text' && !text.trim()) {
      setError('Paste the trader’s message first.');
      return;
    }
    if (mode === 'voice' && !audio) {
      setError('Choose the voice note file first.');
      return;
    }
    if (audio && audio.size > MAX_AUDIO_BYTES) {
      setError('That audio file is over 15 MB. Ask the trader for a shorter voice note.');
      return;
    }
    setBusy(true);
    try {
      const input =
        mode === 'text'
          ? ({ kind: 'text', text } as const)
          : ({ kind: 'audio', mimeType: audioMimeType(audio!), base64: await fileToBase64(audio!) } as const);
      const res = await parseMessage(input, { apiKey: settings.apiKey, model: settings.model });
      const source = mode === 'text' ? text : null;
      setTranscript(res.transcript);
      setAiQuestion(res.needs_clarification);
      setDrafts(res.records.map((r) => toDraft(r, source)));
    } catch (e) {
      setError(e instanceof ParseError ? e.message : 'Something went wrong reading the message. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const setDraft = (key: string, patch: Partial<Draft>) =>
    setDrafts((ds) => ds && ds.map((d) => (d.key === key ? { ...d, ...patch, amountNotInText: patch.amount !== undefined ? false : d.amountNotInText } : d)));

  const problems = (drafts ?? []).map(draftProblem);
  const canSave = drafts !== null && problems.every((p) => p === null);

  const save = () => {
    if (!trader || !drafts || !canSave) return;
    const messageId = newId();
    const now = new Date().toISOString();
    const records: LedgerRecord[] = drafts.map((d) => ({
      id: newId(),
      traderId: trader.id,
      messageId,
      day,
      type: d.type,
      item: d.item.trim(),
      quantity: d.quantity ? Number(d.quantity) : null,
      amountTzs: Number(d.amount.replace(/[,\s]/g, '')),
      person: d.person.trim() || null,
      note: d.note.trim() || null,
      createdAt: now,
    }));
    update((cur) => ({
      ...cur,
      messages: [...cur.messages, { id: messageId, traderId: trader.id, day, at: now, source: mode, recordCount: records.length }],
      records: [...cur.records, ...records],
    }));
    setSaved(records.length === 0 ? 'Message counted (no records).' : `Saved ${records.length} record${records.length > 1 ? 's' : ''}.`);
    reset();
  };

  const removeRecord = (id: string) => {
    if (!confirm('Delete this record?')) return;
    update((cur) => ({ ...cur, records: cur.records.filter((r) => r.id !== id) }));
  };

  return (
    <>
      <div className="card">
        <div className="grid2">
          <div>
            <label htmlFor="trader">Trader</label>
            <select id="trader" value={traderId} onChange={(e) => { setTraderId(e.target.value); reset(); setSaved(null); }}>
              {db.traders.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="day">Day</label>
            <input id="day" type="date" value={day} max={dayKey()} onChange={(e) => e.target.value && setDay(e.target.value)} />
          </div>
        </div>

        <div className="big-numbers" style={{ marginTop: 12 }}>
          <div><b>{formatTzs(totals.sales)}</b><span>Mauzo</span></div>
          <div><b>{formatTzs(totals.expenses)}</b><span>Matumizi</span></div>
          <div><b>{formatTzs(totals.profit)}</b><span>Faida</span></div>
        </div>
        <p className="small muted" style={{ marginTop: 8, marginBottom: 0 }}>
          {dayMessages} message{dayMessages === 1 ? '' : 's'} on this day
        </p>
      </div>

      {saved && <div className="card good" role="status">{saved}</div>}

      {drafts === null ? (
        <div className="card">
          <div className="seg" role="group" aria-label="Message type">
            <button type="button" aria-pressed={mode === 'text'} onClick={() => setMode('text')}>Text</button>
            <button type="button" aria-pressed={mode === 'voice'} onClick={() => setMode('voice')}>Voice note</button>
          </div>

          {mode === 'text' ? (
            <>
              <label htmlFor="msg">Paste the trader’s message</label>
              <textarea id="msg" value={text} onChange={(e) => setText(e.target.value)} placeholder="nimeuza viatu 3 elfu 45" />
            </>
          ) : (
            <>
              <label htmlFor="audio">Voice note file (.opus, .ogg, .m4a, .mp3)</label>
              <input
                id="audio"
                ref={fileRef}
                type="file"
                accept="audio/*,.opus,.ogg,.m4a,.aac,.mp3,.wav,.webm"
                onChange={(e) => setAudio(e.target.files?.[0] ?? null)}
              />
              <p className="small muted" style={{ marginTop: 6 }}>
                In WhatsApp: long-press the voice note, then Share and save it to Files. The audio is sent to Gemini and is not stored here.
              </p>
            </>
          )}

          {error && <div className="card bad small" role="alert" style={{ marginTop: 10, marginBottom: 0 }}>{error}</div>}

          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn primary" type="button" onClick={read} disabled={busy}>
              {busy ? 'Reading…' : 'Read message'}
            </button>
            <button className="btn" type="button" onClick={() => { setDrafts([blankDraft()]); setTranscript(''); }} disabled={busy}>
              Enter by hand
            </button>
          </div>
          {busy && (<><div className="skeleton" /><div className="skeleton" style={{ width: '70%' }} /></>)}
        </div>
      ) : (
        <div className="card">
          <h2>Check before saving</h2>
          {transcript && (
            <>
              <p className="small muted" style={{ marginBottom: 0 }}>{mode === 'voice' ? 'What Gemini heard (not stored):' : 'Message (not stored):'}</p>
              <div className="pre">{transcript}</div>
            </>
          )}
          {aiQuestion && trader && (
            <div className="card warn small">
              <b>Unclear:</b> {aiQuestion}
              <div style={{ marginTop: 8 }}>
                <a className="btn wa" href={waLink(trader.phone, aiQuestion)} target="_blank" rel="noreferrer">Ask {trader.name.split(' ')[0]} on WhatsApp</a>
              </div>
            </div>
          )}
          {drafts.length === 0 && (
            <p className="muted">No records found in this message. Save to count it as a message anyway (the trader was active), or add one by hand.</p>
          )}

          {drafts.map((d, i) => (
            <div className="card" key={d.key} style={{ background: '#fcfcfa' }}>
              <div className="grid2">
                <div>
                  <label htmlFor={`t-${d.key}`}>Type</label>
                  <select id={`t-${d.key}`} value={d.type} onChange={(e) => setDraft(d.key, { type: e.target.value as RecordType })}>
                    {RECORD_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor={`a-${d.key}`}>Amount (TSh)</label>
                  <input id={`a-${d.key}`} inputMode="numeric" value={d.amount} onChange={(e) => setDraft(d.key, { amount: e.target.value.replace(/[^\d]/g, '') })} />
                </div>
                <div>
                  <label htmlFor={`i-${d.key}`}>Item</label>
                  <input id={`i-${d.key}`} value={d.item} onChange={(e) => setDraft(d.key, { item: e.target.value })} />
                </div>
                <div>
                  <label htmlFor={`q-${d.key}`}>Quantity</label>
                  <input id={`q-${d.key}`} inputMode="decimal" value={d.quantity} onChange={(e) => setDraft(d.key, { quantity: e.target.value })} />
                </div>
              </div>
              {(d.type === 'debt_given' || d.type === 'debt_paid' || d.person) && (
                <>
                  <label htmlFor={`p-${d.key}`}>Customer name</label>
                  <input id={`p-${d.key}`} value={d.person} onChange={(e) => setDraft(d.key, { person: e.target.value })} />
                </>
              )}
              {d.amount && <p className="small muted" style={{ marginTop: 8 }}>= {formatTzs(Number(d.amount))}</p>}
              {d.confidence < LOW_CONFIDENCE && <p className="flag">Low confidence ({Math.round(d.confidence * 100)}%). Check type and amount.</p>}
              {d.amountNotInText && <p className="flag">This amount isn’t written in the message. Check it.</p>}
              {d.question && trader && (
                <p className="flag">
                  Suggested question: “{d.question}”{' '}
                  <a href={waLink(trader.phone, d.question)} target="_blank" rel="noreferrer">Ask on WhatsApp</a>
                </p>
              )}
              {problems[i] && <p className="flag" style={{ color: 'var(--bad)' }}>{problems[i]}</p>}
              <button className="btn ghost danger" type="button" onClick={() => setDrafts(drafts.filter((x) => x.key !== d.key))}>Remove</button>
            </div>
          ))}

          <div className="row">
            <button className="btn" type="button" onClick={() => setDrafts([...drafts, blankDraft()])}>+ Add record</button>
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn primary" type="button" onClick={save} disabled={!canSave}>
              {drafts.length === 0 ? 'Count message, no records' : `Sawa, save ${drafts.length}`}
            </button>
            <button className="btn" type="button" onClick={reset}>Cancel</button>
          </div>
        </div>
      )}

      {trader && dayRecords.length > 0 && (
        <div className="card">
          <h3>{trader.name}: records on this day</h3>
          <ul className="list">
            {dayRecords.map((r) => (
              <li key={r.id}>
                <div>
                  <span className={`tag ${r.type}`}>{TYPE_LABEL[r.type]}</span>{' '}
                  {r.quantity ? `${r.quantity} × ` : ''}{r.item}{r.person ? ` · ${r.person}` : ''}
                </div>
                <div className="row" style={{ flex: 'none' }}>
                  <span className="amount">{formatTzs(r.amountTzs)}</span>
                  <button className="btn ghost danger" type="button" aria-label={`Delete ${r.item}`} onClick={() => removeRecord(r.id)}>✕</button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
