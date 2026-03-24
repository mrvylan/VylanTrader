import type { RiskPanelData } from '../domain/types'
import styles from './RiskCard.module.css'

function formatMoney(n: number) {
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  })
}

export function RiskCard({ data }: { data: RiskPanelData }) {
  return (
    <article className={styles.card} aria-labelledby="risk-title">
      <h2 id="risk-title" className={styles.title}>
        Risk
      </h2>
      <dl className={styles.list}>
        <div className={styles.row}>
          <dt>Account</dt>
          <dd>{formatMoney(data.accountSize)}</dd>
        </div>
        <div className={styles.row}>
          <dt>Risk / trade</dt>
          <dd>{formatMoney(data.riskPerTrade)}</dd>
        </div>
        <div className={styles.row}>
          <dt>Daily max</dt>
          <dd>{formatMoney(data.dailyMaxLoss)}</dd>
        </div>
        <div className={styles.row}>
          <dt>Open exposure</dt>
          <dd>{formatMoney(data.openRiskExposure)}</dd>
        </div>
        <div className={styles.row}>
          <dt>Trades today</dt>
          <dd>
            {data.tradesTaken} / {data.tradesMax}
          </dd>
        </div>
      </dl>
    </article>
  )
}
