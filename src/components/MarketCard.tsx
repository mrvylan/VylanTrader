import type { MarketBiasResult, TrendArrow } from '../domain/types'
import styles from './MarketCard.module.css'

const trendArrow: Record<TrendArrow, string> = {
  up: '↑',
  flat: '→',
  down: '↓',
}

const trendLabel: Record<TrendArrow, string> = {
  up: 'Bullish',
  flat: 'Neutral',
  down: 'Bearish',
}

function volLabel(v: MarketBiasResult['volatility']): string {
  if (v === 'low') return 'Low'
  if (v === 'high') return 'High'
  return 'Medium'
}

function regimeLabel(r: MarketBiasResult['regime']): string {
  return r.toUpperCase()
}

function TrendRow({
  name,
  trend,
}: {
  name: string
  trend: TrendArrow
}) {
  return (
    <div className={styles.row}>
      <span className={styles.rowLabel}>{name}</span>
      <span
        className={`${styles.arrow} ${styles[`trend_${trend}`]}`}
        aria-hidden
      >
        {trendArrow[trend]}
      </span>
      <span className={styles.rowValue}>{trendLabel[trend]}</span>
    </div>
  )
}

function biasTrendArrow(m: MarketBiasResult['marketTrend']): TrendArrow {
  if (m === 'bullish') return 'up'
  if (m === 'bearish') return 'down'
  return 'flat'
}

export function MarketCard({ data }: { data: MarketBiasResult | null }) {
  if (!data) {
    return (
      <article className={styles.card} aria-labelledby="market-regime-title">
        <h2 id="market-regime-title" className={styles.title}>
          Market Regime
        </h2>
        <p className={styles.placeholder}>
          No live macro snapshot. The daily plan still uses market bias from
          when you create it (defaults to neutral if unset).
        </p>
      </article>
    )
  }

  return (
    <article className={styles.card} aria-labelledby="market-regime-title">
      <h2 id="market-regime-title" className={styles.title}>
        Market Regime
      </h2>
      <div className={styles.body}>
        <div className={styles.row}>
          <span className={styles.rowLabel}>Bias</span>
          <span
            className={`${styles.arrow} ${styles[`trend_${biasTrendArrow(data.marketTrend)}`]}`}
            aria-hidden
          >
            {trendArrow[biasTrendArrow(data.marketTrend)]}
          </span>
          <span className={styles.rowValue}>
            {data.marketTrend.charAt(0).toUpperCase() + data.marketTrend.slice(1)}
          </span>
        </div>
        <TrendRow name="SPY" trend={data.spyTrend} />
        <TrendRow name="QQQ" trend={data.qqqTrend} />
        <div className={styles.row}>
          <span className={styles.rowLabel}>Vol</span>
          <span className={styles.volSpacer} aria-hidden />
          <span className={styles.rowValue}>{volLabel(data.volatility)}</span>
        </div>
        <div className={styles.row}>
          <span className={styles.rowLabel}>State</span>
          <span className={styles.volSpacer} aria-hidden />
          <span className={styles.regime}>{regimeLabel(data.regime)}</span>
        </div>
      </div>
    </article>
  )
}
