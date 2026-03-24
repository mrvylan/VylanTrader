import type { OHLCV } from '../domain/types'
import { generateUptrendBreakoutDailyBars } from '../demo/demoPassingDailyBars'
import type { MarketDataProvider, MarketQuote } from './types'

function tickerSeed(symbol: string): number {
  let h = 2166136261
  for (let i = 0; i < symbol.length; i++) {
    h ^= symbol.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h) || 1
}

function mulberry32(seed: number) {
  return function next() {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Deterministic daily OHLCV for demos and tests. */
export function generateMockDailyBars(symbol: string, count = 130): OHLCV[] {
  const rnd = mulberry32(tickerSeed(symbol))
  const bars: OHLCV[] = []
  const base =
    50 + (tickerSeed(symbol) % 400) + (symbol.length * 3)
  let c = base
  const dayMs = 86_400_000
  const start = Date.now() - count * dayMs
  const drift = (rnd() - 0.45) * 0.002

  for (let i = 0; i < count; i++) {
    const vol = 0.008 + rnd() * 0.02
    const change = drift + (rnd() - 0.48) * vol
    const o = c
    c = Math.max(1, o * (1 + change))
    const wick = c * vol * (0.3 + rnd() * 0.7)
    const h = Math.max(o, c) + wick * rnd()
    const l = Math.min(o, c) - wick * rnd()
    const v = Math.floor(1e6 + rnd() * 8e6 * (1 + Math.abs(change) * 40))
    bars.push({
      t: start + i * dayMs,
      o,
      h,
      l,
      c,
      v,
    })
  }
  return bars
}

export class MockMarketDataProvider implements MarketDataProvider {
  private cache = new Map<string, OHLCV[]>()

  async getDailyBars(symbol: string): Promise<OHLCV[]> {
    const key = symbol.toUpperCase()
    let b = this.cache.get(key)
    if (!b) {
      /** AMD: bars that pass morning engine (Create plan after demo matches prep). */
      b =
        key === 'AMD' || key === 'NVDA'
          ? generateUptrendBreakoutDailyBars()
          : generateMockDailyBars(key)
      this.cache.set(key, b)
    }
    return b.map((x) => ({ ...x }))
  }

  /** Last close + small deterministic jitter per ticker (stable across refreshes). */
  async getLastPrice(symbol: string): Promise<number> {
    const bars = await this.getDailyBars(symbol)
    const last = bars[bars.length - 1]
    if (!last) return 0
    const rnd = mulberry32(tickerSeed(symbol))
    const jitter = (rnd() - 0.5) * 0.003
    return Math.round(last.c * (1 + jitter) * 10000) / 10000
  }

  async getQuote(symbol: string): Promise<MarketQuote> {
    const bars = await this.getDailyBars(symbol)
    const lastBar = bars[bars.length - 1]
    const prevBar = bars[bars.length - 2]
    const last = await this.getLastPrice(symbol)
    return {
      last,
      previousClose: prevBar?.c,
      volume: lastBar?.v,
    }
  }
}
