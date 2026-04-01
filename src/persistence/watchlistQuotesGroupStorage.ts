const KEY = 'trade-ui-watchlist-quotes-groups-v1'

export type WatchlistQuoteGroup = 'active' | 'backBurner'

/** Per-ticker group for Watchlist quotes card (uppercase keys). */
export function loadWatchlistQuotesGroups(): Record<string, WatchlistQuoteGroup> {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const j = JSON.parse(raw) as unknown
    if (!j || typeof j !== 'object') return {}
    const out: Record<string, WatchlistQuoteGroup> = {}
    for (const [k, v] of Object.entries(j as Record<string, unknown>)) {
      const key = String(k).trim().toUpperCase()
      if (!key) continue
      if (v === 'backBurner' || v === 'back-burner') out[key] = 'backBurner'
      else if (v === 'active') out[key] = 'active'
    }
    return out
  } catch {
    return {}
  }
}

export function saveWatchlistQuotesGroups(
  groups: Record<string, WatchlistQuoteGroup>,
): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(groups))
  } catch {
    /* ignore */
  }
}
