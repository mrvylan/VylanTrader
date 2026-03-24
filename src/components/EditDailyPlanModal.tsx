import { useEffect, useState } from 'react'
import type { DailyPlan } from '../domain/types'
import styles from './EditDailyPlanModal.module.css'

export function EditDailyPlanModal({
  plan,
  open,
  onClose,
  onSave,
}: {
  plan: DailyPlan | null
  open: boolean
  onClose: () => void
  onSave: (
    id: string,
    patch: {
      selectedTickers: string[]
      maxTrades: number
      maxDailyLoss: number
      notes?: string
    },
  ) => void
}) {
  const [tickersCsv, setTickersCsv] = useState('')
  const [maxTrades, setMaxTrades] = useState('')
  const [maxDailyLoss, setMaxDailyLoss] = useState('')
  const [notes, setNotes] = useState('')

  const lockTickers = plan?.status !== 'draft'

  useEffect(() => {
    if (!plan || !open) return
    setTickersCsv(plan.selectedTickers.join(', '))
    setMaxTrades(String(plan.maxTrades))
    setMaxDailyLoss(String(plan.maxDailyLoss))
    setNotes(plan.notes ?? '')
  }, [plan, open])

  if (!open || !plan) return null

  return (
    <div className={styles.backdrop} role="presentation" onClick={onClose}>
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-daily-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="edit-daily-title" className={styles.title}>
          Edit daily plan
        </h2>
        {lockTickers && (
          <p className={styles.hint}>
            Trading day is active — tickers are locked; adjust limits or notes.
          </p>
        )}
        <label className={styles.field}>
          Selected tickers (comma-separated)
          <input
            className={styles.input}
            value={tickersCsv}
            disabled={lockTickers}
            onChange={(e) => setTickersCsv(e.target.value)}
          />
        </label>
        <label className={styles.field}>
          Max trades today
          <input
            className={styles.input}
            type="number"
            min={1}
            value={maxTrades}
            onChange={(e) => setMaxTrades(e.target.value)}
          />
        </label>
        <label className={styles.field}>
          Max daily loss ($)
          <input
            className={styles.input}
            type="number"
            min={1}
            value={maxDailyLoss}
            onChange={(e) => setMaxDailyLoss(e.target.value)}
          />
        </label>
        <label className={styles.field}>
          Notes
          <textarea
            className={styles.textarea}
            rows={4}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
        <div className={styles.actions}>
          <button type="button" className={styles.cancel} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={styles.save}
            onClick={() => {
              const mt = Number(maxTrades)
              const md = Number(maxDailyLoss)
              if (!Number.isFinite(mt) || mt < 1) return
              if (!Number.isFinite(md) || md < 1) return
              const tickers = lockTickers
                ? plan.selectedTickers
                : tickersCsv
                    .split(/[,;\s]+/)
                    .map((t) => t.trim().toUpperCase())
                    .filter(Boolean)
                    .slice(0, 10)
              onSave(plan.id, {
                selectedTickers: tickers,
                maxTrades: mt,
                maxDailyLoss: md,
                notes: notes.trim() || undefined,
              })
              onClose()
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
