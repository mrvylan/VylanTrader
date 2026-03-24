import type { TradePlan } from '../domain/types'

/** Canonical rounding for max loss at plan prices (engine, planner, demo, daily-plan risk). */
export function roundRiskAmountDollars(
  positionSize: number,
  riskPerShare: number,
): number {
  if (positionSize <= 0 || riskPerShare <= 0) return 0
  return Math.round(positionSize * riskPerShare * 100) / 100
}

/** Effective $ risk per share (stop distance for longs). */
export function planRiskPerShare(plan: TradePlan): number {
  const fromBar = plan.entry - plan.stop
  const stored = plan.riskPerShare
  if (stored > 0) return stored
  return fromBar > 0 ? fromBar : 0
}

/** Max loss $ if stopped: shares × (entry − stop). */
export function planMaxRiskDollars(plan: TradePlan): number {
  return roundRiskAmountDollars(plan.positionSize, planRiskPerShare(plan))
}

/** Capital at entry: shares × entry. */
export function planNotionalAtEntry(plan: TradePlan): number {
  if (plan.positionSize <= 0) return 0
  return Math.round(plan.entry * plan.positionSize * 100) / 100
}

/** Unrealized $ to target at plan prices: shares × (target − entry). */
export function planRewardToTargetDollars(plan: TradePlan): number {
  if (plan.positionSize <= 0) return 0
  const perShare = plan.target - plan.entry
  return Math.round(plan.positionSize * perShare * 100) / 100
}
