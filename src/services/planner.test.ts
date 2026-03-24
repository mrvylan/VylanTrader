import { describe, expect, it } from 'vitest'
import type { RankedSetup, UserSettings } from '../domain/types'
import { closes } from './indicators'
import { planFromSetup, sharesFromRisk } from './planner'
import { generateMockDailyBars } from '../providers/mockMarketData'

describe('sharesFromRisk', () => {
  it('floors risk / per-share distance', () => {
    expect(sharesFromRisk(100, 50, 48)).toBe(50)
    expect(sharesFromRisk(100, 50, 50)).toBeNull()
  })
})

describe('planFromSetup', () => {
  const settings: UserSettings = {
    accountSize: 20_000,
    riskPerTrade: 100,
    dailyMaxLoss: 200,
    maxTradesPerDay: 2,
    alertSound: false,
    alertWebhookUrl: '',
  }

  it('builds a long plan with positive R and size', () => {
    const bars = generateMockDailyBars('TEST', 80)
    const last = closes(bars).at(-1)!
    const setup: RankedSetup = {
      ticker: 'TEST',
      strategyKind: 'breakout_retest',
      level: last * 0.994,
      ema9: last,
      ema20: last * 0.97,
      relVolume: 1.2,
      trendArrow: 'up',
      nearResistancePct: 0.01,
      score: 72,
    }
    const plan = planFromSetup(setup, bars, settings, 'bullish', 2, 'p1')
    expect(plan).not.toBeNull()
    expect(plan!.positionSize).toBeGreaterThan(0)
    expect(plan!.riskAmount).toBeGreaterThan(0)
    expect(plan!.entry).toBeGreaterThan(plan!.stop)
    expect(plan!.target).toBeGreaterThan(plan!.entry)
    expect(plan!.rMultiple).toBe(2)
    expect(plan!.expectedR).toBe(2)
    expect(plan!.riskPerShare).toBeGreaterThan(0)
  })
})
