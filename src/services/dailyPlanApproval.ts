import type { DailyPlan, ScanRejectionReason, TradePlan } from '../domain/types'
import { planMaxRiskDollars } from './tradePlanMoney'
import { planMeetsMorningQualityGate } from './tradePlanQuality'
import { MIN_EXPECTED_R, MIN_MORNING_SCORE } from './strategyScore'

function plansInDailyPlan(
  dailyPlan: DailyPlan | null,
  tradePlans: TradePlan[],
): TradePlan[] {
  if (!dailyPlan) return []
  const ids = new Set(dailyPlan.approvedPlans)
  return tradePlans.filter(
    (p) =>
      ids.has(p.id) && (p.status === 'approved' || p.status === 'entered'),
  )
}

/** Slots used: approved (queued) + entered (live). */
export function countTradeSlotsUsed(
  tradePlans: TradePlan[],
  dailyPlan?: DailyPlan | null,
): number {
  const scoped = dailyPlan ? plansInDailyPlan(dailyPlan, tradePlans) : tradePlans
  return scoped.filter((p) => p.status === 'approved' || p.status === 'entered')
    .length
}

/** Sum of risk $ for approved or entered plans (committed capital at risk). */
export function committedPlanRisk(
  tradePlans: TradePlan[],
  dailyPlan?: DailyPlan | null,
): number {
  const scoped = dailyPlan ? plansInDailyPlan(dailyPlan, tradePlans) : tradePlans
  return scoped
    .filter((p) => p.status === 'approved' || p.status === 'entered')
    .reduce((s, p) => s + planMaxRiskDollars(p), 0)
}

export function canApproveMoreTrades(
  tradePlans: TradePlan[],
  dailyPlan: DailyPlan,
  maxTrades: number,
): boolean {
  return countTradeSlotsUsed(tradePlans, dailyPlan) < maxTrades
}

/** If we approve `plan`, would committed risk exceed cap? */
export function wouldExceedDailyLoss(
  tradePlans: TradePlan[],
  dailyPlan: DailyPlan,
  plan: TradePlan,
  maxDailyLoss: number,
): boolean {
  const others = committedPlanRisk(tradePlans, dailyPlan)
  return others + planMaxRiskDollars(plan) > maxDailyLoss
}

export type ApprovalBlockReason =
  | 'none'
  | 'max_trades'
  | 'risk_cap'
  | 'closed'
  | 'quality'

export function whyCannotApprove(
  dailyPlan: DailyPlan | null,
  tradePlans: TradePlan[],
  plan: TradePlan,
): ApprovalBlockReason {
  if (!dailyPlan || dailyPlan.status === 'closed') return 'closed'
  if (!planMeetsMorningQualityGate(plan)) return 'quality'
  if (!canApproveMoreTrades(tradePlans, dailyPlan, dailyPlan.maxTrades))
    return 'max_trades'
  if (wouldExceedDailyLoss(tradePlans, dailyPlan, plan, dailyPlan.maxDailyLoss))
    return 'risk_cap'
  return 'none'
}

/**
 * Structured reasons when Approve is blocked (daily plan / slots / quality).
 * Separate from scanner gates; merge in UI when explaining “why not approvable”.
 */
export function approvalBlockingScanReasons(
  dailyPlan: DailyPlan | null,
  tradePlans: TradePlan[],
  plan: TradePlan | null,
): ScanRejectionReason[] {
  if (!plan) return []
  const w = whyCannotApprove(dailyPlan, tradePlans, plan)
  if (w === 'none' || w === 'closed') return []
  if (w === 'max_trades') return ['max_trades_reached']
  if (w === 'risk_cap') return ['daily_risk_cap_exceeded']
  const reasons: ScanRejectionReason[] = []
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
  if (!short && plan.entry <= plan.stop) reasons.push('entry_not_above_stop')
  if (!short && plan.target <= plan.entry) reasons.push('target_not_above_entry')
  if (short && plan.entry >= plan.stop) reasons.push('entry_not_above_stop')
  if (short && plan.target >= plan.entry) reasons.push('target_not_above_entry')
  if (plan.planOrigin !== 'manual_quotes' && score < MIN_MORNING_SCORE)
    reasons.push('score_below_threshold')
  if (er < MIN_EXPECTED_R) reasons.push('expected_r_below_minimum')
  if (plan.positionSize < 1) reasons.push('position_size_below_one')
  if (reasons.length === 0) reasons.push('morning_quality_not_met')
  return reasons
}
