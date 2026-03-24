import type {
  PlanHistoryEntry,
  PlanHistoryResult,
  PlanHistorySource,
  PlanSetupKind,
  TradePlanStatus,
} from '../domain/types'

const KEY = 'trade-ui-plan-history-v1'

const RESULTS: PlanHistoryResult[] = [
  'win',
  'loss',
  'breakeven',
  'no_trade',
  'skipped',
]

const SOURCES: PlanHistorySource[] = ['manual_reconcile', 'position_close']

const SETUP_KINDS: PlanSetupKind[] = [
  'breakout_retest',
  'trend_pullback',
  'orb_continuation',
]

const PRIOR_STATUSES: TradePlanStatus[] = [
  'watching',
  'approved',
  'entered',
  'rejected',
  'closed',
]

function isRecord(x: unknown): x is Record<string, unknown> {
  return x != null && typeof x === 'object' && !Array.isArray(x)
}

function isValidPlanHistoryEntry(x: unknown): x is PlanHistoryEntry {
  if (!isRecord(x)) return false
  const id = x.id
  const reconciledAt = x.reconciledAt
  const tradePlanId = x.tradePlanId
  const ticker = x.ticker
  const setupType = x.setupType
  const setupKind = x.setupKind
  const bias = x.bias
  const priorStatus = x.priorStatus
  const result = x.result
  const followedRules = x.followedRules
  const source = x.source
  if (typeof id !== 'string' || !id) return false
  if (typeof reconciledAt !== 'string' || !reconciledAt) return false
  if (typeof tradePlanId !== 'string' || !tradePlanId) return false
  if (typeof ticker !== 'string' || !ticker) return false
  if (typeof setupType !== 'string') return false
  if (!SETUP_KINDS.includes(setupKind as PlanSetupKind)) return false
  if (bias !== 'bullish' && bias !== 'bearish' && bias !== 'neutral')
    return false
  if (!PRIOR_STATUSES.includes(priorStatus as TradePlanStatus)) return false
  if (!RESULTS.includes(result as PlanHistoryResult)) return false
  if (typeof followedRules !== 'boolean') return false
  if (!SOURCES.includes(source as PlanHistorySource)) return false

  const nums = [
    x.entry,
    x.stop,
    x.target,
    x.positionSize,
  ]
  for (const n of nums) {
    if (typeof n !== 'number' || !Number.isFinite(n)) return false
  }
  if (x.exitPrice !== undefined) {
    if (typeof x.exitPrice !== 'number' || !Number.isFinite(x.exitPrice))
      return false
  }
  if (x.pnlDollars !== undefined) {
    if (typeof x.pnlDollars !== 'number' || !Number.isFinite(x.pnlDollars))
      return false
  }
  if (x.rMultiple !== undefined) {
    if (typeof x.rMultiple !== 'number' || !Number.isFinite(x.rMultiple))
      return false
  }
  if (x.notes !== undefined && typeof x.notes !== 'string') return false
  return true
}

export function loadPlanHistory(): PlanHistoryEntry[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const p = JSON.parse(raw) as unknown
    if (!Array.isArray(p)) return []
    return p.filter(isValidPlanHistoryEntry)
  } catch {
    return []
  }
}

export function savePlanHistory(entries: PlanHistoryEntry[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(entries))
  } catch {
    /* quota or private mode */
  }
}

export function appendPlanHistoryEntry(
  entry: PlanHistoryEntry,
): PlanHistoryEntry[] {
  const all = loadPlanHistory()
  const next = [entry, ...all]
  savePlanHistory(next)
  return next
}
