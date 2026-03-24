import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type {
  PlanHistoryResult,
  PlanReconcilePayload,
  TradePlan,
} from '../domain/types'
import styles from './ReconcilePlanModal.module.css'

const RESULT_OPTIONS: { value: PlanHistoryResult; label: string }[] = [
  { value: 'win', label: 'Win (took profit / target)' },
  { value: 'loss', label: 'Loss (stopped or scratch loss)' },
  { value: 'breakeven', label: 'Breakeven' },
  { value: 'no_trade', label: 'No trade (never triggered)' },
  { value: 'skipped', label: 'Skipped (passed / no fill)' },
]

function parseOptionalNumber(raw: string): number | undefined {
  const t = raw.trim()
  if (t === '') return undefined
  const n = Number(t)
  return Number.isFinite(n) ? n : undefined
}

export function ReconcilePlanModal({
  plan,
  open,
  onClose,
  onConfirm,
}: {
  plan: TradePlan | null
  open: boolean
  onClose: () => void
  onConfirm: (planId: string, payload: PlanReconcilePayload) => void
}) {
  const [result, setResult] = useState<PlanHistoryResult>('no_trade')
  const [exitPrice, setExitPrice] = useState('')
  const [pnlOverride, setPnlOverride] = useState('')
  const [rOverride, setROverride] = useState('')
  const [notes, setNotes] = useState('')
  const [followedRules, setFollowedRules] = useState(true)

  useEffect(() => {
    if (!plan || !open) return
    setResult('no_trade')
    setExitPrice('')
    setPnlOverride('')
    setROverride('')
    setNotes('')
    setFollowedRules(true)
  }, [open, plan?.id])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const preview = useMemo(() => {
    if (!plan) return null
    const ex = parseOptionalNumber(exitPrice)
    const pnlManual = parseOptionalNumber(pnlOverride)
    const rManual = parseOptionalNumber(rOverride)
    if (ex == null) {
      if (pnlManual != null || rManual != null) {
        return { pnl: pnlManual, r: rManual, fromExit: false }
      }
      return null
    }
    const shares = plan.positionSize
    const isShort = plan.bias === 'bearish'
    const rawPnl = isShort
      ? (plan.entry - ex) * shares
      : (ex - plan.entry) * shares
    const pnl =
      pnlManual != null ? pnlManual : Math.round(rawPnl * 100) / 100
    let r = rManual
    if (r == null && plan.riskAmount > 0) {
      r = Math.round((pnl / plan.riskAmount) * 100) / 100
    }
    return { pnl, r, fromExit: true }
  }, [plan, exitPrice, pnlOverride, rOverride])

  const submit = () => {
    if (!plan) return
    const payload: PlanReconcilePayload = {
      result,
      followedRules,
      notes: notes.trim() || undefined,
      exitPrice: parseOptionalNumber(exitPrice),
      pnlDollars: parseOptionalNumber(pnlOverride),
      rMultiple: parseOptionalNumber(rOverride),
    }
    onConfirm(plan.id, payload)
    onClose()
  }

  if (!open || !plan || typeof document === 'undefined') return null

  return createPortal(
    <div className={styles.backdrop} role="presentation" onClick={onClose}>
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="reconcile-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="reconcile-title" className={styles.title}>
          Record outcome · {plan.ticker}
        </h2>
        <p className={styles.subtitle}>
          {plan.setupType} · was <strong>{plan.status}</strong>. Plan closes
          after you confirm; this row is added to Plan history (not the
          execution journal unless you closed a position there).
        </p>

        <label className={styles.field}>
          Result
          <select
            className={styles.select}
            value={result}
            onChange={(e) =>
              setResult(e.target.value as PlanHistoryResult)
            }
          >
            {RESULT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.field}>
          Exit price (optional)
          <input
            className={styles.input}
            type="text"
            inputMode="decimal"
            value={exitPrice}
            onChange={(e) => setExitPrice(e.target.value)}
            placeholder="e.g. 102.50"
          />
          <p className={styles.hint}>
            If set, P&amp;L and R are derived from plan entry × shares (override
            below if needed).
          </p>
        </label>

        <label className={styles.field}>
          P&amp;L $ (optional override)
          <input
            className={styles.input}
            type="text"
            inputMode="decimal"
            value={pnlOverride}
            onChange={(e) => setPnlOverride(e.target.value)}
          />
        </label>

        <label className={styles.field}>
          R multiple (optional override)
          <input
            className={styles.input}
            type="text"
            inputMode="decimal"
            value={rOverride}
            onChange={(e) => setROverride(e.target.value)}
          />
        </label>

        {preview && (
          <p className={styles.preview}>
            Stored preview: P&amp;L{' '}
            {preview.pnl != null && Number.isFinite(preview.pnl)
              ? `$${preview.pnl.toFixed(2)}`
              : '—'}{' '}
            · R {preview.r != null && Number.isFinite(preview.r) ? preview.r.toFixed(2) : '—'}
          </p>
        )}

        <label className={styles.field}>
          Notes
          <textarea
            className={styles.textarea}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional context"
          />
        </label>

        <label className={styles.checkRow}>
          <input
            type="checkbox"
            checked={followedRules}
            onChange={(e) => setFollowedRules(e.target.checked)}
          />
          Followed plan / risk rules
        </label>

        <div className={styles.actions}>
          <button type="button" className={styles.cancel} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={styles.submit} onClick={submit}>
            Confirm &amp; close plan
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
