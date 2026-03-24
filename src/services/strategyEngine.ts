import type {
  CandidateTier,
  MarketBiasResult,
  MarketTrend,
  OHLCV,
  PlanRejectionDetail,
  ScannerCandidate,
  StrategyKind,
  SymbolScanDebug,
  SymbolScanResult,
  SymbolScanStatus,
  ScanRejectionReason,
  TradePlan,
  TrendArrow,
  UserSettings,
} from '../domain/types'
import type { FullTradeSetupScoreInput, SetupQualityInput } from './setupScoring'
import {
  atr,
  averageDailyRangePct,
  closes,
  lastEma,
  recentHighLow,
  relativeVolume,
} from './indicators'
import { sharesFromRisk } from './planner'
import {
  morningStrategyScoreBreakdown,
  scoreMorningStrategy,
} from './strategyScore'
import { strategyKindLabel } from './strategyLabels'
import type { MorningPlanBuildResult } from './morningPlanResult'
import {
  buildRejectionSuggestions,
  explainScanRejectionReasons,
  headlineForRejection,
} from './rejectionNarrative'
import { evaluateUniverseFilter } from './universeFilter'
import { planMeetsMorningQualityGate } from './tradePlanQuality'
import { roundRiskAmountDollars } from './tradePlanMoney'
import {
  DEFAULT_SCANNER_TUNING,
  mergeScannerTuning,
  type ScannerTuning,
} from './scannerTuning'

const HIGH_LOOKBACK = 20

function tickerTrend(closesArr: number[], ema20: number | null): TrendArrow {
  const last = closesArr[closesArr.length - 1]
  if (last == null || ema20 == null || ema20 <= 0) return 'flat'
  const pct = (last - ema20) / ema20
  if (pct > 0.006) return 'up'
  if (pct < -0.006) return 'down'
  return 'flat'
}

type RawHit = {
  side: 'long' | 'short'
  strategyKind: StrategyKind
  entry: number
  stop: number
  target: number
  expectedR: number
  level: number
  ema9: number
  ema20: number
  relVolume: number
  trendArrow: TrendArrow
  nearResistancePct: number
  lastClose: number
  closesLast5: number[]
  setupQuality: SetupQualityInput
}

function invertTrendArrow(a: TrendArrow): TrendArrow {
  if (a === 'up') return 'down'
  if (a === 'down') return 'up'
  return 'flat'
}

function mirrorBarsForShort(bars: OHLCV[]): OHLCV[] {
  return bars.map((b) => ({
    t: b.t,
    o: -b.o,
    h: -b.l,
    l: -b.h,
    c: -b.c,
    v: b.v,
  }))
}

function shortFromMirroredHit(hit: RawHit): RawHit {
  return {
    ...hit,
    side: 'short',
    entry: -hit.entry,
    stop: -hit.stop,
    target: -hit.target,
    level: -hit.level,
    ema9: -hit.ema9,
    ema20: -hit.ema20,
    trendArrow: invertTrendArrow(hit.trendArrow),
    lastClose: -hit.lastClose,
    closesLast5: hit.closesLast5.map((x) => -x),
  }
}

/**
 * Tighten structural long stop: require entry − stop ≤ min(ATR$, ADR%×entry).
 * Pulls stop upward (higher price) when structure would be too wide.
 */
function clampLongStopByAtrAndAdr(
  entry: number,
  structuralStop: number,
  atrDollars: number,
  adrPct: number | null,
): number {
  if (!Number.isFinite(entry) || entry <= 0 || structuralStop >= entry) {
    return structuralStop
  }
  const adrWidth =
    adrPct != null && adrPct > 0 && Number.isFinite(adrPct)
      ? entry * adrPct
      : Number.POSITIVE_INFINITY
  const atrWidth =
    atrDollars > 0 && Number.isFinite(atrDollars)
      ? atrDollars
      : Number.POSITIVE_INFINITY
  const maxWidth = Math.min(atrWidth, adrWidth)
  if (!Number.isFinite(maxWidth) || maxWidth <= 0) return structuralStop
  const floorStop = entry - maxWidth
  return Math.max(structuralStop, floorStop)
}

function applyVolatilityStopCap(
  entry: number,
  stop: number,
  atrDollars: number,
  bars: OHLCV[],
  t: ScannerTuning,
): number {
  if (!t.capStopByAtrAndAdr) return stop
  const adrPct = averageDailyRangePct(bars, t.adrRangeLookback)
  return clampLongStopByAtrAndAdr(entry, stop, atrDollars, adrPct)
}

function logCandidate(
  ticker: string,
  kind: StrategyKind,
  detail: Record<string, string | number>,
): void {
  const parts = Object.entries(detail).map(([k, v]) => `${k}=${v}`)
  console.log(
    `[Trade UI] Strategy candidate: ${ticker} · ${kind} · ${parts.join(' · ')}`,
  )
}

function tryBreakoutRetest(
  ticker: string,
  bars: OHLCV[],
  c: number[],
  last: number,
  ema9: number,
  ema20: number,
  recentHigh: number,
  recentLow: number,
  dailyEma20: number,
  rv: number,
  trendArrow: TrendArrow,
  t: ScannerTuning,
): RawHit | null {
  if (last <= dailyEma20) return null
  if (last < recentHigh * t.breakoutNearHighRatio) return null
  if (rv < t.minRelVolPattern) return null
  if (last > recentHigh * 1.015) return null

  const a = atr(bars, 14) ?? last * 0.015
  const breakoutBuffer = Math.max(0.05, a * 0.1)
  const stopBuffer = Math.max(0.1, a * 0.15)
  const entry = Math.max(last, recentHigh + breakoutBuffer)
  let stop = recentHigh - stopBuffer
  if (recentLow > 0) {
    stop = Math.max(stop, recentLow * 0.998)
  }
  if (stop >= entry) {
    stop = entry - Math.max(a, entry * t.stopUnderEntryMinFraction)
  }
  stop = applyVolatilityStopCap(entry, stop, a, bars, t)
  if (stop >= entry) {
    stop = entry - Math.max(a, entry * t.stopUnderEntryMinFraction)
  }
  const risk = entry - stop
  if (risk <= 0) return null

  const target = entry + Math.max(2, t.targetRMultiple) * risk
  const expectedR = (target - entry) / risk

  const riskAtr = risk / a
  const extensionPct = Math.max(0, (last - recentHigh) / recentHigh)
  const holdAtHigh = last >= recentHigh * 0.998

  logCandidate(ticker, 'breakout_retest', {
    close: Number(last.toFixed(4)),
    high20: Number(recentHigh.toFixed(4)),
    relVol: Number(rv.toFixed(2)),
    expectedR: Number(expectedR.toFixed(2)),
  })

  return {
    side: 'long',
    strategyKind: 'breakout_retest',
    entry,
    stop,
    target,
    expectedR,
    level: recentHigh,
    ema9,
    ema20,
    relVolume: rv,
    trendArrow,
    nearResistancePct:
      recentHigh > 0 ? Math.abs(recentHigh - last) / recentHigh : 0,
    lastClose: last,
    closesLast5: c.slice(-5),
    setupQuality: {
      kind: 'breakout_retest',
      breakout: { extensionPct, riskAtr, holdAtHigh },
    },
  }
}

function tryTrendPullback(
  ticker: string,
  bars: OHLCV[],
  c: number[],
  last: number,
  ema9: number,
  ema20: number,
  recentHigh: number,
  rv: number,
  trendArrow: TrendArrow,
  t: ScannerTuning,
): RawHit | null {
  if (last <= ema20) return null
  if (ema9 < ema20 * 0.998) return null

  const swingHigh = recentHigh > 0 ? recentHigh : last
  const pullDepth = swingHigh > 0 ? (swingHigh - last) / swingHigh : 1
  if (pullDepth > Math.min(t.pullbackMaxDepth, 0.035) || pullDepth < 0) return null

  const inPullbackZone =
    last <= ema9 * 1.04 && last >= ema20 * 0.965
  if (!inPullbackZone) return null

  const last3 = bars.slice(-3)
  if (last3.length < 3) return null
  const lows = last3.map((b) => b.l)
  const pullLow = Math.min(...lows)
  if (pullLow < ema20 * 0.965) return null

  const range3 =
    Math.max(...last3.map((b) => b.h)) - Math.min(...last3.map((b) => b.l))
  const a = atr(bars, 14) ?? last * 0.015
  if (range3 > a * 4.5) return null

  const prev = bars[bars.length - 2]!
  const cur = bars[bars.length - 1]!
  const reversalHigh = Math.max(prev.h, cur.h)
  const entry = reversalHigh + 0.05
  let stop = pullLow - 0.05
  if (stop >= entry) {
    stop = entry - Math.max(a * 1.1, entry * t.stopUnderEntryMinFraction)
  }
  stop = applyVolatilityStopCap(entry, stop, a, bars, t)
  if (stop >= entry) {
    stop = entry - Math.max(a * 1.1, entry * t.stopUnderEntryMinFraction)
  }
  const risk = entry - stop
  if (risk <= 0) return null

  const priorSlice = bars.slice(-HIGH_LOOKBACK - 1, -1)
  let priorHigh = recentHigh
  if (priorSlice.length >= 5) {
    priorHigh = Math.max(...priorSlice.map((b) => b.h))
  }
  const targetFrom2R = entry + Math.max(2, t.targetRMultiple) * risk
  const target = Math.max(priorHigh, targetFrom2R)
  const expectedR = (target - entry) / risk

  const rangeAtr = range3 / a
  const depthToEma9 = (ema9 - last) / ema9
  const reversalOk =
    cur.c >= prev.c * 1.0005 && cur.c > cur.o

  logCandidate(ticker, 'trend_pullback', {
    close: Number(last.toFixed(4)),
    ema9: Number(ema9.toFixed(4)),
    ema20: Number(ema20.toFixed(4)),
    expectedR: Number(expectedR.toFixed(2)),
  })

  return {
    side: 'long',
    strategyKind: 'trend_pullback',
    entry,
    stop,
    target,
    expectedR,
    level: ema9,
    ema9,
    ema20,
    relVolume: rv,
    trendArrow,
    nearResistancePct:
      recentHigh > 0 ? Math.abs(recentHigh - last) / recentHigh : 0,
    lastClose: last,
    closesLast5: c.slice(-5),
    setupQuality: {
      kind: 'trend_pullback',
      pullback: { rangeAtr, depthToEma9, reversalOk },
    },
  }
}

/**
 * ORB continuation on intraday bars (first 5m/15m range).
 */
function tryOrbContinuation(
  ticker: string,
  bars: OHLCV[],
  bias: MarketTrend,
  c: number[],
  last: number,
  ema9: number,
  ema20: number,
  rv: number,
  trendArrow: TrendArrow,
  recentHigh: number,
  t: ScannerTuning,
): RawHit | null {
  if (bias === 'bearish') return null
  if (bars.length < 8) return null
  const openTs = bars[0]!.t
  const inFirst15m = bars.filter((b) => b.t - openTs <= 15 * 60_000)
  const inFirst5m = bars.filter((b) => b.t - openTs <= 5 * 60_000)
  const openingRangeBars = inFirst15m.length >= 3 ? inFirst15m : inFirst5m
  if (openingRangeBars.length === 0) return null
  const cur = bars[bars.length - 1]!
  const orh = Math.max(...openingRangeBars.map((b) => b.h))
  const orl = Math.min(...openingRangeBars.map((b) => b.l))
  const a = atr(bars, 14) ?? cur.c * 0.012
  const range = orh - orl
  const clearRange = range > 0 && range <= Math.max(cur.c * 0.02, a * 2.5)
  if (!clearRange) return null

  if (cur.c <= orh * 1.001) return null
  if (rv < t.minRelVolPattern) return null

  const entry = Math.max(cur.c, orh + 0.05)
  let stop = orl - 0.05
  if (stop >= entry) {
    stop = entry - Math.max(a, entry * t.stopUnderEntryMinFraction)
  }
  stop = applyVolatilityStopCap(entry, stop, a, bars, t)
  if (stop >= entry) {
    stop = entry - Math.max(a, entry * t.stopUnderEntryMinFraction)
  }
  const risk = entry - stop
  if (risk <= 0) return null

  const target = entry + Math.max(2, t.targetRMultiple) * risk
  const expectedR = (target - entry) / risk

  const rangePct = range / cur.c
  const riskAtrValue = risk / a
  const volStrong = rv >= 1.5

  logCandidate(ticker, 'orb_continuation', {
    close: Number(cur.c.toFixed(4)),
    orHigh: Number(orh.toFixed(4)),
    relVol: Number(rv.toFixed(2)),
    expectedR: Number(expectedR.toFixed(2)),
  })

  return {
    side: 'long',
    strategyKind: 'orb_continuation',
    entry,
    stop,
    target,
    expectedR,
    level: orh,
    ema9,
    ema20,
    relVolume: rv,
    trendArrow,
    nearResistancePct:
      recentHigh > 0 ? Math.abs(recentHigh - last) / recentHigh : 0,
    lastClose: cur.c,
    closesLast5: c.slice(-5),
    setupQuality: {
      kind: 'orb_continuation',
      orb: { rangePct, riskAtrValue, volStrong },
    },
  }
}

function fullInputFromHit(
  hit: RawHit,
  marketBias: MarketBiasResult,
  now: Date,
): FullTradeSetupScoreInput {
  const trend =
    hit.side === 'short'
      ? {
          lastClose: -hit.lastClose,
          ema9: -hit.ema9,
          ema20: -hit.ema20,
          trendArrow: invertTrendArrow(hit.trendArrow),
          recentCloses5: hit.closesLast5.map((x) => -x),
        }
      : {
          lastClose: hit.lastClose,
          ema9: hit.ema9,
          ema20: hit.ema20,
          trendArrow: hit.trendArrow,
          recentCloses5: hit.closesLast5,
        }
  return {
    market: {
      marketTrend: marketBias.marketTrend,
      regime: marketBias.regime,
      spyTrend: marketBias.spyTrend,
      qqqTrend: marketBias.qqqTrend,
    },
    strategyKind: hit.strategyKind,
    setupQuality: hit.setupQuality,
    relVolume: hit.relVolume,
    trend,
    levelDistancePct: hit.nearResistancePct,
    expectedR: hit.expectedR,
    now,
  }
}

function scoreHit(
  hit: RawHit,
  marketBias: MarketBiasResult,
  now: Date,
): number {
  const base = scoreMorningStrategy(fullInputFromHit(hit, marketBias, now))
  const bearishDistribution =
    marketBias.marketTrend === 'bearish' && marketBias.regime === 'distribution'
  const conflictsBias =
    (hit.side === 'long' && marketBias.marketTrend === 'bearish') ||
    (hit.side === 'short' && marketBias.marketTrend === 'bullish')

  let adjusted = base

  // Directional conflict should materially reduce ranking quality.
  if (conflictsBias) adjusted -= 30

  // In bearish+distribution, prioritize short breakdown/pullback/failed-breakout style ideas.
  if (bearishDistribution) {
    if (hit.side === 'long') {
      adjusted -= hit.strategyKind === 'orb_continuation' ? 18 : 10
    } else {
      if (hit.strategyKind === 'orb_continuation') adjusted += 10 // opening-range breakdown proxy
      if (hit.strategyKind === 'trend_pullback') adjusted += 8
      if (hit.strategyKind === 'breakout_retest') adjusted += 6 // failed-breakout proxy
    }
  }

  return Math.max(0, Math.min(100, Math.round(adjusted * 10) / 10))
}

function dedupeReasons(r: ScanRejectionReason[]): ScanRejectionReason[] {
  return [...new Set(r)]
}

export function rawHits(
  ticker: string,
  bars: OHLCV[],
  bias: MarketTrend,
  _marketBias: MarketBiasResult,
  tuning: ScannerTuning = DEFAULT_SCANNER_TUNING,
  dailyBars?: OHLCV[],
): RawHit[] {
  if (bars.length < HIGH_LOOKBACK + 5) return []

  const c = closes(bars)
  const last = c[c.length - 1]!
  const ema9 = lastEma(c, 9)
  const ema20 = lastEma(c, 20)
  if (ema9 == null || ema20 == null) return []

  const daily = dailyBars && dailyBars.length >= HIGH_LOOKBACK ? dailyBars : bars
  const dailyCloses = closes(daily)
  const dailyEma20 = lastEma(dailyCloses, 20)
  if (dailyEma20 == null) return []
  const hl = recentHighLow(daily, HIGH_LOOKBACK)
  if (!hl) return []
  const rv = relativeVolume(bars, HIGH_LOOKBACK)
  if (rv == null) return []

  const trendArrow = tickerTrend(c, ema20)
  const out: RawHit[] = []

  const b = tryBreakoutRetest(
    ticker,
    bars,
    c,
    last,
    ema9,
    ema20,
    hl.high,
    hl.low,
    dailyEma20,
    rv,
    trendArrow,
    tuning,
  )
  if (b) out.push(b)

  const p = tryTrendPullback(
    ticker,
    bars,
    c,
    last,
    ema9,
    ema20,
    hl.high,
    rv,
    trendArrow,
    tuning,
  )
  if (p) out.push(p)

  const o = tryOrbContinuation(
    ticker,
    bars,
    bias,
    c,
    last,
    ema9,
    ema20,
    rv,
    trendArrow,
    hl.high,
    tuning,
  )
  if (o) out.push(o)

  if (bias === 'bearish') {
    const mirrored = mirrorBarsForShort(bars)
    const mc = closes(mirrored)
    const mLast = mc[mc.length - 1]!
    const mEma9 = lastEma(mc, 9)
    const mEma20 = lastEma(mc, 20)
    const mHl = recentHighLow(mirrored, HIGH_LOOKBACK)
    const mRv = relativeVolume(mirrored, HIGH_LOOKBACK)
    if (mEma9 != null && mEma20 != null && mHl != null && mRv != null) {
      const mTrend = tickerTrend(mc, mEma20)
      const mDaily = daily.map((b) => ({
        t: b.t,
        o: -b.o,
        h: -b.l,
        l: -b.h,
        c: -b.c,
        v: b.v,
      }))
      const mDailyCloses = closes(mDaily)
      const mDailyEma20 = lastEma(mDailyCloses, 20)
      if (mDailyEma20 == null) return out
      const sb = tryBreakoutRetest(
        ticker,
        mirrored,
        mc,
        mLast,
        mEma9,
        mEma20,
        mHl.high,
        mHl.low,
        mDailyEma20,
        mRv,
        mTrend,
        tuning,
      )
      if (sb) out.push(shortFromMirroredHit(sb))

      const sp = tryTrendPullback(
        ticker,
        mirrored,
        mc,
        mLast,
        mEma9,
        mEma20,
        mHl.high,
        mRv,
        mTrend,
        tuning,
      )
      if (sp) out.push(shortFromMirroredHit(sp))

      const so = tryOrbContinuation(
        ticker,
        mirrored,
        'neutral',
        mc,
        mLast,
        mEma9,
        mEma20,
        mRv,
        mTrend,
        mHl.high,
        tuning,
      )
      if (so) out.push(shortFromMirroredHit(so))
    }
  }

  return out
}

function candidateFromHit(ticker: string, hit: RawHit): ScannerCandidate {
  return {
    ticker,
    strategyKind: hit.strategyKind,
    level: hit.level,
    ema9: hit.ema9,
    ema20: hit.ema20,
    relVolume: hit.relVolume,
    trendArrow: hit.trendArrow,
    nearResistancePct: hit.nearResistancePct,
  }
}

function planFromHit(
  ticker: string,
  hit: RawHit,
  score: number,
  settings: UserSettings,
  bias: MarketTrend,
  planId: string,
): { candidate: ScannerCandidate; plan: TradePlan } {
  const riskPerShare =
    hit.side === 'short' ? hit.stop - hit.entry : hit.entry - hit.stop
  const shares = sharesFromRisk(settings.riskPerTrade, hit.entry, hit.stop) ?? 0
  const riskAmount = roundRiskAmountDollars(shares, riskPerShare)
  const rMultiple =
    Math.round(((hit.target - hit.entry) / riskPerShare) * 100) / 100

  const candidate: ScannerCandidate = {
    ticker,
    strategyKind: hit.strategyKind,
    level: hit.level,
    ema9: hit.ema9,
    ema20: hit.ema20,
    relVolume: hit.relVolume,
    trendArrow: hit.trendArrow,
    nearResistancePct: hit.nearResistancePct,
  }

  const plan: TradePlan = {
    id: planId,
    ticker,
    setupKind: hit.strategyKind,
    setupType: strategyKindLabel(hit.strategyKind),
    bias,
    entry: hit.entry,
    stop: hit.stop,
    target: hit.target,
    positionSize: shares,
    riskAmount,
    riskPerShare,
    rMultiple,
    expectedR: Math.round(hit.expectedR * 100) / 100,
    status: 'watching',
    notes: `Rel vol ${hit.relVolume.toFixed(2)}× · ${hit.side.toUpperCase()} · ${hit.strategyKind} · score ${score.toFixed(1)} · expR ${hit.expectedR.toFixed(2)}`,
    score,
    createdAt: new Date().toISOString(),
    alertEnabled: true,
  }

  return { candidate, plan }
}

/**
 * Full scanner + plan with explicit rejection reasons (score, R, sizing, geometry).
 * Use `scoreTime` from last morning prep so execution-fit score matches the prep row.
 */
export function tryBuildMorningTradePlan(
  ticker: string,
  bars: OHLCV[],
  settings: UserSettings,
  bias: MarketTrend,
  marketBias: MarketBiasResult,
  planId: string,
  options?: { scoreTime?: Date; tuning?: Partial<ScannerTuning> },
): MorningPlanBuildResult {
  const tuning = mergeScannerTuning(options?.tuning)
  const hits = rawHits(ticker, bars, bias, marketBias, tuning)
  const riskBudget = settings.riskPerTrade

  if (hits.length === 0) {
    const codes: ScanRejectionReason[] = ['no_valid_pattern']
    const detail: PlanRejectionDetail = {}
    return {
      ok: false,
      ticker,
      headline: headlineForRejection(false, codes),
      reasons: explainScanRejectionReasons(codes, detail),
      rejectionCodes: codes,
      rejectionDetail: detail,
      scoreBreakdown: null,
      debug: { riskBudget },
    }
  }

  const now = options?.scoreTime ?? new Date()
  const evaluated = hits.map((hit) => ({
    hit,
    score: scoreHit(hit, marketBias, now),
  }))
  evaluated.sort((a, b) => b.score - a.score)

  /** Tradable directional setup: valid geometry and at least 1 share. */
  for (const { hit, score } of evaluated) {
    const riskPerShare =
      hit.side === 'short' ? hit.stop - hit.entry : hit.entry - hit.stop
    const geomOk =
      hit.side === 'short'
        ? hit.entry < hit.stop && hit.target < hit.entry
        : hit.entry > hit.stop && hit.target > hit.entry
    if (riskPerShare <= 0 || !geomOk) continue
    const shares = sharesFromRisk(settings.riskPerTrade, hit.entry, hit.stop) ?? 0
    if (shares <= 0) continue

    const built = planFromHit(ticker, hit, score, settings, bias, planId)
    console.log(
      `[Trade UI] Plan surfaced: ${ticker} · ${hit.strategyKind} · score=${score.toFixed(1)} · expR=${hit.expectedR.toFixed(2)} · entry=${hit.entry.toFixed(2)}`,
    )
    console.log('[Trade UI] Plan debug', {
      entry: hit.entry,
      stop: hit.stop,
      target: hit.target,
      riskPerShare,
      expectedR: hit.expectedR,
      positionSize: built.plan.positionSize,
    })
    return { ok: true, ...built }
  }

  const best = evaluated[0]!
  const { hit, score } = best
  const riskPerShare =
    hit.side === 'short' ? hit.stop - hit.entry : hit.entry - hit.stop
  const geomOk =
    hit.side === 'short'
      ? hit.entry < hit.stop && hit.target < hit.entry
      : hit.entry > hit.stop && hit.target > hit.entry
  if (riskPerShare <= 0 || !geomOk) {
    const codesRaw: ScanRejectionReason[] = []
    if (riskPerShare <= 0) codesRaw.push('entry_not_above_stop')
    if (!geomOk) codesRaw.push('target_not_above_entry')
    const codes = dedupeReasons(codesRaw)
    const detail: PlanRejectionDetail = {
      actualScore: score,
      requiredScore: tuning.minMorningScore,
      actualExpectedR: hit.expectedR,
      requiredExpectedR: tuning.minExpectedR,
      positionSize: 0,
      requiredPositionSize: 1,
      riskBudgetPerTrade: riskBudget,
      riskPerShare: riskPerShare > 0 ? riskPerShare : undefined,
    }
    const bd = morningStrategyScoreBreakdown(
      fullInputFromHit(hit, marketBias, now),
    )
    const debug = {
      entry: hit.entry,
      stop: hit.stop,
      target: hit.target,
      riskPerShare,
      expectedR: hit.expectedR,
      score,
      positionSize: 0,
      riskBudget,
      strategyKind: hit.strategyKind,
    }
    console.warn('[Trade UI] Morning plan rejected (geometry)', debug)
    if (import.meta.env.DEV) {
      console.debug('[Trade UI] tryBuildMorningTradePlan rejection', {
        ticker,
        codes,
        detail,
        scoreBreakdown: bd,
      })
    }
    return {
      ok: false,
      ticker,
      headline: headlineForRejection(true, codes),
      reasons: explainScanRejectionReasons(codes, detail),
      suggestion: buildRejectionSuggestions(codes, detail, bd).join(' '),
      rejectionCodes: codes,
      rejectionDetail: detail,
      scoreBreakdown: bd,
      debug,
    }
  }

  const debug = {
    entry: hit.entry,
    stop: hit.stop,
    target: hit.target,
    riskPerShare,
    expectedR: hit.expectedR,
    score,
    positionSize: 0,
    riskBudget,
    strategyKind: hit.strategyKind,
  }
  console.warn('[Trade UI] Morning plan rejected (sizing)', {
    ...debug,
    floorRisk: riskBudget / riskPerShare,
  })
  const codes = dedupeReasons(
    riskPerShare > riskBudget
      ? (['position_size_below_one', 'stop_too_wide'] as ScanRejectionReason[])
      : ['position_size_below_one'],
  )
  const detail: PlanRejectionDetail = {
    actualScore: score,
    requiredScore: tuning.minMorningScore,
    actualExpectedR: hit.expectedR,
    requiredExpectedR: tuning.minExpectedR,
    positionSize: 0,
    requiredPositionSize: 1,
    riskBudgetPerTrade: riskBudget,
    riskPerShare,
  }
  const bd = morningStrategyScoreBreakdown(
    fullInputFromHit(hit, marketBias, now),
  )
  if (import.meta.env.DEV) {
    console.debug('[Trade UI] tryBuildMorningTradePlan rejection', {
      ticker,
      codes,
      detail,
      scoreBreakdown: bd,
    })
  }
  return {
    ok: false,
    ticker,
    headline: headlineForRejection(true, codes),
    reasons: explainScanRejectionReasons(codes, detail),
    suggestion: buildRejectionSuggestions(codes, detail, bd).join(' '),
    rejectionCodes: codes,
    rejectionDetail: detail,
    scoreBreakdown: bd,
    debug,
  }
}

/**
 * Morning swing scanner + plan: first tradable pattern (geometry + ≥1 share), sized from settings.
 * Score / expected-R gates apply at approval time in the UI, not here.
 */
export function scanAndBuildTradePlan(
  ticker: string,
  bars: OHLCV[],
  settings: UserSettings,
  bias: MarketTrend,
  marketBias: MarketBiasResult,
  planId: string,
  options?: { scoreTime?: Date; tuning?: Partial<ScannerTuning> },
): { candidate: ScannerCandidate; plan: TradePlan } | null {
  const r = tryBuildMorningTradePlan(
    ticker,
    bars,
    settings,
    bias,
    marketBias,
    planId,
    options,
  )
  return r.ok ? { candidate: r.candidate, plan: r.plan } : null
}

/**
 * Best pattern candidate by morning score (no approval gates — for diagnostics / tests).
 */
export function scanTicker(
  ticker: string,
  bars: OHLCV[],
  options?: {
    scoreTime?: Date
    marketBias?: MarketBiasResult
    tuning?: Partial<ScannerTuning>
  },
): ScannerCandidate | null {
  const fallbackBias: MarketBiasResult = {
    marketTrend: 'neutral',
    regime: 'chop',
    spyTrend: 'flat',
    qqqTrend: 'flat',
    volatility: 'medium',
  }
  const mb = options?.marketBias ?? fallbackBias
  const tuning = mergeScannerTuning(options?.tuning)
  const hits = rawHits(ticker, bars, mb.marketTrend, mb, tuning)
  if (hits.length === 0) return null

  const now = options?.scoreTime ?? new Date()
  let best: { hit: RawHit; score: number } | null = null
  for (const hit of hits) {
    const score = scoreHit(hit, mb, now)
    if (!best || score > best.score) best = { hit, score }
  }
  if (!best) return null

  const { hit } = best
  return {
    ticker,
    strategyKind: hit.strategyKind,
    level: hit.level,
    ema9: hit.ema9,
    ema20: hit.ema20,
    relVolume: hit.relVolume,
    trendArrow: hit.trendArrow,
    nearResistancePct: hit.nearResistancePct,
  }
}

function buildSymbolScanDebug(
  ticker: string,
  hit: RawHit | null,
  score: number | null,
  plan: TradePlan | null,
  status: SymbolScanStatus,
  rejectionReasons: ScanRejectionReason[],
  hl: { high: number; low: number } | null,
  ema9: number | null,
  ema20: number | null,
  rv: number | null,
  extras?: {
    dailyBarsLength?: number
    intradayBarsLength?: number
    universeStatus?: 'pass' | 'fail' | 'insufficient_data'
    lastClose?: number | null
    avg20DayVolume?: number | null
    dailyEma20?: number | null
  },
): SymbolScanDebug {
  const rps =
    plan?.riskPerShare ??
    (hit != null ? Math.abs(hit.entry - hit.stop) : null)
  return {
    ticker,
    dailyBarsLength: extras?.dailyBarsLength,
    intradayBarsLength: extras?.intradayBarsLength,
    universeStatus: extras?.universeStatus,
    lastClose: extras?.lastClose ?? null,
    avg20DayVolume: extras?.avg20DayVolume ?? null,
    dailyEma20: extras?.dailyEma20 ?? null,
    detectedSetupType: hit?.strategyKind ?? plan?.setupKind ?? null,
    recentHigh: hl?.high ?? null,
    recentLow: hl?.low ?? null,
    ema9,
    ema20,
    relVol: rv,
    entry: hit?.entry ?? plan?.entry ?? null,
    stop: hit?.stop ?? plan?.stop ?? null,
    target: hit?.target ?? plan?.target ?? null,
    riskPerShare: rps,
    expectedR: hit?.expectedR ?? plan?.expectedR ?? null,
    positionSize: plan?.positionSize ?? null,
    score: score ?? plan?.score ?? null,
    status,
    rejectionReasons: [...rejectionReasons],
  }
}

/**
 * Prefer a tradable hit (geometry + ≥1 share), else first geometry-valid hit (for undersized / gate UX).
 * Mirrors `tryBuildMorningTradePlan` hit order so prep does not drop plans when the top-scored raw hit is broken.
 */
function pickHitForSymbolScanPlan(
  evaluated: { hit: RawHit; score: number }[],
  settings: UserSettings,
): { hit: RawHit; score: number } | null {
  for (const e of evaluated) {
    const rps =
      e.hit.side === 'short'
        ? e.hit.stop - e.hit.entry
        : e.hit.entry - e.hit.stop
    const geomOk =
      e.hit.side === 'short'
        ? e.hit.entry < e.hit.stop && e.hit.target < e.hit.entry
        : e.hit.entry > e.hit.stop && e.hit.target > e.hit.entry
    if (rps <= 0 || !geomOk) continue
    const sh =
      sharesFromRisk(settings.riskPerTrade, e.hit.entry, e.hit.stop) ?? 0
    if (sh > 0) return e
  }
  for (const e of evaluated) {
    const rps =
      e.hit.side === 'short'
        ? e.hit.stop - e.hit.entry
        : e.hit.entry - e.hit.stop
    const geomOk =
      e.hit.side === 'short'
        ? e.hit.entry < e.hit.stop && e.hit.target < e.hit.entry
        : e.hit.entry > e.hit.stop && e.hit.target > e.hit.entry
    if (rps <= 0 || !geomOk) continue
    return e
  }
  return null
}

/**
 * Per-symbol morning evaluation: liquidity → patterns → scored best hit → plan draft.
 * `watching` = visible candidate that may fail approval gates; `approved_candidate` = passes quality gate.
 */
export function evaluateSymbolScan(
  ticker: string,
  bars: OHLCV[],
  settings: UserSettings,
  bias: MarketTrend,
  marketBias: MarketBiasResult,
  options?: {
    scoreTime?: Date
    planId?: string
    tuning?: Partial<ScannerTuning>
    /** Universe checks always use daily bars (history/price/avg-volume gates). */
    universeBars?: OHLCV[]
  },
): SymbolScanResult {
  const planId = options?.planId ?? `plan-${ticker}-scan`
  const now = options?.scoreTime ?? new Date()
  const tuning = mergeScannerTuning(options?.tuning)

  const c = closes(bars)
  const hl = recentHighLow(bars, HIGH_LOOKBACK)
  const ema9 = lastEma(c, 9)
  const ema20 = lastEma(c, 20)
  const rv = relativeVolume(bars, HIGH_LOOKBACK)

  const universeBars = options?.universeBars ?? bars
  const dailyCloses = closes(universeBars)
  const dailyEma20 = lastEma(dailyCloses, 20)
  const universeEval = evaluateUniverseFilter(ticker, universeBars)
  const universeReasons = universeEval.reasons
  if (universeReasons.length > 0) {
    const rejectionReasons = dedupeReasons(universeReasons)
    const rejectionDetail: PlanRejectionDetail = {}
    rejectionDetail.dailyBarsAvailable = universeEval.metrics.dailyBars
    rejectionDetail.requiredDailyBars = universeEval.metrics.requiredDailyBars
    rejectionDetail.lastClose = universeEval.metrics.lastClose
    rejectionDetail.minPrice = universeEval.metrics.minPrice
    rejectionDetail.avg20DayVolume = universeEval.metrics.avg20DayVolume
    rejectionDetail.minAvg20DayVolume = universeEval.metrics.minAvg20DayVolume
    rejectionDetail.earningsStatus = universeEval.metrics.earningsStatus
    const scoreBreakdown = null
    const rejectionSuggestions = buildRejectionSuggestions(
      rejectionReasons,
      rejectionDetail,
      scoreBreakdown,
    )
    const debug = buildSymbolScanDebug(
      ticker,
      null,
      null,
      null,
      'no_setup',
      rejectionReasons,
      hl,
      ema9,
      ema20,
      rv,
      {
        dailyBarsLength: universeBars.length,
        intradayBarsLength: bars.length,
        universeStatus: universeEval.status,
        lastClose: universeEval.metrics.lastClose ?? null,
        avg20DayVolume: universeEval.metrics.avg20DayVolume ?? null,
        dailyEma20,
      },
    )
    if (import.meta.env.DEV) {
      console.debug('[Trade UI] Symbol scan rejection', {
        ticker,
        rejectionReasons,
        rejectionDetail,
        scoreBreakdown,
      })
    }
    console.info('[Trade UI] Symbol scan', debug)
    return {
      status: 'no_setup',
      candidateTier: 'no_setup',
      universeStatus: universeEval.status,
      candidate: null,
      plan: null,
      rejectionReasons,
      rejectionDetail,
      scoreBreakdown,
      rejectionSuggestions,
      debug,
    }
  }

  const hits = rawHits(ticker, bars, bias, marketBias, tuning, universeBars)
  if (hits.length === 0) {
    const rejectionReasons: ScanRejectionReason[] = ['no_valid_pattern']
    const rejectionDetail: PlanRejectionDetail = {}
    const scoreBreakdown = null
    const rejectionSuggestions = buildRejectionSuggestions(
      rejectionReasons,
      rejectionDetail,
      scoreBreakdown,
    )
    const debug = buildSymbolScanDebug(
      ticker,
      null,
      null,
      null,
      'no_setup',
      rejectionReasons,
      hl,
      ema9,
      ema20,
      rv,
      {
        dailyBarsLength: universeBars.length,
        intradayBarsLength: bars.length,
        universeStatus: 'pass',
        lastClose: universeEval.metrics.lastClose ?? null,
        avg20DayVolume: universeEval.metrics.avg20DayVolume ?? null,
        dailyEma20,
      },
    )
    if (import.meta.env.DEV) {
      console.debug('[Trade UI] Symbol scan rejection', {
        ticker,
        rejectionReasons,
        rejectionDetail,
        scoreBreakdown,
      })
    }
    console.info('[Trade UI] Symbol scan', debug)
    return {
      status: 'no_setup',
      candidateTier: 'no_setup',
      universeStatus: 'pass',
      candidate: null,
      plan: null,
      rejectionReasons,
      rejectionDetail,
      scoreBreakdown,
      rejectionSuggestions,
      debug,
    }
  }

  const evaluated = hits.map((hit) => ({
    hit,
    score: scoreHit(hit, marketBias, now),
  }))
  evaluated.sort((a, b) => b.score - a.score)

  const picked = pickHitForSymbolScanPlan(evaluated, settings)
  if (picked == null) {
    const { hit, score } = evaluated[0]!
    const scoreInput = fullInputFromHit(hit, marketBias, now)
    const bd = morningStrategyScoreBreakdown(scoreInput)
    const riskPerShare =
      hit.side === 'short' ? hit.stop - hit.entry : hit.entry - hit.stop
    const geomOk =
      hit.side === 'short'
        ? hit.entry < hit.stop && hit.target < hit.entry
        : hit.entry > hit.stop && hit.target > hit.entry
    const geom: ScanRejectionReason[] = []
    if (riskPerShare <= 0) geom.push('entry_not_above_stop')
    if (!geomOk) geom.push('target_not_above_entry')
    const rejectionReasons = dedupeReasons(geom)
    const rejectionDetail: PlanRejectionDetail = {
      actualScore: score,
      requiredScore: tuning.minMorningScore,
      actualExpectedR: hit.expectedR,
      requiredExpectedR: tuning.minExpectedR,
      positionSize: 0,
      requiredPositionSize: 1,
      riskBudgetPerTrade: settings.riskPerTrade,
      riskPerShare: riskPerShare > 0 ? riskPerShare : undefined,
    }
    const rejectionSuggestions = buildRejectionSuggestions(
      rejectionReasons,
      rejectionDetail,
      bd,
    )
    const debug = buildSymbolScanDebug(
      ticker,
      hit,
      score,
      null,
      'watching',
      rejectionReasons,
      hl,
      ema9,
      ema20,
      rv,
      {
        dailyBarsLength: universeBars.length,
        intradayBarsLength: bars.length,
        universeStatus: 'pass',
        lastClose: universeEval.metrics.lastClose ?? null,
        avg20DayVolume: universeEval.metrics.avg20DayVolume ?? null,
        dailyEma20,
      },
    )
    if (import.meta.env.DEV) {
      console.debug('[Trade UI] Symbol scan rejection', {
        ticker,
        rejectionReasons,
        rejectionDetail,
        scoreBreakdown: bd,
      })
    }
    console.info('[Trade UI] Symbol scan', debug)
    return {
      status: 'watching',
      candidateTier: 'candidate',
      universeStatus: 'pass',
      candidate: candidateFromHit(ticker, hit),
      plan: null,
      rejectionReasons,
      rejectionDetail,
      scoreBreakdown: bd,
      rejectionSuggestions,
      debug,
    }
  }

  const { hit, score } = picked
  const scoreInput = fullInputFromHit(hit, marketBias, now)
  const bd = morningStrategyScoreBreakdown(scoreInput)
  const riskPerShare =
    hit.side === 'short' ? hit.stop - hit.entry : hit.entry - hit.stop

  const built = planFromHit(ticker, hit, score, settings, bias, planId)
  const gateReasons: ScanRejectionReason[] = []

  if (hit.side === 'long' && marketBias.marketTrend === 'bearish') {
    gateReasons.push('market_not_aligned')
  }
  if (hit.side === 'short' && marketBias.marketTrend === 'bullish') {
    gateReasons.push('market_not_aligned')
  }
  const regimeBlocked =
    hit.side === 'long'
      ? marketBias.regime === 'chop' || marketBias.regime === 'distribution'
      : marketBias.regime === 'chop'
  if (regimeBlocked) {
    gateReasons.push('regime_not_supported')
  }
  if (hit.relVolume < tuning.minRelVolPattern) {
    gateReasons.push('rel_vol_too_low')
  }
  if (hit.expectedR < tuning.minExpectedR) {
    gateReasons.push('expected_r_below_minimum')
  }
  if (built.plan.positionSize < 1) {
    gateReasons.push('position_size_below_one')
    if (riskPerShare > settings.riskPerTrade) {
      gateReasons.push('stop_too_wide')
    }
  }
  if (score < tuning.minMorningScore) {
    gateReasons.push('score_below_threshold')
  }

  const meetsGate = planMeetsMorningQualityGate(built.plan, {
    minScore: tuning.minMorningScore,
    minExpectedR: tuning.minExpectedR,
  })
  const marketAligned =
    hit.side === 'short'
      ? marketBias.marketTrend === 'bearish'
      : marketBias.marketTrend !== 'bearish'
  const approved = meetsGate && marketAligned
  const status: SymbolScanStatus = approved ? 'approved_candidate' : 'watching'
  const rejectionReasons = approved ? [] : dedupeReasons(gateReasons)

  const rejectionDetail: PlanRejectionDetail = {
    actualScore: score,
    requiredScore: tuning.minMorningScore,
    actualExpectedR: hit.expectedR,
    requiredExpectedR: tuning.minExpectedR,
    positionSize: built.plan.positionSize,
    requiredPositionSize: 1,
    riskBudgetPerTrade: settings.riskPerTrade,
    riskPerShare,
  }

  const rejectionSuggestions = approved
    ? []
    : buildRejectionSuggestions(rejectionReasons, rejectionDetail, bd)

  const candidateTier: CandidateTier = approved
    ? 'approvable'
    : 'rejected'

  const debug = buildSymbolScanDebug(
    ticker,
    hit,
    score,
    built.plan,
    status,
    rejectionReasons,
    hl,
    ema9,
    ema20,
    rv,
    {
      dailyBarsLength: universeBars.length,
      intradayBarsLength: bars.length,
      universeStatus: 'pass',
      lastClose: universeEval.metrics.lastClose ?? null,
      avg20DayVolume: universeEval.metrics.avg20DayVolume ?? null,
      dailyEma20,
    },
  )
  if (import.meta.env.DEV && rejectionReasons.length > 0) {
    console.debug('[Trade UI] Symbol scan rejection', {
      ticker,
      rejectionReasons,
      rejectionDetail,
      scoreBreakdown: bd,
    })
  }
  console.info('[Trade UI] Symbol scan', debug)

  return {
    status,
    candidateTier,
    universeStatus: 'pass',
    candidate: built.candidate,
    plan: built.plan,
    rejectionReasons,
    rejectionDetail,
    scoreBreakdown: bd,
    rejectionSuggestions,
    debug,
  }
}
