import { useEffect, useRef, useState } from 'react';
import type { Ctx } from '../App';
import { DEFAULT_MODEL } from '../lib/gemini';
import { download, exportCsv, exportJson, importJson } from '../lib/store';
import { dayKey } from '../lib/summary';

export function SettingsView({ db, replaceDb, settings, setSettings, go }: Ctx) {
  const [apiKey, setApiKey] = useState(settings.apiKey);
  const [model, setModel] = useState(settings.model);
  const [contact, setContact] = useState(settings.contact);
  const [msg, setMsg] = useState<string | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null));
  }, []);

  const save = () => {
    setSettings({ apiKey: apiKey.trim(), model: model.trim() || DEFAULT_MODEL, contact: contact.trim() });
    setMsg('Saved.');
    if (!settings.apiKey && apiKey.trim()) go('traders');
  };

  const restore = async (file: File | undefined) => {
    if (!file) return;
    try {
      const next = importJson(await file.text());
      if (!confirm(`Replace everything on this device with this backup (${next.traders.length} traders, ${next.records.length} records)?`)) return;
      replaceDb(next);
      setMsg('Backup restored.');
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <>
      {!settings.apiKey && (
        <div className="card warn">
          <b>Start here.</b> Add a free Gemini API key from Google AI Studio (aistudio.google.com). It is stored only in this browser.
        </div>
      )}

      <div className="card">
        <h2>AI</h2>
        <label htmlFor="key">Gemini API key</label>
        <input id="key" type="password" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
        <label htmlFor="model">Model</label>
        <input id="model" value={model} onChange={(e) => setModel(e.target.value)} placeholder={DEFAULT_MODEL} />
        <label htmlFor="contact">Contact for data questions (shown in the consent message)</label>
        <input id="contact" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="email or WhatsApp number" />
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn primary" type="button" onClick={save}>Save</button>
        </div>
        {msg && <p className="small" role="status" style={{ marginTop: 8 }}>{msg}</p>}
        <p className="small muted" style={{ marginTop: 8 }}>
          Use this tool only on your own phone. Anyone who can open this browser can use the key and see the traders’ records. Restrict the key to the
          Generative Language API in Google Cloud.
        </p>
      </div>

      <div className="card">
        <h2>Your data</h2>
        <p className="small muted">
          Everything is stored only in this browser on this device: {db.traders.length} traders, {db.records.length} records, {db.messages.length} messages.
          If the phone is lost or the browser data is cleared, it is gone. Export a backup every evening.
          {persisted === false && ' This browser may delete it under storage pressure.'}
        </p>
        <div className="row">
          <button className="btn primary" type="button" onClick={() => download(`daftari-backup-${dayKey()}.json`, exportJson(db), 'application/json')}>
            Backup (JSON)
          </button>
          <button className="btn" type="button" onClick={() => download(`daftari-records-${dayKey()}.csv`, exportCsv(db), 'text/csv')}>
            Records (CSV)
          </button>
        </div>
        <label htmlFor="restore">Restore a backup</label>
        <input id="restore" ref={fileRef} type="file" accept="application/json,.json" onChange={(e) => restore(e.target.files?.[0])} />
      </div>

      <div className="card">
        <h2>What this tool does with data</h2>
        <ul className="small" style={{ paddingLeft: 18, margin: 0 }}>
          <li>Stores: trader name, phone, what they sell, consent time and version, and the confirmed records (item, amount, customer names for debts).</li>
          <li>Does not store: message text, transcripts or voice notes. They exist only while you check them.</li>
          <li>Sends: each message you read (text or audio) to Google’s Gemini API, outside Tanzania. Nothing else leaves this device.</li>
          <li>No analytics, no trackers, no external fonts. The page is hosted on GitHub Pages, which logs visits.</li>
        </ul>
      </div>
    </>
  );
}
