import type { XFeedItem, XFeedTickerAggregate } from './xFeed'

export type XFeedFilterId =
  | 'all'
  | 'watchlist'
  | 'news'
  | 'traders'
  | 'education'
  | 'bullish'
  | 'bearish'

export function filterXFeedItems(
  items: XFeedItem[],
  filter: XFeedFilterId,
  watchlistUpper: string[],
): XFeedItem[] {
  if (filter === 'all') return items
  const wl = new Set(watchlistUpper.map((s) => s.trim().toUpperCase()).filter(Boolean))

  return items.filter((it) => {
    switch (filter) {
      case 'watchlist':
        return it.detectedTickers.some((t) => wl.has(t.toUpperCase()))
      case 'news':
        return it.sourceType === 'news'
      case 'traders':
        return it.sourceType === 'trader'
      case 'education':
        return it.sourceType === 'education'
      case 'bullish':
        return it.sentiment === 'bullish'
      case 'bearish':
        return it.sentiment === 'bearish'
      default:
        return true
    }
  })
}

export function tickerPostsFromFeed(
  items: XFeedItem[],
  ticker: string,
  limit = 8,
): XFeedItem[] {
  const sym = ticker.trim().toUpperCase()
  if (!sym) return []
  return items
    .filter((it) =>
      it.detectedTickers.some((t) => t.toUpperCase() === sym),
    )
    .slice(0, limit)
}

export function aggregateForTicker(
  ticker: string,
  aggregates: XFeedTickerAggregate[] | undefined,
): XFeedTickerAggregate | null {
  const sym = ticker.trim().toUpperCase()
  if (!sym || !aggregates?.length) return null
  return aggregates.find((a) => a.ticker.toUpperCase() === sym) ?? null
}
