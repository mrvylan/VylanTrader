import type { XFeedCategoryKey } from './xFeedCurated'

/** Keep in sync with `server/index.mjs` JSON errors (for setup hints). */
export const X_FEED_ERR_NO_BEARER =
  'Missing X_BEARER_TOKEN (or TWITTER_BEARER_TOKEN) in server env'
export const X_FEED_ERR_NO_HANDLES =
  'Set X_FEED_HANDLES in server env to override the built-in curated list (comma-separated, no @).'

export type XFeedSentiment = 'bullish' | 'bearish' | 'neutral' | 'unknown'

export type XFeedSourceType = 'trader' | 'news' | 'education'

export type XFeedItem = {
  id: string
  tweetId: string
  handle: string
  displayName: string
  category: XFeedCategoryKey
  sourceType: XFeedSourceType
  text: string
  createdAt: string
  url: string
  detectedTickers: string[]
  sentiment: XFeedSentiment
  relevanceScore: number
}

export type XFeedTickerAggregate = {
  ticker: string
  mentionCount: number
  bullishMentions: number
  bearishMentions: number
  neutralMentions: number
  unknownMentions: number
  /** Recent vs older-window mention density ratio (~1 = flat). */
  mentionVelocity: number
  lastMentionAt: string
}

export type XFeedSummary = {
  topTicker: string | null
  topTickerMentions: number
  sentimentSkew: 'bullish' | 'bearish' | 'mixed' | 'neutral'
  spikeTicker: string | null
  spikeVelocityPct: number | null
  marketContextLine: string | null
  disclaimer: string
}

export type XFeedResponse = {
  fetchedAt: string
  items: XFeedItem[]
  tickerAggregates: XFeedTickerAggregate[]
  summary: XFeedSummary | null
  error: string | null
  /** Accounts used for this response (server default or custom query). */
  handlesUsed?: string[]
}

export const X_FEED_HANDLES_STORAGE_KEY = 'trade-ui-x-feed-handles'
export const X_FEED_USE_CUSTOM_STORAGE_KEY = 'trade-ui-x-feed-handles-custom'

export function parseHandlesDraft(text: string): string[] {
  const parts = text
    .split(/[\n,]+/)
    .flatMap((line) => line.trim().split(/\s+/))
    .map((s) => s.replace(/^@/, '').trim())
    .filter(Boolean)
  const seen = new Set<string>()
  const out: string[] = []
  for (const h of parts) {
    const k = h.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    out.push(h)
  }
  return out
}

export type XFeedHealth = {
  ok: boolean
  hasToken?: boolean
  handles?: number
  envFilesLoaded?: string[]
  usingDefaultCurated?: boolean
  /** Post filtering: off | on (keywords OK) | strict (symbol/$/% required). */
  contentFilterMode?: 'off' | 'on' | 'strict'
}

function xApiBase(): string {
  const base = import.meta.env.VITE_X_FEED_BASE as string | undefined
  return base && base.length > 0 ? base.replace(/\/$/, '') : ''
}

/** Dev: Vite proxies /api → Express. Production: same host or set import.meta.env.VITE_X_FEED_BASE. */
export function xFeedUrl(): string {
  const b = xApiBase()
  return b ? `${b}/api/x/feed` : '/api/x/feed'
}

export function xHealthUrl(): string {
  const b = xApiBase()
  return b ? `${b}/api/x/health` : '/api/x/health'
}

export async function fetchXFeedHealth(): Promise<XFeedHealth | null> {
  try {
    const r = await fetch(xHealthUrl())
    if (!r.ok) return null
    return (await r.json()) as XFeedHealth
  } catch {
    return null
  }
}

export async function fetchXFeed(opts?: {
  handles?: string[]
  watchlist?: string[]
}): Promise<XFeedResponse> {
  let url = xFeedUrl()
  const params = new URLSearchParams()
  if (opts?.handles != null && opts.handles.length > 0) {
    params.set('handles', opts.handles.join(','))
  }
  if (opts?.watchlist != null && opts.watchlist.length > 0) {
    params.set('watchlist', opts.watchlist.join(','))
  }
  const q = params.toString()
  if (q) url += `${url.includes('?') ? '&' : '?'}${q}`
  const r = await fetch(url)
  const data = (await r.json()) as XFeedResponse
  if (!Array.isArray(data.tickerAggregates)) data.tickerAggregates = []
  if (data.summary === undefined) data.summary = null
  if (!Array.isArray(data.items)) data.items = []
  for (const it of data.items) {
    if (!Array.isArray(it.detectedTickers)) it.detectedTickers = []
  }
  if (!r.ok && !data.error) {
    return {
      fetchedAt: new Date().toISOString(),
      items: [],
      tickerAggregates: [],
      summary: null,
      error: `HTTP ${r.status} — X API rate limit or server error. Retry later or check server logs.`,
    }
  }
  return data
}
