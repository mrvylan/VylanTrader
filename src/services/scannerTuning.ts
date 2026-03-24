import { MIN_EXPECTED_R, MIN_MORNING_SCORE } from './strategyScore'

/**
 * Resolved scanner / plan-geometry knobs for tuning (defaults match production constants).
 */
export interface ScannerTuning {
  /** Require last >= recentHigh × ratio (higher = stricter proximity to high). */
  breakoutNearHighRatio: number
  /** Minimum relative volume for pattern detection (breakout / ORB). */
  minRelVolPattern: number
  /** Morning score gate vs {@link MIN_MORNING_SCORE} baseline. */
  minMorningScore: number
  /** Expected R gate vs {@link MIN_EXPECTED_R} baseline. */
  minExpectedR: number
  /** Max pullback depth from swing high (fraction) for trend pullback. */
  pullbackMaxDepth: number
  /** Entry buffer above reference level: level × (1 + fraction). */
  entryBufferFraction: number
  /** ATR multiplier for the “tight stop” leg on breakout retest. */
  atrTightStopMultiplier: number
  /** Target distance as multiple of entry−stop risk. */
  targetRMultiple: number
  /** Minimum stop distance below entry as fraction of entry (fallback vs ATR). */
  stopUnderEntryMinFraction: number
  /**
   * Cap long stop width so entry − stop ≤ min(ATR, ADR%×entry), matching a “not wider than ATR or ADR” rule.
   * ADR% is mean (high−low)/close over `adrRangeLookback` daily bars.
   */
  capStopByAtrAndAdr: boolean
  /** Lookback for average daily range % (high−low)/close. */
  adrRangeLookback: number
}

export const DEFAULT_SCANNER_TUNING: ScannerTuning = {
  breakoutNearHighRatio: 0.99,
  minRelVolPattern: 0.9,
  minMorningScore: MIN_MORNING_SCORE,
  minExpectedR: MIN_EXPECTED_R,
  pullbackMaxDepth: 0.05,
  entryBufferFraction: 0.001,
  atrTightStopMultiplier: 0.8,
  targetRMultiple: 2,
  stopUnderEntryMinFraction: 0.008,
  capStopByAtrAndAdr: true,
  adrRangeLookback: 20,
}

export function mergeScannerTuning(
  partial?: Partial<ScannerTuning>,
): ScannerTuning {
  return { ...DEFAULT_SCANNER_TUNING, ...partial }
}
