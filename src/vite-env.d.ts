/// <reference types="vite/client" />

/**
 * Put `X_BEARER_TOKEN` / `X_FEED_HANDLES` in root `.env.local` next to `VITE_*`.
 * Vite only exposes `VITE_*` to the client; the Express feed server loads `X_*` via dotenv.
 * `X_FEED_PORT` (optional) aligns the dev proxy target with the feed server port.
 */

interface ImportMetaEnv {
  /** Finnhub API token (quotes; free tier often blocks historical candles → use AV or dev Stooq backup). */
  readonly VITE_FINNHUB_API_KEY?: string
  /** Alpha Vantage key — daily bars + prices from browser; good Finnhub backup. */
  readonly VITE_ALPHA_VANTAGE_API_KEY?: string
  /** `mock` forces synthetic data even if API keys exist. */
  readonly VITE_MARKET_DATA?:
    | 'mock'
    | 'massive'
    | 'polygon'
    | 'finnhub'
    | 'alphavantage'
    | 'layered'
    | 'layered_dev'
  /** Optional universe minimum close price gate override (default 1). */
  readonly VITE_UNIVERSE_MIN_PRICE?: string
  /** Optional universe 20D average volume gate override (default 1000000). */
  readonly VITE_UNIVERSE_MIN_AVG_VOL?: string
  /** Optional lookback for volume average (default 20). */
  readonly VITE_UNIVERSE_VOL_LOOKBACK?: string
  /** Optional absolute origin for X feed API when not using Vite dev proxy (e.g. production). */
  readonly VITE_X_FEED_BASE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
