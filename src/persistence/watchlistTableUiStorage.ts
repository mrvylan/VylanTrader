const KEY = 'trade-ui-watchlist-table-visible'

/** Default hidden; enable in Settings to show the scan table again. */
export function loadWatchlistTableVisible(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function saveWatchlistTableVisible(visible: boolean): void {
  try {
    localStorage.setItem(KEY, visible ? '1' : '0')
  } catch {
    /* ignore */
  }
}
