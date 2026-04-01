import { useMemo } from 'react'
import type { DailyPlan, Position, TradePlan } from '../domain/types'
import {
  whyCannotApprove,
} from '../services/dailyPlanApproval'
import { planMaxRiskDollars, planNotionalAtEntry } from '../services/tradePlanMoney'
import { TradeCard } from './TradeCard'
import styles from './DailyPlanPanel.module.css'

function formatMoney(n: number) {
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
}

/** Position $ (notional / risk) — show cents so totals match shares × per-share math. */
function formatMoneyPrecise(n: number) {
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function formatPx(n: number) {
  return n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

const statusLabel: Record<DailyPlan['status'], string> = {
  draft: 'Draft',
  finalized: 'Finalized',
  active: 'Active',
  closed: 'Closed',
}

function hasOpenPositionForPlan(positions: Position[], planId: string) {
  return positions.some(
    (p) => p.tradePlanId === planId && p.status === 'open',
  )
}

export function DailyPlanPanel({
  dailyPlan,
  tradePlans,
  positions,
  onCreate,
  onFinalize,
  onEdit,
  onStart,
  onClose,
  onApprove,
  onReject,
  onUnapprove,
  onEditTradePlan,
  onTogglePlanAlert,
  onReconcile,
}: {
  dailyPlan: DailyPlan | null
  tradePlans: TradePlan[]
  positions: Position[]
  onCreate: () => void
  onFinalize: () => void
  onEdit: () => void
  onStart: () => void
  onClose: () => void
  onApprove: (id: string) => void
  onReject: (id: string) => void
  onUnapprove: (id: string) => void
  onEditTradePlan: (id: string) => void
  onTogglePlanAlert: (id: string) => void
  onReconcile: (id: string) => void
}) {
  const candidates = useMemo(
    () => tradePlans.filter((p) => p.status === 'watching'),
    [tradePlans],
  )

  const approvedList = useMemo(() => {
    if (!dailyPlan) return []
    const byId = new Map(tradePlans.map((p) => [p.id, p]))
    const out: TradePlan[] = []
    const seen = new Set<string>()

    // Primary list: whatever this daily plan explicitly tracks.
    for (const id of dailyPlan.approvedPlans) {
      const p = byId.get(id)
      if (!p) continue
      if (p.status !== 'approved' && p.status !== 'entered') continue
      if (seen.has(p.id)) continue
      out.push(p)
      seen.add(p.id)
    }

    // Visibility safety net: always show entered plans, even if missing from approvedPlans.
    for (const p of tradePlans) {
      if (p.status !== 'entered') continue
      if (seen.has(p.id)) continue
      out.push(p)
      seen.add(p.id)
    }

    return out
  }, [dailyPlan, tradePlans])

  const totalRisk = useMemo(
    () => approvedList.reduce((s, p) => s + planMaxRiskDollars(p), 0),
    [approvedList],
  )
  const slotsUsed = approvedList.length
  const openRiskExposure = useMemo(
    () =>
      Math.round(
        positions
          .filter((p) => p.status === 'open')
          .reduce((s, p) => s + p.initialRiskDollars, 0) * 100,
      ) / 100,
    [positions],
  )

  const riskLimitMsg = useMemo(() => {
    if (!dailyPlan || candidates.length === 0) return null
    const anyBlocked = candidates.some((c) => {
      const w = whyCannotApprove(dailyPlan, tradePlans, c)
      return w === 'risk_cap' || w === 'max_trades'
    })
    if (!anyBlocked) return null
    const riskHit = candidates.some(
      (c) => whyCannotApprove(dailyPlan, tradePlans, c) === 'risk_cap',
    )
    return riskHit
      ? 'Daily risk limit reached'
      : 'Max trades reached for this plan'
  }, [dailyPlan, tradePlans, candidates])

  const canCreate =
    !dailyPlan ||
    dailyPlan.status === 'closed' ||
    dailyPlan.status === 'draft'
  const canFinalize = dailyPlan?.status === 'draft'
  const canStart = dailyPlan?.status === 'finalized'
  const canCloseDay = dailyPlan?.status === 'active'
  const canEditDailyMeta = dailyPlan?.status === 'draft'

  const approvalsLocked = !dailyPlan || dailyPlan.status === 'closed'

  return (
    <section
      className={`${styles.wrap} ${dailyPlan ? styles[`wrap_${dailyPlan.status}`] : ''}`}
      aria-labelledby="daily-plan-title"
    >
      <div className={styles.head}>
        <h2 id="daily-plan-title" className={styles.title}>
          Daily plan
        </h2>
        {dailyPlan && (
          <span className={`${styles.badge} ${styles[`badge_${dailyPlan.status}`]}`}>
            {statusLabel[dailyPlan.status]}
          </span>
        )}
      </div>

      <div className={styles.toolbar}>
        <button
          type="button"
          className={styles.btnPrimary}
          disabled={!canCreate}
          onClick={onCreate}
          title={
            dailyPlan?.status === 'finalized' || dailyPlan?.status === 'active'
              ? 'Close the trading day before starting a new plan'
              : undefined
          }
        >
          Create daily plan
        </button>
        <button
          type="button"
          className={styles.btn}
          disabled={!canFinalize}
          onClick={onFinalize}
        >
          Finalize plan
        </button>
        <button
          type="button"
          className={styles.btn}
          disabled={!canEditDailyMeta}
          onClick={onEdit}
        >
          Edit plan
        </button>
        <button
          type="button"
          className={styles.btn}
          disabled={!canStart}
          onClick={onStart}
        >
          Start trading day
        </button>
        <button
          type="button"
          className={styles.btnDanger}
          disabled={!canCloseDay}
          onClick={onClose}
        >
          Close trading day
        </button>
      </div>

      {!dailyPlan && (
        <p className={styles.empty}>
          Create a daily plan to approve candidates and cap risk before
          execution.
        </p>
      )}

      {dailyPlan && (
        <>
          <div className={styles.summaryRow}>
            <div className={styles.pill}>
              <span className={styles.pillLabel}>Bias</span>
              <span className={styles.pillVal}>{dailyPlan.marketBias}</span>
            </div>
            <div className={styles.pill}>
              <span className={styles.pillLabel}>Regime</span>
              <span className={styles.pillVal}>{dailyPlan.regime}</span>
            </div>
            <div className={styles.pill}>
              <span className={styles.pillLabel}>Names</span>
              <span className={styles.pillTickers}>
                {dailyPlan.selectedTickers.length
                  ? dailyPlan.selectedTickers.join(', ')
                  : '—'}
              </span>
            </div>
            <div className={styles.pill}>
              <span className={styles.pillLabel}>Caps</span>
              <span className={styles.pillVal}>
                {dailyPlan.maxTrades} trades · {formatMoney(dailyPlan.maxDailyLoss)}{' '}
                loss
              </span>
            </div>
            <div className={styles.pill}>
              <span className={styles.pillLabel}>Committed risk</span>
              <span className={styles.pillVal}>
                {formatMoneyPrecise(totalRisk)}
              </span>
            </div>
            <div className={styles.pill}>
              <span className={styles.pillLabel}>Open risk</span>
              <span className={styles.pillVal}>
                {formatMoneyPrecise(openRiskExposure)}
              </span>
            </div>
            <div className={styles.pill}>
              <span className={styles.pillLabel}>Trades used</span>
              <span className={styles.pillVal}>
                {slotsUsed} / {dailyPlan.maxTrades}
              </span>
            </div>
          </div>

          {riskLimitMsg && (
            <p className={styles.limitWarn} role="status">
              {riskLimitMsg}
            </p>
          )}

          <div className={styles.block}>
            <h3 className={styles.blockTitle}>Candidates (prep)</h3>
            {candidates.length === 0 ? (
              <p className={styles.muted}>
                No watching setups — add plans from watchlist quotes or approve
                manual plans here.
              </p>
            ) : (
              <div className={styles.tableScroll}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Ticker</th>
                      <th>Setup</th>
                      <th>Entry/sh</th>
                      <th>Stop/sh</th>
                      <th>Target/sh</th>
                      <th>Notional</th>
                      <th>Risk</th>
                      <th>Shares</th>
                      <th>Score</th>
                      <th>Exp R</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {candidates.map((p) => {
                      const block = dailyPlan
                        ? whyCannotApprove(dailyPlan, tradePlans, p)
                        : ('closed' as const)
                      const canApprove =
                        !approvalsLocked && block === 'none'
                      const disabledReason =
                        block === 'quality'
                          ? 'Morning quality gate: score 75+ and expected R 2+'
                          : block === 'risk_cap' || block === 'max_trades'
                            ? 'Daily risk limit reached'
                            : block === 'closed'
                              ? 'Plan closed'
                              : undefined
                      return (
                        <tr key={p.id}>
                          <td className={styles.tk}>{p.ticker}</td>
                          <td>{p.setupType}</td>
                          <td>{formatPx(p.entry)}</td>
                          <td>{formatPx(p.stop)}</td>
                          <td>{formatPx(p.target)}</td>
                          <td>{formatMoneyPrecise(planNotionalAtEntry(p))}</td>
                          <td className={styles.riskCell}>
                            {formatMoneyPrecise(planMaxRiskDollars(p))}
                          </td>
                          <td>{p.positionSize}</td>
                          <td>{p.score?.toFixed(1) ?? '—'}</td>
                          <td>{p.expectedR?.toFixed(2) ?? '—'}</td>
                          <td className={styles.actCell}>
                            <button
                              type="button"
                              className={styles.approveBtn}
                              disabled={!canApprove}
                              title={!canApprove ? disabledReason : undefined}
                              onClick={() => onApprove(p.id)}
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              className={styles.rejectBtn}
                              disabled={approvalsLocked}
                              onClick={() => onReject(p.id)}
                            >
                              Reject
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {candidates.length > 0 && (
              <div className={styles.cardStack}>
                <h4 className={styles.cardStackTitle}>Plan cards</h4>
                {candidates.map((p) => (
                  <TradeCard
                    key={p.id}
                    trade={p}
                    onApprove={onApprove}
                    onReject={onReject}
                    onEdit={onEditTradePlan}
                    onToggleAlert={onTogglePlanAlert}
                    onReconcile={onReconcile}
                    planHasOpenPosition={hasOpenPositionForPlan(
                      positions,
                      p.id,
                    )}
                  />
                ))}
              </div>
            )}
          </div>

          <div className={styles.block}>
            <h3 className={styles.blockTitle}>Approved setups</h3>
            {approvedList.length === 0 ? (
              <p className={styles.muted}>
                Approve candidates above to commit risk and unlock execution.
              </p>
            ) : (
              <ul className={styles.approvedRows}>
                {approvedList.map((p) => {
                  const open = hasOpenPositionForPlan(positions, p.id)
                  return (
                    <li key={p.id} className={styles.approvedRow}>
                      <div className={styles.approvedMain}>
                        <span className={styles.tk}>{p.ticker}</span>
                        <span className={styles.setupTag}>{p.setupType}</span>
                        <span className={styles.riskTag}>
                          {formatMoneyPrecise(planMaxRiskDollars(p))}
                        </span>
                        {p.status === 'entered' && (
                          <span className={styles.enteredTag}>Entered</span>
                        )}
                      </div>
                      <div className={styles.approvedActions}>
                        <button
                          type="button"
                          className={styles.outcomeBtn}
                          disabled={p.status === 'entered' && open}
                          title={
                            p.status === 'entered' && open
                              ? 'Close the position in Active positions first'
                              : undefined
                          }
                          onClick={() => onReconcile(p.id)}
                        >
                          Record outcome
                        </button>
                        {p.status === 'approved' && !approvalsLocked && (
                          <button
                            type="button"
                            className={styles.removeBtn}
                            onClick={() => onUnapprove(p.id)}
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {dailyPlan.notes?.trim() && (
            <div className={styles.notesBlock}>
              <h3 className={styles.blockTitle}>Notes</h3>
              <p className={styles.notes}>{dailyPlan.notes}</p>
            </div>
          )}
        </>
      )}
    </section>
  )
}
