import { AlphaVantageMarketDataProvider } from './alphaVantageMarketData'
import { FinnhubMarketDataProvider } from './finnhubMarketData'
import { LayeredMarketDataProvider } from './layeredMarketData'
import { MockMarketDataProvider } from './mockMarketData'
import { StooqMarketDataProvider } from './stooqMarketData'
import {
  PolygonMarketDataProvider,
  PolygonWithMockFallbackMarketDataProvider,
} from './polygonMarketData'
import type { MarketDataProvider } from './types'

export type MarketDataSource =
  | 'mock'
  | 'massive'
  | 'polygon'
  | 'finnhub'
  | 'alphavantage'
  | 'layered'
  | 'layered_dev'

/**
 * - `VITE_FINNHUB_API_KEY` — quotes often work; **daily candles frequently 403 on free tier**.
 * - `VITE_ALPHA_VANTAGE_API_KEY` — optional backup (works in browser); get a free key at alphavantage.co.
 * - `VITE_MARKET_DATA=massive` (or `polygon`) uses server-side Massive/Polygon endpoints.
 * - In **dev only**, if you have Finnhub but no AV key, **Stooq** is used as backup via Vite proxy (no key).
 * - `VITE_MARKET_DATA=mock` forces mock data.
 *
 * `VITE_*` secrets are embedded in the client bundle; use a backend proxy for production if needed.
 */
export function createDefaultMarketDataProvider(): MarketDataProvider {
  const mode = (import.meta.env.VITE_MARKET_DATA ?? '').toLowerCase()
  const fh = (import.meta.env.VITE_FINNHUB_API_KEY ?? '').trim()
  const av = (import.meta.env.VITE_ALPHA_VANTAGE_API_KEY ?? '').trim()

  if (mode === 'mock') {
    return new MockMarketDataProvider()
  }

  /**
   * Force a specific provider (useful when one provider blocks historical candles).
   * If the requested key is missing, fall back to the other key (or mock).
   */
  if (mode === 'finnhub') {
    if (fh) return new FinnhubMarketDataProvider(fh)
    if (av) return new AlphaVantageMarketDataProvider(av)
    return new MockMarketDataProvider()
  }

  if (mode === 'alphavantage') {
    if (av) return new AlphaVantageMarketDataProvider(av)
    if (fh && import.meta.env.DEV) {
      // Dev: keep a deterministic fallback so dev UI still works.
      return new LayeredMarketDataProvider(
        new FinnhubMarketDataProvider(fh),
        new StooqMarketDataProvider(),
      )
    }
    return new MockMarketDataProvider()
  }

  if (mode === 'massive' || mode === 'polygon') {
    const polygon = new PolygonMarketDataProvider()
    return new PolygonWithMockFallbackMarketDataProvider(
      polygon,
      new MockMarketDataProvider(),
    )
  }

  if (mode === 'layered') {
    if (fh && av) {
      return new LayeredMarketDataProvider(
        new FinnhubMarketDataProvider(fh),
        new AlphaVantageMarketDataProvider(av),
      )
    }
    // If only one key is present, pick the available one.
    if (fh) return new FinnhubMarketDataProvider(fh)
    if (av) return new AlphaVantageMarketDataProvider(av)
    return new MockMarketDataProvider()
  }

  if (mode === 'layered_dev') {
    if (fh && !av) {
      return new LayeredMarketDataProvider(
        new FinnhubMarketDataProvider(fh),
        new StooqMarketDataProvider(),
      )
    }
    if (fh && av) {
      return new LayeredMarketDataProvider(
        new FinnhubMarketDataProvider(fh),
        new AlphaVantageMarketDataProvider(av),
      )
    }
    return new MockMarketDataProvider()
  }

  if (fh) {
    const finn = new FinnhubMarketDataProvider(fh)
    if (av) {
      return new LayeredMarketDataProvider(
        finn,
        new AlphaVantageMarketDataProvider(av),
      )
    }
    if (import.meta.env.DEV) {
      // Finnhub daily candles frequently 403 on free tier; in dev we try Stooq,
      // and if Stooq rate-limits we keep the app usable by falling back to mock.
      return new LayeredMarketDataProvider(
        finn,
        new LayeredMarketDataProvider(
          new StooqMarketDataProvider(),
          new MockMarketDataProvider(),
        ),
      )
    }
    // Outside dev, Stooq requires a Vite proxy and fails without AV.
    // Fall back to mock so prep still produces scan candidates.
    return new LayeredMarketDataProvider(finn, new MockMarketDataProvider())
  }

  if (av) {
    return new AlphaVantageMarketDataProvider(av)
  }

  return new MockMarketDataProvider()
}

export function getMarketDataSourceLabel(): MarketDataSource {
  const mode = (import.meta.env.VITE_MARKET_DATA ?? '').toLowerCase()
  const fh = (import.meta.env.VITE_FINNHUB_API_KEY ?? '').trim()
  const av = (import.meta.env.VITE_ALPHA_VANTAGE_API_KEY ?? '').trim()

  if (mode === 'mock') return 'mock'
  if (mode === 'massive') return 'massive'
  if (mode === 'polygon') return 'polygon'
  if (mode === 'finnhub') return 'finnhub'
  if (mode === 'alphavantage') return 'alphavantage'
  if (mode === 'layered') return fh && av ? 'layered' : 'layered'
  if (mode === 'layered_dev') return 'layered_dev'

  // Heuristic (when not forcing).
  if (fh && av) return 'layered'
  if (fh && import.meta.env.DEV && !av) return 'layered_dev'
  if (fh) return 'finnhub'
  if (av) return 'alphavantage'
  return 'mock'
}
