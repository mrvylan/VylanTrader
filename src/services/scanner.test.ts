import { describe, expect, it } from 'vitest'
import type { MarketBiasResult, OHLCV, UserSettings } from '../domain/types'
import {
  evaluateSymbolScan,
  scanAndBuildTradePlan,
  scanTicker,
} from './scanner'

function bar(
  t: number,
  o: number,
  h: number,
  l: number,
  c: number,
  v: number,
): OHLCV {
  return { t, o, h, l, c, v }
}

const settings: UserSettings = {
  accountSize: 20_000,
  riskPerTrade: 200,
  dailyMaxLoss: 400,
  maxTradesPerDay: 3,
  alertSound: false,
  alertWebhookUrl: '',
}

const bullishBias: MarketBiasResult = {
  marketTrend: 'bullish',
  regime: 'trend',
  spyTrend: 'up',
  qqqTrend: 'up',
  volatility: 'medium',
}

/** 6:30 AM Pacific (July — DST) for executionFitScore = 5 */
const scoreMorningPT = new Date(Date.UTC(2025, 6, 15, 13, 30))

const scanOpts = {
  scoreTime: scoreMorningPT,
  marketBias: bullishBias,
}

/** Long uptrend then volume spike through the 20d range (breakout retest path). */
function buildBreakoutSeries(): OHLCV[] {
  const rows: OHLCV[] = []
  let ts = Date.UTC(2024, 0, 1)
  let c = 45
  for (let i = 0; i < 40; i++) {
    const o = c
    c = o + 0.4
    const h = Math.max(o, c) + 0.25
    const l = Math.min(o, c) - 0.2
    rows.push(bar(ts, o, h, l, c, 2_200_000))
    ts += 86_400_000
  }
  const prev = rows[rows.length - 1]!
  const o = prev.c
  const nextC = o * 1.055
  const h = nextC * 1.012
  rows.push(bar(ts, o, h, o * 0.996, nextC, 5_500_000))
  return rows
}

describe('morning scanner / strategy engine', () => {
  it('detects a scored candidate (best of breakout retest vs OR continuation)', () => {
    const rows = buildBreakoutSeries()
    const c = scanTicker('TEST', rows, scanOpts)
    expect(c).not.toBeNull()
    expect(['breakout_retest', 'orb_continuation']).toContain(c!.strategyKind)
  })

  it('builds TradePlan with valid geometry and sizing (approval gates are UI-only)', () => {
    const rows = buildBreakoutSeries()

    const out = scanAndBuildTradePlan(
      'TEST',
      rows,
      settings,
      'bullish',
      bullishBias,
      'plan-test',
      { scoreTime: scoreMorningPT },
    )
    expect(out).not.toBeNull()
    const { plan } = out!
    expect(plan.expectedR).toBeGreaterThanOrEqual(2)
    expect(plan.score).toBeDefined()
    expect(plan.riskPerShare).toBeCloseTo(plan.entry - plan.stop, 6)
    const r = plan.riskPerShare
    expect(plan.target).toBeCloseTo(plan.entry + 2 * r, 4)
    expect(plan.positionSize).toBeGreaterThan(0)
    expect(plan.riskAmount).toBeCloseTo(plan.positionSize * r, 2)
  })

  it('evaluateSymbolScan returns watching or approved_candidate with debug', () => {
    const rows = buildBreakoutSeries()
    const ev = evaluateSymbolScan(
      'TEST',
      rows,
      settings,
      'bullish',
      bullishBias,
      { scoreTime: scoreMorningPT, planId: 'plan-x' },
    )
    expect(ev.status).not.toBe('no_setup')
    expect(ev.candidateTier).toBe('approvable')
    expect(ev.plan).not.toBeNull()
    expect(ev.scoreBreakdown).not.toBeNull()
    expect(ev.debug.ticker).toBe('TEST')
    expect(ev.debug.detectedSetupType).not.toBeNull()
    expect(ev.debug.recentHigh).not.toBeNull()
  })

  it('returns null when no pattern matches', () => {
    const rows: OHLCV[] = []
    let ts = Date.UTC(2024, 0, 1)
    for (let i = 0; i < 45; i++) {
      rows.push(bar(ts, 50, 50.2, 49.8, 50, 2_000_000))
      ts += 86_400_000
    }
    rows.push(bar(ts, 49, 50, 47, 47, 2_000_000))
    expect(scanTicker('FLAT', rows, scanOpts)).toBeNull()
    expect(
      scanAndBuildTradePlan(
        'FLAT',
        rows,
        settings,
        'neutral',
        {
          marketTrend: 'neutral',
          regime: 'chop',
          spyTrend: 'flat',
          qqqTrend: 'flat',
          volatility: 'medium',
        },
        'x',
        { scoreTime: scoreMorningPT },
      ),
    ).toBeNull()
  })
})
