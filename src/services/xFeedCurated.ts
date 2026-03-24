/** Curated X sources — keep in sync with `server/xFeedDefaults.mjs`. */

export const DEFAULT_CURATED_HANDLES = [
  'alphatrends',
  'traderstewie',
  'Qullamaggie',
  'markminervini',
  'unusual_whales',
  'DeItaone',
  'StockMKTNewz',
  'SMBcapital',
  'ChartGuys',
  'TradeTheNews',
  'MarketRebels',
] as const

export const MARKET_INDEX_TICKERS = ['SPY', 'QQQ', 'IWM', 'DIA'] as const

export const X_FEED_CATEGORIES = {
  technical: 'Technical / swing',
  news: 'News / context',
  education: 'Education / process',
} as const

export type XFeedCategoryKey = keyof typeof X_FEED_CATEGORIES
