import type { OHLCV } from '../domain/types'
import type {
  IntradayTimeframe,
  MarketDataProvider,
  MarketQuote,
} from './types'
import { MockMarketDataProvider } from './mockMarketData'

type PolygonTimeframe = 'daily' | '1h' | IntradayTimeframe

type ServerHistoricalResponse = {
  ticker: string
  timeframe: string
  source: 'massive' | 'polygon'
  bars: Array<{
    t: number
    o: number
    h: number
    l: number
    c: number
    v: number
  }>
}

type ServerLastResponse = {
  ticker: string
  source: 'massive' | 'polygon'
  last: number
  previousClose?: number
  volume?: number
  ts?: number
}

function timeframeToParam(tf: PolygonTimeframe): PolygonTimeframe {
  return tf
}

/**
 * Massive/Polygon-backed provider (calls our server endpoints).
 * Server owns MASSIVE_API_KEY (or POLYGON_API_KEY fallback).
 */
export class PolygonMarketDataProvider implements MarketDataProvider {
  private readonly cache = new Map<
    string,
    { at: number; bars: OHLCV[]; last: number }
  >()
  private readonly inflight = new Map<string, Promise<unknown>>()
  private readonly cacheTtlMs: number

  constructor(cacheTtlMs = 60_000) {
    this.cacheTtlMs = cacheTtlMs
  }

  private cacheKey(symbol: string, timeframe: PolygonTimeframe) {
    return `${symbol.toUpperCase()}:${timeframe}`
  }

  private async getJson<T>(url: string): Promise<T> {
    const res = await fetch(url)
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Polygon proxy HTTP ${res.status}: ${text.slice(0, 200)}`)
    }
    return (await res.json()) as T
  }

  async getHistoricalBars(
    ticker: string,
    timeframe: PolygonTimeframe,
  ): Promise<OHLCV[]> {
    const symbol = ticker.toUpperCase()
    const tf = timeframeToParam(timeframe)
    const key = this.cacheKey(symbol, tf)
    const hit = this.cache.get(key)
    if (hit && Date.now() - hit.at < this.cacheTtlMs) {
      return hit.bars.map((b) => ({ ...b }))
    }

    const inflightKey = `hist:${key}`
    const existing = this.inflight.get(inflightKey)
    if (existing) return (await existing) as OHLCV[]

    const p = (async () => {
      const j = await this.getJson<ServerHistoricalResponse>(
        `/api/market/historical?ticker=${encodeURIComponent(
          symbol,
        )}&timeframe=${encodeURIComponent(tf)}`,
      )
      const bars = j.bars.map((b) => ({
        t: b.t,
        o: b.o,
        h: b.h,
        l: b.l,
        c: b.c,
        v: b.v,
      }))
      this.cache.set(key, { at: Date.now(), bars, last: 0 })
      return bars
    })().finally(() => {
      this.inflight.delete(inflightKey)
    })

    this.inflight.set(inflightKey, p)
    return await p
  }

  async getDailyBars(symbol: string): Promise<OHLCV[]> {
    return this.getHistoricalBars(symbol, 'daily')
  }

  async getIntradayBars(
    symbol: string,
    timeframe: IntradayTimeframe,
  ): Promise<OHLCV[]> {
    return this.getHistoricalBars(symbol, timeframe)
  }

  async getLastPrice(symbol: string): Promise<number> {
    const symbolUp = symbol.toUpperCase()
    const key = this.cacheKey(symbolUp, 'daily')
    const hit = this.cache.get(key)
    if (hit && hit.last > 0 && Date.now() - hit.at < this.cacheTtlMs) {
      return hit.last
    }

    const inflightKey = `last:${symbolUp}`
    const existing = this.inflight.get(inflightKey)
    if (existing) return (await existing) as number

    const p = (async () => {
      const j = await this.getJson<ServerLastResponse>(
        `/api/market/last?ticker=${encodeURIComponent(symbolUp)}`,
      )
      const last = j.last
      // store last against the daily cache key so it shares TTL
      const prior = this.cache.get(key)
      this.cache.set(key, { at: Date.now(), bars: prior?.bars ?? [], last })
      return last
    })().finally(() => {
      this.inflight.delete(inflightKey)
    })

    this.inflight.set(inflightKey, p)
    return await p
  }

  async getQuote(symbol: string): Promise<MarketQuote> {
    const symbolUp = symbol.toUpperCase()
    const j = await this.getJson<ServerLastResponse>(
      `/api/market/last?ticker=${encodeURIComponent(symbolUp)}`,
    )
    return {
      last: j.last,
      previousClose: j.previousClose,
      volume: j.volume,
    }
  }
}

/**
 * Polygon -> mock fallback wrapper.
 * Exposes `consumeDemoDataNotice()` for the UI.
 */
export class PolygonWithMockFallbackMarketDataProvider
  implements MarketDataProvider
{
  private demoNotice: string | null = null
  private readonly polygon: PolygonMarketDataProvider
  private readonly mock: MockMarketDataProvider

  constructor(
    polygon: PolygonMarketDataProvider,
    mock: MockMarketDataProvider,
  ) {
    this.polygon = polygon
    this.mock = mock
  }

  consumeDemoDataNotice(): string | null {
    const n = this.demoNotice
    this.demoNotice = null
    return n
  }

  private markDemoNotice() {
    if (!this.demoNotice) this.demoNotice = 'Using demo data'
  }

  async getDailyBars(symbol: string): Promise<OHLCV[]> {
    try {
      return await this.polygon.getDailyBars(symbol)
    } catch {
      this.markDemoNotice()
      return await this.mock.getDailyBars(symbol)
    }
  }

  async getIntradayBars(
    symbol: string,
    timeframe: IntradayTimeframe,
  ): Promise<OHLCV[]> {
    try {
      return await this.polygon.getIntradayBars(symbol, timeframe)
    } catch {
      this.markDemoNotice()
      // Mock provider has only daily bars; this keeps the scan running.
      return await this.mock.getDailyBars(symbol)
    }
  }

  async getLastPrice(symbol: string): Promise<number> {
    try {
      return await this.polygon.getLastPrice(symbol)
    } catch {
      this.markDemoNotice()
      return await this.mock.getLastPrice(symbol)
    }
  }

  async getQuote(symbol: string): Promise<MarketQuote> {
    try {
      return await this.polygon.getQuote(symbol)
    } catch {
      this.markDemoNotice()
      return await this.mock.getQuote(symbol)
    }
  }
}

