import { addDays, daysBetween } from './summary';
import type { Db, Trader } from './types';

export const TEST_DAYS = 14;
/** "Still sending" = sent at least one message in the last N days of the window. */
export const RECENT_WINDOW = 3;
/** Go/no-go: build the real bot if at least this many of 10 traders are still sending at day 14. */
export const TARGET_STILL_ACTIVE = 5;

export type TraderScore = {
  trader: Trader;
  dayNumber: number; // 1-based day of the test as of `today` (can exceed 14)
  perDay: number[]; // messages on day 1..14
  activeDays: number;
  totalMessages: number;
  lastDay: string | null;
  stillSending: boolean;
  checkpoints: { day5: boolean | null; day10: boolean | null; day14: boolean | null };
};

export function scoreTrader(db: Db, trader: Trader, today: string): TraderScore {
  const msgs = db.messages.filter((m) => m.traderId === trader.id);
  const perDay = Array.from({ length: TEST_DAYS }, (_, i) => {
    const d = addDays(trader.startedOn, i);
    return msgs.filter((m) => m.day === d).length;
  });
  const dayNumber = daysBetween(trader.startedOn, today) + 1;
  const lastDay = msgs.reduce<string | null>((a, m) => (a === null || m.day > a ? m.day : a), null);

  // active in the RECENT_WINDOW days ending at `day` (1-based test day)
  const activeAround = (day: number): boolean | null => {
    if (dayNumber < day) return null; // not reached yet
    const end = addDays(trader.startedOn, day - 1);
    const start = addDays(end, -(RECENT_WINDOW - 1));
    return msgs.some((m) => m.day >= start && m.day <= end);
  };

  const recentStart = addDays(today, -(RECENT_WINDOW - 1));
  return {
    trader,
    dayNumber,
    perDay,
    activeDays: perDay.filter((n) => n > 0).length,
    totalMessages: msgs.length,
    lastDay,
    stillSending: msgs.some((m) => m.day >= recentStart && m.day <= today),
    checkpoints: { day5: activeAround(5), day10: activeAround(10), day14: activeAround(14) },
  };
}

export function verdict(scores: TraderScore[]): { reached14: number; active14: number; text: string } {
  const reached = scores.filter((s) => s.checkpoints.day14 !== null);
  const active = reached.filter((s) => s.checkpoints.day14);
  if (reached.length === 0) return { reached14: 0, active14: 0, text: 'No trader has reached day 14 yet.' };
  const text =
    active.length >= TARGET_STILL_ACTIVE
      ? `${active.length} of ${reached.length} still sending at day 14: the signal is there. Build the real bot.`
      : `${active.length} of ${reached.length} still sending at day 14: below the bar of ${TARGET_STILL_ACTIVE}. Find out why before building anything.`;
  return { reached14: reached.length, active14: active.length, text };
}
