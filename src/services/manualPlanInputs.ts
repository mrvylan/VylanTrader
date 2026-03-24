export type ManualPlanProfitR = 3 | 5 | 10

/** Scales base risk $ before stop / target math (same choices as profit R). */
export type ManualPlanRiskMultiplier = 3 | 5 | 10

export function defaultProfitRFromExpected(
  expectedR: number | undefined,
): ManualPlanProfitR {
  if (expectedR == null || !Number.isFinite(expectedR)) return 3
  const opts: ManualPlanProfitR[] = [3, 5, 10]
  let best: ManualPlanProfitR = 3
  let bestDiff = Infinity
  for (const o of opts) {
    const d = Math.abs(o - expectedR)
    if (d < bestDiff) {
      bestDiff = d
      best = o
    }
  }
  return best
}

export type ManualPlanComputed =
  | { ok: false; error: string }
  | {
      ok: true
      stop: number
      target: number
      rps: number
      maxRisk: number
      notional: number
      rewardPerShare: number
      expectedR: number
      baseRiskDollars: number
      riskMultiplier: ManualPlanRiskMultiplier
      effectiveRiskDollars: number
    }

/** Seed base risk field when reopening a plan (effective $ ÷ default multiplier). */
export function baseRiskInputFromEffective(
  effectiveDollars: number,
  multiplier: ManualPlanRiskMultiplier,
): string {
  if (!(effectiveDollars > 0) || !Number.isFinite(effectiveDollars)) return ''
  const b = effectiveDollars / multiplier
  const rounded = Math.round(b * 100) / 100
  return String(rounded)
}

/** Parse risk $ from a free-typed string (commas ok). */
export function parseRiskDollarsInput(raw: string): number {
  const trimmed = raw.trim().replace(/,/g, '')
  if (trimmed === '') return NaN
  return Number(trimmed)
}

export function computeManualPlanInputs(params: {
  entry: string
  shares: string
  riskDollars: string
  riskMultiplier: ManualPlanRiskMultiplier
  profitR: ManualPlanProfitR
  isShort: boolean
}): ManualPlanComputed {
  const e = Number(params.entry)
  const sh = Math.floor(Number(params.shares))
  const baseRisk = parseRiskDollarsInput(params.riskDollars)
  const mult = params.riskMultiplier
  if (
    !Number.isFinite(e) ||
    !Number.isFinite(sh) ||
    sh < 1 ||
    !Number.isFinite(baseRisk) ||
    baseRisk <= 0
  ) {
    return {
      ok: false,
      error:
        'Enter entry, at least 1 share, and positive base risk ($).',
    }
  }
  const effectiveRisk = baseRisk * mult
  if (!Number.isFinite(effectiveRisk) || effectiveRisk <= 0) {
    return { ok: false, error: 'Invalid effective risk after multiplier.' }
  }
  const rps = effectiveRisk / sh
  if (!Number.isFinite(rps) || rps <= 0) {
    return { ok: false, error: 'Invalid risk per share.' }
  }
  const stop = params.isShort ? e + rps : e - rps
  const target = params.isShort
    ? e - params.profitR * rps
    : e + params.profitR * rps
  if (!Number.isFinite(stop) || !Number.isFinite(target)) {
    return { ok: false, error: 'Invalid stop or target.' }
  }
  if (!params.isShort) {
    if (!(stop < e && e < target)) {
      return {
        ok: false,
        error:
          'Long: stop must be below entry and target above entry. Adjust base risk, multiplier, shares, or entry.',
      }
    }
  } else {
    if (!(target < e && e < stop)) {
      return {
        ok: false,
        error:
          'Short: target below entry and stop above entry. Adjust base risk, multiplier, shares, or entry.',
      }
    }
  }
  const maxRisk = sh * rps
  const rewardPerShare = params.isShort ? e - target : target - e
  const expectedR = rewardPerShare / rps
  const notional = sh * e
  return {
    ok: true,
    stop,
    target,
    rps,
    maxRisk,
    notional,
    rewardPerShare,
    expectedR,
    baseRiskDollars: baseRisk,
    riskMultiplier: mult,
    effectiveRiskDollars: effectiveRisk,
  }
}
