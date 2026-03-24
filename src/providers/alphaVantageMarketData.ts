import type { OHLCV } from '../domain/types'
import type { MarketDataProvider, MarketQuote } from './types'

const BASE = 'https://www.alphavantage.co/query'

/** Free tier ~5 calls/min — serialize all requests. */
const MIN_GAP_MS = 13_000

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

let avQueue: Promise<unknown> = Promise.resolve()

function enqueueAv<T>(fn: () => Promise<T>): Promise<T> {
  const next = avQueue.then(fn, fn) as Promise<T>
  avQueue = next.then(
    () => undefined,
    () => undefined,
  )
  return next
}

interface AvDailyResponse {
  'Error Message'?: string
  Note?: string
  Information?: string
  'Time Series (Daily)'?: Record<
    string,
    {
      '1. open': string
      '2. high': string
      '3. low': string
      '4. close': string
      '5. volume': string
    }
  >
}

/**
 * Alpha Vantage — free key: https://www.alphavantage.co/support/#api-key
 * CORS allows browser use (`Access-Control-Allow-Origin: *`).
 */
export class AlphaVantageMarketDataProvider implements MarketDataProvider {
  private readonly apiKey: string
  private lastFetch = 0
  private readonly cache = new Map<string, { t: number; bars: OHLCV[] }>()
  private readonly cacheTtlMs = 120_000

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  private async throttle(): Promise<void> {
    const now = Date.now()
    const wait = Math.max(0, MIN_GAP_MS - (now - this.lastFetch))
    if (wait > 0) await sleep(wait)
    this.lastFetch = Date.now()
  }

  private async getJson<T>(params: Record<string, string>): Promise<T> {
    return enqueueAv(async () => {
      await this.throttle()
      const q = new URLSearchParams({ ...params, apikey: this.apiKey })
      const res = await fetch(`${BASE}?${q}`)
      if (!res.ok) {
        const t = await res.text()
        throw new Error(`Alpha Vantage HTTP ${res.status}: ${t.slice(0, 200)}`)
      }
      return res.json() as Promise<T>
    })
  }

  async getDailyBars(symbol: string): Promise<OHLCV[]> {
    const sym = symbol.toUpperCase().trim()
    const cached = this.cache.get(sym)
    if (cached && Date.now() - cached.t < this.cacheTtlMs) {
      return cached.bars.map((b) => ({ ...b }))
    }

    const j = await this.getJson<AvDailyResponse>({
      function: 'TIME_SERIES_DAILY',
      symbol: sym,
      outputsize: 'full',
    })

    if (j.Information || j.Note) {
      throw new Error(
        j.Note ??
          j.Information ??
          'Alpha Vantage: rate limit or invalid key — wait 1 minute.',
      )
    }
    if (j['Error Message']) {
      throw new Error(j['Error Message'])
    }

    const series = j['Time Series (Daily)']
    if (!series) {
      throw new Error(`Alpha Vantage: no daily series for ${sym}`)
    }

    const dates = Object.keys(series).sort()
    const bars: OHLCV[] = dates.map((d) => {
      const row = series[d]!
      const day = new Date(d + 'T12:00:00Z').getTime()
      return {
        t: day,
        o: Number(row['1. open']),
        h: Number(row['2. high']),
        l: Number(row['3. low']),
        c: Number(row['4. close']),
        v: Number(row['5. volume'] || 0),
      }
    })

    this.cache.set(sym, { t: Date.now(), bars })
    return bars.map((b) => ({ ...b }))
  }

  async getLastPrice(symbol: string): Promise<number> {
    const bars = await this.getDailyBars(symbol)
    const last = bars[bars.length - 1]
    if (!last?.c || last.c <= 0) {
      throw new Error(`No price for ${symbol}`)
    }
    return last.c
  }

  async getQuote(symbol: string): Promise<MarketQuote> {
    const bars = await this.getDailyBars(symbol)
    const n = bars.length
    if (n === 0) throw new Error(`No bars for ${symbol}`)
    const lastBar = bars[n - 1]!
    const prevBar = bars[n - 2]
    return {
      last: lastBar.c,
      previousClose: prevBar?.c,
      volume: lastBar.v,
    }
  }
}
