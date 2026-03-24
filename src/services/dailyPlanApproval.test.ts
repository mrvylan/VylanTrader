import { describe, expect, it } from 'vitest'
import type { DailyPlan, TradePlan } from '../domain/types'
import {
  approvalBlockingScanReasons,
  committedPlanRisk,
  countTradeSlotsUsed,
  whyCannotApprove,
} from './dailyPlanApproval'

const dp = (over: Partial<DailyPlan> = {}): DailyPlan => ({
  id: 'd1',
  date: '2025-01-01',
  marketBias: 'bullish',
  regime: 'trend',
  selectedTickers: ['A'],
  approvedPlans: [],
  maxTrades: 2,
  maxDailyLoss: 100,
  status: 'draft',
  createdAt: '',
  ...over,
})

const plan = (over: Partial<TradePlan> = {}): TradePlan => ({
  id: 'p1',
  ticker: 'X',
  setupKind: 'breakout_retest',
  setupType: 'Breakout retest',
  bias: 'bullish',
  entry: 100,
  stop: 90,
  target: 120,
  positionSize: 1,
  riskAmount: 10,
  riskPerShare: 10,
  rMultiple: 2,
  expectedR: 2,
  score: 80,
  status: 'watching',
  createdAt: '',
  ...over,
})

describe('dailyPlanApproval', () => {
  it('counts slots for approved and entered', () => {
    const plans = [
      plan({ id: 'a', status: 'approved' }),
      plan({ id: 'b', status: 'entered' }),
      plan({ id: 'c', status: 'watching' }),
    ]
    expect(countTradeSlotsUsed(plans)).toBe(2)
  })

  it('sums committed risk from shares × stop distance', () => {
    const plans = [
      plan({
        id: 'a',
        status: 'approved',
        entry: 100,
        stop: 95,
        target: 110,
        positionSize: 3,
        riskPerShare: 5,
        riskAmount: 15,
      }),
      plan({
        id: 'b',
        status: 'entered',
        entry: 100,
        stop: 95,
        target: 110,
        positionSize: 5,
        riskPerShare: 5,
        riskAmount: 25,
      }),
    ]
    expect(committedPlanRisk(plans)).toBe(40)
  })

  it('blocks approval when risk cap exceeded', () => {
    const d = dp({ maxDailyLoss: 25 })
    const plans = [
      plan({
        status: 'approved',
        entry: 100,
        stop: 95,
        positionSize: 4,
        riskPerShare: 5,
        riskAmount: 20,
      }),
    ]
    const next = plan({
      id: 'p2',
      entry: 100,
      stop: 95,
      positionSize: 2,
      riskPerShare: 5,
      riskAmount: 10,
    })
    expect(whyCannotApprove(d, plans, next)).toBe('risk_cap')
  })

  it('blocks when max trades reached', () => {
    const d = dp({ maxTrades: 1 })
    const plans = [plan({ status: 'approved' })]
    const next = plan({ id: 'p2' })
    expect(whyCannotApprove(d, plans, next)).toBe('max_trades')
  })

  it('blocks when morning quality gate fails', () => {
    const d = dp()
    const plans: TradePlan[] = []
    const weak = plan({ score: 70, expectedR: 2 })
    expect(whyCannotApprove(d, plans, weak)).toBe('quality')
    const lowR = plan({ id: 'p2', score: 80, expectedR: 1.5, target: 115 })
    expect(whyCannotApprove(d, plans, lowR)).toBe('quality')
    const noSize = plan({
      id: 'p3',
      score: 80,
      positionSize: 0,
      riskAmount: 0,
    })
    expect(whyCannotApprove(d, plans, noSize)).toBe('quality')
    const badStops = plan({
      id: 'p4',
      score: 80,
      entry: 90,
      stop: 95,
      target: 100,
      riskPerShare: -5,
    })
    expect(whyCannotApprove(d, plans, badStops)).toBe('quality')
  })

  it('maps approval blocks to scan rejection codes', () => {
    const d = dp({ maxTrades: 1 })
    expect(
      approvalBlockingScanReasons(d, [plan({ status: 'approved' })], plan({ id: 'p2' })),
    ).toEqual(['max_trades_reached'])

    const d2 = dp({ maxDailyLoss: 20 })
    expect(
      approvalBlockingScanReasons(
        d2,
        [
          plan({
            status: 'approved',
            entry: 100,
            stop: 95,
            positionSize: 3,
            riskPerShare: 5,
            riskAmount: 15,
          }),
        ],
        plan({
          id: 'p2',
          entry: 100,
          stop: 95,
          positionSize: 2,
          riskPerShare: 5,
          riskAmount: 10,
        }),
      ),
    ).toEqual(['daily_risk_cap_exceeded'])

    expect(approvalBlockingScanReasons(dp(), [], plan({ score: 70 }))).toEqual([
      'score_below_threshold',
    ])
  })
})
