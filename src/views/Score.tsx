import type { Ctx } from '../App';
import { RECENT_WINDOW, scoreTrader, TARGET_STILL_ACTIVE, TEST_DAYS, verdict } from '../lib/score';
import { dayKey } from '../lib/summary';

const mark = (v: boolean | null) => (v === null ? '–' : v ? '✓' : '✗');

export function Score({ db }: Ctx) {
  const today = dayKey();
  const scores = db.traders.map((t) => scoreTrader(db, t, today));
  const v = verdict(scores);
  const stillNow = scores.filter((s) => s.stillSending).length;

  return (
    <>
      <div className={`card ${v.reached14 === 0 ? '' : v.active14 >= TARGET_STILL_ACTIVE ? 'good' : 'warn'}`}>
        <h2>The only number that matters</h2>
        <p>{v.text}</p>
        <p className="small muted" style={{ marginBottom: 0 }}>
          Right now {stillNow} of {scores.length} sent something in the last {RECENT_WINDOW} days. Bar: {TARGET_STILL_ACTIVE} of 10 still
          sending at day {TEST_DAYS}, with no reminders from you beyond the evening summary.
        </p>
      </div>

      {scores.length === 0 && <p className="muted">No traders yet.</p>}

      {scores
        .sort((a, b) => b.activeDays - a.activeDays)
        .map((s) => (
          <div className="card" key={s.trader.id}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h3 style={{ flex: 'none', margin: 0 }}>{s.trader.name}</h3>
              <span className="small muted" style={{ flex: 'none' }}>
                Day {Math.min(Math.max(s.dayNumber, 0), TEST_DAYS)}/{TEST_DAYS}
              </span>
            </div>
            <div className="strip" aria-label={`Messages per day: ${s.perDay.join(', ')}`}>
              {s.perDay.map((n, i) => (
                <i key={i} className={i + 1 > s.dayNumber ? 'future' : n > 0 ? 'on' : ''} title={`Day ${i + 1}: ${n}`} />
              ))}
            </div>
            <p className="small" style={{ marginBottom: 0 }}>
              {s.activeDays} active days · {s.totalMessages} messages · last {s.lastDay ?? 'never'}
              <br />
              Day 5 {mark(s.checkpoints.day5)} · Day 10 {mark(s.checkpoints.day10)} · Day 14 {mark(s.checkpoints.day14)}
              {s.stillSending ? '' : ' · gone quiet'}
            </p>
          </div>
        ))}
    </>
  );
}
