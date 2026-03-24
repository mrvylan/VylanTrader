import { describe, expect, it } from 'vitest'
import type { TradePlan } from '../domain/types'
import {
  planMaxRiskDollars,
  planNotionalAtEntry,
  planRewardToTargetDollars,
  planRiskPerShare,
  roundRiskAmountDollars,
} from './tradePlanMoney'

const base = (): TradePlan => ({
  id: 'p',
  ticker: 'X',
  setupKind: 'breakout_retest',
  setupType: 'Breakout',
  bias: 'bullish',
  entry: 100,
  stop: 92,
  target: 116,
  positionSize: 5,
  riskAmount: 40,
  riskPerShare: 8,
  rMultiple: 2,
  expectedR: 2,
  score: 80,
  status: 'watching',
  createdAt: '',
})

describe('tradePlanMoney', () => {
  it('roundRiskAmountDollars matches cents rounding used by engine', () => {
    expect(roundRiskAmountDollars(47, 4.1965999999999894)).toBe(197.24)
    expect(roundRiskAmountDollars(0, 8)).toBe(0)
    expect(roundRiskAmountDollars(5, 0)).toBe(0)
  })

  it('planRiskPerShare prefers stored riskPerShare', () => {
    expect(planRiskPerShare(base())).toBe(8)
  })

  it('planRiskPerShare falls back to entry − stop', () => {
    const p = { ...base(), riskPerShare: 0 }
    expect(planRiskPerShare(p)).toBe(8)
  })

  it('planMaxRiskDollars is shares × risk per share', () => {
    expect(planMaxRiskDollars(base())).toBe(40)
  })

  it('planNotionalAtEntry is shares × entry', () => {
    expect(planNotionalAtEntry(base())).toBe(500)
  })

  it('planRewardToTargetDollars is shares × (target − entry)', () => {
    expect(planRewardToTargetDollars(base())).toBe(80)
  })

  it('returns 0 when no size', () => {
    const p = { ...base(), positionSize: 0 }
    expect(planMaxRiskDollars(p)).toBe(0)
    expect(planNotionalAtEntry(p)).toBe(0)
    expect(planRewardToTargetDollars(p)).toBe(0)
  })
})
