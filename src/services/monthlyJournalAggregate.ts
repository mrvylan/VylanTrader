import type { TradeJournalEntry } from '../domain/types'

export interface MonthlyJournalTradeExtreme {
  id: string
  date: string
  ticker: string
  /** Dollars or percent return, depending on context. */
  value: number
}

export interface MonthlyJournalDailyRow {
  date: string
  tradeCount: number
  wins: number
  losses: number
  pnlDollars: number
  sumR: number
}

export interface MonthlyJournalAggregate {
  month: string
  daily: MonthlyJournalDailyRow[]
  totals: {
    tradeCount: number
    wins: number
    losses: number
    winRatePct: number
    totalPnlDollars: number
    totalR: number
    avgR: number
  }
  bestPnl: MonthlyJournalTradeExtreme | null
  worstPnl: MonthlyJournalTradeExtreme | null
  bestPct: MonthlyJournalTradeExtreme | null
  worstPct: MonthlyJournalTradeExtreme | null
  /** Trades with entry × size ≤ 0 (excluded from % extremes). */
  tradesSkippedForPct: number
}

function isValidMonthPrefix(m: string): boolean {
  if (!/^\d{4}-\d{2}$/.test(m)) return false
  const mo = Number(m.slice(5, 7))
  return mo >= 1 && mo <= 12
}

function notional(entry: TradeJournalEntry): number {
  return entry.entry * entry.positionSize
}

function pctReturn(entry: TradeJournalEntry): number | null {
  const n = notional(entry)
  if (!Number.isFinite(n) || n <= 0) return null
  return (entry.pnlDollars / n) * 100
}

function toExtreme(
  e: TradeJournalEntry,
  value: number,
): MonthlyJournalTradeExtreme {
  return { id: e.id, date: e.date, ticker: e.ticker, value }
}

/** Prefer larger value; tie-break date asc, then id. */
function pickMaxByValue(
  current: TradeJournalEntry | null,
  next: TradeJournalEntry,
  valueOf: (e: TradeJournalEntry) => number,
): TradeJournalEntry {
  if (!current) return next
  const va = valueOf(current)
  const vb = valueOf(next)
  if (vb > va) return next
  if (vb < va) return current
  if (next.date !== current.date)
    return next.date < current.date ? next : current
  return next.id < current.id ? next : current
}

/** Prefer smaller value; tie-break date asc, then id. */
function pickMinByValue(
  current: TradeJournalEntry | null,
  next: TradeJournalEntry,
  valueOf: (e: TradeJournalEntry) => number,
): TradeJournalEntry {
  if (!current) return next
  const va = valueOf(current)
  const vb = valueOf(next)
  if (vb < va) return next
  if (vb > va) return current
  if (next.date !== current.date)
    return next.date < current.date ? next : current
  return next.id < current.id ? next : current
}

const emptyTotals = (): MonthlyJournalAggregate['totals'] => ({
  tradeCount: 0,
  wins: 0,
  losses: 0,
  winRatePct: 0,
  totalPnlDollars: 0,
  totalR: 0,
  avgR: 0,
})

export function aggregateJournalByMonth(
  entries: TradeJournalEntry[],
  month: string,
): MonthlyJournalAggregate {
  const base: MonthlyJournalAggregate = {
    month,
    daily: [],
    totals: emptyTotals(),
    bestPnl: null,
    worstPnl: null,
    bestPct: null,
    worstPct: null,
    tradesSkippedForPct: 0,
  }

  if (!isValidMonthPrefix(month)) return base

  const inMonth = entries.filter((e) => e.date.startsWith(month))
  if (inMonth.length === 0) return base

  const byDay = new Map<
    string,
    { wins: number; losses: number; pnl: number; sumR: number; count: number }
  >()

  let wins = 0
  let losses = 0
  let totalPnl = 0
  let totalR = 0
  let bestPnlEntry: TradeJournalEntry | null = null
  let worstPnlEntry: TradeJournalEntry | null = null
  let bestPctEntry: TradeJournalEntry | null = null
  let worstPctEntry: TradeJournalEntry | null = null
  let skippedPct = 0

  for (const e of inMonth) {
    const day = byDay.get(e.date) ?? {
      wins: 0,
      losses: 0,
      pnl: 0,
      sumR: 0,
      count: 0,
    }
    day.count += 1
    day.pnl += e.pnlDollars
    day.sumR += e.rMultiple
    if (e.result === 'win') day.wins += 1
    else day.losses += 1
    byDay.set(e.date, day)

    if (e.result === 'win') wins += 1
    else losses += 1

    totalPnl += e.pnlDollars
    totalR += e.rMultiple

    bestPnlEntry = pickMaxByValue(bestPnlEntry, e, (x) => x.pnlDollars)
    worstPnlEntry = pickMinByValue(worstPnlEntry, e, (x) => x.pnlDollars)

    const p = pctReturn(e)
    if (p == null) {
      skippedPct += 1
    } else {
      bestPctEntry = pickMaxByValue(bestPctEntry, e, (x) => pctReturn(x)!)
      worstPctEntry = pickMinByValue(worstPctEntry, e, (x) => pctReturn(x)!)
    }
  }

  const tradeCount = inMonth.length
  const winRatePct =
    tradeCount === 0
      ? 0
      : Math.round((wins / tradeCount) * 1000) / 10

  const avgR =
    tradeCount === 0 ? 0 : Math.round((totalR / tradeCount) * 100) / 100

  const daily: MonthlyJournalDailyRow[] = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, d]) => ({
      date,
      tradeCount: d.count,
      wins: d.wins,
      losses: d.losses,
      pnlDollars: Math.round(d.pnl * 100) / 100,
      sumR: Math.round(d.sumR * 100) / 100,
    }))

  return {
    month,
    daily,
    totals: {
      tradeCount,
      wins,
      losses,
      winRatePct,
      totalPnlDollars: Math.round(totalPnl * 100) / 100,
      totalR: Math.round(totalR * 100) / 100,
      avgR,
    },
    bestPnl: bestPnlEntry
      ? toExtreme(bestPnlEntry, bestPnlEntry.pnlDollars)
      : null,
    worstPnl: worstPnlEntry
      ? toExtreme(worstPnlEntry, worstPnlEntry.pnlDollars)
      : null,
    bestPct: bestPctEntry
      ? toExtreme(bestPctEntry, pctReturn(bestPctEntry)!)
      : null,
    worstPct: worstPctEntry
      ? toExtreme(worstPctEntry, pctReturn(worstPctEntry)!)
      : null,
    tradesSkippedForPct: skippedPct,
  }
}
