import { useCallback, useEffect, useState } from 'react';
import type { Db } from './lib/types';
import { loadDb, loadSettings, requestPersistence, saveDb, saveSettings, type Settings } from './lib/store';
import { Inbox } from './views/Inbox';
import { Summaries } from './views/Summaries';
import { Traders } from './views/Traders';
import { Score } from './views/Score';
import { SettingsView } from './views/Settings';
import { Icon } from './views/Icon';

export type Tab = 'inbox' | 'summaries' | 'traders' | 'score' | 'settings';

export type Ctx = {
  db: Db;
  update: (fn: (db: Db) => Db) => void;
  replaceDb: (db: Db) => void;
  settings: Settings;
  setSettings: (s: Settings) => void;
  go: (t: Tab) => void;
};

const TABS: { id: Tab; label: string }[] = [
  { id: 'inbox', label: 'Inbox' },
  { id: 'summaries', label: 'Evening' },
  { id: 'traders', label: 'Traders' },
  { id: 'score', label: 'Score' },
  { id: 'settings', label: 'Settings' },
];

export function App() {
  const [db, setDb] = useState<Db>(loadDb);
  const [settings, setSettingsState] = useState<Settings>(loadSettings);
  const [tab, setTab] = useState<Tab>(() => (loadSettings().apiKey ? 'inbox' : 'settings'));
  const [saveFailed, setSaveFailed] = useState(false);

  useEffect(() => {
    void requestPersistence();
  }, []);

  const update = useCallback((fn: (db: Db) => Db) => {
    setDb((prev) => {
      const next = fn(prev);
      setSaveFailed(!saveDb(next));
      return next;
    });
  }, []);

  const replaceDb = useCallback((next: Db) => {
    setSaveFailed(!saveDb(next));
    setDb(next);
  }, []);

  const setSettings = useCallback((s: Settings) => {
    saveSettings(s);
    setSettingsState(s);
  }, []);

  const go = useCallback((t: Tab) => {
    setTab(t);
    window.scrollTo(0, 0);
  }, []);

  const ctx: Ctx = { db, update, replaceDb, settings, setSettings, go };

  return (
    <>
      <div className="app">
        <header className="top">
          <h1>
            Daftari <span>Concierge</span>
          </h1>
          <small>{db.traders.length} traders</small>
        </header>

        {saveFailed && (
          <div className="card bad" role="alert">
            <b>Not saved.</b> This browser refused to store data (storage full or private mode). Export a backup in Settings now.
          </div>
        )}

        {tab === 'inbox' && <Inbox {...ctx} />}
        {tab === 'summaries' && <Summaries {...ctx} />}
        {tab === 'traders' && <Traders {...ctx} />}
        {tab === 'score' && <Score {...ctx} />}
        {tab === 'settings' && <SettingsView {...ctx} />}
      </div>

      <nav className="nav" aria-label="Main">
        {TABS.map((t) => (
          <button key={t.id} type="button" aria-current={tab === t.id ? 'page' : undefined} onClick={() => go(t.id)}>
            <Icon name={t.id} />
            {t.label}
          </button>
        ))}
      </nav>
    </>
  );
}
