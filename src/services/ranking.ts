import type { MarketBiasResult, RankedSetup, ScannerCandidate } from '../domain/types'

function trendScore(arrow: ScannerCandidate['trendArrow']): number {
  if (arrow === 'up') return 1
  if (arrow === 'down') return 0
  return 0.5
}

function biasAlignment(
  bias: MarketBiasResult,
  candidate: ScannerCandidate,
): number {
  if (bias.marketTrend === 'bullish' && candidate.trendArrow === 'up') return 1
  if (bias.marketTrend === 'bearish' && candidate.trendArrow === 'down')
    return 0.6
  if (bias.marketTrend === 'neutral') return 0.5
  if (
    bias.marketTrend === 'bullish' &&
    candidate.strategyKind === 'trend_pullback'
  )
    return 0.85
  return 0.35
}

function levelClarity(candidate: ScannerCandidate): number {
  const n = candidate.nearResistancePct
  return Math.max(0, 1 - Math.min(n / 0.05, 1))
}

/**
 * Score 0–100, higher is better. Deterministic (legacy helper — morning prep uses strategyScore).
 */
export function scoreCandidate(
  candidate: ScannerCandidate,
  bias: MarketBiasResult,
): number {
  const vol = Math.min(candidate.relVolume / 2, 1)
  const align = biasAlignment(bias, candidate)
  const clarity = levelClarity(candidate)
  const t = trendScore(candidate.trendArrow)
  const raw = 0.3 * align + 0.25 * vol + 0.2 * clarity + 0.25 * t
  return Math.round(raw * 1000) / 10
}

export function rankAllCandidates(
  candidates: ScannerCandidate[],
  bias: MarketBiasResult,
): RankedSetup[] {
  const ranked = candidates.map((c) => ({
    ...c,
    score: scoreCandidate(c, bias),
  }))
  ranked.sort((a, b) => b.score - a.score)
  return ranked
}

export function rankCandidates(
  candidates: ScannerCandidate[],
  bias: MarketBiasResult,
  topN = 3,
): RankedSetup[] {
  return rankAllCandidates(candidates, bias).slice(0, topN)
}
