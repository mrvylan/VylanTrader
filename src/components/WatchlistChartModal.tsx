import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react'
import {
  CandlestickSeries,
  ColorType,
  createChart,
  type IChartApi,
  type UTCTimestamp,
} from 'lightweight-charts'
import styles from './WatchlistChartModal.module.css'

type HistoricalBar = {
  t: number
  o: number
  h: number
  l: number
  c: number
  v: number
}

/** Polygon/Massive bar time is ms; lightweight-charts intraday scale uses UTC seconds. */
function utcTimestampSeconds(ms: number): number {
  return Math.floor(ms / 1000)
}

export function WatchlistChartModal({
  open,
  ticker,
  onClose,
}: {
  open: boolean
  ticker: string | null
  onClose: () => void
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [phase, setPhase] = useState<'idle' | 'loading' | 'error' | 'ready'>(
    'idle',
  )
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const onBackdropKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Escape') onClose()
    },
    [onClose],
  )

  useEffect(() => {
    if (!open || !ticker) {
      setPhase('idle')
      setErrorMessage(null)
      return
    }

    const el = wrapRef.current
    if (!el) return

    let cancelled = false
    let chart: IChartApi | null = null
    let ro: ResizeObserver | null = null

    setPhase('loading')
    setErrorMessage(null)

    void (async () => {
      try {
        const res = await fetch(
          `/api/market/historical?ticker=${encodeURIComponent(
            ticker,
          )}&timeframe=1h`,
        )
        const j = (await res.json()) as {
          error?: string
          bars?: HistoricalBar[]
        }
        if (!res.ok) {
          throw new Error(j.error ?? `HTTP ${res.status}`)
        }
        const bars = j.bars ?? []
        if (bars.length === 0) {
          throw new Error('No bars returned for this symbol.')
        }
        if (cancelled) return

        const node = wrapRef.current
        if (!node || cancelled) return

        chart = createChart(node, {
          layout: {
            background: { type: ColorType.Solid, color: '#0b0d12' },
            textColor: '#94a3b8',
          },
          width: node.clientWidth,
          height: node.clientHeight,
          grid: {
            vertLines: { color: '#1a1f28' },
            horzLines: { color: '#1a1f28' },
          },
          rightPriceScale: {
            borderColor: '#1f2933',
          },
          timeScale: {
            borderColor: '#1f2933',
            timeVisible: true,
            secondsVisible: false,
          },
        })

        const series = chart.addSeries(CandlestickSeries, {
          upColor: '#22c55e',
          downColor: '#ef4444',
          borderVisible: false,
          wickUpColor: '#22c55e',
          wickDownColor: '#ef4444',
        })

        const data = bars.map((b) => ({
          time: utcTimestampSeconds(b.t) as UTCTimestamp,
          open: b.o,
          high: b.h,
          low: b.l,
          close: b.c,
        }))
        series.setData(data)
        chart.timeScale().fitContent()

        ro = new ResizeObserver(() => {
          if (!wrapRef.current || !chart) return
          const { clientWidth, clientHeight } = wrapRef.current
          chart.applyOptions({ width: clientWidth, height: clientHeight })
        })
        ro.observe(node)

        if (cancelled) {
          ro.disconnect()
          chart.remove()
          return
        }

        setPhase('ready')
      } catch (e) {
        if (cancelled) return
        setErrorMessage(e instanceof Error ? e.message : 'Could not load chart.')
        setPhase('error')
      }
    })()

    return () => {
      cancelled = true
      ro?.disconnect()
      chart?.remove()
    }
  }, [open, ticker])

  if (!open || !ticker) return null

  return (
    <div
      className={styles.backdrop}
      role="presentation"
      onClick={onClose}
      onKeyDown={onBackdropKeyDown}
      tabIndex={-1}
    >
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="watchlist-chart-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.head}>
          <div>
            <h2 id="watchlist-chart-title" className={styles.title}>
              {ticker}
            </h2>
            <p className={styles.subtitle}>
              Hourly candles (Massive 1h aggregates, ~90 days)
            </p>
          </div>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <div className={styles.chartWrap}>
          {phase === 'loading' && (
            <div className={styles.overlay}>Loading chart…</div>
          )}
          {phase === 'error' && (
            <div className={styles.overlayError}>
              {errorMessage ?? 'Failed to load chart.'}
            </div>
          )}
          <div
            ref={wrapRef}
            className={styles.chartInner}
            aria-hidden={phase !== 'ready'}
          />
        </div>
      </div>
    </div>
  )
}
