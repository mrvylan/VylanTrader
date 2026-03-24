import type { OHLCV } from '../domain/types'
import type { MarketDataProvider, MarketQuote } from './types'

function shouldTryFallback(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  const m = err.message
  return (
    m.includes('403') ||
    m.includes('401') ||
    m.includes("don't have access") ||
    m.includes('429') ||
    // Stooq daily endpoint is often rate-limited via HTML/text body.
    m.toLowerCase().includes('daily hits limit') ||
    m.toLowerCase().includes('rate-limited') ||
    m.toLowerCase().includes('exceeded the daily hits limit')
  )
}

/**
 * Try `primary` first; on 403/401/429 use `fallback` (e.g. Finnhub → Alpha Vantage / Stooq).
 */
export class LayeredMarketDataProvider implements MarketDataProvider {
  private readonly primary: MarketDataProvider
  private readonly fallback: MarketDataProvider

  constructor(primary: MarketDataProvider, fallback: MarketDataProvider) {
    this.primary = primary
    this.fallback = fallback
  }

  async getDailyBars(symbol: string): Promise<OHLCV[]> {
    try {
      return await this.primary.getDailyBars(symbol)
    } catch (e) {
      if (shouldTryFallback(e)) {
        return this.fallback.getDailyBars(symbol)
      }
      throw e
    }
  }

  async getLastPrice(symbol: string): Promise<number> {
    try {
      return await this.primary.getLastPrice(symbol)
    } catch (e) {
      if (shouldTryFallback(e)) {
        return this.fallback.getLastPrice(symbol)
      }
      throw e
    }
  }

  async getQuote(symbol: string): Promise<MarketQuote> {
    try {
      return await this.primary.getQuote(symbol)
    } catch (e) {
      if (shouldTryFallback(e)) {
        return this.fallback.getQuote(symbol)
      }
      throw e
    }
  }
}
