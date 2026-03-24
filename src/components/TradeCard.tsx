import { useCallback, useState, type KeyboardEvent } from 'react'
import type { TradePlan } from '../domain/types'
import {
  planMaxRiskDollars,
  planNotionalAtEntry,
  planRewardToTargetDollars,
  planRiskPerShare,
} from '../services/tradePlanMoney'
import styles from './TradeCard.module.css'

function formatUsd(n: number) {
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

const statusLabel: Record<TradePlan['status'], string> = {
  watching: 'WATCHING',
  approved: 'APPROVED',
  entered: 'ENTERED',
  rejected: 'REJECTED',
  closed: 'CLOSED',
}

export function TradeCard({
  trade,
  onApprove,
  onReject,
  onEnter,
  onEdit,
  onToggleAlert,
  onReconcile,
  planHasOpenPosition,
  hideApprovalActions,
}: {
  trade: TradePlan
  onApprove?: (id: string) => void
  onReject?: (id: string) => void
  onEnter?: (id: string) => void
  onEdit?: (id: string) => void
  onToggleAlert?: (id: string) => void
  onReconcile?: (id: string) => void
  /** True when an open position exists for this plan (blocks manual reconcile). */
  planHasOpenPosition?: boolean
  /** Hide Approve/Reject (controlled from Daily Plan). */
  hideApprovalActions?: boolean
}) {
  const [expanded, setExpanded] = useState(false)

  const toggleExpand = useCallback(() => {
    setExpanded((e) => !e)
  }, [])

  const onExpandKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        toggleExpand()
      }
    },
    [toggleExpand],
  )

  const actionable =
    trade.status === 'watching' || trade.status === 'approved'
  const alertsOn = trade.alertEnabled !== false
  const openPos = planHasOpenPosition === true
  const canReconcile =
    trade.status !== 'closed' && onReconcile != null && !(trade.status === 'entered' && openPos)

  const rps = planRiskPerShare(trade)
  const expR =
    trade.expectedR ??
    (rps > 0 ? (trade.target - trade.entry) / rps : trade.rMultiple)
  const maxRisk = planMaxRiskDollars(trade)
  const notional = planNotionalAtEntry(trade)
  const rewardToTarget = planRewardToTargetDollars(trade)

  return (
    <article className={styles.card} aria-expanded={expanded}>
      <div
        role="button"
        tabIndex={0}
        className={styles.mainHit}
        onClick={toggleExpand}
        onKeyDown={onExpandKeyDown}
        aria-label={`${trade.ticker} trade details, ${expanded ? 'expanded' : 'collapsed'}`}
      >
        <header className={styles.header}>
          <span className={styles.titleLine}>
            {trade.ticker} — {trade.setupType}
          </span>
          <span className={styles.biasHint}>{trade.bias} bias</span>
        </header>

        <dl className={styles.metrics}>
          <div className={styles.metric}>
            <dt>Entry / sh</dt>
            <dd>{formatUsd(trade.entry)}</dd>
          </div>
          <div className={styles.metric}>
            <dt>Stop / sh</dt>
            <dd>{formatUsd(trade.stop)}</dd>
          </div>
          <div className={styles.metric}>
            <dt>Target / sh</dt>
            <dd>{formatUsd(trade.target)}</dd>
          </div>
          <div className={styles.metric}>
            <dt>Notional</dt>
            <dd>{formatUsd(notional)}</dd>
          </div>
          <div className={styles.metric}>
            <dt>Risk (max)</dt>
            <dd>{formatUsd(maxRisk)}</dd>
          </div>
          <div className={styles.metric}>
            <dt>Shares</dt>
            <dd>{trade.positionSize}</dd>
          </div>
          <div className={styles.metric}>
            <dt>Score</dt>
            <dd>{trade.score != null ? trade.score.toFixed(0) : '—'}</dd>
          </div>
        </dl>

        <div className={styles.footer}>
          <span className={styles.rr}>
            R (plan) = <strong>{trade.rMultiple.toFixed(2)}</strong>
          </span>
          <span className={styles.rr}>
            Exp R = <strong>{expR.toFixed(2)}</strong>
          </span>
          {trade.positionSize > 0 && (
            <span className={styles.rr}>
              To target{' '}
              <strong>
                {rewardToTarget >= 0 ? '+' : ''}
                {formatUsd(rewardToTarget)}
              </strong>
            </span>
          )}
        </div>
      </div>

      {expanded && trade.notes && (
        <p className={styles.notes}>{trade.notes}</p>
      )}

      <div className={styles.actionRow}>
        <span className={`${styles.badge} ${styles[`badge_${trade.status}`]}`}>
          {statusLabel[trade.status]}
        </span>
        <div className={styles.buttons}>
          {!hideApprovalActions && (
            <>
              <button
                type="button"
                className={styles.primaryBtn}
                disabled={!actionable || trade.status !== 'watching'}
                onClick={(e) => {
                  e.stopPropagation()
                  onApprove?.(trade.id)
                }}
              >
                Approve
              </button>
              <button
                type="button"
                className={styles.secondaryBtn}
                disabled={!actionable}
                onClick={(e) => {
                  e.stopPropagation()
                  onReject?.(trade.id)
                }}
              >
                Reject
              </button>
            </>
          )}
          <button
            type="button"
            className={styles.secondaryBtn}
            disabled={!actionable}
            onClick={(e) => {
              e.stopPropagation()
              onEdit?.(trade.id)
            }}
          >
            Edit
          </button>
          <button
            type="button"
            className={styles.secondaryBtn}
            disabled={trade.status !== 'watching' && trade.status !== 'approved'}
            onClick={(e) => {
              e.stopPropagation()
              onToggleAlert?.(trade.id)
            }}
            title="Toggle price alerts for this plan"
          >
            Alert {alertsOn ? 'on' : 'off'}
          </button>
          <button
            type="button"
            className={styles.secondaryBtn}
            disabled={trade.status !== 'approved'}
            onClick={(e) => {
              e.stopPropagation()
              void onEnter?.(trade.id)
            }}
          >
            Mark entered
          </button>
          {onReconcile && (
            <button
              type="button"
              className={styles.secondaryBtn}
              disabled={!canReconcile}
              title={
                trade.status === 'entered' && openPos
                  ? 'Close the position in Active positions first'
                  : undefined
              }
              onClick={(e) => {
                e.stopPropagation()
                onReconcile(trade.id)
              }}
            >
              Record outcome
            </button>
          )}
        </div>
      </div>
    </article>
  )
}
