import { describe, expect, it } from 'vitest'
import { computeManualPlanInputsFromStop } from './manualPlanInputs'

describe('computeManualPlanInputsFromStop', () => {
  it('sizes long: risk $ ÷ (entry − stop) → shares and target', () => {
    const r = computeManualPlanInputsFromStop({
      entry: '100',
      stop: '98',
      riskDollars: '200',
      profitR: 3,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.positionSize).toBe(100)
    expect(r.rps).toBe(2)
    expect(r.maxRisk).toBe(200)
    expect(r.stop).toBe(98)
    expect(r.target).toBe(106)
    expect(r.expectedR).toBeCloseTo(3, 5)
  })

  it('rejects stop at or above entry', () => {
    const r = computeManualPlanInputsFromStop({
      entry: '100',
      stop: '100',
      riskDollars: '200',
      profitR: 3,
    })
    expect(r.ok).toBe(false)
    const r2 = computeManualPlanInputsFromStop({
      entry: '100',
      stop: '101',
      riskDollars: '200',
      profitR: 3,
    })
    expect(r2.ok).toBe(false)
  })

  it('rejects when risk $ too small for one share', () => {
    const r = computeManualPlanInputsFromStop({
      entry: '100',
      stop: '99.5',
      riskDollars: '0.25',
      profitR: 3,
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toMatch(/too small/i)
  })
})
