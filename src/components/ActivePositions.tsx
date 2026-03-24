import { useState } from 'react'
import type { Position } from '../domain/types'
import styles from './ActivePositions.module.css'

function formatMoney(n: number) {
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function positionDebugSnapshot(p: Position) {
  return {
    ticker: p.ticker,
    entryPrice: p.entryPrice,
    currentPrice: p.currentPrice,
    stopPrice: p.stopPrice,
    shares: p.shares,
    riskPerShare: p.initialRiskPerShare,
    initialRiskDollars: p.initialRiskDollars,
    unrealizedPnL: p.unrealizedPnL,
    unrealizedR: p.unrealizedR,
  }
}

export function ActivePositions({
  positions,
  onClose,
  onMoveStop,
  onTakePartial,
  onUpdateNotes,
}: {
  positions: Position[]
  onClose: (
    id: string,
    exit: number,
    followedRules: boolean,
    notes?: string,
  ) => Promise<void>
  onMoveStop?: (positionId: string, stop: number) => void
  onTakePartial?: (positionId: string) => void
  onUpdateNotes?: (positionId: string, notes: string) => void
}) {
  const open = positions.filter((p) => p.status === 'open')
  const [closingId, setClosingId] = useState<string | null>(null)
  const [exitPx, setExitPx] = useState('')
  const [followed, setFollowed] = useState(true)
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)

  if (open.length === 0) {
    return (
      <section className={styles.wrap} aria-labelledby="positions-title">
        <h2 id="positions-title" className={styles.title}>
          Positions
        </h2>
        <p className={styles.empty}>
          No open positions. Approve a plan, then mark entered after you fill at
          the broker.
        </p>
      </section>
    )
  }

  const active = closingId ? open.find((p) => p.id === closingId) : null

  return (
    <section className={styles.wrap} aria-labelledby="positions-title">
      <h2 id="positions-title" className={styles.title}>
        Positions
      </h2>
      <div className={styles.tableScroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Ticker</th>
              <th>Entry</th>
              <th>Last</th>
              <th>P/L</th>
              <th>R</th>
              <th>Stop</th>
              <th>Target</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {open.map((p) => {
              const pl = p.unrealizedPnL
              const ur = p.unrealizedR
              return (
                <tr key={p.id}>
                  <td className={styles.tk}>
                    {p.ticker}
                    {p.quoteIsSimulated && (
                      <span className={styles.simBadge} title="Quote from mock provider">
                        {' '}
                        sim
                      </span>
                    )}
                  </td>
                  <td>{formatMoney(p.entryPrice)}</td>
                  <td>{formatMoney(p.currentPrice)}</td>
                  <td className={pl >= 0 ? styles.pos : styles.neg}>
                    {formatMoney(pl)}
                  </td>
                  <td
                    className={
                      ur == null ? styles.meta : ur >= 0 ? styles.pos : styles.neg
                    }
                    title="Unrealized R vs initial risk at entry"
                  >
                    {ur == null ? '—' : ur.toFixed(2)}
                  </td>
                  <td>{formatMoney(p.stopPrice)}</td>
                  <td>{formatMoney(p.targetPrice)}</td>
                  <td className={styles.actionsCell}>
                    <div className={styles.actionBtns}>
                      <details className={styles.debugInline}>
                        <summary className={styles.debugSum}>Debug</summary>
                        <pre className={styles.debugPre}>
                          {JSON.stringify(positionDebugSnapshot(p), null, 2)}
                        </pre>
                      </details>
                      <button
                        type="button"
                        className={styles.miniBtn}
                        onClick={() => {
                          const raw = window.prompt(
                            `New stop for ${p.ticker}`,
                            p.stopPrice.toFixed(4),
                          )
                          if (raw == null) return
                          const n = Number(raw)
                          if (!Number.isFinite(n)) return
                          onMoveStop?.(p.id, n)
                        }}
                      >
                        Move stop
                      </button>
                      <button
                        type="button"
                        className={styles.miniBtn}
                        onClick={() => onTakePartial?.(p.id)}
                      >
                        Partial
                      </button>
                      <button
                        type="button"
                        className={styles.miniBtn}
                        onClick={() => {
                          const raw = window.prompt(
                            'Position notes',
                            p.notes ?? '',
                          )
                          if (raw == null) return
                          onUpdateNotes?.(p.id, raw)
                        }}
                      >
                        Note
                      </button>
                      <button
                        type="button"
                        className={styles.closeBtn}
                        onClick={() => {
                          setClosingId(p.id)
                          setExitPx(p.currentPrice.toFixed(2))
                          setFollowed(true)
                          setNotes('')
                        }}
                      >
                        Close
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {active && (
        <div
          className={styles.modalBackdrop}
          role="presentation"
          onClick={() => !busy && setClosingId(null)}
        >
          <div
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="close-dialog-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="close-dialog-title" className={styles.modalTitle}>
              Close {active.ticker}
            </h3>
            <label className={styles.field}>
              Exit price
              <input
                type="number"
                step="0.01"
                value={exitPx}
                onChange={(e) => setExitPx(e.target.value)}
                className={styles.input}
              />
            </label>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={followed}
                onChange={(e) => setFollowed(e.target.checked)}
              />
              Followed rules
            </label>
            <label className={styles.field}>
              Notes
              <textarea
                className={styles.textarea}
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.cancel}
                disabled={busy}
                onClick={() => setClosingId(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.submit}
                disabled={busy || !exitPx}
                onClick={async () => {
                  const x = Number(exitPx)
                  if (!Number.isFinite(x)) return
                  setBusy(true)
                  try {
                    await onClose(active.id, x, followed, notes.trim() || undefined)
                    setClosingId(null)
                  } finally {
                    setBusy(false)
                  }
                }}
              >
                Log & close
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
