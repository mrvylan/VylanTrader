import { describe, expect, it } from 'vitest'
import {
  computeInitialRiskDollars,
  computeInitialRiskPerShareLong,
  computeRealizedPnLLong,
  computeRealizedR,
  computeUnrealizedPnLLong,
  computeUnrealizedR,
} from './positionMath'

describe('positionMath', () => {
  it('computeUnrealizedPnLLong', () => {
    expect(computeUnrealizedPnLLong(100, 103, 5)).toBe(15)
    expect(computeUnrealizedPnLLong(100, 97, 10)).toBe(-30)
  })

  it('computeUnrealizedR', () => {
    expect(computeUnrealizedR(40, 40)).toBe(1)
    expect(computeUnrealizedR(20, 40)).toBe(0.5)
    expect(computeUnrealizedR(-40, 40)).toBe(-1)
    expect(computeUnrealizedR(10, 0)).toBeNull()
  })

  it('computeRealizedPnLLong', () => {
    expect(computeRealizedPnLLong(100, 108, 5)).toBe(40)
    expect(computeRealizedPnLLong(50, 48, 20)).toBe(-40)
  })

  it('computeRealizedR', () => {
    expect(computeRealizedR(40, 40)).toBe(1)
    expect(computeRealizedR(10, 0)).toBeNull()
  })

  it('rejects invalid riskPerShare', () => {
    expect(computeInitialRiskPerShareLong(100, 100)).toBeNull()
    expect(computeInitialRiskPerShareLong(100, 101)).toBeNull()
    expect(computeInitialRiskPerShareLong(100, 99)).toBe(1)
  })

  it('computeInitialRiskDollars', () => {
    expect(computeInitialRiskDollars(2, 5)).toBe(10)
    expect(computeInitialRiskDollars(0, 5)).toBeNull()
    expect(computeInitialRiskDollars(2, 0)).toBeNull()
  })
})
