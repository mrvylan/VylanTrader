import { useEffect, useMemo, useState } from 'react'
import type { MarketTrend, TradePlan, TradePlanEditPatch } from '../domain/types'
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

export function ManualQuotePlanModal({
  open,
  mode,
  ticker,
  plan,
  quoteLast,
  riskPerTrade,
  marketTrend: _marketTrend,
  onClose,
  onCreate,
  onSaveEdit,
}: {
  open: boolean
  mode: 'create' | 'edit'
  ticker: string
  plan: TradePlan | null
  quoteLast: number | null
  riskPerTrade: number
  marketTrend: MarketTrend
  onClose: () => void
  onCreate: (
    patch: TradePlanEditPatch,
    bias: MarketTrend,
  ) => void
  onSaveEdit: (id: string, patch: TradePlanEditPatch) => void
}) {
  void _marketTrend

  const [entry, setEntry] = useState('')
  const [stop, setStop] = useState('')
  const [riskDollars, setRiskDollars] = useState('')
  const [profitR, setProfitR] = useState<ManualPlanProfitR>(3)
  const [comments, setComments] = useState('')

  useEffect(() => {
    if (!open) return
    if (mode === 'create') {
      const hint =
        quoteLast != null && Number.isFinite(quoteLast) ? quoteLast : null
      setEntry(hint != null ? String(hint) : '')
      setStop('')
      setProfitR(3)
      setComments('')
      setRiskDollars(
        riskPerTrade > 0 ? baseRiskInputFromEffective(riskPerTrade, 3) : '',
      )
      return
    }
    if (!plan) return
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
  }, [open, mode, plan, quoteLast, riskPerTrade])

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

  if (!open) return null
  if (mode === 'edit' && !plan) return null

  const sym = ticker.toUpperCase()
  const canSubmit =
    mode === 'create' ||
    (plan != null &&
      (plan.status === 'watching' || plan.status === 'approved'))

  const title =
    mode === 'create' ? `New plan · ${sym}` : `Edit plan · ${sym}`
  const setupLabel = mode === 'create' ? 'Manual · quotes' : plan!.setupType

  return (
    <div className={styles.backdrop} role="presentation" onClick={onClose}>
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="manual-quote-plan-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="manual-quote-plan-title" className={styles.title}>
          {title}
        </h2>
        <p className={styles.subtitle}>
          Long · {setupLabel}. Shares = floor(risk ÷ (entry − stop)); target =
          entry + {profitR} × (entry − stop). Stop below entry.
        </p>
        {mode === 'edit' && !canSubmit && (
          <p className={styles.warn}>
            Only watching or approved plans can be edited.
          </p>
        )}
        {mode === 'edit' && plan?.bias === 'bearish' && canSubmit && (
          <p className={styles.warn}>
            Plan bias is short; this form sizes a long (stop below entry).
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
            disabled={!canSubmit}
            onChange={(e) => setEntry(e.target.value)}
          />
          <span className={styles.hint}>
            Planned trade price; shares use entry − stop in the denominator.
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
            disabled={!canSubmit}
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
            disabled={!canSubmit}
            onChange={(e) => setRiskDollars(e.target.value)}
            placeholder="e.g. 40 or 1,250.50"
          />
          <span className={styles.hint}>
            Commas ok. Shares = floor(risk ÷ (entry − stop)).
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
            disabled={!canSubmit}
            onChange={(e) =>
              setProfitR(Number(e.target.value) as ManualPlanProfitR)
            }
          >
            <option value={3}>3R — target = entry + 3 × (entry − stop)</option>
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
            disabled={!canSubmit}
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
            disabled={!canSubmit || !computed.ok}
            onClick={() => {
              if (!computed.ok) return
              const patch: TradePlanEditPatch = {
                entry: Number(entry),
                stop: computed.stop,
                target: computed.target,
                notes: comments.trim() || undefined,
                positionSize: computed.positionSize,
              }
              if (mode === 'create') {
                onCreate(patch, 'bullish')
              } else if (plan) {
                onSaveEdit(plan.id, patch)
              }
              onClose()
            }}
          >
            {mode === 'create' ? 'Create plan' : 'Save plan'}
          </button>
        </div>
      </div>
    </div>
  )
}
