import type { WatchlistTableRow } from '../domain/types'

/**
 * Watchlist table: short header tooltips + copy for the in-panel column guide.
 */
export type WatchlistColumnHelpKey =
  | 'ticker'
  | 'trend'
  | 'setup'
  | 'level'
  | 'relVol'
  | 'score'
  | 'status'

export interface WatchlistColumnHelp {
  key: WatchlistColumnHelpKey
  /** Table header label (must match column). */
  label: string
  /** Native tooltip on the column header. */
  tooltip: string
  /** Longer explanation in the help panel. */
  description: string
}

export const WATCHLIST_COLUMN_HELP: WatchlistColumnHelp[] = [
  {
    key: 'ticker',
    label: 'Ticker',
    tooltip: 'Symbol from your saved watchlist (max 10 names).',
    description:
      'The stock or ETF ticker. Click a row to open setup detail when scan data exists.',
  },
  {
    key: 'trend',
    label: 'Trend',
    tooltip: 'Last close vs ~20-day EMA: ↑ up, → flat, ↓ down.',
    description:
      'A simple daily structure read: where the last close sits relative to the 20-period exponential moving average. It is not a trade signal by itself—only context next to the setup type.',
  },
  {
    key: 'setup',
    label: 'Setup',
    tooltip: 'Scanner pattern name, or universe/insufficient-data marker when filtered.',
    description:
      'The highest-scoring morning pattern among breakout retest, trend pullback, and opening-range continuation. “Universe filter” means the symbol failed hard liquidity/price checks. “Insufficient data” means daily history is below the minimum needed to run 20-day logic. An em dash means no pattern matched.',
  },
  {
    key: 'level',
    label: 'Level',
    tooltip: 'Reference price for this setup (high, EMA9, or prior-bar high).',
    description:
      'The structural anchor price for the chosen setup: typically the 20-day high for a breakout retest, EMA9 for a trend pullback, or the prior session’s high for the OR continuation proxy. Use it to see what the engine is leaning on.',
  },
  {
    key: 'relVol',
    label: 'Rel vol',
    tooltip: 'Last bar volume ÷ 20-day average volume (shown as ×).',
    description:
      'Relative volume compares the most recent session’s volume to the average of the prior 20 daily bars (the current bar is not included in that average). Values above 1.0 mean more participation than a typical day.',
  },
  {
    key: 'score',
    label: 'Score',
    tooltip: '0–100 ranking score from market, setup, vol, trend, level, R:R, and execution window.',
    description:
      'A capped 0–100 ranking rubric: market alignment (20), setup quality (20), relative volume (15), trend quality (15), level clarity (10), reward-to-risk (10), and execution fit (10). Bands: 85–100 A, 75–84 B, 65–74 watch, 55–64 weak, below 55 ignore. Approval still requires strict score, expected R, sizing, and risk-cap gates.',
  },
  {
    key: 'status',
    label: 'Status',
    tooltip: 'Scan outcome: NO SETUP, WATCHING (visible but may fail gates), or READY (passes scan gates).',
    description:
      'NO SETUP: filtered out or no qualifying pattern. WATCHING: a candidate exists but may fail score, expected R, size, tape, or regime checks—you still need a daily plan and Approve for execution. READY: passes the morning quality gates from the scan; you still explicitly approve in the daily plan when you want to commit.',
  },
]

/** Per-row status badge tooltips (status column body cells). */
export const WATCHLIST_STATUS_CELL_TOOLTIPS: Record<
  WatchlistTableRow['status'],
  string
> = {
  no_setup:
    'No morning edge setup, or symbol outside scan universe (e.g. price below $1 or low 20d avg volume).',
  watching:
    'Pattern surfaced; may still fail score, expected R, size, or tape/regime gates until approved.',
  ready:
    'Passes morning scan gates; add to daily plan and Approve when you want to commit capital.',
}
