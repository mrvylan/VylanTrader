import { useMemo, useState } from 'react'
import type { TradeJournalEntry } from '../domain/types'
import { aggregateJournalByMonth } from '../services/monthlyJournalAggregate'
import styles from './MonthlyAggregatePanel.module.css'

function currentMonthLocal(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

function formatMoney(n: number) {
  const sign = n < 0 ? '−' : ''
  const abs = Math.abs(n)
  return (
    sign +
    abs.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  )
}

function formatPct(n: number) {
  const rounded = Math.round(n * 100) / 100
  return `${rounded >= 0 ? '' : '−'}${Math.abs(rounded).toFixed(2)}%`
}

function pnlClass(n: number) {
  if (n > 0) return styles.pnlPos
  if (n < 0) return styles.pnlNeg
  return ''
}

export function MonthlyAggregatePanel({
  journal,
  onBackToDesk,
}: {
  journal: TradeJournalEntry[]
  onBackToDesk: () => void
}) {
  const [month, setMonth] = useState(currentMonthLocal)

  const agg = useMemo(
    () => aggregateJournalByMonth(journal, month),
    [journal, month],
  )

  const { totals } = agg

  return (
    <section className={styles.wrap} aria-labelledby="aggregate-title">
      <div className={styles.head}>
        <div>
          <h1 id="aggregate-title" className={styles.title}>
            Monthly aggregate
          </h1>
          <p className={styles.sub}>
            Closed trades from your journal for the selected month. P/L % is
            realized dollars divided by entry × shares (position notional).
          </p>
        </div>
        <button type="button" className={styles.backBtn} onClick={onBackToDesk}>
          Trading desk
        </button>
      </div>

      <div className={styles.monthRow}>
        <label htmlFor="agg-month" className={styles.monthLabel}>
          Month
        </label>
        <input
          id="agg-month"
          className={styles.monthInput}
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
        />
      </div>

      {totals.tradeCount === 0 ? (
        <p className={styles.muted}>
          No journal trades in this month. Close a position from Active positions
          to log a row.
        </p>
      ) : (
        <>
          <div>
            <h2 className={styles.blockTitle}>Month summary</h2>
            <div className={styles.summaryGrid}>
              <div className={styles.summaryCard}>
                <p className={styles.summaryLabel}>Trades</p>
                <p className={styles.summaryValue}>{totals.tradeCount}</p>
                <p className={styles.summaryDetail}>
                  {totals.wins}W · {totals.losses}L
                </p>
              </div>
              <div className={styles.summaryCard}>
                <p className={styles.summaryLabel}>Win rate</p>
                <p className={styles.summaryValue}>
                  {totals.winRatePct}%
                </p>
              </div>
              <div className={styles.summaryCard}>
                <p className={styles.summaryLabel}>Total P/L</p>
                <p
                  className={`${styles.summaryValue} ${pnlClass(totals.totalPnlDollars)}`}
                >
                  {formatMoney(totals.totalPnlDollars)}
                </p>
              </div>
              <div className={styles.summaryCard}>
                <p className={styles.summaryLabel}>Total R</p>
                <p className={styles.summaryValue}>
                  {totals.totalR.toFixed(2)}
                </p>
              </div>
              <div className={styles.summaryCard}>
                <p className={styles.summaryLabel}>Avg R</p>
                <p className={styles.summaryValue}>
                  {totals.avgR.toFixed(2)}
                </p>
              </div>
            </div>
          </div>

          <div>
            <h2 className={styles.blockTitle}>Best / worst</h2>
            <div className={styles.extremesRow}>
              <div className={styles.summaryCard}>
                <p className={styles.summaryLabel}>Best $</p>
                <p
                  className={`${styles.summaryValue} ${agg.bestPnl ? pnlClass(agg.bestPnl.value) : ''}`}
                >
                  {agg.bestPnl ? formatMoney(agg.bestPnl.value) : '—'}
                </p>
                {agg.bestPnl ? (
                  <p className={styles.summaryDetail}>
                    {agg.bestPnl.ticker} · {agg.bestPnl.date}
                  </p>
                ) : null}
              </div>
              <div className={styles.summaryCard}>
                <p className={styles.summaryLabel}>Worst $</p>
                <p
                  className={`${styles.summaryValue} ${agg.worstPnl ? pnlClass(agg.worstPnl.value) : ''}`}
                >
                  {agg.worstPnl ? formatMoney(agg.worstPnl.value) : '—'}
                </p>
                {agg.worstPnl ? (
                  <p className={styles.summaryDetail}>
                    {agg.worstPnl.ticker} · {agg.worstPnl.date}
                  </p>
                ) : null}
              </div>
              <div className={styles.summaryCard}>
                <p className={styles.summaryLabel}>Best %</p>
                <p
                  className={`${styles.summaryValue} ${agg.bestPct ? pnlClass(agg.bestPct.value) : ''}`}
                >
                  {agg.bestPct ? formatPct(agg.bestPct.value) : '—'}
                </p>
                {agg.bestPct ? (
                  <p className={styles.summaryDetail}>
                    {agg.bestPct.ticker} · {agg.bestPct.date}
                  </p>
                ) : null}
              </div>
              <div className={styles.summaryCard}>
                <p className={styles.summaryLabel}>Worst %</p>
                <p
                  className={`${styles.summaryValue} ${agg.worstPct ? pnlClass(agg.worstPct.value) : ''}`}
                >
                  {agg.worstPct ? formatPct(agg.worstPct.value) : '—'}
                </p>
                {agg.worstPct ? (
                  <p className={styles.summaryDetail}>
                    {agg.worstPct.ticker} · {agg.worstPct.date}
                  </p>
                ) : null}
              </div>
            </div>
            {agg.tradesSkippedForPct > 0 ? (
              <p className={styles.note}>
                {agg.tradesSkippedForPct} trade
                {agg.tradesSkippedForPct === 1 ? '' : 's'} skipped for % best/worst
                (zero or invalid notional).
              </p>
            ) : null}
          </div>

          <div>
            <h2 className={styles.blockTitle}>By day</h2>
            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.th}>Date</th>
                    <th className={styles.th}>Trades</th>
                    <th className={styles.th}>W/L</th>
                    <th className={styles.th}>P/L</th>
                    <th className={styles.th}>Σ R</th>
                  </tr>
                </thead>
                <tbody>
                  {agg.daily.map((d) => (
                    <tr key={d.date}>
                      <td className={styles.td}>{d.date}</td>
                      <td className={styles.td}>{d.tradeCount}</td>
                      <td className={styles.td}>
                        {d.wins}/{d.losses}
                      </td>
                      <td
                        className={`${styles.td} ${pnlClass(d.pnlDollars)}`}
                      >
                        {formatMoney(d.pnlDollars)}
                      </td>
                      <td className={styles.td}>{d.sumR.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </section>
  )
}
