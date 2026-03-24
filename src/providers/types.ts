import type { OHLCV } from '../domain/types'

export type IntradayTimeframe = '1min' | '5min'

/** Snapshot for last / prior session / volume when available. */
export interface MarketQuote {
  last: number
  previousClose?: number
  volume?: number
}

/**
 * Pluggable market data. Implement `getQuote` for richer UI; intraday series can
 * be added later as optional methods on a widened interface.
 */
export interface MarketDataProvider {
  getDailyBars(symbol: string): Promise<OHLCV[]>
  /** Optional intraday series (current-session setup detection). */
  getIntradayBars?: (
    symbol: string,
    timeframe: IntradayTimeframe,
  ) => Promise<OHLCV[]>
  /** Last trade or close for live P/L simulation. */
  getLastPrice(symbol: string): Promise<number>
  /** Quote snapshot (defaults to last price if vendor has no extra fields). */
  getQuote(symbol: string): Promise<MarketQuote>
}
