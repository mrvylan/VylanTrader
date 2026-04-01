import { useEffect, useMemo, useState } from 'react'
import type { MarketQuote } from '../providers/types'
import styles from './DailyScanPanel.module.css'

type ScanScope = 'watchlist' | 'universe'
type LookbackDays = 1 | 5 | 10

type ScanRow = {
  ticker: string
  last: number | null
  volume: number | null
  gapPct: number | null
  pass: boolean
  reasons: string[]
}

const DEFAULT_FILTERS = {
  minPrice: 1,
  maxPrice: 5,
  minVolume: 5_000_000,
  minGapPct: 20,
} as const

function fmtPrice(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return n.toFixed(2)
}

function fmtVolume(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return Math.round(n).toLocaleString('en-US')
}

function fmtPct(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return '—'
  const sign = n > 0 ? '+' : ''
  return `${sign}${n.toFixed(2)}%`
}

export function DailyScanPanel({
  watchlist,
  quotes,
  lastPriceRefreshAt,
}: {
  watchlist: string[]
  quotes: Record<string, MarketQuote>
  lastPriceRefreshAt: number | null
}) {
  const [minPrice, setMinPrice] = useState<number>(DEFAULT_FILTERS.minPrice)
  const [maxPrice, setMaxPrice] = useState<number>(DEFAULT_FILTERS.maxPrice)
  const [minVolume, setMinVolume] = useState<number>(DEFAULT_FILTERS.minVolume)
  const [minGapPct, setMinGapPct] = useState<number>(DEFAULT_FILTERS.minGapPct)
  const [showAll, setShowAll] = useState(false)
  const [lookbackDays, setLookbackDays] = useState<LookbackDays>(1)
  const [scope, setScope] = useState<ScanScope>('watchlist')
  const [universeRows, setUniverseRows] = useState<ScanRow[]>([])
  const [universeError, setUniverseError] = useState<string | null>(null)
  const [universeLoading, setUniverseLoading] = useState(false)
  const [watchlistLookbackByTicker, setWatchlistLookbackByTicker] = useState<
    Record<string, number | null>
  >({})

  useEffect(() => {
    if (lookbackDays === 1 || watchlist.length === 0) {
      setWatchlistLookbackByTicker({})
      return
    }
    const ac = new AbortController()
    const params = new URLSearchParams({
      tickers: watchlist.map((t) => t.toUpperCase()).join(','),
      lookbackDays: String(lookbackDays),
    })
    fetch(`/api/market/lookback?${params.toString()}`, { signal: ac.signal })
      .then(async (res) => {
        if (!res.ok) {
          const text = await res.text()
          throw new Error(text.slice(0, 200) || `HTTP ${res.status}`)
        }
        return res.json() as Promise<{
          rows?: Array<{ ticker: string; gapPct: number | null }>
          error?: string
        }>
      })
      .then((j) => {
        if (j.error) throw new Error(j.error)
        const next: Record<string, number | null> = {}
        for (const r of j.rows ?? []) next[r.ticker] = r.gapPct
        setWatchlistLookbackByTicker(next)
      })
      .catch(() => {
        if (!ac.signal.aborted) setWatchlistLookbackByTicker({})
      })
    return () => ac.abort()
  }, [watchlist, lookbackDays])

  const rows = useMemo<ScanRow[]>(() => {
    return watchlist.map((t) => {
      const ticker = t.toUpperCase()
      const q = quotes[ticker]
      const last =
        q?.last != null && Number.isFinite(q.last) ? q.last : null
      const prev =
        q?.previousClose != null &&
        Number.isFinite(q.previousClose) &&
        q.previousClose > 0
          ? q.previousClose
          : null
      const volume =
        q?.volume != null && Number.isFinite(q.volume) ? q.volume : null
      const oneDayGapPct =
        last != null && prev != null ? ((last - prev) / prev) * 100 : null
      const gapPct =
        lookbackDays === 1
          ? oneDayGapPct
          : (watchlistLookbackByTicker[ticker] ?? null)
      const reasons: string[] = []
      if (last == null) reasons.push('No last price')
      if (volume == null) reasons.push('No volume')
      if (gapPct == null) reasons.push(`No ${lookbackDays}D baseline`)
      if (last != null && last < minPrice)
        reasons.push(`Price < ${minPrice.toFixed(2)}`)
      if (last != null && last > maxPrice)
        reasons.push(`Price > ${maxPrice.toFixed(2)}`)
      if (volume != null && volume <= minVolume)
        reasons.push(`Volume <= ${Math.round(minVolume).toLocaleString('en-US')}`)
      if (gapPct != null && gapPct < minGapPct)
        reasons.push(`${lookbackDays}D move < ${minGapPct.toFixed(2)}%`)
      const pass = reasons.length === 0
      return { ticker, last, volume, gapPct, pass, reasons }
    })
  }, [
    watchlist,
    quotes,
    lookbackDays,
    watchlistLookbackByTicker,
    minGapPct,
    minPrice,
    minVolume,
    maxPrice,
  ])

  const matches = useMemo(
    () =>
      rows
        .filter((r) => r.pass)
        .sort((a, b) => (b.gapPct ?? -Infinity) - (a.gapPct ?? -Infinity)),
    [rows],
  )
  const displayed = useMemo(
    () =>
      (showAll ? rows : matches)
        .slice()
        .sort((a, b) => (b.gapPct ?? -Infinity) - (a.gapPct ?? -Infinity)),
    [matches, rows, showAll],
  )

  const universeMatches = useMemo(
    () =>
      universeRows
        .filter((r) => r.pass)
        .slice()
        .sort((a, b) => (b.gapPct ?? -Infinity) - (a.gapPct ?? -Infinity)),
    [universeRows],
  )

  const universeDisplayed = useMemo(
    () =>
      (showAll ? universeRows : universeMatches).slice().sort(
        (a, b) => (b.gapPct ?? -Infinity) - (a.gapPct ?? -Infinity),
      ),
    [showAll, universeMatches, universeRows],
  )

  useEffect(() => {
    if (scope !== 'universe') return
    const ac = new AbortController()
    setUniverseLoading(true)
    setUniverseError(null)
    const params = new URLSearchParams({
      minPrice: String(minPrice),
      maxPrice: String(maxPrice),
      minVolume: String(Math.floor(minVolume)),
      minGapPct: String(minGapPct),
      lookbackDays: String(lookbackDays),
      limit: '150',
    })
    fetch(`/api/market/scan?${params.toString()}`, { signal: ac.signal })
      .then(async (res) => {
        if (!res.ok) {
          const text = await res.text()
          throw new Error(text.slice(0, 200) || `HTTP ${res.status}`)
        }
        return res.json() as Promise<{
          rows?: Array<{
            ticker: string
            last: number | null
            volume: number | null
            gapPct: number | null
          }>
          error?: string
        }>
      })
      .then((j) => {
        if (j.error) throw new Error(j.error)
        const nextRows = (j.rows ?? []).map((r) => ({
          ticker: r.ticker,
          last: r.last,
          volume: r.volume,
          gapPct: r.gapPct,
          pass: true,
          reasons: [],
        }))
        setUniverseRows(nextRows)
      })
      .catch((e: unknown) => {
        if (ac.signal.aborted) return
        setUniverseRows([])
        setUniverseError(e instanceof Error ? e.message : 'Failed to run live scan')
      })
      .finally(() => {
        if (!ac.signal.aborted) setUniverseLoading(false)
      })
    return () => ac.abort()
  }, [scope, minPrice, maxPrice, minVolume, minGapPct, lookbackDays, lastPriceRefreshAt])

  const refreshedLabel = useMemo(() => {
    if (lastPriceRefreshAt == null) return 'Not refreshed yet'
    return `Updated ${new Date(lastPriceRefreshAt).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })}`
  }, [lastPriceRefreshAt])

  return (
    <article className={styles.card} aria-labelledby="daily-scan-title">
      <div className={styles.head}>
        <h2 id="daily-scan-title" className={styles.title}>
          Daily scan
        </h2>
        <p className={styles.meta}>{refreshedLabel}</p>
      </div>

      <div className={styles.summary}>
        <span className={styles.pill}>
          Scope: {scope === 'watchlist' ? 'Watchlist' : 'Live universe'}
        </span>
        <span className={styles.pill}>
          Price {minPrice.toFixed(2)}–{maxPrice.toFixed(2)}
        </span>
        <span className={styles.pill}>
          Volume &gt; {Math.round(minVolume).toLocaleString('en-US')}
        </span>
        <span className={styles.pill}>
          {lookbackDays}D move ≥ {minGapPct.toFixed(2)}%
        </span>
        <span className={styles.pill}>
          Matches: {scope === 'watchlist' ? matches.length : universeMatches.length}
        </span>
      </div>
      <div className={styles.scopeTabs}>
        <button
          type="button"
          className={scope === 'watchlist' ? styles.scopeBtnActive : styles.scopeBtn}
          onClick={() => setScope('watchlist')}
        >
          Watchlist
        </button>
        <button
          type="button"
          className={scope === 'universe' ? styles.scopeBtnActive : styles.scopeBtn}
          onClick={() => setScope('universe')}
        >
          Live universe
        </button>
      </div>
      <div className={styles.controls}>
        <label className={styles.ctrl}>
          Min $
          <input
            className={styles.input}
            type="number"
            step="0.01"
            value={minPrice}
            onChange={(e) => setMinPrice(Math.max(0, Number(e.target.value) || 0))}
          />
        </label>
        <label className={styles.ctrl}>
          Max $
          <input
            className={styles.input}
            type="number"
            step="0.01"
            value={maxPrice}
            onChange={(e) => setMaxPrice(Math.max(0, Number(e.target.value) || 0))}
          />
        </label>
        <label className={styles.ctrl}>
          Min vol
          <input
            className={styles.input}
            type="number"
            step="100000"
            value={minVolume}
            onChange={(e) =>
              setMinVolume(Math.max(0, Math.floor(Number(e.target.value) || 0)))
            }
          />
        </label>
        <label className={styles.ctrl}>
          Lookback
          <select
            className={styles.input}
            value={lookbackDays}
            onChange={(e) => {
              const n = Number(e.target.value)
              setLookbackDays(n === 5 ? 5 : n === 10 ? 10 : 1)
            }}
          >
            <option value={1}>1 day</option>
            <option value={5}>5 day</option>
            <option value={10}>10 day</option>
          </select>
        </label>
        <label className={styles.ctrl}>
          Min gap %
          <input
            className={styles.input}
            type="number"
            step="0.1"
            value={minGapPct}
            onChange={(e) => setMinGapPct(Number(e.target.value) || 0)}
          />
        </label>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={showAll}
            onChange={(e) => setShowAll(e.target.checked)}
          />
          Show all symbols (with reasons)
        </label>
      </div>
      <p className={styles.helper}>
        1D uses current price vs prior close. 5D/10D uses multi-session move from the
        server lookback baseline.
      </p>
      {scope === 'universe' && universeLoading ? (
        <p className={styles.meta}>Running live scan...</p>
      ) : null}
      {scope === 'universe' && universeError ? (
        <p className={styles.warn}>{universeError}</p>
      ) : null}

      {(scope === 'watchlist' ? displayed : universeDisplayed).length === 0 ? (
        <p className={styles.empty}>
          {scope === 'watchlist'
            ? 'No symbols match the current filter from your watchlist.'
            : 'No symbols match the current live-universe filter.'}
        </p>
      ) : (
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Ticker</th>
                <th>Last</th>
                <th>{lookbackDays}D %</th>
                <th>Volume</th>
                <th>Float</th>
                <th>Catalyst</th>
                {showAll && <th>Status / reason</th>}
              </tr>
            </thead>
            <tbody>
              {(scope === 'watchlist' ? displayed : universeDisplayed).map((r) => (
                <tr key={r.ticker}>
                  <td className={styles.tk}>{r.ticker}</td>
                  <td>{fmtPrice(r.last)}</td>
                  <td className={r.pass ? styles.ok : styles.warn}>{fmtPct(r.gapPct)}</td>
                  <td>{fmtVolume(r.volume)}</td>
                  <td className={styles.na}>N/A</td>
                  <td className={styles.na}>N/A</td>
                  {showAll && scope === 'watchlist' && (
                    <td className={r.pass ? styles.ok : styles.warn}>
                      {r.pass ? 'Pass' : r.reasons.join(' · ')}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className={styles.note}>
        Float and catalyst are placeholders until a fundamentals/news source is connected.
      </p>
    </article>
  )
}
