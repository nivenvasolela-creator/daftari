import { useState } from 'react';
import type { Ctx } from '../App';
import { dayKey, eveningMessage, waLink } from '../lib/summary';

export function Summaries({ db, update, go }: Ctx) {
  const [day, setDay] = useState(dayKey());
  const [open, setOpen] = useState<string | null>(null);

  if (db.traders.length === 0) {
    return (
      <div className="card">
        <h2>No traders yet</h2>
        <button className="btn primary block" type="button" onClick={() => go('traders')}>Add a trader</button>
      </div>
    );
  }

  const markSent = (traderId: string) =>
    update((cur) => ({
      ...cur,
      sent: [...cur.sent.filter((s) => !(s.traderId === traderId && s.day === day)), { traderId, day, at: new Date().toISOString() }],
    }));

  const rows = db.traders.map((t) => ({
    t,
    msgs: db.messages.filter((m) => m.traderId === t.id && m.day === day).length,
    sent: db.sent.find((s) => s.traderId === t.id && s.day === day) ?? null,
  }));
  const due = rows.filter((r) => r.msgs > 0 && !r.sent).length;

  return (
    <>
      <div className="card">
        <label htmlFor="sday" style={{ marginTop: 0 }}>Evening summaries for</label>
        <input id="sday" type="date" value={day} max={dayKey()} onChange={(e) => e.target.value && setDay(e.target.value)} />
        <p className="small muted" style={{ marginTop: 8, marginBottom: 0 }}>
          {due} to send. Traders who sent nothing today get nothing: a message to them would be a reminder and would spoil the test.
        </p>
      </div>

      {rows.map(({ t, msgs, sent }) => {
        const text = eveningMessage(t, db, day);
        return (
          <div className="card" key={t.id}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h3 style={{ flex: 'none', margin: 0 }}>{t.name}</h3>
              <span className="small muted" style={{ flex: 'none' }}>
                {msgs} msg{msgs === 1 ? '' : 's'}{sent ? ` · sent ${new Date(sent.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
              </span>
            </div>

            {msgs === 0 ? (
              <p className="small muted" style={{ marginTop: 8, marginBottom: 0 }}>No messages on this day.</p>
            ) : (
              <>
                {open === t.id && <div className="pre">{text}</div>}
                <div className="row" style={{ marginTop: 10 }}>
                  <a className="btn wa" href={waLink(t.phone, text)} target="_blank" rel="noreferrer" onClick={() => markSent(t.id)}>
                    {sent ? 'Send again' : 'Open in WhatsApp'}
                  </a>
                  <button className="btn" type="button" onClick={() => setOpen(open === t.id ? null : t.id)}>
                    {open === t.id ? 'Hide' : 'Preview'}
                  </button>
                </div>
              </>
            )}
          </div>
        );
      })}
    </>
  );
}
