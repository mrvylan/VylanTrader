import type { OHLCV } from '../domain/types'
import type { MarketDataProvider, MarketQuote } from './types'

const BASE = 'https://finnhub.io/api/v1'

/** Finnhub candle API response (daily). */
interface CandleResponse {
  s: 'ok' | 'no_data' | string
  t?: number[]
  o?: number[]
  h?: number[]
  l?: number[]
  c?: number[]
  v?: number[]
}

interface QuoteResponse {
  c: number
  pc: number
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * Live US equities via [Finnhub](https://finnhub.io/) (free tier: register for API key).
 * Calls are lightly throttled to stay under typical rate limits.
 */
export class FinnhubMarketDataProvider implements MarketDataProvider {
  private readonly apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  private lastFetch = 0

  private async throttle(): Promise<void> {
    const minGap = 220
    const now = Date.now()
    const wait = Math.max(0, minGap - (now - this.lastFetch))
    if (wait > 0) await sleep(wait)
    this.lastFetch = Date.now()
  }

  private async getJson<T>(url: string): Promise<T> {
    await this.throttle()
    const res = await fetch(url)
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Market data HTTP ${res.status}: ${body.slice(0, 200)}`)
    }
    return res.json() as Promise<T>
  }

  async getDailyBars(symbol: string): Promise<OHLCV[]> {
    const sym = symbol.toUpperCase().trim()
    const to = Math.floor(Date.now() / 1000)
    const from = to - 86400 * 800

    const url = `${BASE}/stock/candle?symbol=${encodeURIComponent(sym)}&resolution=D&from=${from}&to=${to}&token=${encodeURIComponent(this.apiKey)}`
    const j = await this.getJson<CandleResponse>(url)

    if (j.s !== 'ok' || !j.t?.length) {
      throw new Error(
        j.s === 'no_data'
          ? `No daily history for ${sym} (check symbol / exchange).`
          : `Finnhub error for ${sym}: ${j.s}`,
      )
    }

    const out: OHLCV[] = []
    for (let i = 0; i < j.t.length; i++) {
      out.push({
        t: j.t[i]! * 1000,
        o: j.o![i]!,
        h: j.h![i]!,
        l: j.l![i]!,
        c: j.c![i]!,
        v: j.v![i]!,
      })
    }
    return out
  }

  async getLastPrice(symbol: string): Promise<number> {
    const q = await this.getQuote(symbol)
    return q.last
  }

  async getQuote(symbol: string): Promise<MarketQuote> {
    const sym = symbol.toUpperCase().trim()
    const url = `${BASE}/quote?symbol=${encodeURIComponent(sym)}&token=${encodeURIComponent(this.apiKey)}`
    const q = await this.getJson<QuoteResponse>(url)
    const last = q.c > 0 ? q.c : q.pc
    if (!last || last <= 0) {
      throw new Error(`No live quote for ${sym}`)
    }
    return {
      last,
      previousClose: q.pc > 0 ? q.pc : undefined,
    }
  }
}
