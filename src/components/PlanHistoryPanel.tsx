import { useMemo, useState } from 'react'
import type { PlanHistoryEntry, Position, TradePlan } from '../domain/types'
import styles from './PlanHistoryPanel.module.css'

function hasOpenPositionForPlan(positions: Position[], planId: string) {
  return positions.some(
    (p) => p.tradePlanId === planId && p.status === 'open',
  )
}

function formatMoney(n: number | undefined) {
  if (n == null || !Number.isFinite(n)) return '—'
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function PlanHistoryPanel({
  planHistory,
  tradePlans,
  positions,
  onBackToDesk,
  onReconcile,
  onClearHistory,
}: {
  planHistory: PlanHistoryEntry[]
  tradePlans: TradePlan[]
  positions: Position[]
  onBackToDesk: () => void
  onReconcile: (planId: string) => void
  /** Dev: wipe reconciled rows from local storage (plans / journal unchanged). */
  onClearHistory: () => void
}) {
  const [tickerFilter, setTickerFilter] = useState('')

  const outstanding = useMemo(() => {
    return tradePlans
      .filter((p) => p.status !== 'closed')
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }, [tradePlans])

  const filteredHistory = useMemo(() => {
    const q = tickerFilter.trim().toUpperCase()
    if (!q) return planHistory
    return planHistory.filter((h) => h.ticker.toUpperCase().includes(q))
  }, [planHistory, tickerFilter])

  return (
    <section className={styles.wrap} aria-labelledby="plan-history-title">
      <div className={styles.head}>
        <div>
          <h1 id="plan-history-title" className={styles.title}>
            Plan history
          </h1>
          <p className={styles.sub}>
            Master report of reconciled plans. Close executed trades from
            Active positions to log in the Journal; use Record outcome for
            everything else.
          </p>
        </div>
        <div className={styles.headActions}>
          <button
            type="button"
            className={styles.clearBtn}
            disabled={planHistory.length === 0}
            title={
              planHistory.length === 0
                ? 'No reconciled rows to remove'
                : 'Remove all rows from the Reconciled table (local only)'
            }
            onClick={() => {
              if (
                !window.confirm(
                  'Clear all plan history data? This removes reconciled rows from this browser only. Trade plans and the journal are not changed.',
                )
              ) {
                return
              }
              onClearHistory()
            }}
          >
            Clear history
          </button>
          <button type="button" className={styles.backBtn} onClick={onBackToDesk}>
            Trading desk
          </button>
        </div>
      </div>

      <div>
        <h2 className={styles.blockTitle}>Outstanding — needs outcome</h2>
        {outstanding.length === 0 ? (
          <p className={styles.muted}>All plans are closed.</p>
        ) : (
          <ul className={styles.outstandingList}>
            {outstanding.map((p) => {
              const open = hasOpenPositionForPlan(positions, p.id)
              const blockReconcile = p.status === 'entered' && open
              return (
                <li key={p.id} className={styles.outRow}>
                  <div className={styles.outMain}>
                    <span className={styles.tk}>{p.ticker}</span>
                    <span>{p.setupType}</span>
                    <span className={styles.statusPill}>{p.status}</span>
                  </div>
                  <button
                    type="button"
                    className={styles.recBtn}
                    disabled={blockReconcile}
                    title={
                      blockReconcile
                        ? 'Close the open position in Active positions first'
                        : undefined
                    }
                    onClick={() => onReconcile(p.id)}
                  >
                    Record outcome
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div>
        <h2 className={styles.blockTitle}>Reconciled</h2>
        <div className={styles.filterRow}>
          <label htmlFor="hist-filter" className={styles.srOnly}>
            Filter by ticker
          </label>
          <input
            id="hist-filter"
            className={styles.filterInput}
            type="search"
            placeholder="Filter ticker…"
            value={tickerFilter}
            onChange={(e) => setTickerFilter(e.target.value)}
            aria-label="Filter history by ticker"
          />
        </div>
        {filteredHistory.length === 0 ? (
          <p className={styles.muted}>
            {planHistory.length === 0 && !tickerFilter.trim()
              ? 'Nothing reconciled yet. When you record an outcome for a plan, it will appear here.'
              : 'No rows match your filter.'}
          </p>
        ) : (
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.th}>Date</th>
                  <th className={styles.th}>Ticker</th>
                  <th className={styles.th}>Setup</th>
                  <th className={styles.th}>Was</th>
                  <th className={styles.th}>Result</th>
                  <th className={styles.th}>R</th>
                  <th className={styles.th}>P&amp;L</th>
                  <th className={styles.th}>Notes</th>
                </tr>
              </thead>
              <tbody>
                {filteredHistory.map((h) => (
                  <tr key={h.id}>
                    <td className={styles.td}>
                      {h.reconciledAt.slice(0, 10)}
                    </td>
                    <td className={styles.td}>{h.ticker}</td>
                    <td className={styles.td}>{h.setupType}</td>
                    <td className={styles.td}>{h.priorStatus}</td>
                    <td className={styles.td}>{h.result}</td>
                    <td className={styles.td}>
                      {h.rMultiple != null && Number.isFinite(h.rMultiple)
                        ? h.rMultiple.toFixed(2)
                        : '—'}
                    </td>
                    <td className={styles.td}>
                      {formatMoney(h.pnlDollars)}
                    </td>
                    <td className={`${styles.td} ${styles.notesCell}`}>
                      {h.notes ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}
