import { describe, expect, it } from 'vitest'
import {
  executionFitScoreFromMinutesPT,
  interpretTradeSetupScore,
  levelClarityScore,
  marketAlignmentScoreLong,
  minutesSinceMidnightPacific,
  relativeVolumeScore,
  rewardRiskScore,
  setupQualityScoreBreakout,
  setupQualityScoreOrb,
  setupQualityScorePullback,
  totalTradeSetupScore,
  trendQualityScore,
} from './setupScoring'

describe('relativeVolumeScore', () => {
  it.each([
    [2.0, 15],
    [1.8, 12],
    [1.7, 12],
    [1.5, 12],
    [1.4, 9],
    [1.2, 9],
    [1.1, 6],
    [1.0, 6],
    [0.9, 3],
    [0.8, 3],
    [0.79, 0],
  ])('relVol %s → %i', (rv, exp) => {
    expect(relativeVolumeScore(rv)).toBe(exp)
  })
})

describe('rewardRiskScore', () => {
  it.each([
    [3.5, 10],
    [3.0, 10],
    [2.7, 8],
    [2.5, 8],
    [2.2, 6],
    [2.0, 6],
    [1.8, 4],
    [1.7, 2],
    [1.5, 2],
    [1.4, 0],
  ])('expectedR %s → %i', (er, exp) => {
    expect(rewardRiskScore(er)).toBe(exp)
  })
})

describe('executionFitScoreFromMinutesPT', () => {
  it('gives 10 for 6:00–7:30', () => {
    expect(executionFitScoreFromMinutesPT(6 * 60)).toBe(10)
    expect(executionFitScoreFromMinutesPT(7 * 60 + 30)).toBe(10)
    expect(executionFitScoreFromMinutesPT(6 * 60 + 45)).toBe(10)
  })
  it('grades adjacent windows smoothly', () => {
    expect(executionFitScoreFromMinutesPT(5 * 60 + 45)).toBe(8)
    expect(executionFitScoreFromMinutesPT(8 * 60)).toBe(8)
    expect(executionFitScoreFromMinutesPT(9 * 60)).toBe(6)
    expect(executionFitScoreFromMinutesPT(10 * 60)).toBe(4)
    expect(executionFitScoreFromMinutesPT(12 * 60)).toBe(2)
  })
  it('gives 0 deep overnight', () => {
    expect(executionFitScoreFromMinutesPT(2 * 60)).toBe(0)
  })
})

describe('marketAlignmentScoreLong', () => {
  it('returns 20 when both indices aligned and regime trend', () => {
    expect(
      marketAlignmentScoreLong({
        marketTrend: 'bullish',
        regime: 'trend',
        spyTrend: 'up',
        qqqTrend: 'up',
      }),
    ).toBe(20)
  })
  it('returns 16 when both aligned but mixed regime', () => {
    expect(
      marketAlignmentScoreLong({
        marketTrend: 'bullish',
        regime: 'chop',
        spyTrend: 'up',
        qqqTrend: 'up',
      }),
    ).toBe(16)
  })
  it('returns 12 when only one index is up in chop', () => {
    expect(
      marketAlignmentScoreLong({
        marketTrend: 'neutral',
        regime: 'chop',
        spyTrend: 'up',
        qqqTrend: 'flat',
      }),
    ).toBe(12)
  })
  it('returns 0 when hostile to longs', () => {
    expect(
      marketAlignmentScoreLong({
        marketTrend: 'bearish',
        regime: 'trend',
        spyTrend: 'down',
        qqqTrend: 'down',
      }),
    ).toBe(0)
  })
})

describe('levelClarityScore', () => {
  it('scores tighter proximity higher', () => {
    expect(levelClarityScore(0.001)).toBe(10)
    expect(levelClarityScore(0.005)).toBe(8)
    expect(levelClarityScore(0.015)).toBe(4)
    expect(levelClarityScore(0.03)).toBe(2)
    expect(levelClarityScore(0.08)).toBe(0)
  })
})

describe('trendQualityScore', () => {
  const base = {
    lastClose: 102,
    ema9: 100,
    ema20: 95,
    trendArrow: 'up' as const,
    recentCloses5: [98, 99, 100, 101, 102],
  }
  it('returns 15 for strong stack and short proxy', () => {
    expect(trendQualityScore(base)).toBe(15)
  })
  it('returns 0 when below daily 20 EMA', () => {
    expect(
      trendQualityScore({ ...base, lastClose: 90, trendArrow: 'flat' }),
    ).toBe(0)
  })
})

describe('setupQualityScoreBreakout', () => {
  it('returns 20 for clean tight breakout', () => {
    expect(
      setupQualityScoreBreakout({
        extensionPct: 0.005,
        riskAtr: 1.2,
        holdAtHigh: true,
      }),
    ).toBe(20)
  })
  it('returns 0 only when clearly invalid', () => {
    expect(
      setupQualityScoreBreakout({
        extensionPct: 0.1,
        riskAtr: 2,
        holdAtHigh: false,
      }),
    ).toBe(0)
  })
})

describe('setupQualityScorePullback', () => {
  it('returns 20 for shallow orderly pullback with reversal', () => {
    expect(
      setupQualityScorePullback({
        rangeAtr: 1.1,
        depthToEma9: 0.012,
        reversalOk: true,
      }),
    ).toBe(20)
  })
})

describe('setupQualityScoreOrb', () => {
  it('returns 20 for wide clear range, tight risk, strong vol', () => {
    expect(
      setupQualityScoreOrb({
        rangePct: 0.012,
        riskAtrValue: 1.4,
        volStrong: true,
      }),
    ).toBe(20)
  })
})

describe('interpretTradeSetupScore', () => {
  it('buckets A / B / watch / weak / ignore', () => {
    expect(interpretTradeSetupScore(90)).toBe('A')
    expect(interpretTradeSetupScore(80)).toBe('B')
    expect(interpretTradeSetupScore(70)).toBe('watch')
    expect(interpretTradeSetupScore(60)).toBe('weak')
    expect(interpretTradeSetupScore(50)).toBe('ignore')
  })
})

describe('totalTradeSetupScore', () => {
  it('sums buckets and caps at 100', () => {
    const julyMorning = new Date(Date.UTC(2025, 6, 15, 13, 30))
    expect(minutesSinceMidnightPacific(julyMorning)).toBeGreaterThanOrEqual(
      6 * 60,
    )
    expect(minutesSinceMidnightPacific(julyMorning)).toBeLessThanOrEqual(
      7 * 60 + 30,
    )

    const s = totalTradeSetupScore({
      market: {
        marketTrend: 'bullish',
        regime: 'trend',
        spyTrend: 'up',
        qqqTrend: 'up',
      },
      strategyKind: 'breakout_retest',
      setupQuality: {
        kind: 'breakout_retest',
        breakout: {
          extensionPct: 0.004,
          riskAtr: 1.1,
          holdAtHigh: true,
        },
      },
      relVolume: 2,
      trend: {
        lastClose: 105,
        ema9: 102,
        ema20: 98,
        trendArrow: 'up',
        recentCloses5: [100, 101, 102, 103, 105],
      },
      levelDistancePct: 0.002,
      expectedR: 3,
      now: julyMorning,
    })
    expect(s).toBeGreaterThanOrEqual(85)
    expect(s).toBeLessThanOrEqual(100)
  })
})
