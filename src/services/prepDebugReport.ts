import type {
  DailyPlan,
  MarketBiasResult,
  MarketTrend,
  MorningScoreBreakdown,
  OHLCV,
  Regime,
  ScanRejectionReason,
  StrategyKind,
  SymbolScanResult,
  TradePlan,
} from '../domain/types'
import {
  canApproveMoreTrades,
  wouldExceedDailyLoss,
} from './dailyPlanApproval'
import { closes } from './indicators'
import { explainScanRejectionReasons } from './rejectionNarrative'
import { rawHits } from './strategyEngine'
import type { ScannerTuning } from './scannerTuning'

export type PrepCandidateStatus =
  | 'insufficient_data'
  | 'no_setup'
  | 'candidate'
  | 'rejected'
  | 'approvable'

export interface PrepTickerPipelineDebug {
  universeFilterPassed: boolean
  setupDetected: boolean
  tradePlanGenerated: boolean
  scored: boolean
  approvalEvaluated: boolean
}

export interface PrepGateChecklist {
  scoreOk: boolean | null
  expectedROk: boolean | null
  positionSizeOk: boolean | null
  entryAboveStopOk: boolean | null
  targetAboveEntryOk: boolean | null
  dailyRiskCapOk: boolean | null
  maxTradesOk: boolean | null
}

export interface PrepTickerDebugRow {
  ticker: string
  dailyBarsLength?: number
  intradayBarsLength?: number
  universeStatus?: 'pass' | 'fail' | 'insufficient_data'
  currentPrice: number | null
  recentHigh: number | null
  recentLow: number | null
  ema9: number | null
  ema20: number | null
  relativeVolume: number | null
  marketBias: MarketTrend
  regime: Regime
  detectedSetupType: StrategyKind | null
  entry: number | null
  stop: number | null
  target: number | null
  riskPerShare: number | null
  riskAmount: number | null
  positionSize: number | null
  expectedR: number | null
  totalScore: number | null
  candidateStatus: PrepCandidateStatus
  scoreBreakdown: MorningScoreBreakdown | null
  rejectionReasons: ScanRejectionReason[]
  humanMessages: string[]
  pipeline: PrepTickerPipelineDebug
  gates: PrepGateChecklist
}

export interface PrepDebugReport {
  summary: {
    totalTickers: number
    candidatesDetected: number
    approvable: number
    rejected: number
    mostCommonRejectionReason: ScanRejectionReason | null
  }
  tuning: ScannerTuning
  rows: PrepTickerDebugRow[]
}

function mapCandidateStatus(tier: SymbolScanResult['candidateTier']): PrepCandidateStatus {
  if (tier === 'no_setup') return 'no_setup'
  if (tier === 'candidate') return 'candidate'
  if (tier === 'approvable') return 'approvable'
  return 'rejected'
}

function mostCommonReason(reasons: ScanRejectionReason[]): ScanRejectionReason | null {
  const counts = new Map<ScanRejectionReason, number>()
  for (const r of reasons) {
    counts.set(r, (counts.get(r) ?? 0) + 1)
  }
  let best: ScanRejectionReason | null = null
  let n = 0
  for (const [k, v] of counts) {
    if (v > n) {
      best = k
      n = v
    }
  }
  return best
}

/**
 * Build a structured prep debug snapshot for the Debug / Tuning panel.
 */
export function buildPrepDebugReport(input: {
  tickers: string[]
  barsByIndex: OHLCV[][]
  bias: MarketBiasResult
  scans: SymbolScanResult[]
  dailyPlan: DailyPlan | null
  tradePlans: TradePlan[]
  tuning: ScannerTuning
}): PrepDebugReport {
  const { tickers, barsByIndex, bias, scans, dailyPlan, tradePlans, tuning } =
    input

  const rows: PrepTickerDebugRow[] = []
  let candidatesDetected = 0
  let approvable = 0
  let rejected = 0
  const allReasons: ScanRejectionReason[] = []

  for (let i = 0; i < tickers.length; i++) {
    const ticker = tickers[i]!
    const bars = barsByIndex[i] ?? []
    const scan = scans[i]!
    const universeOk =
      scan.universeStatus !== 'fail' && scan.universeStatus !== 'insufficient_data'
    const rawList = universeOk
      ? rawHits(ticker, bars, bias.marketTrend, bias, tuning)
      : []
    const setupDetected = rawList.length > 0
    if (setupDetected) candidatesDetected += 1

    const d = scan.debug
    const plan = scan.plan
    const c = closes(bars)
    const currentPrice = c.length > 0 ? c[c.length - 1]! : null

    if (scan.candidateTier === 'approvable') approvable += 1
    else if (
      scan.candidateTier === 'rejected' ||
      scan.candidateTier === 'candidate'
    ) {
      rejected += 1
    }

    const entry = plan?.entry ?? d.entry
    const stop = plan?.stop ?? d.stop
    const target = plan?.target ?? d.target
    const rps = plan?.riskPerShare ?? d.riskPerShare
    const er = plan?.expectedR ?? d.expectedR
    const score = plan?.score ?? d.score
    const pos = plan?.positionSize ?? d.positionSize

    const minS = tuning.minMorningScore
    const minR = tuning.minExpectedR

    let dailyRiskCapOk: boolean | null = null
    let maxTradesOk: boolean | null = null
    if (plan != null && dailyPlan != null && dailyPlan.status !== 'closed') {
      dailyRiskCapOk = !wouldExceedDailyLoss(
        tradePlans,
        plan,
        dailyPlan.maxDailyLoss,
      )
      maxTradesOk = canApproveMoreTrades(tradePlans, dailyPlan.maxTrades)
    }

    const pipeline: PrepTickerPipelineDebug = {
      universeFilterPassed: universeOk,
      setupDetected,
      tradePlanGenerated: plan != null,
      scored: score != null || scan.scoreBreakdown != null,
      approvalEvaluated: plan != null && dailyPlan != null && dailyPlan.status !== 'closed',
    }

    const gates: PrepGateChecklist = {
      scoreOk:
        score != null ? score >= minS : plan == null && setupDetected ? false : null,
      expectedROk:
        er != null ? er >= minR : plan == null && setupDetected ? false : null,
      positionSizeOk:
        pos != null
          ? pos >= 1
          : plan == null && setupDetected
            ? false
            : null,
      entryAboveStopOk:
        entry != null && stop != null
          ? entry > stop
          : plan == null && setupDetected
            ? false
            : null,
      targetAboveEntryOk:
        target != null && entry != null
          ? target > entry
          : plan == null && setupDetected
            ? false
            : null,
      dailyRiskCapOk,
      maxTradesOk,
    }

    const rejectionReasons = [...scan.rejectionReasons]
    allReasons.push(...rejectionReasons)

    const humanMessages = explainScanRejectionReasons(
      rejectionReasons,
      scan.rejectionDetail,
    )

    const finalStatus: PrepCandidateStatus =
      scan.universeStatus === 'insufficient_data'
        ? 'insufficient_data'
        : mapCandidateStatus(scan.candidateTier)

    rows.push({
      ticker,
      dailyBarsLength: d.dailyBarsLength,
      intradayBarsLength: d.intradayBarsLength,
      universeStatus: scan.universeStatus,
      currentPrice,
      recentHigh: d.recentHigh,
      recentLow: d.recentLow,
      ema9: d.ema9,
      ema20: d.ema20,
      relativeVolume: d.relVol,
      marketBias: bias.marketTrend,
      regime: bias.regime,
      detectedSetupType: d.detectedSetupType,
      entry,
      stop,
      target,
      riskPerShare: rps,
      riskAmount: plan?.riskAmount ?? null,
      positionSize: pos,
      expectedR: er,
      totalScore: score,
      candidateStatus: finalStatus,
      scoreBreakdown: scan.scoreBreakdown,
      rejectionReasons,
      humanMessages,
      pipeline,
      gates,
    })
  }

  return {
    summary: {
      totalTickers: tickers.length,
      candidatesDetected,
      approvable,
      rejected,
      mostCommonRejectionReason: mostCommonReason(allReasons),
    },
    tuning,
    rows,
  }
}

export function logPrepDebugStructured(
  report: PrepDebugReport,
  meta?: {
    barCountByTicker: Record<string, number>
    intradayBarCountByTicker?: Record<string, number>
  },
): void {
  console.groupCollapsed(
    `[Trade UI] Prep debug · tickers=${report.summary.totalTickers} candidates=${report.summary.candidatesDetected} approvable=${report.summary.approvable}`,
  )
  console.log('tuning', report.tuning)
  console.log('summary', report.summary)
  if (meta?.barCountByTicker) {
    console.log('scannerInput · barCounts', meta.barCountByTicker)
  }
  if (meta?.intradayBarCountByTicker) {
    console.log('scannerInput · intradayBarCounts', meta.intradayBarCountByTicker)
  }
  for (const row of report.rows) {
    console.log(row.ticker, {
      currentPrice: row.currentPrice,
      pipeline: row.pipeline,
      gates: row.gates,
      candidateStatus: row.candidateStatus,
      score: row.totalScore,
      plan: {
        entry: row.entry,
        stop: row.stop,
        target: row.target,
        riskPerShare: row.riskPerShare,
        positionSize: row.positionSize,
        expectedR: row.expectedR,
      },
      breakdown: row.scoreBreakdown,
      rejectionCodes: row.rejectionReasons,
      messages: row.humanMessages,
    })
  }
  console.groupEnd()
}
