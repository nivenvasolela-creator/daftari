import { useState } from 'react';
import type { Ctx } from '../App';
import { CONSENT_PURPOSE, CONSENT_VERSION, consentMessage } from '../lib/consent';
import { deleteTrader, download, exportCsv, exportJson, newId } from '../lib/store';
import { dayKey, normalisePhone, waLink } from '../lib/summary';

const SELLS = ['Nguo', 'Viatu', 'Chakula', 'Vipodozi', 'Simu/Elektroniki', 'Mengineyo'];

export function Traders({ db, update, settings }: Ctx) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [sells, setSells] = useState<string[]>([]);
  const [startedOn, setStartedOn] = useState(dayKey());
  const [consented, setConsented] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(db.traders.length === 0);

  const phoneOk = normalisePhone(phone);
  const consentText = consentMessage(name || 'rafiki', settings.contact);

  const add = () => {
    setError(null);
    if (!name.trim()) return setError('Add the trader’s name.');
    if (!phoneOk) return setError('Phone must be a Tanzanian mobile number, e.g. 0712 345 678.');
    if (db.traders.some((t) => t.phone === phoneOk)) return setError('A trader with this phone number already exists.');
    if (!consented) return setError('Tick consent only after the trader has replied NAKUBALI.');
    update((cur) => ({
      ...cur,
      traders: [
        ...cur.traders,
        {
          id: newId(),
          name: name.trim(),
          phone: phoneOk,
          sells: sells.join(', '),
          startedOn,
          consentAt: new Date().toISOString(),
          consentVersion: CONSENT_VERSION,
          consentPurpose: CONSENT_PURPOSE,
        },
      ],
    }));
    setName('');
    setPhone('');
    setSells([]);
    setConsented(false);
    setAdding(false);
  };

  const remove = (id: string, traderName: string) => {
    const typed = prompt(`This permanently deletes ${traderName} and all their records on this device. Export first if they asked for a copy.\n\nType DELETE to confirm.`);
    if (typed !== 'DELETE') return;
    update((cur) => deleteTrader(cur, id));
  };

  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'trader';

  return (
    <>
      {adding ? (
        <div className="card">
          <h2>Add a trader</h2>
          <p className="small muted">Send the consent message first. Add them only after they reply NAKUBALI.</p>

          <label htmlFor="tn">Name</label>
          <input id="tn" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />

          <label htmlFor="tp">WhatsApp number</label>
          <input id="tp" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0712 345 678" />

          <label>What they sell</label>
          <div className="chips">
            {SELLS.map((s) => (
              <button
                key={s}
                type="button"
                className="chip"
                aria-pressed={sells.includes(s)}
                onClick={() => setSells(sells.includes(s) ? sells.filter((x) => x !== s) : [...sells, s])}
              >
                {s}
              </button>
            ))}
          </div>

          <label htmlFor="ts">Test start day</label>
          <input id="ts" type="date" value={startedOn} onChange={(e) => e.target.value && setStartedOn(e.target.value)} />

          <details style={{ marginTop: 12 }}>
            <summary className="small" style={{ cursor: 'pointer', minHeight: 32 }}>Consent message (Swahili)</summary>
            <div className="pre">{consentText}</div>
            {!settings.contact && <p className="flag">Add a contact for data questions in Settings so it appears in this message.</p>}
          </details>
          <div className="row" style={{ marginTop: 8 }}>
            <a
              className="btn wa"
              href={phoneOk ? waLink(phoneOk, consentText) : undefined}
              aria-disabled={!phoneOk}
              onClick={(e) => { if (!phoneOk) { e.preventDefault(); setError('Enter a valid phone number first.'); } }}
              target="_blank"
              rel="noreferrer"
            >
              Send consent message
            </a>
          </div>

          <label className="check" style={{ marginTop: 14 }}>
            <input type="checkbox" checked={consented} onChange={(e) => setConsented(e.target.checked)} />
            <span>They replied <b>NAKUBALI</b> to consent version {CONSENT_VERSION}.</span>
          </label>

          {error && <div className="card bad small" role="alert" style={{ marginTop: 10, marginBottom: 0 }}>{error}</div>}

          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn primary" type="button" onClick={add}>Add trader</button>
            {db.traders.length > 0 && <button className="btn" type="button" onClick={() => setAdding(false)}>Cancel</button>}
          </div>
        </div>
      ) : (
        <button className="btn primary block" type="button" onClick={() => setAdding(true)} style={{ marginBottom: 12 }}>
          + Add a trader
        </button>
      )}

      {db.traders.map((t) => {
        const recs = db.records.filter((r) => r.traderId === t.id).length;
        return (
          <div className="card" key={t.id}>
            <h3>{t.name}</h3>
            <p className="small muted">
              +{t.phone} · {t.sells || 'not set'} · started {t.startedOn} · {recs} records
              <br />
              Consent v{t.consentVersion} on {new Date(t.consentAt).toLocaleString()}
            </p>
            <div className="row">
              <button className="btn" type="button" onClick={() => download(`daftari-${slug(t.name)}.json`, exportJson(db, t.id), 'application/json')}>
                Export JSON
              </button>
              <button className="btn" type="button" onClick={() => download(`daftari-${slug(t.name)}.csv`, exportCsv(db, t.id), 'text/csv')}>
                Export CSV
              </button>
              <button className="btn danger" type="button" onClick={() => remove(t.id, t.name)}>Delete</button>
            </div>
          </div>
        );
      })}
    </>
  );
}
