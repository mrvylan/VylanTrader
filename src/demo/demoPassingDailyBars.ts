import type { OHLCV } from '../domain/types'

function bar(
  t: number,
  o: number,
  h: number,
  l: number,
  c: number,
  v: number,
): OHLCV {
  return { t, o, h, l, c, v }
}

/**
 * Strong uptrend + volume spike (same family as scanner tests) so
 * tryBuildMorningTradePlan can pass for demo “Create plan” on AMD.
 */
export function generateUptrendBreakoutDailyBars(): OHLCV[] {
  const rows: OHLCV[] = []
  let ts = Date.UTC(2024, 0, 1)
  let c = 45
  for (let i = 0; i < 40; i++) {
    const o = c
    c = o + 0.4
    const h = Math.max(o, c) + 0.25
    const l = Math.min(o, c) - 0.2
    rows.push(bar(ts, o, h, l, c, 2_200_000))
    ts += 86_400_000
  }
  const prev = rows[rows.length - 1]!
  const o = prev.c
  const nextC = o * 1.055
  const h = nextC * 1.012
  rows.push(bar(ts, o, h, o * 0.996, nextC, 5_500_000))
  return rows
}
