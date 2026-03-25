import { describe, expect, it } from 'vitest'
import type { TradeJournalEntry } from '../domain/types'
import { aggregateJournalByMonth } from './monthlyJournalAggregate'

function entry(
  over: Partial<TradeJournalEntry> & Pick<TradeJournalEntry, 'id' | 'date'>,
): TradeJournalEntry {
  return {
    ticker: 'SPY',
    setupType: 'ORB',
    entry: 100,
    exit: 101,
    stop: 99,
    target: 103,
    positionSize: 10,
    pnlDollars: 10,
    rMultiple: 1,
    result: 'win',
    followedRules: true,
    ...over,
  } as TradeJournalEntry
}

describe('aggregateJournalByMonth', () => {
  it('returns empty structure for invalid month', () => {
    const r = aggregateJournalByMonth([], '2025-13')
    expect(r.daily).toEqual([])
    expect(r.totals.tradeCount).toBe(0)
    expect(r.bestPnl).toBeNull()
  })

  it('returns empty totals when no rows match month', () => {
    const r = aggregateJournalByMonth(
      [entry({ id: 'a', date: '2025-01-15' })],
      '2025-02',
    )
    expect(r.daily).toEqual([])
    expect(r.totals.tradeCount).toBe(0)
  })

  it('rolls up multiple trades on one day', () => {
    const rows = [
      entry({
        id: 'a',
        date: '2025-03-10',
        pnlDollars: 50,
        rMultiple: 1,
        result: 'win',
      }),
      entry({
        id: 'b',
        date: '2025-03-10',
        ticker: 'QQQ',
        pnlDollars: -20,
        rMultiple: -0.5,
        result: 'loss',
      }),
    ]
    const r = aggregateJournalByMonth(rows, '2025-03')
    expect(r.daily).toHaveLength(1)
    expect(r.daily[0]).toMatchObject({
      date: '2025-03-10',
      tradeCount: 2,
      wins: 1,
      losses: 1,
      pnlDollars: 30,
    })
    expect(r.totals.tradeCount).toBe(2)
    expect(r.totals.wins).toBe(1)
    expect(r.totals.winRatePct).toBe(50)
    expect(r.totals.totalPnlDollars).toBe(30)
  })

  it('sorts daily rows by date', () => {
    const rows = [
      entry({ id: 'b', date: '2025-03-12', pnlDollars: 1, result: 'win' }),
      entry({ id: 'a', date: '2025-03-02', pnlDollars: 2, result: 'win' }),
    ]
    const r = aggregateJournalByMonth(rows, '2025-03')
    expect(r.daily.map((d) => d.date)).toEqual(['2025-03-02', '2025-03-12'])
  })

  it('computes best and worst dollar P/L', () => {
    const rows = [
      entry({ id: 'a', date: '2025-04-01', pnlDollars: 100, result: 'win' }),
      entry({ id: 'b', date: '2025-04-02', pnlDollars: -40, result: 'loss' }),
      entry({ id: 'c', date: '2025-04-03', pnlDollars: 25, result: 'win' }),
    ]
    const r = aggregateJournalByMonth(rows, '2025-04')
    expect(r.bestPnl?.value).toBe(100)
    expect(r.bestPnl?.ticker).toBe('SPY')
    expect(r.worstPnl?.value).toBe(-40)
  })

  it('computes % return vs notional and skips zero notional', () => {
    const rows = [
      entry({
        id: 'a',
        date: '2025-05-01',
        entry: 50,
        positionSize: 100,
        pnlDollars: 250,
        result: 'win',
      }),
      entry({
        id: 'b',
        date: '2025-05-02',
        entry: 0,
        positionSize: 10,
        pnlDollars: 5,
        result: 'win',
      }),
    ]
    const r = aggregateJournalByMonth(rows, '2025-05')
    expect(r.tradesSkippedForPct).toBe(1)
    expect(r.bestPct?.value).toBe(5)
    expect(r.worstPct?.value).toBe(5)
  })

  it('picks best and worst % among multiple valid trades', () => {
    const rows = [
      entry({
        id: 'a',
        date: '2025-06-01',
        entry: 100,
        positionSize: 1,
        pnlDollars: 10,
        result: 'win',
      }),
      entry({
        id: 'b',
        date: '2025-06-02',
        entry: 100,
        positionSize: 1,
        pnlDollars: -5,
        result: 'loss',
      }),
    ]
    const r = aggregateJournalByMonth(rows, '2025-06')
    expect(r.bestPct?.value).toBeCloseTo(10, 5)
    expect(r.worstPct?.value).toBeCloseTo(-5, 5)
    expect(r.tradesSkippedForPct).toBe(0)
  })
})
