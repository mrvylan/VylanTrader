import { useEffect, useState } from 'react'
import styles from './DeskHeader.module.css'

function dataSourceTitle(
  s: string,
): string {
  switch (s) {
    case 'massive':
      return 'Massive API (server-side) — requires MASSIVE_API_KEY in server env.'
    case 'finnhub':
      return 'Finnhub only — free tier may block daily candles (403). Add VITE_ALPHA_VANTAGE_API_KEY.'
    case 'polygon':
      return 'Polygon.io (server-side) — requires POLYGON_API_KEY in server env.'
    case 'alphavantage':
      return 'Alpha Vantage (VITE_ALPHA_VANTAGE_API_KEY)'
    case 'layered':
      return 'Finnhub + Alpha Vantage fallback'
    case 'layered_dev':
      return 'Finnhub + Stooq fallback (dev server proxy only)'
    default:
      return 'Synthetic data (mock)'
  }
}

/** Shown in the header pill — explicit provider so it’s easy to spot. */
function dataSourcePillLabel(
  s: string,
): string {
  switch (s) {
    case 'mock':
      return 'Mock'
    case 'massive':
      return 'Massive'
    case 'polygon':
      return 'Polygon'
    case 'finnhub':
      return 'Finnhub'
    case 'alphavantage':
      return 'Alpha Vantage'
    case 'layered':
      return 'Finnhub + AV'
    case 'layered_dev':
      return 'Finnhub + Stooq'
    default:
      return s
  }
}

function formatPt(d: Date): string {
  return d.toLocaleTimeString('en-US', {
    timeZone: 'America/Los_Angeles',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  })
}

export function DeskHeader({
  planActionError,
  dataFallbackNotice,
  onDismissPlanActionError,
  marketDataSource,
  onOpenSettings,
  onOpenJournal,
  onOpenPrices,
  deskView,
  onOpenHistory,
  onOpenDesk,
}: {
  planActionError: string | null
  dataFallbackNotice: string | null
  onDismissPlanActionError: () => void
  marketDataSource: string
  onOpenSettings: () => void
  onOpenJournal: () => void
  onOpenPrices: () => void
  deskView: 'desk' | 'history'
  onOpenHistory: () => void
  onOpenDesk: () => void
}) {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(t)
  }, [])

  return (
    <header className={styles.bar}>
      <div className={styles.left}>
        <span className={styles.brand}>Trade Desk</span>
        <span className={styles.clock} title="Pacific Time">
          {formatPt(now)} PT
        </span>
        <span className={styles.dataSourceGroup}>
          <span className={styles.dataSourceLabel}>Data source</span>
          <span
            className={
              marketDataSource === 'mock' ? styles.dataMock : styles.dataLive
            }
            title={dataSourceTitle(marketDataSource)}
            aria-label={`Market data source: ${dataSourcePillLabel(marketDataSource)}`}
          >
            {dataSourcePillLabel(marketDataSource)}
          </span>
        </span>
      </div>
      <div className={styles.actions}>
        {dataFallbackNotice && (
          <span className={styles.demoNotice} role="status">
            {dataFallbackNotice}
          </span>
        )}
        {planActionError && (
          <span className={styles.error} role="alert">
            {planActionError}{' '}
            <button
              type="button"
              className={styles.dismissLink}
              onClick={onDismissPlanActionError}
            >
              Dismiss
            </button>
          </span>
        )}
        <button type="button" className={styles.btn} onClick={onOpenPrices}>
          Prices
        </button>
        <button
          type="button"
          className={deskView === 'desk' ? `${styles.btn} ${styles.navOn}` : styles.btn}
          onClick={onOpenDesk}
          aria-current={deskView === 'desk' ? 'page' : undefined}
        >
          Trading desk
        </button>
        <button
          type="button"
          className={
            deskView === 'history' ? `${styles.btn} ${styles.navOn}` : styles.btn
          }
          onClick={onOpenHistory}
          aria-current={deskView === 'history' ? 'page' : undefined}
        >
          History
        </button>
        <button type="button" className={styles.btn} onClick={onOpenJournal}>
          Journal
        </button>
        <button type="button" className={styles.btn} onClick={onOpenSettings}>
          Settings
        </button>
      </div>
    </header>
  )
}
