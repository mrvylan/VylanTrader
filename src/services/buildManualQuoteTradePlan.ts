import type { MarketTrend, TradePlan } from '../domain/types'
import { roundRiskAmountDollars } from './tradePlanMoney'

const SETUP_TYPE = 'Manual · quotes'

/**
 * Build a watching trade plan from quote-table modal inputs (no scanner).
 * `planOrigin: 'manual_quotes'` tags plans created from the quotes UI.
 */
export function buildManualQuoteTradePlan(
  ticker: string,
  args: {
    entry: number
    stop: number
    target: number
    positionSize: number
    notes?: string
    bias: MarketTrend
  },
): TradePlan {
  const sym = ticker.toUpperCase()
  const short = args.bias === 'bearish'
  const riskPerShare = short ? args.stop - args.entry : args.entry - args.stop
  const rewardPerShare = short ? args.entry - args.target : args.target - args.entry
  const shares = Math.max(1, Math.floor(args.positionSize))
  const rMultiple =
    riskPerShare > 0
      ? Math.round((rewardPerShare / riskPerShare) * 100) / 100
      : 0
  const expectedR =
    riskPerShare > 0 ? rewardPerShare / riskPerShare : 0
  return {
    id: `plan-manual-${sym}-${Date.now()}`,
    ticker: sym,
    setupKind: 'trend_pullback',
    setupType: SETUP_TYPE,
    bias: short ? 'bearish' : 'bullish',
    entry: args.entry,
    stop: args.stop,
    target: args.target,
    positionSize: shares,
    riskAmount: roundRiskAmountDollars(shares, riskPerShare),
    riskPerShare,
    rMultiple: Number.isFinite(rMultiple) ? rMultiple : 0,
    expectedR: Number.isFinite(expectedR) ? Math.round(expectedR * 100) / 100 : 0,
    status: 'watching',
    notes: args.notes,
    createdAt: new Date().toISOString(),
    alertEnabled: true,
    planOrigin: 'manual_quotes',
  }
}
