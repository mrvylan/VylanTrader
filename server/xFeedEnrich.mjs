import {
  HANDLE_META,
  LIQUID_SYMBOLS,
  MARKET_ETFS,
  TICKER_BLOCKLIST,
} from './xFeedDefaults.mjs'

const BULLISH = [
  'breakout',
  'long',
  'reclaim',
  'strong',
  'higher',
  'support held',
  'trend continuation',
  'rip',
  'squeeze',
  'bullish',
  'accumulation',
  'rally',
  'ATH',
  'momentum',
]

const BEARISH = [
  'short',
  'failed',
  'breakdown',
  'weak',
  'lower',
  'rejected',
  'distribution',
  'bearish',
  'fade',
  'dump',
  'flush',
  'sell',
  'selling',
]

export function metaForHandle(handle) {
  const m = HANDLE_META[String(handle).toLowerCase()]
  if (m) return m
  return { category: 'technical', sourceType: 'trader' }
}

function normalizeWatchlistList(raw) {
  return normalizeHandleListLike(raw).map((s) => s.toUpperCase())
}

function normalizeHandleListLike(raw) {
  const parts = String(raw ?? '')
    .split(/[\n,]+/)
    .flatMap((line) => line.trim().split(/\s+/))
    .map((s) => s.replace(/^@/, '').trim())
    .filter(Boolean)
  const seen = new Set()
  const out = []
  for (const h of parts) {
    const k = h.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    out.push(h)
  }
  return out
}

export { normalizeWatchlistList as normalizeWatchlistQuery }

function countPhraseHits(lower, phrases) {
  let n = 0
  for (const p of phrases) {
    if (lower.includes(p)) n += 1
  }
  return n
}

export function classifySentiment(text) {
  const lower = String(text ?? '').toLowerCase()
  const b = countPhraseHits(lower, BULLISH)
  const br = countPhraseHits(lower, BEARISH)
  if (b === 0 && br === 0) return { sentiment: 'unknown', bullishHits: 0, bearishHits: 0 }
  if (b > 0 && br > 0) {
    if (b === br) return { sentiment: 'neutral', bullishHits: b, bearishHits: br }
    return b > br
      ? { sentiment: 'bullish', bullishHits: b, bearishHits: br }
      : { sentiment: 'bearish', bullishHits: b, bearishHits: br }
  }
  if (b > 0) return { sentiment: 'bullish', bullishHits: b, bearishHits: 0 }
  return { sentiment: 'bearish', bullishHits: 0, bearishHits: br }
}

/**
 * @param {'on' | 'strict'} mode
 *   `on` — allow keyword-only posts after URL strip (default).
 *   `strict` — require a ticker, cashtag, $price, or % move; drop keyword-only.
 * Filter off is handled in enrichFeedItems (skip this call).
 */
export function passesTradingContextGate(text, detectedTickers, mode = 'on') {
  const raw = String(text ?? '')
  const hasSymbolSignal =
    detectedTickers.length > 0 ||
    /\$[A-Za-z]{1,5}\b/.test(raw) ||
    /\$\d/.test(raw) ||
    /\d+(\.\d+)?\s*%/.test(raw)

  if (hasSymbolSignal) return true
  if (mode === 'strict') return false

  const stripped = raw.replace(/https?:\/\/\S+/gi, ' ').replace(/\s+/g, ' ').trim()
  if (stripped.length < 10) return false

  if (/\bafter\s+hours\b/i.test(stripped)) return true
  if (/\bpre\s*market\b/i.test(stripped)) return true

  const low = stripped.toLowerCase()
  if (low.includes('s&p') || low.includes('s&p 500')) return true

  return TRADING_CONTEXT_RX.test(stripped)
}

/** Word-boundary hints for market/trading posts (avoids short ambiguous tokens). */
const TRADING_CONTEXT_RX =
  /\b(earnings|revenue|guidance|eps|futures|options|breakout|breakdown|support|resistance|volume|vwap|charts?|trading|traders?|markets?|stocks?|equities|nasdaq|nyse|indexes?|indices|fed|fomc|cpi|pce|squeeze|catalyst|merger|acquisitions?|dividend|splits?|ipos?|bonds?|treasur(y|ies)|yields?|inflation|recession|gdp|bullish|bearish|rally|selloff|correction|volatile|liquidity|gamma|puts?|calls?|vix|sector|oversold|overbought|macd|rsi|watchlists?|setups?|economy|unemployment|jobs|cut\s+rates|hike\s+rates|rate\s+cut|rate\s+hike|interest\s+rates?|commodities|oil|gold|bitcoin|btc|eth|crypto|dow|intraday|session|open\s+interest|short\s+interest|free\s+float|ftse|dax|nikkei|hang\s+seng|boj|ecb|boe|powell)\b/i

/**
 * @param {string} text
 * @param {Set<string>} watchUpper
 */
export function extractTickers(text, watchUpper) {
  const raw = String(text ?? '')
  const found = new Set()
  const reCash = /\$([A-Za-z]{1,5})\b/g
  let m
  while ((m = reCash.exec(raw)) !== null) {
    const sym = m[1].toUpperCase()
    if (sym.length >= 1 && !TICKER_BLOCKLIST.has(sym.toLowerCase())) found.add(sym)
  }
  const upperText = raw.toUpperCase()
  const addIfAllowed = (sym) => {
    const u = sym.toUpperCase()
    if (u.length < 2 || u.length > 5) return
    if (TICKER_BLOCKLIST.has(u.toLowerCase())) return
    if (
      watchUpper.has(u) ||
      MARKET_ETFS.has(u) ||
      LIQUID_SYMBOLS.has(u)
    ) {
      const re = new RegExp(`\\b${u}\\b`)
      if (re.test(upperText)) found.add(u)
    }
  }
  for (const w of watchUpper) addIfAllowed(w)
  for (const etf of MARKET_ETFS) addIfAllowed(etf)
  // Match liquid/ETF tokens case-insensitively (posts often use "nvda" not "NVDA").
  const reBare = /\b([A-Z]{2,5})\b/g
  while ((m = reBare.exec(upperText)) !== null) {
    const sym = m[1]
    if (TICKER_BLOCKLIST.has(sym.toLowerCase())) continue
    if (LIQUID_SYMBOLS.has(sym) || MARKET_ETFS.has(sym)) found.add(sym)
  }
  return [...found].sort()
}

function ageMinutes(createdAt, nowMs) {
  const t = +new Date(createdAt)
  if (!Number.isFinite(t)) return 9999
  return Math.max(0, (nowMs - t) / 60_000)
}

/**
 * @param {object} arg
 * @param {string} arg.createdAt
 * @param {string[]} arg.detectedTickers
 * @param {Set<string>} arg.watchUpper
 * @param {'trader'|'news'|'education'} arg.sourceType
 * @param {'bullish'|'bearish'|'neutral'|'unknown'} arg.sentiment
 * @param {number} arg.bullishHits
 * @param {number} arg.bearishHits
 */
export function relevanceScore(arg) {
  const {
    createdAt,
    detectedTickers,
    watchUpper,
    sourceType,
    sentiment,
    bullishHits,
    bearishHits,
  } = arg
  const nowMs = Date.now()
  const age = ageMinutes(createdAt, nowMs)
  let score = 0
  if (age <= 15) score += 32
  else if (age <= 60) score += 22
  else if (age <= 240) score += 12
  else if (age <= 720) score += 6

  let wl = 0
  for (const t of detectedTickers) {
    if (watchUpper.has(t)) wl += 1
  }
  score += Math.min(42, wl * 22)

  for (const t of detectedTickers) {
    if (MARKET_ETFS.has(t)) score += 18
  }

  if (sourceType === 'news') score += 12
  else if (sourceType === 'trader') score += 6
  else score += 4

  const cert = Math.max(bullishHits, bearishHits)
  if (sentiment === 'bullish' || sentiment === 'bearish') {
    score += cert >= 2 ? 12 : 6
  } else if (sentiment === 'neutral') score += 3

  return Math.min(100, Math.round(score))
}

/**
 * @param {object[]} rawItems { handle, tweetId, text, createdAt, url, displayName? }
 * @param {string[]} watchlistUpper
 * @param {{ contentFilterMode?: 'off' | 'on' | 'strict' }} [options]
 */
export function enrichFeedItems(rawItems, watchlistUpper, options = {}) {
  const { contentFilterMode = 'on' } = options
  const watchUpper = new Set(
    watchlistUpper.map((s) => String(s).trim().toUpperCase()).filter(Boolean),
  )
  let items = rawItems.map((row) => {
    const { category, sourceType } = metaForHandle(row.handle)
    const { sentiment, bullishHits, bearishHits } = classifySentiment(row.text)
    const detectedTickers = extractTickers(row.text, watchUpper)
    const relevance = relevanceScore({
      createdAt: row.createdAt,
      detectedTickers,
      watchUpper,
      sourceType,
      sentiment,
      bullishHits,
      bearishHits,
    })
    const id = String(row.tweetId)
    return {
      id,
      tweetId: id,
      handle: row.handle,
      displayName: row.displayName || row.handle,
      category,
      sourceType,
      text: row.text,
      createdAt: row.createdAt,
      url: row.url,
      detectedTickers,
      sentiment,
      relevanceScore: relevance,
    }
  })
  if (contentFilterMode !== 'off') {
    const mode = contentFilterMode === 'strict' ? 'strict' : 'on'
    items = items.filter((it) =>
      passesTradingContextGate(it.text, it.detectedTickers, mode),
    )
  }
  items.sort((a, b) => {
    const dr = b.relevanceScore - a.relevanceScore
    if (dr !== 0) return dr
    return +new Date(b.createdAt) - +new Date(a.createdAt)
  })
  return items
}

/**
 * @param {ReturnType<typeof enrichFeedItems>} items
 * @param {number} nowMs
 */
export function aggregateTickerContext(items, nowMs = Date.now()) {
  /** @type {Map<string, { bullish: number, bearish: number, neutral: number, unknown: number, times: number[], last: string }>} */
  const map = new Map()
  const newest = items.reduce(
    (mx, it) => Math.max(mx, +new Date(it.createdAt) || 0),
    0,
  )
  const recentCut = newest - 45 * 60 * 1000
  const midStart = newest - 3 * 60 * 60 * 1000
  const midEnd = recentCut

  for (const it of items) {
    const tMs = +new Date(it.createdAt)
    for (const sym of it.detectedTickers) {
      const k = sym.toUpperCase()
      if (!map.has(k))
        map.set(k, {
          bullish: 0,
          bearish: 0,
          neutral: 0,
          unknown: 0,
          times: [],
          last: it.createdAt,
        })
      const row = map.get(k)
      if (it.sentiment === 'bullish') row.bullish += 1
      else if (it.sentiment === 'bearish') row.bearish += 1
      else if (it.sentiment === 'neutral') row.neutral += 1
      else row.unknown += 1
      row.times.push(tMs)
      if (+new Date(it.createdAt) > +new Date(row.last)) row.last = it.createdAt
    }
  }

  const out = []
  for (const [ticker, row] of map) {
    const recent = row.times.filter((t) => t >= recentCut).length
    const baseline = row.times.filter((t) => t >= midStart && t < midEnd).length
    const hoursRecent = 0.75
    const hoursBase = Math.max(0.25, (midEnd - midStart) / 3_600_000)
    const rateR = recent / hoursRecent
    const rateB = baseline / hoursBase
    let mentionVelocity = rateB > 0.05 ? rateR / rateB : recent > 0 ? 2 : 0

    out.push({
      ticker,
      mentionCount: row.bullish + row.bearish + row.neutral + row.unknown,
      bullishMentions: row.bullish,
      bearishMentions: row.bearish,
      neutralMentions: row.neutral,
      unknownMentions: row.unknown,
      mentionVelocity: Math.round(mentionVelocity * 100) / 100,
      lastMentionAt: row.last,
    })
  }
  out.sort((a, b) => b.mentionCount - a.mentionCount)
  return out
}

/**
 * @param {ReturnType<typeof enrichFeedItems>} items
 * @param {ReturnType<typeof aggregateTickerContext>} tickerAggregates
 */
export function buildFeedSummary(items, tickerAggregates) {
  const top = tickerAggregates[0] ?? null
  let bullishN = 0
  let bearishN = 0
  let neutralN = 0
  for (const it of items) {
    if (it.sentiment === 'bullish') bullishN += 1
    else if (it.sentiment === 'bearish') bearishN += 1
    else if (it.sentiment === 'neutral') neutralN += 1
  }
  let sentimentSkew = 'neutral'
  if (bullishN + bearishN + neutralN === 0) sentimentSkew = 'neutral'
  else if (bullishN > bearishN * 1.25) sentimentSkew = 'bullish'
  else if (bearishN > bullishN * 1.25) sentimentSkew = 'bearish'
  else if (bullishN > 0 || bearishN > 0) sentimentSkew = 'mixed'

  let spikeTicker = null
  let spikeVelocityPct = null
  for (const row of tickerAggregates) {
    if (row.mentionCount < 2) continue
    if (row.mentionVelocity >= 1.6) {
      const pct = Math.round((row.mentionVelocity - 1) * 100)
      if (spikeVelocityPct == null || pct > spikeVelocityPct) {
        spikeTicker = row.ticker
        spikeVelocityPct = pct
      }
    }
  }

  const newsCandidates = items.filter(
    (it) =>
      it.sourceType === 'news' &&
      it.relevanceScore >= 55 &&
      ageMinutes(it.createdAt, Date.now()) <= 360,
  )
  const newsPost =
    newsCandidates.find((it) => it.handle.toLowerCase() === 'deitaone') ??
    newsCandidates[0] ??
    null
  let marketContextLine = null
  if (newsPost) {
    const snippet = newsPost.text.replace(/\s+/g, ' ').slice(0, 72)
    marketContextLine = `Market context from @${newsPost.handle}: ${snippet}${newsPost.text.length > 72 ? '…' : ''}`
  }

  return {
    topTicker: top?.ticker ?? null,
    topTickerMentions: top?.mentionCount ?? 0,
    sentimentSkew,
    spikeTicker,
    spikeVelocityPct,
    marketContextLine,
    disclaimer:
      'Context only — not trade advice. Posts are not recommendations; confirm with your plan, levels, and risk.',
  }
}
