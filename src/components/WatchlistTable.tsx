import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import type { TrendArrow, WatchlistTableRow } from '../domain/types'
import {
  type WatchlistColumnHelp,
  WATCHLIST_COLUMN_HELP,
  WATCHLIST_STATUS_CELL_TOOLTIPS,
} from '../services/watchlistColumnHelp'
import styles from './WatchlistTable.module.css'

const trendArrow: Record<TrendArrow, string> = {
  up: '↑',
  flat: '→',
  down: '↓',
}

const statusDisplay: Record<WatchlistTableRow['status'], string> = {
  watching: 'WATCHING',
  ready: 'READY',
  no_setup: 'NO SETUP',
}

const TOOLTIP_HIDE_DELAY_MS = 160

/**
 * Full column-guide text in a floating panel. Portaled to `document.body` with
 * `position: fixed` so it is not clipped by `.tableScroll { overflow-x: auto }`.
 */
function ColumnHeaderInfoTrigger({ column }: { column: WatchlistColumnHelp }) {
  const tipId = useId()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const hideTimerRef = useRef<number | null>(null)
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(
    null,
  )

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current != null) {
      window.clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }
  }, [])

  const updatePosition = useCallback(() => {
    const el = buttonRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setCoords({
      top: r.bottom + 8,
      left: r.left + r.width / 2,
    })
  }, [])

  const show = useCallback(() => {
    clearHideTimer()
    updatePosition()
    setOpen(true)
  }, [clearHideTimer, updatePosition])

  const scheduleHide = useCallback(() => {
    clearHideTimer()
    hideTimerRef.current = window.setTimeout(() => {
      setOpen(false)
      hideTimerRef.current = null
    }, TOOLTIP_HIDE_DELAY_MS)
  }, [clearHideTimer])

  useEffect(() => {
    if (!open) return
    const dismiss = () => setOpen(false)
    window.addEventListener('scroll', dismiss, true)
    window.addEventListener('resize', dismiss)
    return () => {
      window.removeEventListener('scroll', dismiss, true)
      window.removeEventListener('resize', dismiss)
    }
  }, [open])

  useEffect(() => () => clearHideTimer(), [clearHideTimer])

  const portal =
    open &&
    coords != null &&
    typeof document !== 'undefined' &&
    createPortal(
      <div
        id={tipId}
        role="tooltip"
        className={styles.tooltipPortal}
        style={{
          top: coords.top,
          left: coords.left,
        }}
        onPointerEnter={clearHideTimer}
        onPointerLeave={scheduleHide}
      >
        <span className={styles.tooltipBubbleTitle}>{column.label}</span>
        <span className={styles.tooltipBubbleBody}>{column.description}</span>
      </div>,
      document.body,
    )

  return (
    <>
      <span
        className={styles.tooltipAnchor}
        onPointerEnter={show}
        onPointerLeave={scheduleHide}
      >
        <button
          ref={buttonRef}
          type="button"
          className={styles.tooltipTrigger}
          aria-describedby={open ? tipId : undefined}
          aria-expanded={open}
          aria-label={`${column.label} column: ${column.tooltip}`}
          onFocus={show}
          onBlur={scheduleHide}
        >
          <svg
            viewBox="0 0 16 16"
            className={styles.headerInfoSvg}
            aria-hidden="true"
          >
            <circle
              cx="8"
              cy="8"
              r="6.25"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.25"
            />
            <path
              fill="currentColor"
              d="M8 4.35c-.36 0-.65.29-.65.65s.29.65.65.65.65-.29.65-.65-.29-.65-.65-.65zm-.5 1.9h1v5.05h-1V6.25z"
            />
          </svg>
        </button>
      </span>
      {portal}
    </>
  )
}

export function WatchlistTable({
  rows,
  onRowClick,
}: {
  rows: WatchlistTableRow[]
  onRowClick?: (ticker: string) => void
}) {
  return (
    <section className={styles.wrap} aria-labelledby="watchlist-title">
      <div className={styles.titleRow}>
        <h2 id="watchlist-title" className={styles.title}>
          Watchlist
        </h2>
        <details className={styles.helpPanel}>
          <summary className={styles.helpSummary}>Column guide</summary>
          <p className={styles.helpIntro}>
            Watchlist scan rows appear when loaded from data pipelines. Hover a
            column header for a short
            hint, or hover or focus the info icon for the full column
            explanation. Expand this section to read all definitions at once.
          </p>
          <dl className={styles.helpList}>
            {WATCHLIST_COLUMN_HELP.map((c) => (
              <Fragment key={c.key}>
                <dt className={styles.helpTerm}>{c.label}</dt>
                <dd className={styles.helpDef}>{c.description}</dd>
              </Fragment>
            ))}
          </dl>
        </details>
      </div>
      <div className={styles.tableScroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              {WATCHLIST_COLUMN_HELP.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={styles.colHead}
                  title={c.tooltip}
                >
                  <span className={styles.colHeadInner}>
                    <span className={styles.colHeadLabel}>{c.label}</span>
                    <ColumnHeaderInfoTrigger column={c} />
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.ticker}
                className={`${styles.row} ${onRowClick ? styles.rowClick : ''}`}
                onClick={() => onRowClick?.(r.ticker)}
                onKeyDown={(e) => {
                  if (
                    onRowClick &&
                    (e.key === 'Enter' || e.key === ' ')
                  ) {
                    e.preventDefault()
                    onRowClick(r.ticker)
                  }
                }}
                tabIndex={onRowClick ? 0 : undefined}
                role={onRowClick ? 'button' : undefined}
              >
                <td className={styles.ticker} title={r.ticker}>
                  {r.ticker}
                </td>
                <td title="Trend vs ~20-day EMA for this symbol.">
                  <span
                    className={`${styles.trend} ${styles[`trend_${r.trend}`]}`}
                    aria-label={`${r.ticker} trend ${r.trend}`}
                  >
                    {trendArrow[r.trend]}
                  </span>
                </td>
                <td title="Pattern the scanner chose, or why there is no setup.">
                  {r.setup}
                </td>
                <td
                  className={styles.level}
                  title="Reference price anchor for the active setup type."
                >
                  {r.level}
                </td>
                <td
                  className={styles.meta}
                  title="Last session volume vs 20-day average."
                >
                  {r.relVol ?? '—'}
                </td>
                <td
                  className={styles.meta}
                  title="0–100 morning rubric (market, setup, vol, trend, level, R:R, time window)."
                >
                  {r.score != null ? r.score.toFixed(1) : '—'}
                </td>
                <td>
                  <span
                    className={`${styles.status} ${styles[`status_${r.status}`]}`}
                    title={WATCHLIST_STATUS_CELL_TOOLTIPS[r.status]}
                  >
                    {statusDisplay[r.status]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
