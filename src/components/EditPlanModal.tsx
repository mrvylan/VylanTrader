import { useEffect, useMemo, useState } from 'react'
import type { TradePlan, TradePlanEditPatch } from '../domain/types'
import {
  baseRiskInputFromEffective,
  computeManualPlanInputs,
  defaultProfitRFromExpected,
  type ManualPlanProfitR,
  type ManualPlanRiskMultiplier,
} from '../services/manualPlanInputs'
import { planMaxRiskDollars } from '../services/tradePlanMoney'
import styles from './EditPlanModal.module.css'

function formatUsd(n: number) {
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function EditPlanModal({
  plan,
  open,
  onClose,
  onSave,
}: {
  plan: TradePlan | null
  open: boolean
  onClose: () => void
  onSave: (id: string, patch: TradePlanEditPatch) => void
}) {
  const [entry, setEntry] = useState('')
  const [shares, setShares] = useState('')
  const [riskDollars, setRiskDollars] = useState('')
  const [riskMultiplier, setRiskMultiplier] =
    useState<ManualPlanRiskMultiplier>(3)
  const [profitR, setProfitR] = useState<ManualPlanProfitR>(3)
  const [comments, setComments] = useState('')

  useEffect(() => {
    if (!plan || !open) return
    setEntry(plan.entry.toFixed(4))
    setShares(String(Math.max(1, plan.positionSize)))
    const maxRisk = planMaxRiskDollars(plan)
    const base =
      maxRisk > 0
        ? maxRisk
        : plan.riskPerShare > 0 && plan.positionSize > 0
          ? plan.riskPerShare * plan.positionSize
          : 0
    const mult: ManualPlanRiskMultiplier = 3
    setRiskMultiplier(mult)
    setRiskDollars(
      base > 0 ? baseRiskInputFromEffective(base, mult) : '',
    )
    setProfitR(defaultProfitRFromExpected(plan.expectedR))
    setComments(plan.notes ?? '')
  }, [plan, open])

  const isShort = plan?.bias === 'bearish'

  const computed = useMemo(
    () =>
      computeManualPlanInputs({
        entry,
        shares,
        riskDollars,
        riskMultiplier,
        profitR,
        isShort: Boolean(isShort),
      }),
    [entry, shares, riskDollars, riskMultiplier, profitR, isShort],
  )

  if (!open || !plan) return null

  const canEdit =
    plan.status === 'watching' || plan.status === 'approved'

  return (
    <div className={styles.backdrop} role="presentation" onClick={onClose}>
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-plan-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="edit-plan-title" className={styles.title}>
          Plan inputs · {plan.ticker}
        </h2>
        <p className={styles.subtitle}>
          {isShort ? 'Short' : 'Long'} · {plan.setupType}. Base risk ×{' '}
          {riskMultiplier}x → effective $ ÷ shares → stop; target = entry ± (
          {profitR} × stop distance).
        </p>
        {!canEdit && (
          <p className={styles.warn}>
            Only watching or approved plans can be edited.
          </p>
        )}

        <div className={styles.sectionLabel}>1 · Entry</div>
        <label className={styles.field}>
          Entry price
          <input
            className={styles.input}
            type="number"
            step="any"
            value={entry}
            disabled={!canEdit}
            onChange={(e) => setEntry(e.target.value)}
          />
          <span className={styles.hint}>
            Planned trade price; stop and target are measured from here.
          </span>
        </label>

        <div className={styles.sectionLabel}>2 · Size</div>
        <label className={styles.field}>
          Number of shares
          <input
            className={styles.input}
            type="number"
            min={1}
            step={1}
            value={shares}
            disabled={!canEdit}
            onChange={(e) => setShares(e.target.value)}
          />
          <span className={styles.hint}>
            Used with base risk and multiplier below for effective $ at the stop.
          </span>
        </label>

        <div className={styles.sectionLabel}>3 · Base risk ($)</div>
        <label className={styles.field}>
          Base risk ($)
          <input
            className={styles.input}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={riskDollars}
            disabled={!canEdit}
            onChange={(e) => setRiskDollars(e.target.value)}
            placeholder="e.g. 40 or 1,250.50"
          />
          <span className={styles.hint}>
            Multiplied below; effective dollars at the stop ÷ shares → stop
            distance. Commas allowed.
          </span>
        </label>

        <div className={styles.sectionLabel}>4 · Risk multiplier</div>
        <label className={styles.field}>
          Scale base risk
          <select
            className={styles.select}
            value={riskMultiplier}
            disabled={!canEdit}
            onChange={(e) =>
              setRiskMultiplier(
                Number(e.target.value) as ManualPlanRiskMultiplier,
              )
            }
          >
            <option value={3}>3× — effective = base × 3</option>
            <option value={5}>5× — effective = base × 5</option>
            <option value={10}>10× — effective = base × 10</option>
          </select>
          <span className={styles.hint}>
            Effective risk at stop = base × {riskMultiplier}. Summary uses the
            effective amount.
          </span>
        </label>

        <div className={styles.sectionLabel}>5 · Profit target (R-multiple)</div>
        <label className={styles.field}>
          Target vs risk
          <select
            className={styles.select}
            value={profitR}
            disabled={!canEdit}
            onChange={(e) =>
              setProfitR(Number(e.target.value) as ManualPlanProfitR)
            }
          >
            <option value={3}>3R — target = entry {isShort ? '−' : '+'} 3 × (stop distance)</option>
            <option value={5}>5R</option>
            <option value={10}>10R</option>
          </select>
          <span className={styles.hint}>
            One R = |entry − stop| per share. Reward distance = {profitR}× that.
          </span>
        </label>

        <div className={styles.sectionLabel}>6 · Notes</div>
        <label className={styles.field}>
          Comments
          <textarea
            className={styles.textarea}
            rows={3}
            value={comments}
            disabled={!canEdit}
            onChange={(e) => setComments(e.target.value)}
          />
        </label>

        <div className={styles.summary} aria-live="polite">
          <div className={styles.summaryTitle}>Summary</div>
          {computed.ok ? (
            <ul className={styles.summaryList}>
              <li>
                <strong>Base risk</strong>: {formatUsd(computed.baseRiskDollars)}{' '}
                × {computed.riskMultiplier}× →{' '}
                <strong>effective</strong>{' '}
                {formatUsd(computed.effectiveRiskDollars)} at stop
              </li>
              <li>
                <strong>Risk / share</strong>: {formatUsd(computed.rps)} ←
                effective ÷ shares
              </li>
              <li>
                <strong>Stop</strong>: {formatUsd(computed.stop)} (
                {formatUsd(computed.maxRisk)} max loss at stop)
              </li>
              <li>
                <strong>Target</strong>: {formatUsd(computed.target)} (
                {formatUsd(
                  computed.rewardPerShare * Math.floor(Number(shares) || 0),
                )}{' '}
                gross to
                target, {computed.expectedR.toFixed(2)}R)
              </li>
              <li>
                <strong>Notional</strong> @ entry:{' '}
                {formatUsd(computed.notional)}
              </li>
            </ul>
          ) : (
            <p className={styles.summaryError}>{computed.error}</p>
          )}
        </div>

        <div className={styles.actions}>
          <button type="button" className={styles.cancel} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={styles.save}
            disabled={!canEdit || !computed.ok}
            onClick={() => {
              if (!computed.ok) return
              const sh = Math.floor(Number(shares))
              onSave(plan.id, {
                entry: Number(entry),
                stop: computed.stop,
                target: computed.target,
                notes: comments.trim() || undefined,
                positionSize: sh,
              })
              onClose()
            }}
          >
            Save plan
          </button>
        </div>
      </div>
    </div>
  )
}
