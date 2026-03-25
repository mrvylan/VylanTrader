import { useEffect, useMemo, useState } from 'react'
import type { TradePlan, TradePlanEditPatch } from '../domain/types'
import {
  baseRiskInputFromEffective,
  computeManualPlanInputsFromStop,
  defaultProfitRFromExpected,
  type ManualPlanProfitR,
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
  const [stop, setStop] = useState('')
  const [riskDollars, setRiskDollars] = useState('')
  const [profitR, setProfitR] = useState<ManualPlanProfitR>(3)
  const [comments, setComments] = useState('')

  useEffect(() => {
    if (!plan || !open) return
    setEntry(plan.entry.toFixed(4))
    setStop(plan.stop.toFixed(4))
    const maxRisk = planMaxRiskDollars(plan)
    const effective =
      maxRisk > 0
        ? maxRisk
        : plan.riskPerShare > 0 && plan.positionSize > 0
          ? plan.riskPerShare * plan.positionSize
          : 0
    setRiskDollars(
      effective > 0 ? baseRiskInputFromEffective(effective, 3) : '',
    )
    setProfitR(defaultProfitRFromExpected(plan.expectedR))
    setComments(plan.notes ?? '')
  }, [plan, open])

  const computed = useMemo(
    () =>
      computeManualPlanInputsFromStop({
        entry,
        stop,
        riskDollars,
        profitR,
      }),
    [entry, stop, riskDollars, profitR],
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
          Long · {plan.setupType}. Shares = floor(risk ÷ (entry − stop)); target
          = entry + {profitR} × (entry − stop). Stop must be below entry.
        </p>
        {plan.bias === 'bearish' && canEdit && (
          <p className={styles.warn}>
            Plan bias is short; this form sizes a long (stop below entry). Adjust
            prices or use a new plan.
          </p>
        )}
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
            Planned trade price; stop distance sets risk per share.
          </span>
        </label>

        <div className={styles.sectionLabel}>2 · Stop</div>
        <label className={styles.field}>
          Stop price
          <input
            className={styles.input}
            type="number"
            step="any"
            value={stop}
            disabled={!canEdit}
            onChange={(e) => setStop(e.target.value)}
          />
          <span className={styles.hint}>
            Must be below entry. Risk per share = entry − stop.
          </span>
        </label>

        <div className={styles.sectionLabel}>3 · Risk ($)</div>
        <label className={styles.field}>
          Dollars willing to risk
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
            Commas allowed. Shares use risk ÷ (entry − stop), floored to whole
            shares.
          </span>
        </label>

        <div className={styles.sharesCallout} aria-live="polite">
          <div className={styles.sharesCalloutLabel}>Shares to purchase</div>
          {computed.ok ? (
            <>
              <p className={styles.sharesCalloutValue}>
                {computed.positionSize}
              </p>
              <p className={styles.sharesCalloutFormula}>
                floor( {formatUsd(computed.riskBudgetDollars)} ÷{' '}
                {formatUsd(computed.rps)} ) = <strong>{computed.positionSize}</strong>{' '}
                shares — risk ÷ (entry − stop)
              </p>
            </>
          ) : (
            <p className={styles.sharesCalloutPending}>
              Enter entry, stop below entry, and risk $ to see share count.
            </p>
          )}
        </div>

        <div className={styles.sectionLabel}>4 · Profit target (R-multiple)</div>
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
            <option value={3}>
              3R — target = entry + 3 × (entry − stop)
            </option>
            <option value={5}>5R</option>
            <option value={10}>10R</option>
          </select>
          <span className={styles.hint}>
            One R = entry − stop per share. Reward distance = {profitR}× that.
          </span>
        </label>

        <div className={styles.sectionLabel}>5 · Notes</div>
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
                <strong>Risk / share</strong>: {formatUsd(computed.rps)} (entry
                − stop)
              </li>
              <li>
                <strong>Stop</strong>: {formatUsd(computed.stop)} (
                {formatUsd(computed.maxRisk)} max loss at stop)
              </li>
              <li>
                <strong>Target</strong>: {formatUsd(computed.target)} (
                {formatUsd(
                  computed.rewardPerShare * computed.positionSize,
                )}{' '}
                gross to target, {computed.expectedR.toFixed(2)}R)
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
              onSave(plan.id, {
                entry: Number(entry),
                stop: computed.stop,
                target: computed.target,
                notes: comments.trim() || undefined,
                positionSize: computed.positionSize,
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
