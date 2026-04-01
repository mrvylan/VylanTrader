import { useMemo } from 'react'
import type { Position } from '../domain/types'
import { deployedNotionalOpenLongs } from '../services/positionMath'
import styles from './AccountCashPieCard.module.css'

function formatMoney(n: number) {
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
}

const COLOR_AVAILABLE = '#22c55e'
const COLOR_IN_TRADES = '#3b82f6'

export function AccountCashPieCard({
  accountSize,
  positions,
}: {
  accountSize: number
  positions: Position[]
}) {
  const deployed = useMemo(
    () => deployedNotionalOpenLongs(positions),
    [positions],
  )

  const available = useMemo(() => {
    if (!Number.isFinite(accountSize) || accountSize <= 0) return 0
    return Math.max(0, Math.round((accountSize - deployed) * 100) / 100)
  }, [accountSize, deployed])

  const total = available + deployed
  const availDeg = total > 0 ? (available / total) * 360 : 0

  const pieBackground =
    total <= 0
      ? 'conic-gradient(#334155 0deg 360deg)'
      : deployed <= 0
        ? `conic-gradient(${COLOR_AVAILABLE} 0deg 360deg)`
        : available <= 0
          ? `conic-gradient(${COLOR_IN_TRADES} 0deg 360deg)`
          : `conic-gradient(${COLOR_AVAILABLE} 0deg ${availDeg}deg, ${COLOR_IN_TRADES} ${availDeg}deg 360deg)`

  const pctInTrades =
    total > 0 ? Math.round((deployed / total) * 1000) / 10 : 0
  const pctAvailable =
    total > 0 ? Math.round((available / total) * 1000) / 10 : 0

  let ariaLabel = `Available cash ${formatMoney(available)}, in open trades ${formatMoney(deployed)}.`
  if (total <= 0 && (!Number.isFinite(accountSize) || accountSize <= 0)) {
    ariaLabel =
      'Set account size in Settings to compare cash vs open trades.'
  } else if (total <= 0) {
    ariaLabel = 'No capital in play.'
  }

  return (
    <article
      className={styles.card}
      aria-labelledby="cash-pie-title"
    >
      <h2 id="cash-pie-title" className={styles.title}>
        Cash vs open trades
      </h2>
      {!Number.isFinite(accountSize) || accountSize <= 0 ? (
        <p className={styles.muted}>
          Set account size in Settings to show available cash. Open-trade capital
          is still shown from your positions.
        </p>
      ) : null}
      <div
        className={styles.chartRow}
        role="img"
        aria-label={ariaLabel}
      >
        <div className={styles.donutWrap}>
          <div
            className={styles.donut}
            style={{ background: pieBackground }}
          />
          <div className={styles.donutHole} />
        </div>
        <ul className={styles.legend}>
          <li className={styles.legendItem}>
            <span
              className={styles.swatch}
              style={{ background: COLOR_AVAILABLE }}
            />
            <span className={styles.legendText}>
              <span className={styles.legendLabel}>Available</span>
              <span className={styles.legendVal}>{formatMoney(available)}</span>
              {total > 0 ? (
                <span className={styles.legendPct}>{pctAvailable}%</span>
              ) : null}
            </span>
          </li>
          <li className={styles.legendItem}>
            <span
              className={styles.swatch}
              style={{ background: COLOR_IN_TRADES }}
            />
            <span className={styles.legendText}>
              <span className={styles.legendLabel}>In open trades</span>
              <span className={styles.legendVal}>{formatMoney(deployed)}</span>
              {total > 0 ? (
                <span className={styles.legendPct}>{pctInTrades}%</span>
              ) : null}
            </span>
          </li>
        </ul>
      </div>
      {Number.isFinite(accountSize) && accountSize > 0 ? (
        <p className={styles.meta}>
          Account size {formatMoney(accountSize)} · In trades = entry × shares
          per open position.
        </p>
      ) : deployed > 0 ? (
        <p className={styles.meta}>
          In trades = entry × shares (sum {formatMoney(deployed)}).
        </p>
      ) : (
        <p className={styles.meta}>No open positions.</p>
      )}
    </article>
  )
}
