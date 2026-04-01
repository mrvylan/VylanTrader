import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import type { Position, TradePlan } from '../domain/types'
import type { MarketQuote } from '../providers/types'
import {
  loadWatchlistQuotesGroups,
  saveWatchlistQuotesGroups,
  type WatchlistQuoteGroup,
} from '../persistence/watchlistQuotesGroupStorage'
import { WatchlistChartModal } from './WatchlistChartModal'
import styles from './WatchlistQuotesCard.module.css'

const PAGE_SIZE = 10

type SortKey = 'ticker' | 'previousClose' | 'last' | 'changePct' | 'volume'

type Row = {
  ticker: string
  previousClose: number | null
  last: number | null
  changePct: number | null
  volume: number | null
}

function formatPrice(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function formatVolume(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return Math.round(n).toLocaleString('en-US')
}

function formatPct(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return '—'
  const sign = n > 0 ? '+' : ''
  return `${sign}${n.toFixed(2)}%`
}

function rowFromQuote(ticker: string, q: MarketQuote | undefined): Row {
  const last = q?.last != null && Number.isFinite(q.last) ? q.last : null
  const previousClose =
    q?.previousClose != null && Number.isFinite(q.previousClose) && q.previousClose > 0
      ? q.previousClose
      : null
  const volume =
    q?.volume != null && Number.isFinite(q.volume) ? q.volume : null
  const changePct =
    last != null && previousClose != null && previousClose > 0
      ? ((last - previousClose) / previousClose) * 100
      : null
  return {
    ticker,
    previousClose,
    last,
    changePct,
    volume,
  }
}

function compareNullableNumber(
  a: number | null,
  b: number | null,
  dir: 1 | -1,
): number {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  if (a === b) return 0
  return a < b ? -dir : dir
}

function hasOpenPositionForPlan(positions: Position[], planId: string) {
  return positions.some(
    (p) => p.tradePlanId === planId && p.status === 'open',
  )
}

function groupForTicker(
  groups: Record<string, WatchlistQuoteGroup>,
  ticker: string,
): WatchlistQuoteGroup {
  return groups[ticker.toUpperCase()] ?? 'active'
}

function planSummaryLine(p: TradePlan): string {
  const side = p.bias === 'bearish' ? 'Short' : 'Long'
  const note =
    p.notes && p.notes.trim().length > 0
      ? p.notes.trim().slice(0, 72) + (p.notes.trim().length > 72 ? '…' : '')
      : null
  const parts = [
    `${side}`,
    `${p.positionSize} sh`,
    `entry ${formatPrice(p.entry)}`,
    `stop ${formatPrice(p.stop)}`,
    `tgt ${formatPrice(p.target)}`,
    p.expectedR != null ? `~${p.expectedR.toFixed(1)}R` : null,
    p.status,
  ].filter(Boolean)
  const base = parts.join(' · ')
  return note ? `${base} — ${note}` : base
}

export function WatchlistQuotesCard({
  watchlist,
  quotes,
  lastPriceRefreshAt,
  onRefresh,
  manualQuotePlans,
  positions,
  onReconcileManualPlan,
  onAddManualPlan,
  onEditManualPlan,
  onDeleteManualPlan,
}: {
  watchlist: string[]
  quotes: Record<string, MarketQuote>
  lastPriceRefreshAt: number | null
  onRefresh: () => void | Promise<void>
  manualQuotePlans: TradePlan[]
  positions: Position[]
  onReconcileManualPlan: (planId: string) => void
  onAddManualPlan: (ticker: string) => void
  onEditManualPlan: (planId: string) => void
  onDeleteManualPlan: (planId: string) => void
}) {
  const [sortKey, setSortKey] = useState<SortKey>('ticker')
  const [sortDir, setSortDir] = useState<1 | -1>(1)
  const [refreshBusy, setRefreshBusy] = useState(false)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [chartTicker, setChartTicker] = useState<string | null>(null)
  const [quoteGroups, setQuoteGroups] = useState<Record<string, WatchlistQuoteGroup>>(
    loadWatchlistQuotesGroups,
  )
  const [activePage, setActivePage] = useState(1)
  const [backBurnerPage, setBackBurnerPage] = useState(1)

  useEffect(() => {
    saveWatchlistQuotesGroups(quoteGroups)
  }, [quoteGroups])

  useEffect(() => {
    const wl = new Set(watchlist.map((t) => t.trim().toUpperCase()).filter(Boolean))
    setQuoteGroups((g) => {
      const next = { ...g }
      let changed = false
      for (const k of Object.keys(next)) {
        if (!wl.has(k)) {
          delete next[k]
          changed = true
        }
      }
      return changed ? next : g
    })
  }, [watchlist])

  const setTickerGroup = useCallback((ticker: string, g: WatchlistQuoteGroup) => {
    const k = ticker.toUpperCase()
    setQuoteGroups((prev) => ({ ...prev, [k]: g }))
  }, [])

  const byTicker = useMemo(() => {
    const m = new Map<string, TradePlan[]>()
    for (const p of manualQuotePlans) {
      const k = p.ticker.toUpperCase()
      const arr = m.get(k) ?? []
      arr.push(p)
      m.set(k, arr)
    }
    for (const [, arr] of m) {
      arr.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
    }
    return m
  }, [manualQuotePlans])

  const toggleExpanded = useCallback((ticker: string) => {
    const k = ticker.toUpperCase()
    setExpanded((e) => ({ ...e, [k]: !e[k] }))
  }, [])

  const handleRefresh = useCallback(async () => {
    setRefreshBusy(true)
    try {
      await Promise.resolve(onRefresh())
    } finally {
      setRefreshBusy(false)
    }
  }, [onRefresh])

  const onSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 1 ? -1 : 1))
    } else {
      setSortKey(key)
      setSortDir(key === 'ticker' ? 1 : -1)
    }
  }

  const rows = useMemo(() => {
    const base = watchlist.map((t) =>
      rowFromQuote(t.toUpperCase(), quotes[t.toUpperCase()]),
    )
    const dir = sortDir
    const sorted = [...base].sort((ra, rb) => {
      if (sortKey === 'ticker') {
        const c = ra.ticker.localeCompare(rb.ticker)
        return c * dir
      }
      if (sortKey === 'previousClose') {
        return compareNullableNumber(ra.previousClose, rb.previousClose, dir)
      }
      if (sortKey === 'last') {
        return compareNullableNumber(ra.last, rb.last, dir)
      }
      if (sortKey === 'changePct') {
        return compareNullableNumber(ra.changePct, rb.changePct, dir)
      }
      return compareNullableNumber(ra.volume, rb.volume, dir)
    })
    return sorted
  }, [watchlist, quotes, sortKey, sortDir])

  const activeRows = useMemo(
    () => rows.filter((r) => groupForTicker(quoteGroups, r.ticker) === 'active'),
    [rows, quoteGroups],
  )
  const backBurnerRows = useMemo(
    () =>
      rows.filter((r) => groupForTicker(quoteGroups, r.ticker) === 'backBurner'),
    [rows, quoteGroups],
  )

  const activeTotalPages = Math.max(1, Math.ceil(activeRows.length / PAGE_SIZE))
  const backBurnerTotalPages = Math.max(
    1,
    Math.ceil(backBurnerRows.length / PAGE_SIZE),
  )

  useEffect(() => {
    setActivePage((p) => Math.min(p, activeTotalPages))
  }, [activeTotalPages])
  useEffect(() => {
    setBackBurnerPage((p) => Math.min(p, backBurnerTotalPages))
  }, [backBurnerTotalPages])

  const activeSlice = useMemo(
    () =>
      activeRows.slice(
        (activePage - 1) * PAGE_SIZE,
        activePage * PAGE_SIZE,
      ),
    [activeRows, activePage],
  )
  const backBurnerSlice = useMemo(
    () =>
      backBurnerRows.slice(
        (backBurnerPage - 1) * PAGE_SIZE,
        backBurnerPage * PAGE_SIZE,
      ),
    [backBurnerRows, backBurnerPage],
  )

  const refreshedLabel = useMemo(() => {
    if (lastPriceRefreshAt == null) return null
    return new Date(lastPriceRefreshAt).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  }, [lastPriceRefreshAt])

  const sortIndicator = (key: SortKey) =>
    sortKey === key ? (sortDir === 1 ? '↑' : '↓') : ''

  const tableHead = (
    <thead>
      <tr>
        <th className={styles.th} scope="col">
          <button
            type="button"
            className={styles.thBtn}
            onClick={() => onSort('ticker')}
            aria-sort={
              sortKey === 'ticker'
                ? sortDir === 1
                  ? 'ascending'
                  : 'descending'
                : 'none'
            }
          >
            Ticker / plans
            <span className={styles.sortHint} aria-hidden>
              {sortIndicator('ticker')}
            </span>
          </button>
        </th>
        <th className={styles.th} scope="col">
          Move
        </th>
        <th className={styles.th} scope="col">
          <button
            type="button"
            className={styles.thBtn}
            onClick={() => onSort('previousClose')}
            aria-sort={
              sortKey === 'previousClose'
                ? sortDir === 1
                  ? 'ascending'
                  : 'descending'
                : 'none'
            }
          >
            Prev close
            <span className={styles.sortHint} aria-hidden>
              {sortIndicator('previousClose')}
            </span>
          </button>
        </th>
        <th className={styles.th} scope="col">
          <button
            type="button"
            className={styles.thBtn}
            onClick={() => onSort('last')}
            aria-sort={
              sortKey === 'last'
                ? sortDir === 1
                  ? 'ascending'
                  : 'descending'
                : 'none'
            }
          >
            Last
            <span className={styles.sortHint} aria-hidden>
              {sortIndicator('last')}
            </span>
          </button>
        </th>
        <th className={styles.th} scope="col">
          <button
            type="button"
            className={styles.thBtn}
            onClick={() => onSort('changePct')}
            aria-sort={
              sortKey === 'changePct'
                ? sortDir === 1
                  ? 'ascending'
                  : 'descending'
                : 'none'
            }
          >
            Chg %
            <span className={styles.sortHint} aria-hidden>
              {sortIndicator('changePct')}
            </span>
          </button>
        </th>
        <th className={styles.th} scope="col">
          <button
            type="button"
            className={styles.thBtn}
            onClick={() => onSort('volume')}
            aria-sort={
              sortKey === 'volume'
                ? sortDir === 1
                  ? 'ascending'
                  : 'descending'
                : 'none'
            }
          >
            Volume
            <span className={styles.sortHint} aria-hidden>
              {sortIndicator('volume')}
            </span>
          </button>
        </th>
        <th className={styles.th} scope="col">
          Manual plan
        </th>
        <th className={styles.th} scope="col">
          Chart
        </th>
      </tr>
    </thead>
  )

  const renderRows = (
    slice: Row[],
    section: WatchlistQuoteGroup,
  ) =>
    slice.map((r) => {
      const pctClass =
        r.changePct == null
          ? styles.pctFlat
          : r.changePct > 0
            ? styles.pctUp
            : r.changePct < 0
              ? styles.pctDown
              : styles.pctFlat
      const k = r.ticker.toUpperCase()
      const mqPlans = byTicker.get(k) ?? []
      const isOpen = Boolean(expanded[k])
      return (
        <Fragment key={r.ticker}>
          <tr>
            <td className={`${styles.td} ${styles.ticker}`}>
              <button
                type="button"
                className={styles.expandBtn}
                aria-expanded={isOpen}
                aria-label={
                  isOpen
                    ? `Collapse plans for ${r.ticker}`
                    : `Expand plans for ${r.ticker}`
                }
                onClick={() => toggleExpanded(r.ticker)}
              >
                {isOpen ? '▼' : '▶'}
              </button>
              {r.ticker}
              {mqPlans.length > 0 && (
                <span className={styles.planBadge}>{mqPlans.length}</span>
              )}
            </td>
            <td className={styles.td}>
              <div className={styles.moveCell}>
                {section === 'active' ? (
                  <button
                    type="button"
                    className={styles.moveToBackBurnerBtn}
                    aria-label={`Move ${r.ticker} to back-burner`}
                    onClick={() => setTickerGroup(r.ticker, 'backBurner')}
                  >
                    To back-burner
                  </button>
                ) : (
                  <button
                    type="button"
                    className={styles.moveToActiveBtn}
                    aria-label={`Move ${r.ticker} to active`}
                    onClick={() => setTickerGroup(r.ticker, 'active')}
                  >
                    To Active
                  </button>
                )}
              </div>
            </td>
            <td className={styles.td}>
              {r.previousClose == null ? (
                <span className={styles.muted}>—</span>
              ) : (
                formatPrice(r.previousClose)
              )}
            </td>
            <td className={styles.td}>
              {r.last == null ? (
                <span className={styles.muted}>—</span>
              ) : (
                formatPrice(r.last)
              )}
            </td>
            <td className={`${styles.td} ${pctClass}`}>
              {formatPct(r.changePct)}
            </td>
            <td className={styles.td}>{formatVolume(r.volume)}</td>
            <td className={styles.td}>
              <button
                type="button"
                className={styles.addPlanBtn}
                onClick={() => onAddManualPlan(r.ticker)}
              >
                Add plan
              </button>
            </td>
            <td className={styles.td}>
              <button
                type="button"
                className={styles.chartBtn}
                onClick={() => setChartTicker(r.ticker)}
              >
                Chart
              </button>
            </td>
          </tr>
          {isOpen && mqPlans.length === 0 && (
            <tr className={styles.subRow}>
              <td colSpan={8} className={styles.subEmpty}>
                No manual plans for {r.ticker}. Use Add plan to enter entry, size,
                risk, target, and notes.
              </td>
            </tr>
          )}
          {isOpen &&
            mqPlans.map((p) => {
              const open = hasOpenPositionForPlan(positions, p.id)
              const blockRec = p.status === 'entered' && open
              const blockDelete = open
              return (
                <tr key={p.id} className={styles.subRow}>
                  <td colSpan={7} className={styles.subDetail}>
                    {planSummaryLine(p)}
                  </td>
                  <td className={styles.subActions}>
                    <button
                      type="button"
                      className={styles.editPlanBtn}
                      onClick={() => onEditManualPlan(p.id)}
                    >
                      Edit
                    </button>
                    {p.status !== 'closed' && (
                      <button
                        type="button"
                        className={styles.reconcilePlanBtn}
                        disabled={blockRec}
                        title={
                          blockRec
                            ? 'Close the open position first'
                            : undefined
                        }
                        onClick={() => onReconcileManualPlan(p.id)}
                      >
                        Outcome
                      </button>
                    )}
                    <button
                      type="button"
                      className={styles.deletePlanBtn}
                      disabled={blockDelete}
                      title={
                        blockDelete
                          ? 'Close the open position before deleting this plan'
                          : 'Delete this plan (local only)'
                      }
                      onClick={() => {
                        if (
                          !window.confirm(
                            `Delete this plan for ${p.ticker}? This removes it from this browser only.`,
                          )
                        ) {
                          return
                        }
                        onDeleteManualPlan(p.id)
                      }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              )
            })}
        </Fragment>
      )
    })

  return (
    <article className={styles.card} aria-labelledby="watchlist-quotes-title">
      <div className={styles.head}>
        <div>
          <h2 id="watchlist-quotes-title" className={styles.title}>
            Watchlist quotes
          </h2>
          {refreshedLabel && (
            <p className={styles.meta}>Updated {refreshedLabel}</p>
          )}
          <p className={styles.hintBar}>
            Manual plans (from quotes) use the same fields as plan Edit. Expand
            a row to view or edit.             Use the Move column to send a symbol to the other list (saved in
            this browser); each list shows 10 per page.
          </p>
        </div>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.refreshBtn}
            onClick={() => void handleRefresh()}
            disabled={refreshBusy}
          >
            {refreshBusy ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {watchlist.length === 0 ? (
        <p className={styles.empty}>
          Add tickers in Settings to see previous close, last price, change, and
          volume.
        </p>
      ) : (
        <div className={styles.groupedWrap}>
          <section
            className={styles.groupSection}
            aria-labelledby="wl-quotes-active"
          >
            <div className={styles.groupHead}>
              <h3 id="wl-quotes-active" className={styles.groupTitle}>
                Active
                <span className={styles.groupCount}>{activeRows.length}</span>
              </h3>
              {activeRows.length > 0 ? (
                <div className={styles.paginator}>
                  <span className={styles.pageMeta}>
                    Showing{' '}
                    {Math.min(
                      (activePage - 1) * PAGE_SIZE + 1,
                      activeRows.length,
                    )}
                    –
                    {Math.min(activePage * PAGE_SIZE, activeRows.length)} of{' '}
                    {activeRows.length}
                  </span>
                  <button
                    type="button"
                    className={styles.pageBtn}
                    disabled={activePage <= 1}
                    onClick={() => setActivePage((p) => Math.max(1, p - 1))}
                  >
                    Prev
                  </button>
                  <span className={styles.pageNum}>
                    {activePage} / {activeTotalPages}
                  </span>
                  <button
                    type="button"
                    className={styles.pageBtn}
                    disabled={activePage >= activeTotalPages}
                    onClick={() =>
                      setActivePage((p) => Math.min(activeTotalPages, p + 1))
                    }
                  >
                    Next
                  </button>
                </div>
              ) : null}
            </div>
            {activeRows.length === 0 ? (
              <p className={styles.groupEmpty}>
                No symbols in Active. Open Back-burner and use To Active to
                promote tickers here.
              </p>
            ) : (
              <div className={styles.tableScroll}>
                <table className={styles.table}>
                  {tableHead}
                  <tbody>{renderRows(activeSlice, 'active')}</tbody>
                </table>
              </div>
            )}
          </section>

          <section
            className={styles.groupSection}
            aria-labelledby="wl-quotes-backburner"
          >
            <div className={styles.groupHead}>
              <h3 id="wl-quotes-backburner" className={styles.groupTitle}>
                Back-burner
                <span className={styles.groupCount}>
                  {backBurnerRows.length}
                </span>
              </h3>
              {backBurnerRows.length > 0 ? (
                <div className={styles.paginator}>
                  <span className={styles.pageMeta}>
                    Showing{' '}
                    {Math.min(
                      (backBurnerPage - 1) * PAGE_SIZE + 1,
                      backBurnerRows.length,
                    )}
                    –
                    {Math.min(
                      backBurnerPage * PAGE_SIZE,
                      backBurnerRows.length,
                    )}{' '}
                    of {backBurnerRows.length}
                  </span>
                  <button
                    type="button"
                    className={styles.pageBtn}
                    disabled={backBurnerPage <= 1}
                    onClick={() =>
                      setBackBurnerPage((p) => Math.max(1, p - 1))
                    }
                  >
                    Prev
                  </button>
                  <span className={styles.pageNum}>
                    {backBurnerPage} / {backBurnerTotalPages}
                  </span>
                  <button
                    type="button"
                    className={styles.pageBtn}
                    disabled={backBurnerPage >= backBurnerTotalPages}
                    onClick={() =>
                      setBackBurnerPage((p) =>
                        Math.min(backBurnerTotalPages, p + 1),
                      )
                    }
                  >
                    Next
                  </button>
                </div>
              ) : null}
            </div>
            {backBurnerRows.length === 0 ? (
              <p className={styles.groupEmpty}>
                No symbols on the back-burner. In Active, use To back-burner to
                park lower-priority names here.
              </p>
            ) : (
              <div className={styles.tableScroll}>
                <table className={styles.table}>
                  {tableHead}
                  <tbody>{renderRows(backBurnerSlice, 'backBurner')}</tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
      <WatchlistChartModal
        open={chartTicker != null}
        ticker={chartTicker}
        onClose={() => setChartTicker(null)}
      />
    </article>
  )
}
