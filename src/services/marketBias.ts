import type { MarketBiasResult, OHLCV, Regime, TrendArrow } from '../domain/types'
import { atr, closes, emaSeries } from './indicators'

function closeVsEmaTrend(lastClose: number, ema20: number | null): TrendArrow {
  if (ema20 == null || ema20 <= 0) return 'flat'
  const pct = (lastClose - ema20) / ema20
  if (pct > 0.008) return 'up'
  if (pct < -0.008) return 'down'
  return 'flat'
}

/**
 * Bias from daily 20 EMA: both above → bullish; both below → bearish; else neutral.
 */
function biasFrom20Ema(spyBars: OHLCV[], qqqBars: OHLCV[]): MarketBiasResult['marketTrend'] {
  if (spyBars.length < 25 || qqqBars.length < 25) return 'neutral'
  const spyC = closes(spyBars)
  const qqqC = closes(qqqBars)
  const spyE = emaSeries(spyC, 20)
  const qqqE = emaSeries(qqqC, 20)
  const spyLast = spyC[spyC.length - 1]!
  const qqqLast = qqqC[qqqC.length - 1]!
  const emaSpy = spyE[spyE.length - 1]
  const emaQqq = qqqE[qqqE.length - 1]
  if (emaSpy == null || emaQqq == null) return 'neutral'
  const spyAbove = spyLast > emaSpy
  const qqqAbove = qqqLast > emaQqq
  const spyBelow = spyLast < emaSpy
  const qqqBelow = qqqLast < emaQqq
  if (spyAbove && qqqAbove) return 'bullish'
  if (spyBelow && qqqBelow) return 'bearish'
  return 'neutral'
}

function inferRegime(bars: OHLCV[], ema20: number | null, lastClose: number): Regime {
  const c = closes(bars)
  if (c.length < 25 || ema20 == null) return 'chop'
  const a = atr(bars, 14)
  const atrPct = a != null && lastClose > 0 ? a / lastClose : 0
  const short = c.slice(-5)
  const slope = short[short.length - 1]! - short[0]!

  if (atrPct < 0.012 && Math.abs(lastClose - ema20) / ema20 < 0.02) {
    return 'chop'
  }
  if (lastClose >= ema20 && slope > 0) return 'trend'
  if (lastClose < ema20 || slope < -0.002 * lastClose) return 'distribution'
  return 'chop'
}

function volatilityState(
  bars: OHLCV[],
  lastClose: number,
): MarketBiasResult['volatility'] {
  const a = atr(bars, 14)
  if (a == null || lastClose <= 0) return 'medium'
  const pct = a / lastClose
  if (pct < 0.012) return 'low'
  if (pct > 0.028) return 'high'
  return 'medium'
}

function indexSnapshot(bars: OHLCV[]): {
  trend: TrendArrow
  regime: Regime
  volatility: MarketBiasResult['volatility']
} {
  if (bars.length < 30) {
    return { trend: 'flat', regime: 'chop', volatility: 'medium' }
  }
  const c = closes(bars)
  const ema20s = emaSeries(c, 20)
  const lastClose = c[c.length - 1]!
  const ema20 = ema20s[ema20s.length - 1] ?? null
  return {
    trend: closeVsEmaTrend(lastClose, ema20),
    regime: inferRegime(bars, ema20, lastClose),
    volatility: volatilityState(bars, lastClose),
  }
}

/**
 * SPY + QQQ daily bars (oldest → newest).
 * Bias: both above 20 EMA → bullish; both below → bearish; else neutral.
 * Regime & volatility: SPY-led.
 */
export function computeMarketBias(
  spyBars: OHLCV[],
  qqqBars: OHLCV[],
): MarketBiasResult {
  const spy = indexSnapshot(spyBars)
  const qqq = indexSnapshot(qqqBars)
  return {
    marketTrend: biasFrom20Ema(spyBars, qqqBars),
    regime: spy.regime,
    spyTrend: spy.trend,
    qqqTrend: qqq.trend,
    volatility: spy.volatility,
  }
}
