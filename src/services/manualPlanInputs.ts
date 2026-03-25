import { sharesFromRisk } from './planner'

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
      /** entry − stop per share (long; risk distance). */
      rps: number
      maxRisk: number
      notional: number
      rewardPerShare: number
      expectedR: number
      positionSize: number
      /** Dollars the user entered as risk budget (before share floor). */
      riskBudgetDollars: number
    }

/** Seed risk $ field when reopening a plan (effective max loss at stop). */
export function baseRiskInputFromEffective(
  effectiveDollars: number,
  _multiplier: ManualPlanRiskMultiplier,
): string {
  if (!(effectiveDollars > 0) || !Number.isFinite(effectiveDollars)) return ''
  const rounded = Math.round(effectiveDollars * 100) / 100
  return String(rounded)
}

/** Parse risk $ from a free-typed string (commas ok). */
export function parseRiskDollarsInput(raw: string): number {
  const trimmed = raw.trim().replace(/,/g, '')
  if (trimmed === '') return NaN
  return Number(trimmed)
}

/**
 * Long-only: stop &lt; entry. Shares = floor(risk ÷ (entry − stop)).
 * Target = entry + profitR × (entry − stop).
 */
export function computeManualPlanInputsFromStop(params: {
  entry: string
  stop: string
  riskDollars: string
  profitR: ManualPlanProfitR
}): ManualPlanComputed {
  const e = Number(params.entry)
  const s = Number(params.stop)
  const riskBudget = parseRiskDollarsInput(params.riskDollars)
  if (!Number.isFinite(e) || !Number.isFinite(s)) {
    return { ok: false, error: 'Enter valid entry and stop prices.' }
  }
  if (!Number.isFinite(riskBudget) || riskBudget <= 0) {
    return {
      ok: false,
      error: 'Enter a positive dollar amount you are willing to risk.',
    }
  }
  if (!(s < e)) {
    return {
      ok: false,
      error: 'Stop must be below entry (long). Risk per share = entry − stop.',
    }
  }

  const rps = e - s
  if (!Number.isFinite(rps) || rps <= 0) {
    return { ok: false, error: 'Entry and stop cannot be equal.' }
  }

  const sh = sharesFromRisk(riskBudget, e, s)
  if (sh == null) {
    return {
      ok: false,
      error:
        'Risk $ is too small for this entry–stop distance (need at least 1 share).',
    }
  }

  const stop = s
  const target = e + params.profitR * rps
  if (!Number.isFinite(target)) {
    return { ok: false, error: 'Invalid target.' }
  }
  if (!(stop < e && e < target)) {
    return {
      ok: false,
      error: 'Target must be above entry. Try a different profit R.',
    }
  }

  const maxRisk = Math.round(sh * rps * 100) / 100
  const rewardPerShare = target - e
  const expectedR = rewardPerShare / rps
  const notional = Math.round(sh * e * 100) / 100
  return {
    ok: true,
    stop,
    target,
    rps,
    maxRisk,
    notional,
    rewardPerShare,
    expectedR,
    positionSize: sh,
    riskBudgetDollars: riskBudget,
  }
}
