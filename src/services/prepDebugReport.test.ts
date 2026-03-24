import { describe, expect, it } from 'vitest'
import { buildPrepDebugReport } from './prepDebugReport'
import { mergeScannerTuning } from './scannerTuning'

describe('prepDebugReport', () => {
  it('buildPrepDebugReport handles empty watchlist', () => {
    const r = buildPrepDebugReport({
      tickers: [],
      barsByIndex: [],
      bias: {
        marketTrend: 'neutral',
        regime: 'chop',
        spyTrend: 'flat',
        qqqTrend: 'flat',
        volatility: 'medium',
      },
      scans: [],
      dailyPlan: null,
      tradePlans: [],
      tuning: mergeScannerTuning(),
    })
    expect(r.summary.totalTickers).toBe(0)
    expect(r.rows).toEqual([])
    expect(r.summary.mostCommonRejectionReason).toBeNull()
  })
})
