/**
 * Pure P/L and R math for long positions (frozen initial risk at entry).
 */

export function computeInitialRiskPerShareLong(
  entryPrice: number,
  stopPrice: number,
): number | null {
  const r = entryPrice - stopPrice
  return r > 0 ? r : null
}

export function computeInitialRiskDollars(
  initialRiskPerShare: number,
  shares: number,
): number | null {
  if (initialRiskPerShare <= 0 || shares <= 0) return null
  return Math.round(initialRiskPerShare * shares * 100) / 100
}

export function computeUnrealizedPnLLong(
  entryPrice: number,
  currentPrice: number,
  shares: number,
): number {
  return Math.round((currentPrice - entryPrice) * shares * 100) / 100
}

export function computeUnrealizedR(
  unrealizedPnL: number,
  initialRiskDollars: number,
): number | null {
  if (initialRiskDollars <= 0) return null
  return Math.round((unrealizedPnL / initialRiskDollars) * 10000) / 10000
}

export function computeRealizedPnLLong(
  entryPrice: number,
  exitPrice: number,
  shares: number,
): number {
  return Math.round((exitPrice - entryPrice) * shares * 100) / 100
}

export function computeRealizedR(
  realizedPnL: number,
  initialRiskDollars: number,
): number | null {
  if (initialRiskDollars <= 0) return null
  return Math.round((realizedPnL / initialRiskDollars) * 10000) / 10000
}
