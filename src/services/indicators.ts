import type { OHLCV } from '../domain/types'

export function sma(values: number[], period: number): number | null {
  if (values.length < period) return null
  const slice = values.slice(-period)
  return slice.reduce((a, b) => a + b, 0) / period
}

/** Exponential moving average of closes. Returns array aligned to input (null until warmed). */
export function emaSeries(closes: number[], period: number): (number | null)[] {
  if (closes.length === 0) return []
  const alpha = 2 / (period + 1)
  const out: (number | null)[] = []
  let prev: number | null = null
  for (let i = 0; i < closes.length; i++) {
    const close = closes[i]!
    if (i + 1 < period) {
      out.push(null)
      continue
    }
    if (prev === null) {
      const seed = sma(closes.slice(0, i + 1), period)
      prev = seed ?? close
    } else {
      prev = alpha * close + (1 - alpha) * prev
    }
    out.push(prev)
  }
  return out
}

export function lastEma(closes: number[], period: number): number | null {
  const s = emaSeries(closes, period)
  for (let i = s.length - 1; i >= 0; i--) {
    if (s[i] != null) return s[i]!
  }
  return null
}

/** Wilder ATR(period) — last value only. */
export function atr(bars: OHLCV[], period: number): number | null {
  if (bars.length < period + 1) return null
  const tr: number[] = []
  for (let i = 1; i < bars.length; i++) {
    const cur = bars[i]!
    const prev = bars[i - 1]!
    const highLow = cur.h - cur.l
    const highPc = Math.abs(cur.h - prev.c)
    const lowPc = Math.abs(cur.l - prev.c)
    tr.push(Math.max(highLow, highPc, lowPc))
  }
  let atrVal = tr.slice(0, period).reduce((a, b) => a + b, 0) / period
  for (let i = period; i < tr.length; i++) {
    atrVal = (atrVal * (period - 1) + tr[i]!) / period
  }
  return atrVal
}

export function relativeVolume(bars: OHLCV[], lookback = 20): number | null {
  if (bars.length < lookback + 1) return null
  const vols = bars.slice(-lookback - 1, -1).map((b) => b.v)
  const avg = vols.reduce((a, b) => a + b, 0) / vols.length
  if (avg <= 0) return null
  return bars[bars.length - 1]!.v / avg
}

export function recentHighLow(
  bars: OHLCV[],
  lookback: number,
): { high: number; low: number } | null {
  if (bars.length < lookback) return null
  const slice = bars.slice(-lookback)
  let high = -Infinity
  let low = Infinity
  for (const b of slice) {
    if (b.h > high) high = b.h
    if (b.l < low) low = b.l
  }
  return { high, low }
}

export function closes(bars: OHLCV[]): number[] {
  return bars.map((b) => b.c)
}

/**
 * Mean of (high − low) / close over the last `lookback` daily bars — “ADR %” style width.
 * Used to cap how wide a long stop may sit below entry (with ATR).
 */
export function averageDailyRangePct(
  bars: OHLCV[],
  lookback = 20,
): number | null {
  if (bars.length < lookback || lookback < 1) return null
  const slice = bars.slice(-lookback)
  let sum = 0
  for (const b of slice) {
    if (b.c <= 0) return null
    sum += (b.h - b.l) / b.c
  }
  return sum / slice.length
}
