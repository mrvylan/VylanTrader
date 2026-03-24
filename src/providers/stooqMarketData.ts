import type { OHLCV } from '../domain/types'
import type { MarketDataProvider, MarketQuote } from './types'

/**
 * Stooq daily CSV (no API key). Browsers block direct CORS to stooq.com, so this
 * only works when `vite.config.ts` proxies `/stooq-proxy` → `https://stooq.com` (dev server).
 */
export class StooqMarketDataProvider implements MarketDataProvider {
  async getDailyBars(symbol: string): Promise<OHLCV[]> {
    if (!import.meta.env.DEV) {
      throw new Error(
        'Stooq is only available in dev (CORS). Add VITE_ALPHA_VANTAGE_API_KEY for production backup.',
      )
    }
    const raw = symbol.toLowerCase().trim()
    const stooqSym = raw.includes('.') ? raw : `${raw}.us`
    const url = `/stooq-proxy/q/d/l/?s=${encodeURIComponent(stooqSym)}&i=d`
    const res = await fetch(url)
    if (!res.ok) {
      throw new Error(`Stooq HTTP ${res.status}`)
    }
    const text = await res.text()
    if (/exceeded the daily hits limit/i.test(text)) {
      throw new Error(
        'Stooq daily history rate-limited (Exceeded the daily hits limit). Try again later or switch to Alpha Vantage / mock data.',
      )
    }
    return parseStooqDailyCsv(text)
  }

  async getLastPrice(symbol: string): Promise<number> {
    const bars = await this.getDailyBars(symbol)
    const last = bars[bars.length - 1]
    if (!last?.c || last.c <= 0) throw new Error(`No Stooq price for ${symbol}`)
    return last.c
  }

  async getQuote(symbol: string): Promise<MarketQuote> {
    const bars = await this.getDailyBars(symbol)
    const n = bars.length
    if (n === 0) throw new Error(`No Stooq bars for ${symbol}`)
    const lastBar = bars[n - 1]!
    const prevBar = bars[n - 2]
    return {
      last: lastBar.c,
      previousClose: prevBar?.c,
      volume: lastBar.v,
    }
  }
}

function parseStooqDailyCsv(text: string): OHLCV[] {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length < 2) return []
  const header = lines[0]!.toLowerCase().split(',').map((p) => p.trim())
  const idx = {
    date: header.indexOf('date'),
    open: header.indexOf('open'),
    high: header.indexOf('high'),
    low: header.indexOf('low'),
    close: header.indexOf('close'),
    volume: header.indexOf('volume'),
  }
  const hasHeader =
    idx.date >= 0 &&
    idx.open >= 0 &&
    idx.high >= 0 &&
    idx.low >= 0 &&
    idx.close >= 0
  const out: OHLCV[] = []
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i]!.split(',')
    if (parts.length < 5) continue
    const date = hasHeader ? parts[idx.date] : parts[0]
    const o = hasHeader ? parts[idx.open] : parts[1]
    const h = hasHeader ? parts[idx.high] : parts[2]
    const l = hasHeader ? parts[idx.low] : parts[3]
    const c = hasHeader ? parts[idx.close] : parts[4]
    const v =
      hasHeader && idx.volume >= 0
        ? parts[idx.volume]
        : parts.length >= 6
          ? parts[5]
          : undefined
    if (!date) continue
    const t = new Date(date! + 'T12:00:00Z').getTime()
    const open = Number(o)
    const high = Number(h)
    const low = Number(l)
    const close = Number(c)
    const volume = v != null && v !== '' ? Number(v) : 0
    if (
      !Number.isFinite(t) ||
      !Number.isFinite(open) ||
      !Number.isFinite(high) ||
      !Number.isFinite(low) ||
      !Number.isFinite(close)
    ) {
      continue
    }
    out.push({
      t,
      o: open,
      h: high,
      l: low,
      c: close,
      v: Number.isFinite(volume) ? volume : 0,
    })
  }
  out.sort((a, b) => a.t - b.t)
  return out
}
