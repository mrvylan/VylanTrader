import { useMemo } from 'react'
import type {
  DailyPlan,
  PlanRejectionDetail,
  ScanRejectionReason,
  TradePlan,
  WatchlistScanDetail,
} from '../domain/types'
import { approvalBlockingScanReasons } from '../services/dailyPlanApproval'
import {
  buildRejectionSuggestions,
  explainScanRejectionReasons,
  headlineForRejection,
} from '../services/rejectionNarrative'
import { strategyKindLabel } from '../services/strategyLabels'
import { MIN_EXPECTED_R, MIN_MORNING_SCORE } from '../services/strategyScore'
import { interpretTradeSetupScore } from '../services/setupScoring'
import type { XFeedResponse } from '../services/xFeed'
import { aggregateForTicker, tickerPostsFromFeed } from '../services/xFeedFilters'
import styles from './WatchlistSetupDrawer.module.css'

function formatXCtxTime(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function DrawerXFeedContext({
  ticker,
  xFeedData,
  loadEnabled = true,
}: {
  ticker: string
  xFeedData: XFeedResponse | null | undefined
  loadEnabled?: boolean
}) {
  if (!loadEnabled) {
    return (
      <section className={styles.xContext} aria-label="X context">
        <h3 className={styles.xContextTitle}>X context (curated)</h3>
        <p className={styles.xContextMuted}>
          X post loading is off on the desk — enable &quot;Load X posts&quot;
          above the feed to fetch mentions (saves API usage in dev).
        </p>
      </section>
    )
  }
  if (!xFeedData?.items?.length || xFeedData.error) {
    return (
      <section className={styles.xContext} aria-label="X context">
        <h3 className={styles.xContextTitle}>X context (curated)</h3>
        <p className={styles.xContextMuted}>
          Refresh the curated X feed on the desk to see recent posts mentioning
          this symbol. This is not a trade signal.
        </p>
      </section>
    )
  }
  const agg = aggregateForTicker(ticker, xFeedData.tickerAggregates)
  const posts = tickerPostsFromFeed(xFeedData.items, ticker, 5)
  if (!agg && posts.length === 0) {
    return (
      <section className={styles.xContext} aria-label="X context">
        <h3 className={styles.xContextTitle}>X context (curated)</h3>
        <p className={styles.xContextMuted}>
          No mentions of {ticker} in the current feed batch. Try again after
          Refresh when more posts reference this symbol.
        </p>
      </section>
    )
  }
  const velNote =
    agg && agg.mentionVelocity >= 1.5
      ? ` · Velocity ~+${Math.round((agg.mentionVelocity - 1) * 100)}% vs older window`
      : ''
  return (
    <section className={styles.xContext} aria-label="X context">
      <h3 className={styles.xContextTitle}>X context (curated)</h3>
      {agg ? (
        <p className={styles.xContextStats}>
          Mentions in this batch: <strong>{agg.mentionCount}</strong>
          {' · '}
          Bullish / bearish / neutral:{' '}
          <strong>
            {agg.bullishMentions} / {agg.bearishMentions} /{' '}
            {agg.neutralMentions}
          </strong>
          {velNote}
          <br />
          Latest mention: {formatXCtxTime(agg.lastMentionAt)}
        </p>
      ) : null}
      {posts.length > 0 ? (
        <ul className={styles.xContextList}>
          {posts.map((p) => (
            <li key={`${p.id}-${p.handle}`} className={styles.xContextItem}>
              <span className={styles.xContextMeta}>
                @{p.handle} · {p.sentiment} · {formatXCtxTime(p.createdAt)}
              </span>
              {p.text.slice(0, 160)}
              {p.text.length > 160 ? '…' : ''}
            </li>
          ))}
        </ul>
      ) : null}
      <p className={styles.xContextDisclaimer}>
        Context only — confirm with news and your plan; not a recommendation to
        trade.
      </p>
    </section>
  )
}

function dedupeReasons<T>(xs: T[]): T[] {
  return [...new Set(xs)]
}

export function WatchlistSetupDrawer({
  detail,
  dailyPlan,
  tradePlans,
  riskPerTrade,
  planError,
  onDismissPlanError,
  onClose,
  onCreatePlan,
  busy,
  xFeedData,
  xFeedLoadEnabled = true,
}: {
  detail: WatchlistScanDetail | null
  dailyPlan: DailyPlan | null
  tradePlans: TradePlan[]
  riskPerTrade: number
  planError?: string | null
  onDismissPlanError?: () => void
  onClose: () => void
  onCreatePlan: (detail: WatchlistScanDetail) => void | Promise<void>
  busy?: boolean
  xFeedData?: XFeedResponse | null
  xFeedLoadEnabled?: boolean
}) {
  const tradePlan = useMemo(() => {
    if (!detail) return null
    const sym = detail.ticker.toUpperCase()
    return (
      tradePlans.find(
        (p) => p.ticker.toUpperCase() === sym && p.status === 'watching',
      ) ?? tradePlans.find((p) => p.ticker.toUpperCase() === sym) ??
      null
    )
  }, [detail, tradePlans])

  const rejectionBlock = useMemo(() => {
    if (!detail) {
      return {
        combinedReasons: [] as ScanRejectionReason[],
        mergedDetail: {} as PlanRejectionDetail,
        explainLines: [] as string[],
        suggestionsText: '',
        headline: '',
      }
    }
    const scanReasons = detail.rejectionReasons ?? []
    const approvalReasons = tradePlan
      ? approvalBlockingScanReasons(dailyPlan, tradePlans, tradePlan)
      : []
    const combinedReasons = dedupeReasons([...scanReasons, ...approvalReasons])

    const rps =
      tradePlan != null
        ? tradePlan.riskPerShare ?? tradePlan.entry - tradePlan.stop
        : undefined
    const mergedDetail: PlanRejectionDetail = {
      ...detail.rejectionDetail,
      ...(tradePlan != null
        ? {
            actualScore: tradePlan.score ?? detail.rejectionDetail?.actualScore,
            requiredScore: MIN_MORNING_SCORE,
            actualExpectedR:
              tradePlan.expectedR ?? detail.rejectionDetail?.actualExpectedR,
            requiredExpectedR: MIN_EXPECTED_R,
            positionSize: tradePlan.positionSize,
            requiredPositionSize: 1,
            riskBudgetPerTrade: riskPerTrade,
            riskPerShare: rps ?? detail.rejectionDetail?.riskPerShare,
          }
        : {
            riskBudgetPerTrade:
              detail.rejectionDetail?.riskBudgetPerTrade ?? riskPerTrade,
          }),
    }

    const explainLines = explainScanRejectionReasons(
      combinedReasons,
      mergedDetail,
    )
    const suggestionsText = buildRejectionSuggestions(
      combinedReasons,
      mergedDetail,
      detail.scoreBreakdown ?? null,
    ).join(' ')
    const headline = headlineForRejection(
      Boolean(detail.candidate),
      combinedReasons,
    )

    return {
      combinedReasons,
      mergedDetail,
      explainLines,
      suggestionsText,
      headline,
    }
  }, [
    dailyPlan,
    detail,
    riskPerTrade,
    tradePlan,
    tradePlans,
  ])

  if (!detail) return null

  const c = detail.candidate
  const numericScore = detail.score ?? detail.debug?.score
  const scoreBand = numericScore != null ? interpretTradeSetupScore(numericScore) : null
  const canPlan = Boolean(c && numericScore != null)

  const {
    combinedReasons,
    mergedDetail,
    explainLines,
    suggestionsText,
    headline,
  } = rejectionBlock

  const showRejectionPanel = combinedReasons.length > 0
  const bd = detail.scoreBreakdown

  return (
    <div className={styles.backdrop} role="presentation" onClick={onClose}>
      <aside
        className={styles.drawer}
        role="dialog"
        aria-modal="true"
        aria-labelledby="setup-drawer-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.head}>
          <h2 id="setup-drawer-title" className={styles.title}>
            {detail.ticker}
          </h2>
          <button type="button" className={styles.closeX} onClick={onClose}>
            ×
          </button>
        </div>
        {planError && (
          <div className={styles.errorBanner} role="alert">
            <span className={styles.errorText}>{planError}</span>
            {onDismissPlanError && (
              <button
                type="button"
                className={styles.dismissErr}
                onClick={onDismissPlanError}
              >
                Dismiss
              </button>
            )}
          </div>
        )}
        <p className={styles.bias}>
          Market bias: <strong>{detail.marketBias}</strong>
          {detail.regime != null && (
            <>
              {' '}
              · Regime <strong>{detail.regime}</strong>
            </>
          )}
          {numericScore != null && (
            <>
              {' '}
              · Score <strong>{numericScore.toFixed(1)}</strong>
              {scoreBand != null && (
                <>
                  {' '}
                  (<strong>{scoreBand.toUpperCase()}</strong>)
                </>
              )}
            </>
          )}
        </p>
        <p className={styles.summary}>{detail.summary}</p>
        <DrawerXFeedContext
          ticker={detail.ticker}
          xFeedData={xFeedData}
          loadEnabled={xFeedLoadEnabled}
        />
        {detail.scanStatus != null && (
          <p className={styles.scanMeta}>
            Scan status: <strong>{detail.scanStatus}</strong>
            {detail.candidateTier != null && (
              <>
                {' '}
                · Tier <strong>{detail.candidateTier}</strong>
              </>
            )}
          </p>
        )}

        {showRejectionPanel && (
          <section className={styles.rejectPanel} aria-labelledby="reject-title">
            <h3 id="reject-title" className={styles.rejectTitle}>
              Why this plan was rejected
            </h3>
            <p className={styles.rejectHeadline}>{headline}</p>
            {c && (
              <p className={styles.rejectSetup}>
                <strong>Setup:</strong> {strategyKindLabel(c.strategyKind)} · level{' '}
                {c.level.toFixed(2)} · rel vol {c.relVolume.toFixed(2)}×
              </p>
            )}
            <dl className={styles.rejectMetrics}>
              <div>
                <dt>Score</dt>
                <dd>
                  {numericScore != null ? numericScore.toFixed(1) : '—'}
                  {mergedDetail.requiredScore != null && (
                    <span className={styles.metricHint}>
                      {' '}
                      (need ≥{mergedDetail.requiredScore})
                    </span>
                  )}
                </dd>
              </div>
              <div>
                <dt>Expected R</dt>
                <dd>
                  {detail.expectedR != null
                    ? detail.expectedR.toFixed(2)
                    : detail.debug?.expectedR != null
                      ? detail.debug.expectedR.toFixed(2)
                      : '—'}
                  <span className={styles.metricHint}>
                    {' '}
                    (need ≥{mergedDetail.requiredExpectedR ?? MIN_EXPECTED_R})
                  </span>
                </dd>
              </div>
              <div>
                <dt>Position size</dt>
                <dd>
                  {detail.positionSize != null
                    ? detail.positionSize
                    : detail.debug?.positionSize != null
                      ? detail.debug.positionSize
                      : '—'}{' '}
                  sh
                </dd>
              </div>
            </dl>
            <ul className={styles.reasonList}>
              {explainLines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            {suggestionsText ? (
              <p className={styles.suggestion}>
                <strong>Suggestion:</strong> {suggestionsText}
              </p>
            ) : null}
          </section>
        )}

        {bd != null && (
          <section className={styles.breakdownSection} aria-labelledby="bd-title">
            <h3 id="bd-title" className={styles.breakdownTitle}>
              Score breakdown
            </h3>
            <table className={styles.breakdownTable}>
              <tbody>
                <tr>
                  <th scope="row">Market alignment</th>
                  <td>{bd.marketAlignmentScore.toFixed(1)}</td>
                </tr>
                <tr>
                  <th scope="row">Setup quality</th>
                  <td>{bd.setupQualityScore.toFixed(1)}</td>
                </tr>
                <tr>
                  <th scope="row">Relative volume</th>
                  <td>{bd.relativeVolumeScore.toFixed(1)}</td>
                </tr>
                <tr>
                  <th scope="row">Trend quality</th>
                  <td>{bd.trendQualityScore.toFixed(1)}</td>
                </tr>
                <tr>
                  <th scope="row">Level clarity</th>
                  <td>{bd.levelClarityScore.toFixed(1)}</td>
                </tr>
                <tr>
                  <th scope="row">Reward/Risk quality</th>
                  <td>{bd.rewardRiskScore.toFixed(1)}</td>
                </tr>
                <tr>
                  <th scope="row">Execution fit</th>
                  <td>{bd.executionFitScore.toFixed(1)}</td>
                </tr>
              </tbody>
            </table>
          </section>
        )}

        {detail.debug != null && (
          <details className={styles.debugDetails}>
            <summary>Scanner debug</summary>
            <pre className={styles.debugPre}>
              {JSON.stringify(detail.debug, null, 2)}
            </pre>
          </details>
        )}
        {c && (
          <dl className={styles.levels}>
            <div>
              <dt>Setup</dt>
              <dd>{strategyKindLabel(c.strategyKind)}</dd>
            </div>
            <div>
              <dt>Level</dt>
              <dd>{c.level.toFixed(2)}</dd>
            </div>
            <div>
              <dt>EMA9 / EMA20</dt>
              <dd>
                {c.ema9.toFixed(2)} / {c.ema20.toFixed(2)}
              </dd>
            </div>
            <div>
              <dt>Rel. volume</dt>
              <dd>{c.relVolume.toFixed(2)}×</dd>
            </div>
          </dl>
        )}
        <div className={styles.actions}>
          <button type="button" className={styles.secondary} onClick={onClose}>
            Close
          </button>
          <button
            type="button"
            className={styles.primary}
            disabled={!canPlan || busy}
            onClick={() => void onCreatePlan(detail)}
          >
            Create plan
          </button>
        </div>
      </aside>
    </div>
  )
}
