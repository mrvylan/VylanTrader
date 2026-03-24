import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SCANNER_TUNING,
  mergeScannerTuning,
} from './scannerTuning'

describe('scannerTuning', () => {
  it('mergeScannerTuning fills defaults', () => {
    expect(mergeScannerTuning()).toEqual(DEFAULT_SCANNER_TUNING)
  })

  it('mergeScannerTuning overlays partials', () => {
    const m = mergeScannerTuning({ minMorningScore: 70, minExpectedR: 1.5 })
    expect(m.minMorningScore).toBe(70)
    expect(m.minExpectedR).toBe(1.5)
    expect(m.minRelVolPattern).toBe(DEFAULT_SCANNER_TUNING.minRelVolPattern)
  })
})
