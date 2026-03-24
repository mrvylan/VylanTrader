import type { PlanSetupKind, TradePlan, TradePlanStatus } from '../domain/types'

const KEY = 'trade-ui-trade-plans-v1'

const SETUP_KINDS: PlanSetupKind[] = [
  'breakout_retest',
  'trend_pullback',
  'orb_continuation',
]

const STATUSES: TradePlanStatus[] = [
  'watching',
  'approved',
  'entered',
  'rejected',
  'closed',
]

function isRecord(x: unknown): x is Record<string, unknown> {
  return x != null && typeof x === 'object' && !Array.isArray(x)
}

function isValidTradePlan(x: unknown): x is TradePlan {
  if (!isRecord(x)) return false
  const id = x.id
  const ticker = x.ticker
  const setupKind = x.setupKind
  const setupType = x.setupType
  const bias = x.bias
  const status = x.status
  const createdAt = x.createdAt
  if (typeof id !== 'string' || !id) return false
  if (typeof ticker !== 'string' || !ticker) return false
  if (typeof setupType !== 'string') return false
  if (!SETUP_KINDS.includes(setupKind as PlanSetupKind)) return false
  if (bias !== 'bullish' && bias !== 'bearish' && bias !== 'neutral')
    return false
  if (!STATUSES.includes(status as TradePlanStatus)) return false
  if (typeof createdAt !== 'string') return false

  const nums = [
    x.entry,
    x.stop,
    x.target,
    x.positionSize,
    x.riskAmount,
    x.riskPerShare,
    x.rMultiple,
    x.expectedR,
  ]
  for (const n of nums) {
    if (typeof n !== 'number' || !Number.isFinite(n)) return false
  }
  return true
}

export function loadTradePlans(): TradePlan[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const p = JSON.parse(raw) as unknown
    if (!Array.isArray(p)) return []
    return p.filter(isValidTradePlan)
  } catch {
    return []
  }
}

export function saveTradePlans(plans: TradePlan[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(plans))
  } catch {
    /* quota or private mode */
  }
}
