import type {
  MarketTrend,
  OHLCV,
  RankedSetup,
  TradePlan,
  UserSettings,
} from '../domain/types'
import { atr, closes, recentHighLow } from './indicators'
import { strategyKindLabel } from './strategyLabels'
import { roundRiskAmountDollars } from './tradePlanMoney'

/**
 * positionSize = floor(riskPerTrade / abs(entry - stop)) for directional trades.
 * Returns null if riskPerTrade <= 0 or entry == stop.
 */
export function sharesFromRisk(
  riskPerTrade: number,
  entry: number,
  stop: number,
): number | null {
  if (riskPerTrade <= 0 || entry === stop) return null
  const perShare = Math.abs(entry - stop)
  const raw = riskPerTrade / perShare
  const shares = Math.floor(raw)
  return shares > 0 ? shares : null
}

/**
 * Build plan: entry near level, stop from ATR / structure, target by R multiple.
 */
export type PlanFromSetupOptions = {
  /**
   * If true, use 1 share when risk-based sizing floors to 0 (wide stop vs small $ risk).
   * Morning prep keeps strict sizing; manual “Create plan” uses this so the plan appears.
   */
  allowUndersizedOneShare?: boolean
}

export function planFromSetup(
  setup: RankedSetup,
  bars: OHLCV[],
  settings: UserSettings,
  bias: MarketTrend,
  rMultiple = 2,
  id = 'plan',
  opts?: PlanFromSetupOptions,
): TradePlan | null {
  const c = closes(bars)
  if (c.length === 0) return null
  const lastClose = c[c.length - 1]!
  const a = atr(bars, 14) ?? lastClose * 0.02
  const hl = recentHighLow(bars, 10)

  let entry: number
  let stop: number

  if (setup.strategyKind === 'breakout_retest') {
    entry = setup.level * (1 + 0.001)
    stop = Math.min(setup.level * 0.985, lastClose - a * 1.25)
    if (hl) stop = Math.min(stop, hl.low * 0.998)
  } else if (setup.strategyKind === 'trend_pullback') {
    entry = Math.max(lastClose, setup.ema9 * 1.002)
    stop = Math.min(setup.ema20 * 0.988, hl?.low != null ? hl.low * 0.998 : setup.ema20 * 0.988)
  } else {
    entry = setup.level * (1 + 0.002)
    stop = (hl?.low ?? setup.ema20) * 0.988
  }

  if (entry <= stop) {
    stop = entry - Math.max(a, entry * 0.008)
  }

  const riskPerShare = entry - stop
  if (riskPerShare <= 0) return null

  const target = entry + riskPerShare * rMultiple
  const expectedR = (target - entry) / riskPerShare

  let shares = sharesFromRisk(settings.riskPerTrade, entry, stop) ?? 0
  let undersizedNote = ''
  if (shares <= 0 && opts?.allowUndersizedOneShare && riskPerShare > 0) {
    shares = 1
    undersizedNote =
      ' · 1 sh: risk $ setting floors to 0 at this stop — raise risk or tighten stop'
  }
  if (shares <= 0) return null

  const riskAmount = roundRiskAmountDollars(shares, riskPerShare)

  return {
    id,
    ticker: setup.ticker,
    setupKind: setup.strategyKind,
    setupType: strategyKindLabel(setup.strategyKind),
    bias,
    entry,
    stop,
    target,
    positionSize: shares,
    riskAmount,
    riskPerShare,
    rMultiple,
    expectedR: Math.round(expectedR * 100) / 100,
    status: 'watching',
    notes: `Score ${setup.score.toFixed(1)} · Rel vol ${setup.relVolume.toFixed(2)}×${undersizedNote}`,
    score: setup.score,
    createdAt: new Date().toISOString(),
    alertEnabled: true,
  }
}
