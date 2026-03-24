import { useEffect, useState } from 'react'
import styles from './PricesModal.module.css'

function formatPt(ts: number): string {
  return new Date(ts).toLocaleString('en-US', {
    timeZone: 'America/Los_Angeles',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  })
}

export function PricesModal({
  open,
  lastPrices,
  lastPriceRefreshAt,
  onRefresh,
  onClose,
}: {
  open: boolean
  lastPrices: Record<string, number>
  lastPriceRefreshAt: number | null
  onRefresh: () => Promise<void>
  onClose: () => void
}) {
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    void onRefresh()
  }, [open, onRefresh])

  if (!open) return null

  const rows = Object.entries(lastPrices).sort(([a], [b]) =>
    a.localeCompare(b),
  )

  return (
    <div className={styles.backdrop} role="presentation" onClick={onClose}>
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="prices-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.head}>
          <div>
            <h2 id="prices-title" className={styles.title}>
              Prices
            </h2>
            <p className={styles.sub}>
              Last update (PT):{' '}
              {lastPriceRefreshAt != null
                ? formatPt(lastPriceRefreshAt)
                : '—'}
            </p>
          </div>
          <div className={styles.headActions}>
            <button
              type="button"
              className={styles.refresh}
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                try {
                  await onRefresh()
                } finally {
                  setBusy(false)
                }
              }}
            >
              {busy ? 'Refreshing…' : 'Refresh'}
            </button>
            <button type="button" className={styles.closeX} onClick={onClose}>
              Close
            </button>
          </div>
        </div>
        <div className={styles.scroll}>
          {rows.length === 0 ? (
            <p className={styles.empty}>
              No quotes yet. Tap Refresh.
            </p>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Symbol</th>
                  <th scope="col">Last</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(([sym, px]) => (
                  <tr key={sym}>
                    <td className={styles.sym}>{sym}</td>
                    <td className={styles.px}>
                      {px.toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
