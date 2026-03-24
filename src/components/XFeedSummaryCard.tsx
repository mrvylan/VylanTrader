import type { XFeedResponse } from '../services/xFeed'
import styles from './XFeedSummaryCard.module.css'

export function XFeedSummaryCard({
  data,
  loadEnabled = true,
}: {
  data: XFeedResponse | null
  loadEnabled?: boolean
}) {
  if (!loadEnabled) {
    return (
      <div className={styles.wrap} aria-label="X feed summary">
        <h3 className={styles.title}>X context summary</h3>
        <p className={styles.empty}>
          X post loading is off — enable &quot;Load X posts&quot; above the
          feed to use API quota and populate this card.
        </p>
      </div>
    )
  }

  if (!data?.summary || data.error) {
    return (
      <div className={styles.wrap} aria-label="X feed summary">
        <h3 className={styles.title}>X context summary</h3>
        <p className={styles.empty}>
          {data?.error
            ? 'Connect the X feed to see mention and sentiment context.'
            : 'Refresh the curated feed to populate this summary.'}
        </p>
      </div>
    )
  }

  const s = data.summary
  const spikeLine =
    s.spikeTicker && s.spikeVelocityPct != null
      ? `${s.spikeTicker} mentions ~+${s.spikeVelocityPct}% vs recent baseline in this batch`
      : null

  return (
    <div className={styles.wrap} aria-label="X feed summary">
      <h3 className={styles.title}>X context summary</h3>
      <div className={styles.rows}>
        {s.topTicker ? (
          <p className={styles.row}>
            <strong>{s.topTicker}</strong> most mentioned in this refresh (
            {s.topTickerMentions} posts)
          </p>
        ) : (
          <p className={styles.rowMuted}>No tickers detected in recent posts.</p>
        )}
        <p className={styles.row}>
          Feed tone: <strong>{s.sentimentSkew}</strong>
          {s.sentimentSkew === 'mixed' ? ' (traders/news diverge)' : ''}
        </p>
        {spikeLine ? <p className={styles.row}>{spikeLine}</p> : null}
        {s.marketContextLine ? (
          <p className={styles.rowMuted}>{s.marketContextLine}</p>
        ) : null}
      </div>
      <p className={styles.disclaimer}>{s.disclaimer}</p>
    </div>
  )
}
