import type { TradePlan } from '../domain/types'
import { MIN_EXPECTED_R, MIN_MORNING_SCORE } from './strategyScore'

export type MorningQualityThresholds = {
  minScore: number
  minExpectedR: number
}

export const DEFAULT_MORNING_QUALITY_THRESHOLDS: MorningQualityThresholds = {
  minScore: MIN_MORNING_SCORE,
  minExpectedR: MIN_EXPECTED_R,
}

/** Morning edge + structural gates for approval (or scan with optional thresholds). */
export function planMeetsMorningQualityGate(
  plan: TradePlan,
  thresholds: MorningQualityThresholds = DEFAULT_MORNING_QUALITY_THRESHOLDS,
): boolean {
  const score = plan.score ?? 0
  const short = plan.bias === 'bearish'
  const rps = plan.riskPerShare ?? Math.abs(plan.entry - plan.stop)
  const er =
    plan.expectedR ??
    (rps > 0
      ? short
        ? (plan.entry - plan.target) / rps
        : (plan.target - plan.entry) / rps
      : 0)
  if (plan.planOrigin !== 'manual_quotes' && score < thresholds.minScore)
    return false
  if (er < thresholds.minExpectedR) return false
  if (plan.positionSize < 1) return false
  if (!short && plan.entry <= plan.stop) return false
  if (!short && plan.target <= plan.entry) return false
  if (short && plan.entry >= plan.stop) return false
  if (short && plan.target >= plan.entry) return false
  return true
}
