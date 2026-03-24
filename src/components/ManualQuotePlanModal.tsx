import { useEffect, useMemo, useState } from 'react'
import type { MarketTrend, TradePlan, TradePlanEditPatch } from '../domain/types'
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

export function ManualQuotePlanModal({
  open,
  mode,
  ticker,
  plan,
  quoteLast,
  riskPerTrade,
  marketTrend,
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
  const [entry, setEntry] = useState('')
  const [shares, setShares] = useState('')
  const [riskDollars, setRiskDollars] = useState('')
  const [riskMultiplier, setRiskMultiplier] =
    useState<ManualPlanRiskMultiplier>(3)
  const [profitR, setProfitR] = useState<ManualPlanProfitR>(3)
  const [comments, setComments] = useState('')
  /** Long = bullish bias, short = bearish */
  const [direction, setDirection] = useState<'long' | 'short'>('long')

  useEffect(() => {
    if (!open) return
    if (mode === 'create') {
      const hint =
        quoteLast != null && Number.isFinite(quoteLast) ? quoteLast : null
      setEntry(hint != null ? String(hint) : '')
      setShares('1')
      const mult: ManualPlanRiskMultiplier = 3
      setRiskMultiplier(mult)
      setRiskDollars(
        riskPerTrade > 0
          ? baseRiskInputFromEffective(riskPerTrade, mult)
          : '',
      )
      setProfitR(3)
      setComments('')
      setDirection(marketTrend === 'bearish' ? 'short' : 'long')
      return
    }
    if (!plan) return
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
  }, [open, mode, plan, quoteLast, riskPerTrade, marketTrend])

  const isShort =
    mode === 'create' ? direction === 'short' : plan?.bias === 'bearish'

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
          {isShort ? 'Short' : 'Long'} · {setupLabel}. Base risk × {riskMultiplier}
          × → effective ÷ shares → stop; target = entry {isShort ? '−' : '+'}{' '}
          ({profitR} × stop distance).
        </p>
        {mode === 'edit' && !canSubmit && (
          <p className={styles.warn}>
            Only watching or approved plans can be edited.
          </p>
        )}

        {mode === 'create' && (
          <>
            <div className={styles.sectionLabel}>0 · Direction</div>
            <fieldset className={styles.fieldset} disabled={!canSubmit}>
              <legend className={styles.legend}>Side</legend>
              <label className={styles.radioRow}>
                <input
                  type="radio"
                  name="dir"
                  checked={direction === 'long'}
                  onChange={() => setDirection('long')}
                />
                Long
              </label>
              <label className={styles.radioRow}>
                <input
                  type="radio"
                  name="dir"
                  checked={direction === 'short'}
                  onChange={() => setDirection('short')}
                />
                Short
              </label>
            </fieldset>
          </>
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
            disabled={!canSubmit}
            onChange={(e) => setShares(e.target.value)}
          />
          <span className={styles.hint}>
            Used with base risk and multiplier for effective $ at the stop.
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
            disabled={!canSubmit}
            onChange={(e) => setRiskDollars(e.target.value)}
            placeholder="e.g. 40 or 1,250.50"
          />
          <span className={styles.hint}>
            Multiplied next; effective dollars at stop ÷ shares → stop distance.
            Commas ok.
          </span>
        </label>

        <div className={styles.sectionLabel}>4 · Risk multiplier</div>
        <label className={styles.field}>
          Scale base risk
          <select
            className={styles.select}
            value={riskMultiplier}
            disabled={!canSubmit}
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
            disabled={!canSubmit}
            onChange={(e) =>
              setProfitR(Number(e.target.value) as ManualPlanProfitR)
            }
          >
            <option value={3}>
              3R — target = entry {isShort ? '−' : '+'} 3 × (stop distance)
            </option>
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
            disabled={!canSubmit}
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
              const sh = Math.floor(Number(shares))
              const patch: TradePlanEditPatch = {
                entry: Number(entry),
                stop: computed.stop,
                target: computed.target,
                notes: comments.trim() || undefined,
                positionSize: sh,
              }
              if (mode === 'create') {
                const bias: MarketTrend = direction === 'short' ? 'bearish' : 'bullish'
                onCreate(patch, bias)
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
