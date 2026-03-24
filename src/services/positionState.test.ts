import { describe, expect, it } from 'vitest'
import type { TradePlan } from '../domain/types'
import {
  buildOpenPositionFromPlan,
  closePositionMetrics,
  migratePositionRecord,
} from './positionState'

const basePlan = (): TradePlan => ({
  id: 'plan-1',
  ticker: 'TEST',
  setupKind: 'breakout_retest',
  setupType: 'Breakout retest',
  bias: 'bullish',
  entry: 100,
  stop: 96,
  target: 108,
  positionSize: 10,
  riskAmount: 40,
  riskPerShare: 4,
  rMultiple: 2,
  expectedR: 2,
  status: 'approved',
  score: 80,
  createdAt: '',
})

describe('positionState', () => {
  it('buildOpenPositionFromPlan uses plan entry when no fill override', () => {
    const p = buildOpenPositionFromPlan(basePlan(), {
      id: 'pos-1',
      currentPrice: 100.5,
    })
    expect(p).not.toBeNull()
    expect(p!.entryPrice).toBe(100)
    expect(p!.shares).toBe(10)
    expect(p!.initialRiskPerShare).toBe(4)
    expect(p!.initialRiskDollars).toBe(40)
    expect(p!.unrealizedPnL).toBe(5)
    expect(p!.unrealizedR).toBeCloseTo(0.125, 5)
  })

  it('buildOpenPositionFromPlan respects manual fill price', () => {
    const p = buildOpenPositionFromPlan(basePlan(), {
      id: 'pos-1',
      fillPrice: 99,
      currentPrice: 100,
    })
    expect(p).not.toBeNull()
    expect(p!.entryPrice).toBe(99)
    expect(p!.initialRiskPerShare).toBe(3)
    expect(p!.initialRiskDollars).toBe(30)
  })

  it('buildOpenPositionFromPlan returns null when stop above entry', () => {
    const bad = { ...basePlan(), entry: 100, stop: 101 }
    expect(
      buildOpenPositionFromPlan(bad, { id: 'x', currentPrice: 100 }),
    ).toBeNull()
  })

  it('closePositionMetrics uses frozen initialRiskDollars', () => {
    const p = buildOpenPositionFromPlan(basePlan(), {
      id: 'pos-1',
      currentPrice: 100,
    })!
    const { realizedPnL, realizedR } = closePositionMetrics(p, 108)
    expect(realizedPnL).toBe(80)
    expect(realizedR).toBe(2)
  })

  it('migratePositionRecord maps legacy fields', () => {
    const m = migratePositionRecord({
      id: 'p1',
      planId: 'plan-1',
      ticker: 'X',
      side: 'long',
      entry: 50,
      currentPrice: 52,
      stop: 48,
      target: 54,
      positionSize: 4,
      status: 'open',
      openedAt: 1,
    })
    expect(m).not.toBeNull()
    expect(m!.tradePlanId).toBe('plan-1')
    expect(m!.entryPrice).toBe(50)
    expect(m!.shares).toBe(4)
    expect(m!.initialRiskDollars).toBe(8)
  })
})
