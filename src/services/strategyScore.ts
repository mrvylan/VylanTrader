import type { FullTradeSetupScoreInput, SetupQualityInput } from './setupScoring'
import {
  interpretTradeSetupScore,
  totalTradeSetupScore,
  tradeSetupScoreBreakdown,
} from './setupScoring'

export type { FullTradeSetupScoreInput, SetupQualityInput }

/** @deprecated Prefer FullTradeSetupScoreInput — kept for gradual migration. */
export type StrategyScoreInput = FullTradeSetupScoreInput

/**
 * Deterministic 0–100 morning setup score (sum of seven buckets, max 100).
 */
export function scoreMorningStrategy(input: FullTradeSetupScoreInput): number {
  return totalTradeSetupScore(input)
}

export function morningStrategyScoreBreakdown(input: FullTradeSetupScoreInput) {
  return tradeSetupScoreBreakdown(input)
}

export { interpretTradeSetupScore }

export const MIN_MORNING_SCORE = 75
export const MIN_EXPECTED_R = 2

/** Re-export bucket helpers for tests and UI diagnostics. */
export {
  executionFitScore,
  executionFitScoreFromMinutesPT,
  levelClarityScore,
  marketAlignmentScoreLong,
  minutesSinceMidnightPacific,
  relativeVolumeScore,
  rewardRiskScore,
  scoreSetupQuality,
  setupQualityScoreBreakout,
  setupQualityScoreOrb,
  setupQualityScorePullback,
  trendQualityScore,
} from './setupScoring'
