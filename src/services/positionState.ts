import type { Position, TradePlan } from '../domain/types'
import {
  computeInitialRiskDollars,
  computeInitialRiskPerShareLong,
  computeRealizedPnLLong,
  computeRealizedR,
  computeUnrealizedPnLLong,
  computeUnrealizedR,
} from './positionMath'

export type EnterPositionOptions = {
  fillPrice?: number
  quoteIsSimulated?: boolean
}

/** Apply latest quote and recompute unrealized fields. */
export function applyMarkToMarket(p: Position, currentPrice: number): Position {
  const unrealizedPnL = computeUnrealizedPnLLong(
    p.entryPrice,
    currentPrice,
    p.shares,
  )
  const unrealizedR = computeUnrealizedR(unrealizedPnL, p.initialRiskDollars)
  return {
    ...p,
    currentPrice,
    unrealizedPnL,
    unrealizedR,
  }
}

export function buildOpenPositionFromPlan(
  plan: TradePlan,
  opts: EnterPositionOptions & {
    id: string
    currentPrice: number
    chartEntryDataUrl?: string
  },
): Position | null {
  const stopAtOpen = plan.stop
  const entryPrice =
    opts.fillPrice != null && Number.isFinite(opts.fillPrice)
      ? opts.fillPrice
      : plan.entry

  const initialRiskPerShare = computeInitialRiskPerShareLong(
    entryPrice,
    stopAtOpen,
  )
  if (initialRiskPerShare == null) {
    return null
  }

  const shares = plan.positionSize
  const initialRiskDollars = computeInitialRiskDollars(
    initialRiskPerShare,
    shares,
  )
  if (initialRiskDollars == null) {
    return null
  }

  const base: Position = {
    id: opts.id,
    tradePlanId: plan.id,
    ticker: plan.ticker,
    side: 'long',
    entryPrice,
    currentPrice: opts.currentPrice,
    stopPrice: stopAtOpen,
    targetPrice: plan.target,
    shares,
    initialRiskPerShare,
    initialRiskDollars,
    unrealizedPnL: 0,
    unrealizedR: null,
    realizedPnL: 0,
    realizedR: null,
    status: 'open',
    openedAt: Date.now(),
    quoteIsSimulated: opts.quoteIsSimulated === true,
    chartEntryDataUrl: opts.chartEntryDataUrl,
  }

  return applyMarkToMarket(base, opts.currentPrice)
}

export function withUpdatedStop(p: Position, stopPrice: number): Position {
  return { ...p, stopPrice }
}

export function withPartialShares(p: Position, newShares: number): Position {
  if (newShares < 1 || newShares >= p.shares) return p
  const initialRiskDollars = computeInitialRiskDollars(
    p.initialRiskPerShare,
    newShares,
  )
  if (initialRiskDollars == null) return p
  const next = {
    ...p,
    shares: newShares,
    initialRiskDollars,
  }
  return applyMarkToMarket(next, next.currentPrice)
}

/** Normalize persisted JSON (v1 field names → v2). */
export function migratePositionRecord(raw: unknown): Position | null {
  if (typeof raw !== 'object' || raw == null) return null
  const o = raw as Record<string, unknown>
  if (o.status !== 'open') return null

  const entryPrice = Number(
    o.entryPrice != null ? o.entryPrice : o.entry,
  )
  const stopPrice = Number(o.stopPrice != null ? o.stopPrice : o.stop)
  const targetPrice = Number(o.targetPrice != null ? o.targetPrice : o.target)
  const shares = Number(o.shares != null ? o.shares : o.positionSize)
  const currentPrice = Number(
    o.currentPrice != null ? o.currentPrice : entryPrice,
  )
  const tradePlanId = String(o.tradePlanId ?? o.planId ?? '')
  const id = String(o.id ?? '')

  if (
    !Number.isFinite(entryPrice) ||
    !Number.isFinite(stopPrice) ||
    !Number.isFinite(targetPrice) ||
    !Number.isFinite(shares) ||
    shares < 1 ||
    !id ||
    !tradePlanId
  ) {
    return null
  }

  const initialRiskPerShare = computeInitialRiskPerShareLong(
    entryPrice,
    stopPrice,
  )
  if (initialRiskPerShare == null) return null

  const initialRiskDollars = computeInitialRiskDollars(
    initialRiskPerShare,
    shares,
  )
  if (initialRiskDollars == null) return null

  const unrealizedPnL = computeUnrealizedPnLLong(
    entryPrice,
    currentPrice,
    shares,
  )
  const unrealizedR = computeUnrealizedR(unrealizedPnL, initialRiskDollars)

  return {
    id,
    tradePlanId,
    ticker: String(o.ticker ?? '').toUpperCase() || 'UNKNOWN',
    side: 'long',
    entryPrice,
    currentPrice,
    stopPrice,
    targetPrice,
    shares,
    initialRiskPerShare,
    initialRiskDollars,
    unrealizedPnL,
    unrealizedR,
    realizedPnL: 0,
    realizedR: null,
    status: 'open',
    openedAt: Number(o.openedAt) || Date.now(),
    quoteIsSimulated: o.quoteIsSimulated === true,
    chartEntryDataUrl:
      typeof o.chartEntryDataUrl === 'string' ? o.chartEntryDataUrl : undefined,
    notes: typeof o.notes === 'string' ? o.notes : undefined,
  }
}

export function closePositionMetrics(
  p: Position,
  exitPrice: number,
): { realizedPnL: number; realizedR: number | null } {
  const realizedPnL = computeRealizedPnLLong(
    p.entryPrice,
    exitPrice,
    p.shares,
  )
  const realizedR = computeRealizedR(realizedPnL, p.initialRiskDollars)
  return { realizedPnL, realizedR }
}
