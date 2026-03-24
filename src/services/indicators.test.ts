import { describe, expect, it } from 'vitest'
import {
  averageDailyRangePct,
  emaSeries,
  lastEma,
  relativeVolume,
  sma,
} from './indicators'
import type { OHLCV } from '../domain/types'

describe('sma', () => {
  it('returns mean of last n values', () => {
    expect(sma([1, 2, 3, 4, 5], 3)).toBe(4)
  })
})

describe('emaSeries', () => {
  it('warms up after period bars', () => {
    const closes = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    const s = emaSeries(closes, 3)
    expect(s[0]).toBeNull()
    expect(s[1]).toBeNull()
    expect(s[2]).not.toBeNull()
    expect(s[s.length - 1]!).toBeGreaterThan(0)
  })
})

describe('lastEma', () => {
  it('matches last non-null ema', () => {
    const c = Array.from({ length: 30 }, (_, i) => 100 + i * 0.5)
    const e = lastEma(c, 20)
    expect(e).not.toBeNull()
    expect(e!).toBeGreaterThan(100)
  })
})

describe('averageDailyRangePct', () => {
  it('returns mean (h−l)/c over last n bars', () => {
    const bars: OHLCV[] = Array.from({ length: 22 }, (_, i) => ({
      t: i,
      o: 100,
      h: 104,
      l: 96,
      c: 100,
      v: 1e6,
    }))
    expect(averageDailyRangePct(bars, 20)).toBeCloseTo(0.08, 5)
  })
})

describe('relativeVolume', () => {
  it('compares last bar to prior average', () => {
    const bars: OHLCV[] = Array.from({ length: 25 }, (_, i) => ({
      t: i,
      o: 10,
      h: 11,
      l: 9,
      c: 10,
      v: i === 24 ? 2_000_000 : 1_000_000,
    }))
    const rv = relativeVolume(bars, 20)
    expect(rv).not.toBeNull()
    expect(rv!).toBeGreaterThan(1)
  })
})
