import type {
  MarketTrend,
  ScanRejectionReason,
  ScannerCandidate,
  SymbolScanStatus,
} from '../domain/types'
import { interpretTradeSetupScore } from './setupScoring'
import { strategyKindLabel } from './strategyLabels'

const UNIVERSE_REASONS: ScanRejectionReason[] = [
  'insufficient_bar_history',
  'earnings_too_close',
  'price_below_minimum',
  'average_volume_low',
]

const reasonLabel: Record<ScanRejectionReason, string> = {
  score_below_threshold: 'score below 75',
  expected_r_below_minimum: 'expected R below 2',
  position_size_below_one: 'position size below 1 share',
  stop_too_wide: 'stop too wide for risk budget',
  entry_not_above_stop: 'entry not above stop',
  target_not_above_entry: 'target not above entry',
  market_not_aligned: 'market not aligned (bearish tape)',
  regime_not_supported: 'regime weakens this long setup',
  daily_risk_cap_exceeded: 'daily risk cap',
  max_trades_reached: 'max trades reached',
  morning_quality_not_met: 'morning quality not met',
  no_clear_target: 'reward/R target not clear',
  level_not_clear: 'level clarity weak',
  earnings_too_close: 'earnings too close',
  price_below_minimum: 'price below $1',
  average_volume_low: '20d avg volume low',
  insufficient_bar_history: 'insufficient bar history',
  no_valid_pattern: 'no valid pattern',
  rel_vol_too_low: 'relative volume below 1.1×',
}

export function scanSummaryForTicker(
  ticker: string,
  candidate: ScannerCandidate | null,
  score: number | undefined,
  marketBias: MarketTrend,
  scanStatus?: SymbolScanStatus,
  rejectionReasons?: ScanRejectionReason[],
): string {
  const uni =
    rejectionReasons?.some(
      (r) => UNIVERSE_REASONS.includes(r) && scanStatus === 'no_setup',
    ) ?? false
  if (uni) {
    if (rejectionReasons?.includes('insufficient_bar_history')) {
      return `${ticker}: Insufficient data — need at least 20 daily bars before universe and setup logic can run. Bias: ${marketBias}.`
    }
    return `${ticker}: Not in scan universe — need last close > $1 and 20d avg volume > 1M (earnings unknown does not block). Bias: ${marketBias}.`
  }
  if (!candidate || scanStatus === 'no_setup') {
    return `${ticker}: No setup — did not match breakout retest, trend pullback, or opening-range continuation on this history. Bias: ${marketBias}.`
  }
  const setup = strategyKindLabel(candidate.strategyKind)
  const vol = candidate.relVolume.toFixed(2)
  const near = (candidate.nearResistancePct * 100).toFixed(2)
  const scoreBand =
    score != null ? interpretTradeSetupScore(score).toUpperCase() : '—'
  const tier =
    scanStatus === 'approved_candidate'
      ? 'Tier: ready (passes morning quality gates).'
      : 'Tier: watching (setup visible; may still fail gates).'
  const gaps =
    rejectionReasons && rejectionReasons.length > 0
      ? ` Setup detected, but not approvable right now: ${rejectionReasons.map((r) => reasonLabel[r]).join('; ')}.`
      : ''
  return `${setup} · Level ${candidate.level.toFixed(2)} · Rel vol ${vol}× · Near high ${near}% · Score ${score?.toFixed(1) ?? '—'} (${scoreBand}) · ${tier}${gaps} Bias ${marketBias}.`
}
