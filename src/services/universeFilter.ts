import type {
  OHLCV,
  ScanRejectionReason,
  UniverseStatus,
} from '../domain/types'
import { closes } from './indicators'
import { earningsWithin48h } from './earningsGate'

function numberFromEnv(raw: string | undefined, fallback: number): number {
  const n = Number(raw ?? '')
  return Number.isFinite(n) && n > 0 ? n : fallback
}

const MIN_PRICE = Math.max(
  numberFromEnv(import.meta.env.VITE_UNIVERSE_MIN_PRICE, 1),
  1,
)
const MIN_AVG_VOL = Math.max(
  numberFromEnv(import.meta.env.VITE_UNIVERSE_MIN_AVG_VOL, 1_000_000),
  1_000_000,
)
export const VOL_LOOKBACK = Math.floor(
  numberFromEnv(import.meta.env.VITE_UNIVERSE_VOL_LOOKBACK, 20),
)

export type UniverseEvaluation = {
  status: UniverseStatus
  reasons: ScanRejectionReason[]
  metrics: {
    dailyBars: number
    requiredDailyBars: number
    minPrice: number
    minAvg20DayVolume: number
    lastClose?: number
    avg20DayVolume?: number
    earningsStatus: 'known' | 'unknown'
  }
}

export function evaluateUniverseFilter(
  ticker: string,
  bars: OHLCV[],
): UniverseEvaluation {
  const reasons: ScanRejectionReason[] = []
  const metrics: UniverseEvaluation['metrics'] = {
    dailyBars: bars.length,
    requiredDailyBars: VOL_LOOKBACK,
    minPrice: MIN_PRICE,
    minAvg20DayVolume: MIN_AVG_VOL,
    earningsStatus: 'unknown',
  }

  if (bars.length < VOL_LOOKBACK) {
    reasons.push('insufficient_bar_history')
    return { status: 'insufficient_data', reasons, metrics }
  }

  const c = closes(bars)
  const last = c[c.length - 1]
  metrics.lastClose = last
  if (last == null || !Number.isFinite(last)) {
    reasons.push('insufficient_bar_history')
    return { status: 'insufficient_data', reasons, metrics }
  }
  if (last <= MIN_PRICE) {
    reasons.push('price_below_minimum')
  }

  const slice = bars.slice(-VOL_LOOKBACK)
  const hasCompleteVol = slice.length === VOL_LOOKBACK
  const avgVol = hasCompleteVol
    ? slice.reduce((s, b) => s + b.v, 0) / slice.length
    : undefined
  metrics.avg20DayVolume = avgVol
  if (avgVol == null || !Number.isFinite(avgVol)) {
    reasons.push('insufficient_bar_history')
    return { status: 'insufficient_data', reasons, metrics }
  }
  if (avgVol <= MIN_AVG_VOL) {
    reasons.push('average_volume_low')
  }

  // Earnings source not wired; unknown should not hard-reject.
  const earningsKnown = false
  metrics.earningsStatus = earningsKnown ? 'known' : 'unknown'
  if (earningsKnown && earningsWithin48h(ticker)) {
    reasons.push('earnings_too_close')
  }

  return {
    status: reasons.length === 0 ? 'pass' : 'fail',
    reasons,
    metrics,
  }
}

/**
 * Reasons this symbol fails the scan universe (price, volume, earnings, history).
 */
export function getUniverseRejectionReasons(
  ticker: string,
  bars: OHLCV[],
): ScanRejectionReason[] {
  return evaluateUniverseFilter(ticker, bars).reasons
}

/**
 * Large-cap style liquidity & price gate for the morning swing universe.
 */
export function passesUniverseFilter(ticker: string, bars: OHLCV[]): boolean {
  return getUniverseRejectionReasons(ticker, bars).length === 0
}
