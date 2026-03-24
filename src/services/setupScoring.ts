import type {
  MarketTrend,
  MorningScoreBreakdown,
  Regime,
  StrategyKind,
  TrendArrow,
} from '../domain/types'

/** Long-only: SPY/QQQ trend vs daily 20 EMA (from market bias). */
export type MarketAlignmentInput = {
  marketTrend: MarketTrend
  regime: Regime
  spyTrend: TrendArrow
  qqqTrend: TrendArrow
}

export type BreakoutQualityInput = {
  /** max(0, (lastClose - breakoutLevel) / breakoutLevel) */
  extensionPct: number
  /** (entry − stop) / ATR(14) */
  riskAtr: number
  /** Price holding at/near the breakout level. */
  holdAtHigh: boolean
}

export type PullbackQualityInput = {
  /** Last 3-bar range / ATR */
  rangeAtr: number
  /** How deep into the band: (EMA9 − last) / EMA9 */
  depthToEma9: number
  /** Bullish continuation vs prior close. */
  reversalOk: boolean
}

export type OrbQualityInput = {
  /** Prior session (OR) range as fraction of prior close. */
  rangePct: number
  /** (entry − stop) / ATR(14) */
  riskAtrValue: number
  /** Relative volume ≥ 1.5 */
  volStrong: boolean
}

export type SetupQualityInput =
  | { kind: 'breakout_retest'; breakout: BreakoutQualityInput }
  | { kind: 'trend_pullback'; pullback: PullbackQualityInput }
  | { kind: 'orb_continuation'; orb: OrbQualityInput }

export type TrendQualityInput = {
  lastClose: number
  ema9: number
  ema20: number
  trendArrow: TrendArrow
  /** Last 5 closes (oldest → newest) for short-structure proxy when no intraday data. */
  recentCloses5: number[]
}

export type TradeSetupScoreBreakdown = MorningScoreBreakdown

/** Max 20 — long setup vs SPY/QQQ bias and regime. */
export function marketAlignmentScoreLong(m: MarketAlignmentInput): number {
  const spyUp = m.spyTrend === 'up'
  const qqqUp = m.qqqTrend === 'up'
  const bothAligned = m.marketTrend === 'bullish' || (spyUp && qqqUp)
  const mixed = (spyUp && !qqqUp) || (!spyUp && qqqUp)
  const hostile =
    m.marketTrend === 'bearish' && m.spyTrend === 'down' && m.qqqTrend === 'down'

  if (hostile) return 0
  if (bothAligned && m.regime === 'trend') return 20
  if (bothAligned && m.regime !== 'distribution') return 16
  if (m.marketTrend === 'neutral' || mixed) return 12
  if (m.marketTrend === 'bearish' || m.regime === 'distribution') return 8
  return 4
}

/** Max 20 — breakout retest structure. */
export function setupQualityScoreBreakout(b: BreakoutQualityInput): number {
  const { extensionPct, riskAtr, holdAtHigh } = b
  if (riskAtr > 4.5 || extensionPct > 0.09) return 0
  if (extensionPct <= 0.01 && riskAtr <= 1.45 && holdAtHigh) return 20
  if (extensionPct <= 0.016 && riskAtr <= 1.85) return 16
  if (extensionPct <= 0.026 && riskAtr <= 2.35) return 12
  if (extensionPct <= 0.04 && riskAtr <= 2.9) return 8
  return 4
}

/** Max 20 — trend pullback. */
export function setupQualityScorePullback(p: PullbackQualityInput): number {
  const { rangeAtr, depthToEma9, reversalOk } = p
  if (rangeAtr > 4.0 || depthToEma9 < -0.01) return 0
  if (depthToEma9 <= 0.018 && rangeAtr <= 1.35 && reversalOk) return 20
  if (depthToEma9 <= 0.03 && rangeAtr <= 1.7 && reversalOk) return 16
  if (depthToEma9 <= 0.045 && rangeAtr <= 2.25) return 12
  if (reversalOk && rangeAtr <= 2.9) return 8
  return 4
}

/** Max 20 — ORB continuation (daily proxy). */
export function setupQualityScoreOrb(o: OrbQualityInput): number {
  const { rangePct, riskAtrValue, volStrong } = o
  if (rangePct < 0.002 || riskAtrValue > 4.0) return 0
  if (rangePct >= 0.008 && riskAtrValue <= 1.65 && volStrong) return 20
  if (rangePct >= 0.0055 && riskAtrValue <= 2.0) return 16
  if (rangePct >= 0.0045 && riskAtrValue <= 2.5) return 12
  if (rangePct >= 0.0035 && riskAtrValue <= 3.1) return 8
  return 4
}

/** Router: max 20 by strategy kind. */
export function scoreSetupQuality(
  strategyKind: StrategyKind,
  q: SetupQualityInput,
): number {
  if (q.kind !== strategyKind) return 0
  if (q.kind === 'breakout_retest') return setupQualityScoreBreakout(q.breakout)
  if (q.kind === 'trend_pullback') return setupQualityScorePullback(q.pullback)
  return setupQualityScoreOrb(q.orb)
}

/** Max 15 */
export function relativeVolumeScore(relVol: number): number {
  if (relVol >= 2.0) return 15
  if (relVol >= 1.5) return 12
  if (relVol >= 1.2) return 9
  if (relVol >= 1.0) return 6
  if (relVol >= 0.8) return 3
  return 0
}

function mean(xs: number[]): number {
  if (xs.length === 0) return 0
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

/** Max 15 — daily 20 EMA + 5-close proxy for “intraday” structure. */
export function trendQualityScore(t: TrendQualityInput): number {
  const { lastClose, ema9, ema20, trendArrow, recentCloses5 } = t
  const shortRef =
    recentCloses5.length >= 5 ? mean(recentCloses5) : lastClose
  const aboveDaily20 = lastClose > ema20
  const stack = ema9 > ema20 * 1.001
  const stackSoft = ema9 >= ema20 * 0.997
  const shortOk = lastClose >= shortRef * 0.997

  if (!aboveDaily20 && lastClose < ema20 * 0.995) return 0
  if (!aboveDaily20 && trendArrow === 'down') return 0
  if (stack && trendArrow === 'up' && shortOk) return 15
  if (stackSoft && shortOk) return 12
  if (aboveDaily20 && (trendArrow === 'up' || shortOk)) return 9
  if (trendArrow === 'flat' || Math.abs(ema9 - ema20) / ema20 < 0.006) return 6
  if (aboveDaily20 || shortOk) return 3
  return 0
}

/** Max 10 — proximity to key level (smaller pct = clearer). */
export function levelClarityScore(distanceToLevelPct: number): number {
  const d = Math.max(0, distanceToLevelPct)
  if (d <= 0.0025) return 10
  if (d <= 0.006) return 8
  if (d <= 0.012) return 6
  if (d <= 0.022) return 4
  if (d <= 0.04) return 2
  return 0
}

/** Max 10 */
export function rewardRiskScore(expectedR: number): number {
  if (expectedR >= 3.0) return 10
  if (expectedR >= 2.5) return 8
  if (expectedR >= 2.0) return 6
  if (expectedR >= 1.75) return 4
  if (expectedR >= 1.5) return 2
  return 0
}

/**
 * Minutes since local midnight in America/Los_Angeles for `d`.
 */
export function minutesSinceMidnightPacific(d: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(d)
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0')
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0')
  return hour * 60 + minute
}

/**
 * Max 10 — 6:00–7:30 AM PT execution window.
 * @param minutesSinceMidnightPT 0–1439 from {@link minutesSinceMidnightPacific}
 */
export function executionFitScoreFromMinutesPT(
  minutesSinceMidnightPT: number,
): number {
  const m = minutesSinceMidnightPT
  const winStart = 6 * 60
  const winEnd = 7 * 60 + 30
  if (m >= winStart && m <= winEnd) return 10
  if ((m >= 5 * 60 + 30 && m < winStart) || (m > winEnd && m <= 8 * 60 + 30))
    return 8
  if ((m >= 5 * 60 && m < 5 * 60 + 30) || (m > 8 * 60 + 30 && m <= 9 * 60 + 30))
    return 6
  if ((m >= 4 * 60 + 30 && m < 5 * 60) || (m > 9 * 60 + 30 && m <= 11 * 60))
    return 4
  if ((m >= 4 * 60 && m < 4 * 60 + 30) || (m > 11 * 60 && m <= 16 * 60))
    return 2
  return 0
}

export function executionFitScore(now: Date): number {
  return executionFitScoreFromMinutesPT(minutesSinceMidnightPacific(now))
}

export function interpretTradeSetupScore(
  score: number,
): 'A' | 'B' | 'watch' | 'weak' | 'ignore' {
  if (score >= 85) return 'A'
  if (score >= 75) return 'B'
  if (score >= 65) return 'watch'
  if (score >= 55) return 'weak'
  return 'ignore'
}

export type FullTradeSetupScoreInput = {
  market: MarketAlignmentInput
  strategyKind: StrategyKind
  setupQuality: SetupQualityInput
  relVolume: number
  trend: TrendQualityInput
  /** Distance from last to reference level (e.g. near high), as positive fraction. */
  levelDistancePct: number
  expectedR: number
  now: Date
}

export function tradeSetupScoreBreakdown(
  input: FullTradeSetupScoreInput,
): TradeSetupScoreBreakdown {
  const marketAlignmentScore = marketAlignmentScoreLong(input.market)
  const setupQualityScore = scoreSetupQuality(
    input.strategyKind,
    input.setupQuality,
  )
  const relativeVolumeScore_ = relativeVolumeScore(input.relVolume)
  const trendQualityScore_ = trendQualityScore(input.trend)
  const levelClarityScore_ = levelClarityScore(input.levelDistancePct)
  const rewardRiskScore_ = rewardRiskScore(input.expectedR)
  const executionFitScore_ = executionFitScore(input.now)

  return {
    marketAlignmentScore,
    setupQualityScore,
    relativeVolumeScore: relativeVolumeScore_,
    trendQualityScore: trendQualityScore_,
    levelClarityScore: levelClarityScore_,
    rewardRiskScore: rewardRiskScore_,
    executionFitScore: executionFitScore_,
  }
}

export function totalTradeSetupScore(input: FullTradeSetupScoreInput): number {
  const b = tradeSetupScoreBreakdown(input)
  const sum =
    b.marketAlignmentScore +
    b.setupQualityScore +
    b.relativeVolumeScore +
    b.trendQualityScore +
    b.levelClarityScore +
    b.rewardRiskScore +
    b.executionFitScore
  return Math.min(100, Math.round(sum * 10) / 10)
}
