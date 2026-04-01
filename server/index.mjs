import express from 'express'
import dotenv from 'dotenv'
import { existsSync } from 'fs'
import { dirname, join, relative } from 'path'
import { fileURLToPath } from 'url'
import { DEFAULT_CURATED_HANDLES } from './xFeedDefaults.mjs'
import {
  normalizeWatchlistQuery,
  enrichFeedItems,
  aggregateTickerContext,
  buildFeedSummary,
} from './xFeedEnrich.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..')

/** Trim, strip BOM, optional wrapping quotes (common when pasting from portals). */
function normalizeBearer(raw) {
  let s = String(raw ?? '')
    .replace(/^\uFEFF/, '')
    .trim()
  if (
    (s.startsWith('"') && s.endsWith('"') && s.length >= 2) ||
    (s.startsWith("'") && s.endsWith("'") && s.length >= 2)
  ) {
    s = s.slice(1, -1).trim()
  }
  return s
}

/**
 * Later files override earlier. Lets you keep X_* next to VITE_* in project
 * `.env.local` (Vite still only exposes `VITE_*` to the browser).
 * @returns {string[]} absolute paths of files that existed and were loaded
 */
function loadFeedEnv() {
  const files = [
    join(projectRoot, '.env'),
    join(projectRoot, '.env.local'),
    join(__dirname, '.env'),
    join(__dirname, '.env.local'),
  ]
  const loaded = []
  for (const p of files) {
    if (existsSync(p)) {
      dotenv.config({ path: p, override: true })
      loaded.push(p)
    }
  }
  return loaded
}

const envFilesLoaded = loadFeedEnv()
const envFilesRelative = envFilesLoaded.map((p) =>
  relative(projectRoot, p).replace(/\\/g, '/'),
)

/** Prefer `X_FEED_PORT` so Vite proxy (vite.config) can read the same key from `.env.local`. */
const PORT =
  Number(process.env.X_FEED_PORT || process.env.PORT) || 8787
const BEARER = normalizeBearer(
  process.env.X_BEARER_TOKEN || process.env.TWITTER_BEARER_TOKEN,
)
const HANDLES_RAW = (process.env.X_FEED_HANDLES ?? '').trim()
const MAX_PER = Math.min(
  100,
  Math.max(1, Number(process.env.X_FEED_MAX_PER_USER) || 5),
)
const CACHE_SEC = Math.max(0, Number(process.env.X_FEED_CACHE_SECONDS) || 120)

/** Massive/Polygon API key (server-side only). */
const POLYGON_API_KEY = normalizeBearer(
  process.env.MASSIVE_API_KEY || process.env.POLYGON_API_KEY,
)
const MASSIVE_API_BASE = String(
  process.env.MASSIVE_API_BASE || 'https://api.polygon.io',
).replace(/\/+$/, '')
const POLYGON_CACHE_SEC = Math.max(
  0,
  Number(process.env.POLYGON_CACHE_SECONDS) || 60 * 5,
)

/**
 * `off` — no post filtering.
 * `on` (default) — drop link-only fluff; allow market keywords without a ticker.
 * `strict` — require ticker / cashtag / $price / % move in the post.
 */
function parseContentFilterMode(raw) {
  const s = String(raw ?? '1').trim().toLowerCase()
  if (s === '0' || s === 'off' || s === 'false' || s === 'no') return 'off'
  if (s === 'strict' || s === '2') return 'strict'
  return 'on'
}

const CONTENT_FILTER_MODE = parseContentFilterMode(
  process.env.X_FEED_CONTENT_FILTER,
)

function normalizeHandleList(raw) {
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

const handlesFromEnv = normalizeHandleList(HANDLES_RAW)
const handles =
  handlesFromEnv.length > 0 ? handlesFromEnv : [...DEFAULT_CURATED_HANDLES]
const usingDefaultCurated = handlesFromEnv.length === 0

const ERR_NO_BEARER =
  'Missing X_BEARER_TOKEN (or TWITTER_BEARER_TOKEN) in server env'
const ERR_NO_HANDLES =
  'Set X_FEED_HANDLES in server env to override the built-in curated list (comma-separated, no @).'

function logXFeedEnvStatus() {
  console.info(
    '[x-feed] env: project .env → .env.local → server/.env → server/.env.local (later wins)',
  )
  console.info(
    '[x-feed] env files read: %s',
    envFilesRelative.length > 0 ? envFilesRelative.join(', ') : '(none — create .env.local or server/.env)',
  )
  if (!BEARER) {
    console.warn(
      '[x-feed] X_BEARER_TOKEN (or TWITTER_BEARER_TOKEN) missing — /api/x/feed returns an error until set',
    )
  } else {
    console.info('[x-feed] X_BEARER_TOKEN present (length %d)', BEARER.length)
  }
  if (usingDefaultCurated) {
    console.info(
      '[x-feed] using built-in curated handles (%d); set X_FEED_HANDLES to override',
      handles.length,
    )
  } else {
    console.info('[x-feed] handles from env (%d): %s', handles.length, handles.join(', '))
  }
  const cfMsg =
    CONTENT_FILTER_MODE === 'off'
      ? 'off (all posts)'
      : CONTENT_FILTER_MODE === 'strict'
        ? 'strict (ticker / $ / % required; set X_FEED_CONTENT_FILTER=on to relax)'
        : 'on (keywords OK; strict|0 to change)'
  console.info('[x-feed] content filter: %s', cfMsg)
}

/** @type {{ at: number, payload: object | null, key: string }} */
let cache = { at: 0, payload: null, key: '' }

/** @type {Map<string, { id: string, displayName: string }>} */
const userProfileCache = new Map()

/**
 * @param {string} pathWithQuery path starting with /
 */
async function xFetch(pathWithQuery) {
  const r = await fetch(`https://api.twitter.com/2${pathWithQuery}`, {
    headers: { Authorization: `Bearer ${BEARER}` },
  })
  const text = await r.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    /* ignore */
  }
  if (!r.ok) {
    const msg =
      json?.errors?.[0]?.detail ||
      json?.errors?.[0]?.message ||
      json?.title ||
      text.slice(0, 200) ||
      r.statusText
    throw new Error(`${r.status}: ${msg}`)
  }
  return json
}

/**
 * @param {string} handle
 */
async function userProfileFor(handle) {
  const key = handle.toLowerCase()
  const hit = userProfileCache.get(key)
  if (hit) return hit
  const j = await xFetch(
    `/users/by/username/${encodeURIComponent(handle)}?user.fields=name,username`,
  )
  const id = j?.data?.id
  const displayName = j?.data?.name || handle
  if (!id) throw new Error(`No user id for @${handle}`)
  const row = { id, displayName }
  userProfileCache.set(key, row)
  return row
}

/**
 * @param {string} id
 */
async function tweetsForUser(id) {
  const params = new URLSearchParams({
    max_results: String(MAX_PER),
    'tweet.fields': 'created_at,text',
    exclude: 'retweets,replies',
  })
  const j = await xFetch(`/users/${id}/tweets?${params}`)
  return j?.data ?? []
}

/**
 * @param {string[]} effectiveHandles
 * @param {string[]} watchlistUpper
 */
async function buildFeedPayload(effectiveHandles, watchlistUpper) {
  const raw = []
  for (const handle of effectiveHandles) {
    try {
      const profile = await userProfileFor(handle)
      const tweets = await tweetsForUser(profile.id)
      for (const t of tweets) {
        raw.push({
          handle,
          displayName: profile.displayName,
          tweetId: t.id,
          text: t.text ?? '',
          createdAt: t.created_at ?? '',
          url: `https://x.com/${handle}/status/${t.id}`,
        })
      }
    } catch (e) {
      console.error(
        `[x-feed] @${handle}`,
        e instanceof Error ? e.message : e,
      )
    }
  }
  raw.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
  const items = enrichFeedItems(raw, watchlistUpper, {
    contentFilterMode: CONTENT_FILTER_MODE,
  })
  const tickerAggregates = aggregateTickerContext(items)
  const summary = buildFeedSummary(items, tickerAggregates)
  return {
    fetchedAt: new Date().toISOString(),
    items,
    tickerAggregates,
    summary,
    error: null,
    handlesUsed: [...effectiveHandles],
  }
}

const app = express()

function isoDate(d) {
  const dt = d instanceof Date ? d : new Date(d)
  const yyyy = String(dt.getUTCFullYear())
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dt.getUTCDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

/** @type {Map<string, {at: number, payload: any}>} */
const polygonCache = new Map()

function polygonCacheGet(key) {
  const hit = polygonCache.get(key)
  if (!hit) return null
  if (POLYGON_CACHE_SEC <= 0) return null
  if (Date.now() - hit.at > POLYGON_CACHE_SEC * 1000) return null
  return hit.payload
}

function polygonCacheSet(key, payload) {
  polygonCache.set(key, { at: Date.now(), payload })
  // soft cap to avoid unbounded growth
  if (polygonCache.size > 200) {
    const first = polygonCache.keys().next().value
    if (first) polygonCache.delete(first)
  }
}

async function polygonFetchJson(url, cacheKey) {
  if (cacheKey) {
    const cached = polygonCacheGet(cacheKey)
    if (cached) return cached
  }
  const res = await fetch(url)
  const text = await res.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    const msg =
      json?.error ||
      json?.message ||
      json?.detail ||
      json?.title ||
      text.slice(0, 200) ||
      res.statusText
    throw new Error(`Polygon HTTP ${res.status}: ${msg}`)
  }
  if (cacheKey) polygonCacheSet(cacheKey, json)
  return json
}

function normalizeTf(timeframe) {
  const tf = String(timeframe ?? '').toLowerCase()
  if (tf === 'daily' || tf === 'day') return 'daily'
  if (
    tf === '1h' ||
    tf === 'hour' ||
    tf === 'hourly' ||
    tf === '60m' ||
    tf === '60min' ||
    tf === '60-minute'
  ) {
    return '1h'
  }
  if (tf === '5min' || tf === '5m' || tf === '5-minute') return '5min'
  if (tf === '1min' || tf === '1m' || tf === '1-minute' || tf === '1minut') return '1min'
  throw new Error(`Unsupported timeframe: ${timeframe}`)
}

function normalizeLookbackDays(raw) {
  const n = Number(raw ?? 1)
  if (n === 5) return 5
  if (n === 10) return 10
  return 1
}

function aggregateMinuteBarsToDaily(minuteBars) {
  /** @type {Map<string, {t:number,o:number,h:number,l:number,c:number,v:number}>} */
  const byDay = new Map()
  for (const b of minuteBars) {
    const day = isoDate(b.t)
    const hit = byDay.get(day)
    if (!hit) {
      byDay.set(day, {
        t: new Date(`${day}T12:00:00Z`).getTime(),
        o: b.o,
        h: b.h,
        l: b.l,
        c: b.c,
        v: b.v ?? 0,
      })
      continue
    }
    hit.h = Math.max(hit.h, b.h)
    hit.l = Math.min(hit.l, b.l)
    hit.c = b.c
    hit.v += b.v ?? 0
  }
  return [...byDay.values()].sort((a, b) => a.t - b.t)
}

/**
 * Massive/Polygon v2 aggregates: /range/{multiplier}/{timespan}/{fromMs}/{toMs}
 * @param {'minute'|'hour'} timespan
 */
async function fetchMassiveRangeAggs(ticker, multiplier, timespan, days) {
  const now = Date.now()
  const fromMs = now - days * 86400000
  const cacheKey = `aggs:${ticker}:${multiplier}:${timespan}:${Math.floor(fromMs / 3600000)}`
  const url = new URL(
    `${MASSIVE_API_BASE}/v2/aggs/ticker/${encodeURIComponent(ticker)}/range/${multiplier}/${timespan}/${fromMs}/${now}`,
  )
  url.searchParams.set('adjusted', 'true')
  url.searchParams.set('sort', 'asc')
  url.searchParams.set('limit', '50000')
  url.searchParams.set('apiKey', POLYGON_API_KEY)
  const j = await polygonFetchJson(url.toString(), cacheKey)
  const results = Array.isArray(j?.results) ? j.results : []
  return results.map((r) => ({
    t: r.t,
    o: r.o,
    h: r.h,
    l: r.l,
    c: r.c,
    v: r.v ?? 0,
  }))
}

function pctMoveFromDailyBars(dailyBars, lookbackDays, lastPriceOverride) {
  if (!Array.isArray(dailyBars) || dailyBars.length === 0) return null
  const lb = normalizeLookbackDays(lookbackDays)
  if (dailyBars.length <= lb) return null
  const base = Number(dailyBars[dailyBars.length - 1 - lb]?.c ?? 0)
  const last =
    Number.isFinite(Number(lastPriceOverride)) && Number(lastPriceOverride) > 0
      ? Number(lastPriceOverride)
      : Number(dailyBars[dailyBars.length - 1]?.c ?? 0)
  if (!Number.isFinite(base) || base <= 0 || !Number.isFinite(last) || last <= 0) {
    return null
  }
  return ((last - base) / base) * 100
}

async function fetchDailyBarsForLookback(ticker, lookbackDays) {
  const lb = normalizeLookbackDays(lookbackDays)
  // Buffer for market holidays/weekends.
  const days = lb === 10 ? 45 : lb === 5 ? 25 : 14
  const minuteBars = await fetchMassiveAggsBars(ticker, '5min', days)
  return aggregateMinuteBarsToDaily(minuteBars)
}

/** Minute bars only (1min or 5min). */
async function fetchMassiveAggsBars(ticker, timeframe, days) {
  const tf = normalizeTf(timeframe)
  if (tf !== '1min' && tf !== '5min') {
    throw new Error(`fetchMassiveAggsBars expects 1min or 5min, got ${timeframe}`)
  }
  const multiplier = tf === '1min' ? 1 : 5
  return fetchMassiveRangeAggs(ticker, multiplier, 'minute', days)
}

app.get('/api/x/health', (_req, res) => {
  res.json({
    ok: true,
    handles: handles.length,
    hasToken: Boolean(BEARER),
    envFilesLoaded: envFilesRelative,
    usingDefaultCurated,
    contentFilterMode: CONTENT_FILTER_MODE,
  })
})

app.get('/api/x/feed', async (req, res) => {
  try {
    const emptyErrBody = (error, effective) => ({
      fetchedAt: new Date().toISOString(),
      items: [],
      tickerAggregates: [],
      summary: null,
      error,
      handlesUsed: effective ?? [],
    })

    if (!BEARER) {
      return res.json(emptyErrBody(ERR_NO_BEARER, []))
    }

    const rawQ = req.query.handles
    const rawJoined = Array.isArray(rawQ) ? rawQ.join(',') : rawQ
    const rawWl = req.query.watchlist
    const rawWlJoined = Array.isArray(rawWl) ? rawWl.join(',') : rawWl
    const watchlistUpper = normalizeWatchlistQuery(
      rawWlJoined === undefined ? '' : rawWlJoined,
    )
    const wlKey = watchlistUpper.length ? watchlistUpper.join(',') : '-'

    let effectiveHandles
    let cacheKey

    if (rawJoined !== undefined) {
      effectiveHandles = normalizeHandleList(rawJoined)
      if (effectiveHandles.length === 0) {
        return res.json(
          emptyErrBody(
            'Custom handles list is empty — add at least one username (comma or line separated, no @).',
            [],
          ),
        )
      }
      cacheKey = `q:${effectiveHandles.join(',')}:wl:${wlKey}:cfm:${CONTENT_FILTER_MODE}`
    } else {
      effectiveHandles = handles
      if (effectiveHandles.length === 0) {
        return res.json(emptyErrBody(ERR_NO_HANDLES, []))
      }
      cacheKey = `env:${effectiveHandles.join(',')}:wl:${wlKey}:cfm:${CONTENT_FILTER_MODE}`
    }

    const now = Date.now()
    if (
      CACHE_SEC > 0 &&
      cache.payload &&
      cache.key === cacheKey &&
      now - cache.at < CACHE_SEC * 1000
    ) {
      return res.json(cache.payload)
    }

    const payload = await buildFeedPayload(effectiveHandles, watchlistUpper)
    cache = { at: now, payload, key: cacheKey }
    res.json(payload)
  } catch (e) {
    console.error('[x-feed]', e)
    res.status(502).json({
      fetchedAt: new Date().toISOString(),
      items: [],
      tickerAggregates: [],
      summary: null,
      handlesUsed: [],
      error: e instanceof Error ? e.message : 'X API error',
    })
  }
})

/**
 * Polygon-backed market data (server-side).
 * Returns OHLCV bars:
 * - open, high, low, close, volume
 * - t: timestamp (ms since epoch)
 */
app.get('/api/market/historical', async (req, res) => {
  try {
    if (!POLYGON_API_KEY) {
      return res.status(500).json({ error: 'Missing MASSIVE_API_KEY (or POLYGON_API_KEY) in server env' })
    }

    const tickerRaw = String(req.query.ticker ?? req.query.symbol ?? '').trim()
    if (!tickerRaw) {
      return res.status(400).json({ error: 'Missing ticker/symbol query param' })
    }
    const ticker = tickerRaw.toUpperCase()
    const timeframe = normalizeTf(String(req.query.timeframe ?? 'daily'))
    /** @type {Array<{t:number,o:number,h:number,l:number,c:number,v:number}>} */
    let bars
    if (timeframe === 'daily') {
      // ~50+ session days: roll 90 calendar days of 5m bars into daily OHLCV.
      const minuteBars = await fetchMassiveAggsBars(ticker, '5min', 90)
      bars = aggregateMinuteBarsToDaily(minuteBars)
    } else if (timeframe === '1h') {
      bars = await fetchMassiveRangeAggs(ticker, 1, 'hour', 90)
    } else {
      const minuteBars = await fetchMassiveAggsBars(
        ticker,
        timeframe === '1min' ? '1min' : '5min',
        90,
      )
      bars = minuteBars
    }

    // If empty, fail hard so the frontend can fallback to demo/mock.
    if (bars.length === 0) {
      return res.status(502).json({
        error: `Massive returned no ${timeframe} bars for ${ticker}`,
      })
    }

    res.json({
      ticker,
      timeframe,
      source: 'massive',
      bars,
    })
  } catch (e) {
    console.error('[market/historical]', e)
    res.status(502).json({ error: e instanceof Error ? e.message : 'Polygon error' })
  }
})

/**
 * Polygon-backed last price.
 */
app.get('/api/market/last', async (req, res) => {
  try {
    if (!POLYGON_API_KEY) {
      return res.status(500).json({ error: 'Missing MASSIVE_API_KEY (or POLYGON_API_KEY) in server env' })
    }

    const tickerRaw = String(req.query.ticker ?? req.query.symbol ?? '').trim()
    if (!tickerRaw) {
      return res.status(400).json({ error: 'Missing ticker/symbol query param' })
    }
    const ticker = tickerRaw.toUpperCase()
    // Derive "last" from the most recent 5-minute aggregate to avoid
    // entitlement issues on /v2/last/trade for some plans.
    // Use a longer window so we can aggregate daily bars for prior close + session volume.
    const minuteBars = await fetchMassiveAggsBars(ticker, '5min', 14)
    const b = minuteBars[minuteBars.length - 1]
    const last = Number(b?.c ?? 0)
    if (!Number.isFinite(last) || last <= 0) {
      return res.status(502).json({ error: `Massive last price missing for ${ticker}` })
    }

    const daily = aggregateMinuteBarsToDaily(minuteBars)
    const previousClose =
      daily.length >= 2 ? Number(daily[daily.length - 2].c) : undefined
    const volume =
      daily.length >= 1 ? daily[daily.length - 1].v : b?.v ?? undefined

    res.json({
      ticker,
      source: 'massive',
      last,
      previousClose:
        previousClose != null && Number.isFinite(previousClose) && previousClose > 0
          ? previousClose
          : undefined,
      volume,
      ts: b?.t ?? undefined,
    })
  } catch (e) {
    console.error('[market/last]', e)
    res.status(502).json({ error: e instanceof Error ? e.message : 'Polygon error' })
  }
})

/**
 * Massive live scan (top gainers snapshot).
 * Filters are applied server-side to reduce client load and API calls.
 */
app.get('/api/market/scan', async (req, res) => {
  try {
    if (!POLYGON_API_KEY) {
      return res.status(500).json({ error: 'Missing MASSIVE_API_KEY (or POLYGON_API_KEY) in server env' })
    }

    const minPrice = Math.max(0, Number(req.query.minPrice ?? 1) || 1)
    const maxPrice = Math.max(minPrice, Number(req.query.maxPrice ?? 5) || 5)
    const minVolume = Math.max(0, Number(req.query.minVolume ?? 5_000_000) || 5_000_000)
    const minGapPct = Number(req.query.minGapPct ?? 20) || 20
    const lookbackDays = normalizeLookbackDays(req.query.lookbackDays)
    const maxRows = Math.min(200, Math.max(1, Number(req.query.limit ?? 100) || 100))

    const url = new URL(
      `${MASSIVE_API_BASE}/v2/snapshot/locale/us/markets/stocks/gainers`,
    )
    url.searchParams.set('apiKey', POLYGON_API_KEY)
    const cacheKey = `scan:gainers:${Math.floor(Date.now() / 30_000)}`
    const j = await polygonFetchJson(url.toString(), cacheKey)
    const tickers = Array.isArray(j?.tickers) ? j.tickers : []

    const baseRows = tickers
      .map((row) => {
        const ticker = String(row?.ticker ?? '').toUpperCase()
        const last = Number(row?.lastTrade?.p ?? row?.day?.c ?? 0)
        const previousClose = Number(row?.prevDay?.c ?? 0)
        const volume = Number(row?.day?.v ?? 0)
        const gapPct =
          previousClose > 0 && Number.isFinite(last)
            ? ((last - previousClose) / previousClose) * 100
            : null
        return {
          ticker,
          last: Number.isFinite(last) && last > 0 ? last : null,
          previousClose:
            Number.isFinite(previousClose) && previousClose > 0
              ? previousClose
              : null,
          volume: Number.isFinite(volume) && volume >= 0 ? volume : null,
          gapPct: gapPct != null && Number.isFinite(gapPct) ? gapPct : null,
        }
      })
      .filter((r) => r.ticker)
      .filter(
        (r) =>
          r.last != null &&
          r.last >= minPrice &&
          r.last <= maxPrice &&
          r.volume != null &&
          r.volume > minVolume,
      )

    const enriched =
      lookbackDays === 1
        ? baseRows
        : await Promise.all(
            baseRows.map(async (r) => {
              try {
                const daily = await fetchDailyBarsForLookback(r.ticker, lookbackDays)
                const movePct = pctMoveFromDailyBars(daily, lookbackDays, r.last)
                return { ...r, gapPct: movePct }
              } catch {
                return { ...r, gapPct: null }
              }
            }),
          )

    const rows = enriched
      .filter((r) => r.gapPct != null && r.gapPct >= minGapPct)
      .sort((a, b) => (b.gapPct ?? -Infinity) - (a.gapPct ?? -Infinity))
      .slice(0, maxRows)

    return res.json({
      source: 'massive',
      market: 'us-stocks-gainers',
      filters: {
        minPrice,
        maxPrice,
        minVolume,
        minGapPct,
        lookbackDays,
        limit: maxRows,
      },
      rows,
      fetchedAt: Date.now(),
    })
  } catch (e) {
    console.error('[market/scan]', e)
    return res.status(502).json({ error: e instanceof Error ? e.message : 'Massive scan error' })
  }
})

app.get('/api/market/lookback', async (req, res) => {
  try {
    if (!POLYGON_API_KEY) {
      return res.status(500).json({ error: 'Missing MASSIVE_API_KEY (or POLYGON_API_KEY) in server env' })
    }
    const lookbackDays = normalizeLookbackDays(req.query.lookbackDays)
    const raw =
      Array.isArray(req.query.tickers) && req.query.tickers.length > 0
        ? req.query.tickers.join(',')
        : String(req.query.tickers ?? '')
    const tickers = raw
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean)
      .slice(0, 60)
    if (tickers.length === 0) {
      return res.status(400).json({ error: 'Missing tickers query param' })
    }

    const rows = await Promise.all(
      tickers.map(async (ticker) => {
        try {
          const daily = await fetchDailyBarsForLookback(ticker, lookbackDays)
          const gapPct = pctMoveFromDailyBars(daily, lookbackDays, null)
          return { ticker, gapPct }
        } catch {
          return { ticker, gapPct: null }
        }
      }),
    )
    return res.json({ source: 'massive', lookbackDays, rows, fetchedAt: Date.now() })
  } catch (e) {
    console.error('[market/lookback]', e)
    return res.status(502).json({ error: e instanceof Error ? e.message : 'Massive lookback error' })
  }
})

const httpServer = app.listen(PORT, '127.0.0.1', () => {
  console.info(`[x-feed] listening http://127.0.0.1:${PORT}`)
  logXFeedEnvStatus()
})

httpServer.on('error', (err) => {
  const code = err && typeof err === 'object' && 'code' in err ? err.code : ''
  if (code === 'EADDRINUSE') {
    console.error(
      `[x-feed] Port ${PORT} is already in use — another \`npm run server\` (or crashed zombie) is bound there.`,
    )
    console.error(
      `[x-feed] Free the port:  lsof -ti :${PORT} | xargs kill   (add -9 if it won't exit)`,
    )
    console.error(
      `[x-feed] Or use another port: set X_FEED_PORT=8788 in project .env.local (Vite reads it for the /api proxy too).`,
    )
  } else {
    console.error('[x-feed] listen error', err)
  }
  process.exit(1)
})
