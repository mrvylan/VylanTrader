const KEY = 'trade-ui-x-feed-load-enabled'

/** Default on so existing users keep current behavior; set off in dev to skip X API. */
export function loadXFeedLoadEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) !== '0'
  } catch {
    return true
  }
}

export function saveXFeedLoadEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(KEY, enabled ? '1' : '0')
  } catch {
    /* ignore */
  }
}
