import type {
  MorningScoreBreakdown,
  PlanRejectionDetail,
  ScannerCandidate,
  ScanRejectionReason,
  TradePlan,
} from '../domain/types'
import {
  buildRejectionSuggestions,
  explainScanRejectionReasons,
  headlineForRejection,
} from './rejectionNarrative'

/** Console + UI diagnostics when a plan cannot be built. */
export type MorningPlanDebug = {
  entry?: number
  stop?: number
  target?: number
  riskPerShare?: number
  expectedR?: number
  score?: number
  positionSize?: number
  riskBudget: number
  strategyKind?: string
}

export type MorningPlanBuildResult =
  | { ok: true; candidate: ScannerCandidate; plan: TradePlan }
  | {
      ok: false
      ticker: string
      headline: string
      reasons: string[]
      suggestion?: string
      rejectionCodes?: ScanRejectionReason[]
      rejectionDetail?: PlanRejectionDetail
      scoreBreakdown?: MorningScoreBreakdown | null
      debug: MorningPlanDebug
    }

export function formatMorningPlanRejection(
  r: Extract<MorningPlanBuildResult, { ok: false }>,
): string {
  const codes: ScanRejectionReason[] =
    r.rejectionCodes != null && r.rejectionCodes.length > 0
      ? r.rejectionCodes
      : ['morning_quality_not_met']
  const detail = r.rejectionDetail ?? {}
  const headline =
    r.headline ||
    headlineForRejection(true, codes)
  const explained = explainScanRejectionReasons(codes, detail)
  const sugg =
    r.suggestion ??
    buildRejectionSuggestions(codes, detail, r.scoreBreakdown ?? null).join(' ')
  const lines = [
    `${r.ticker} — ${headline}`,
    '',
    'Reasons:',
    ...explained.map((x) => `• ${x}`),
  ]
  if (sugg) {
    lines.push('', `Suggestion: ${sugg}`)
  }
  const d = r.debug
  lines.push(
    '',
    'Levels (engine):',
    `  entry=${d.entry?.toFixed(2) ?? '—'}  stop=${d.stop?.toFixed(2) ?? '—'}  target=${d.target?.toFixed(2) ?? '—'}`,
    `  risk/share=$${d.riskPerShare?.toFixed(2) ?? '—'}  expected R=${d.expectedR?.toFixed(2) ?? '—'}  score=${d.score?.toFixed(1) ?? '—'}`,
    `  position size=${d.positionSize ?? 0} (budget $${d.riskBudget}/trade)`,
  )
  return lines.join('\n')
}
