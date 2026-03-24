import type { Position, UserSettings } from '../domain/types'
import { migratePositionRecord } from '../services/positionState'

const S_KEY = 'trade-ui-settings-v1'
const W_KEY = 'trade-ui-watchlist-v1'
const P_KEY = 'trade-ui-positions-v2'
const P_KEY_LEGACY = 'trade-ui-positions-v1'

export const DEFAULT_SETTINGS: UserSettings = {
  accountSize: 4_000,
  riskPerTrade: 40,
  dailyMaxLoss: 80,
  maxTradesPerDay: 2,
  alertSound: true,
  alertWebhookUrl: '',
}

export const DEFAULT_WATCHLIST = [
  'NVDA',
  'AMD',
  'META',
  'AAPL',
  'MSFT',
]

export function loadSettings(): UserSettings {
  try {
    const raw = localStorage.getItem(S_KEY)
    if (!raw) return { ...DEFAULT_SETTINGS }
    const p = JSON.parse(raw) as Partial<UserSettings>
    return { ...DEFAULT_SETTINGS, ...p }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(s: UserSettings): void {
  localStorage.setItem(S_KEY, JSON.stringify(s))
}

export function loadWatchlist(): string[] {
  try {
    const raw = localStorage.getItem(W_KEY)
    if (!raw) return [...DEFAULT_WATCHLIST]
    const p = JSON.parse(raw) as unknown
    if (!Array.isArray(p)) return [...DEFAULT_WATCHLIST]
    return p.map(String).filter(Boolean).slice(0, 10)
  } catch {
    return [...DEFAULT_WATCHLIST]
  }
}

export function saveWatchlist(w: string[]): void {
  localStorage.setItem(W_KEY, JSON.stringify(w.slice(0, 10)))
}

export function loadOpenPositions(): Position[] {
  try {
    let raw = localStorage.getItem(P_KEY)
    const usedLegacy = !raw
    if (!raw) {
      raw = localStorage.getItem(P_KEY_LEGACY)
    }
    if (!raw) return []
    const arr = JSON.parse(raw) as unknown[]
    if (!Array.isArray(arr)) return []
    const out: Position[] = []
    for (const item of arr) {
      const m = migratePositionRecord(item)
      if (m) out.push(m)
    }
    if (usedLegacy) {
      localStorage.removeItem(P_KEY_LEGACY)
      saveOpenPositions(out)
    }
    return out
  } catch {
    return []
  }
}

export function saveOpenPositions(p: Position[]): void {
  localStorage.setItem(P_KEY, JSON.stringify(p))
}
