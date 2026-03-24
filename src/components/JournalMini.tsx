import type { JournalMetrics } from '../domain/types'
import styles from './JournalMini.module.css'

export function JournalMini({ metrics }: { metrics: JournalMetrics }) {
  const pills = metrics.lastFive.map((r) => (r === 'win' ? 'W' : 'L'))

  return (
    <article className={styles.card} aria-labelledby="journal-title">
      <h2 id="journal-title" className={styles.title}>
        Journal
      </h2>
      <p className={styles.sub}>Closed today: {metrics.tradesToday}</p>
      <div className={styles.lastFive} role="list" aria-label="Last five trades">
        {pills.length === 0 ? (
          <span className={styles.empty}>No closed trades yet</span>
        ) : (
          pills.map((outcome, i) => (
            <span
              key={`${i}-${outcome}`}
              className={`${styles.pill} ${outcome === 'W' ? styles.win : styles.loss}`}
              role="listitem"
            >
              {outcome}
            </span>
          ))
        )}
      </div>
      <dl className={styles.stats}>
        <div className={styles.stat}>
          <dt>Win rate</dt>
          <dd>{metrics.winRatePct}%</dd>
        </div>
        <div className={styles.stat}>
          <dt>Avg R</dt>
          <dd>{metrics.avgR.toFixed(2)}</dd>
        </div>
        <div className={styles.stat}>
          <dt>Total R</dt>
          <dd>{metrics.totalR.toFixed(2)}</dd>
        </div>
        <div className={styles.stat}>
          <dt>Best setup</dt>
          <dd>{metrics.bestSetup}</dd>
        </div>
      </dl>
    </article>
  )
}
