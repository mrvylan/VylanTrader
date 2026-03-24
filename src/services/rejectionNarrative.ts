import type {
  MorningScoreBreakdown,
  PlanRejectionDetail,
  ScanRejectionReason,
} from '../domain/types'
import { MIN_EXPECTED_R, MIN_MORNING_SCORE } from './strategyScore'

function uniq<T>(xs: T[]): T[] {
  return [...new Set(xs)]
}

/**
 * One human-readable line per rejection code (educational copy).
 */
export function explainScanRejectionReasons(
  reasons: ScanRejectionReason[],
  d: PlanRejectionDetail,
): string[] {
  const lines: string[] = []
  const rs = new Set(reasons)

  if (rs.has('score_below_threshold')) {
    const a = d.actualScore
    lines.push(
      a != null
        ? `Score is ${a.toFixed(1)}, below the required ${d.requiredScore ?? MIN_MORNING_SCORE}.`
        : `Total morning score is below the required ${d.requiredScore ?? MIN_MORNING_SCORE}.`,
    )
  }
  if (rs.has('expected_r_below_minimum')) {
    const a = d.actualExpectedR
    lines.push(
      a != null
        ? `Expected R is ${a.toFixed(2)}, below the required ${d.requiredExpectedR ?? MIN_EXPECTED_R}.`
        : `Reward-to-risk at the plan is below the required ${d.requiredExpectedR ?? MIN_EXPECTED_R}.`,
    )
  }
  if (rs.has('stop_too_wide') && rs.has('position_size_below_one')) {
    const bud = d.riskBudgetPerTrade
    const rps = d.riskPerShare
    lines.push(
      bud != null && rps != null
        ? `Position size is 0 because the stop is too wide for your $${bud} risk limit (about $${rps.toFixed(2)}/share).`
        : 'Position size is 0 — stop distance is too wide for your risk-per-trade budget.',
    )
  } else {
    if (rs.has('position_size_below_one')) {
      lines.push(
        `Position size is ${d.positionSize ?? 0} share(s); at least ${d.requiredPositionSize ?? 1} is required for a sized trade.`,
      )
    }
    if (rs.has('stop_too_wide')) {
      const rps = d.riskPerShare
      const bud = d.riskBudgetPerTrade
      lines.push(
        rps != null && bud != null
          ? `Stop is wide: risk about $${rps.toFixed(2)}/share exceeds what your $${bud} per-trade budget can size to 1+ shares.`
          : 'Stop distance is too wide for your current risk-per-trade setting.',
      )
    }
  }
  if (rs.has('entry_not_above_stop')) {
    lines.push('Long geometry requires entry above stop; levels did not satisfy that.')
  }
  if (rs.has('target_not_above_entry')) {
    lines.push('Target must be above entry for this long plan; levels did not satisfy that.')
  }
  if (rs.has('market_not_aligned')) {
    lines.push('Tape bias is bearish or hostile for this long-focused playbook.')
  }
  if (rs.has('regime_not_supported')) {
    lines.push('Market regime weakens this setup (e.g. chop or distribution vs clean trend).')
  }
  if (rs.has('daily_risk_cap_exceeded')) {
    lines.push('Approving this plan would push committed risk over your daily loss cap.')
  }
  if (rs.has('max_trades_reached')) {
    lines.push('Daily trade slot limit is already used by approved or live trades.')
  }
  if (rs.has('morning_quality_not_met')) {
    lines.push('One or more morning quality checks (score, R, sizing, or geometry) did not pass.')
  }
  if (rs.has('no_clear_target')) {
    lines.push('Reward/risk bucket is weak — target distance vs stop does not read as a clear ≥2R plan.')
  }
  if (rs.has('level_not_clear')) {
    lines.push('Level clarity is weak — price is far from the reference level vs the scoring rubric.')
  }
  if (rs.has('earnings_too_close')) {
    lines.push('Earnings are too close to the session window for this setup.')
  }
  if (rs.has('price_below_minimum')) {
    const last = d.lastClose
    const min = d.minPrice
    lines.push(
      last != null && min != null
        ? `Last close is ${last.toFixed(2)} and must be above ${min.toFixed(2)} for the universe.`
        : 'Last close is below the universe minimum.',
    )
  }
  if (rs.has('average_volume_low')) {
    const avg = d.avg20DayVolume
    const min = d.minAvg20DayVolume
    lines.push(
      avg != null && min != null
        ? `Average 20-day volume is ${Math.round(avg).toLocaleString()} and must be above ${Math.round(min).toLocaleString()}.`
        : 'Average 20-day volume is below the universe minimum.',
    )
  }
  if (rs.has('insufficient_bar_history')) {
    const have = d.dailyBarsAvailable
    const need = d.requiredDailyBars
    lines.push(
      have != null && need != null
        ? `Only ${have} daily bars available; need at least ${need}.`
        : 'Not enough daily bars to run the 20-day pattern engine reliably.',
    )
  }
  if (rs.has('no_valid_pattern')) {
    lines.push('No breakout retest, trend pullback, or opening-range continuation matched today’s rules.')
  }
  if (rs.has('rel_vol_too_low')) {
    lines.push('Relative volume is below the 1.1× threshold used for continuation-style entries.')
  }

  if (lines.length === 0 && reasons.length > 0) {
    return reasons.map((r) => `Gate: ${r.replace(/_/g, ' ')}`)
  }
  return uniq(lines)
}

export function buildRejectionSuggestions(
  reasons: ScanRejectionReason[],
  _d: PlanRejectionDetail,
  breakdown: MorningScoreBreakdown | null,
): string[] {
  const out: string[] = []
  const rs = new Set(reasons)

  if (rs.has('position_size_below_one') || rs.has('stop_too_wide')) {
    out.push('Wait for a tighter pullback or structure so risk per share fits your budget.')
  }
  if (rs.has('score_below_threshold')) {
    out.push('Wait for stronger follow-through, cleaner level, or a better execution window to lift the score.')
    if (breakdown && breakdown.executionFitScore <= 1) {
      out.push('Execution-fit is low outside the morning window — rerun prep closer to the open if rules allow.')
    }
  }
  if (rs.has('expected_r_below_minimum') || rs.has('no_clear_target')) {
    out.push('A wider target or tighter stop (if structure allows) can improve expected R — only if it stays honest to the chart.')
  }
  if (rs.has('regime_not_supported') || rs.has('market_not_aligned')) {
    out.push('Skip or size down unless the broad market/regime improves for longs.')
  }
  if (rs.has('daily_risk_cap_exceeded')) {
    out.push('Free up risk capacity (unapprove or close trades) before approving another setup.')
  }
  if (rs.has('max_trades_reached')) {
    out.push('Close or unapprove a trade slot before adding another approval.')
  }
  if (rs.has('level_not_clear')) {
    out.push('Wait for price to work closer to the key level so the setup reads cleaner.')
  }
  if (rs.has('rel_vol_too_low')) {
    out.push('Consider passing until participation confirms with stronger relative volume.')
  }

  return uniq(out)
}

export function headlineForRejection(
  hasStructuralSetup: boolean,
  reasons: ScanRejectionReason[],
): string {
  if (!hasStructuralSetup) {
    if (reasons.some((r) => r === 'insufficient_bar_history')) {
      return 'Not enough data to scan this symbol.'
    }
    if (
      reasons.some((r) =>
        ['price_below_minimum', 'average_volume_low', 'earnings_too_close'].includes(
          r,
        ),
      )
    ) {
      return 'Symbol outside the scan universe.'
    }
    return 'No qualifying pattern on this history.'
  }
  return 'Setup detected, but not approvable right now.'
}
