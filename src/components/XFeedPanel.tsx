import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { XFeedItem, XFeedResponse } from '../services/xFeed'
import {
  fetchXFeed,
  fetchXFeedHealth,
  parseHandlesDraft,
  X_FEED_ERR_NO_BEARER,
  X_FEED_ERR_NO_HANDLES,
  X_FEED_HANDLES_STORAGE_KEY,
  X_FEED_USE_CUSTOM_STORAGE_KEY,
} from '../services/xFeed'
import { DEFAULT_CURATED_HANDLES, X_FEED_CATEGORIES } from '../services/xFeedCurated'
import {
  filterXFeedItems,
  type XFeedFilterId,
} from '../services/xFeedFilters'
import styles from './XFeedPanel.module.css'

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function safeSet(key: string, val: string) {
  try {
    localStorage.setItem(key, val)
  } catch {
    /* ignore quota / private mode */
  }
}

function formatTime(iso: string): string {
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

const FILTER_CHIPS: { id: XFeedFilterId; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'traders', label: 'Traders' },
  { id: 'watchlist', label: 'My watchlist' },
  { id: 'news', label: 'News' },
  { id: 'education', label: 'Education' },
  { id: 'bullish', label: 'Bullish' },
  { id: 'bearish', label: 'Bearish' },
]

function SetupSteps({ variant }: { variant: 'bearer' | 'handles' }) {
  return (
    <ol className={styles.steps}>
      {variant === 'bearer' ? (
        <>
          <li>
            Add secrets to the <strong>project root</strong>{' '}
            <code>.env.local</code> (same file as <code>VITE_*</code> keys) or
            to <code>server/.env</code> / <code>server/.env.local</code>. Later
            files in that chain override earlier ones.
          </li>
          <li>
            In the X Developer Portal, open your project →{' '}
            <strong>Keys and tokens</strong> → copy the{' '}
            <strong>Bearer Token</strong>.
          </li>
          <li>
            Set <code>X_BEARER_TOKEN=…</code> (or{' '}
            <code>TWITTER_BEARER_TOKEN</code>). No spaces around <code>=</code>.
            Vite does not expose <code>X_*</code> to the browser.
          </li>
          <li>
            The server ships with a <strong>curated handle list</strong> for
            market context. Optionally set <code>X_FEED_HANDLES</code> to
            override it (comma-separated, no <code>@</code>).
          </li>
          <li>
            Save the file. With <code>npm run dev:full</code> or{' '}
            <code>npm run server:watch</code>, the server restarts on env
            changes; otherwise restart <code>npm run server</code> manually.
          </li>
        </>
      ) : (
        <>
          <li>
            The feed already uses a built-in curated list when{' '}
            <code>X_FEED_HANDLES</code> is unset.
          </li>
          <li>
            To customize sources, set{' '}
            <code>X_FEED_HANDLES=TraderA,TraderB</code> in project{' '}
            <code>.env.local</code> or <code>server/.env</code>, then restart
            the feed server if needed.
          </li>
        </>
      )}
    </ol>
  )
}

function EnvHealthHint({ active }: { active: boolean }) {
  const [text, setText] = useState<string | null>(null)
  useEffect(() => {
    if (!active) {
      setText(null)
      return
    }
    void fetchXFeedHealth().then((h) => {
      if (!h) {
        setText(
          'Could not reach /api/x/health — start the feed server (npm run server:watch or npm run dev:full).',
        )
        return
      }
      const files =
        h.envFilesLoaded && h.envFilesLoaded.length > 0
          ? h.envFilesLoaded.join(', ')
          : '(no files — add project .env.local or server/.env)'
      const curated =
        h.usingDefaultCurated === false
          ? 'handles from env'
          : 'built-in curated handles'
      const cf =
        h.contentFilterMode === 'off'
          ? 'content filter off'
          : h.contentFilterMode === 'strict'
            ? 'content filter strict'
            : 'content filter on'
      setText(`Server loaded: ${files} · ${curated} · ${cf}`)
    })
  }, [active])
  return text ? <p className={styles.envDiag}>{text}</p> : null
}

function sentimentClass(s: XFeedItem['sentiment']): string {
  switch (s) {
    case 'bullish':
      return styles.sentBull
    case 'bearish':
      return styles.sentBear
    case 'neutral':
      return styles.sentNeutral
    default:
      return styles.sentUnknown
  }
}

function FeedItem({ item }: { item: XFeedItem }) {
  const catLabel = X_FEED_CATEGORIES[item.category]
  const syms = Array.isArray(item.detectedTickers) ? item.detectedTickers : []
  return (
    <li className={styles.item}>
      <div className={styles.itemHead}>
        <span className={styles.handle}>
          <a
            href={`https://x.com/${item.handle}`}
            target="_blank"
            rel="noreferrer"
          >
            {item.displayName}
            <span className={styles.handleAt}> @{item.handle}</span>
          </a>
        </span>
        <span className={styles.badges}>
          <span className={styles.badgeCat}>{catLabel}</span>
          <span className={sentimentClass(item.sentiment)}>{item.sentiment}</span>
        </span>
        <span className={styles.time}>{formatTime(item.createdAt)}</span>
      </div>
      <div className={styles.relRow} title="Relevance (recency, tickers, source)">
        <span className={styles.relLabel}>Relevance</span>
        <span className={styles.relTrack}>
          <span
            className={styles.relFill}
            style={{ width: `${item.relevanceScore}%` }}
          />
        </span>
        <span className={styles.relNum}>{item.relevanceScore}</span>
      </div>
      <div
        className={styles.symRow}
        aria-label={
          syms.length > 0
            ? 'Stock or ETF symbols detected in this post'
            : 'No stock symbols detected in this post'
        }
      >
        <span className={styles.symLabel}>Symbols</span>
        <div className={styles.tickers}>
          {syms.length > 0 ? (
            syms.map((t) => (
              <span key={t} className={styles.tickerPill}>
                ${t}
              </span>
            ))
          ) : (
            <span className={styles.tickerEmpty}>None detected</span>
          )}
        </div>
      </div>
      <p className={styles.text}>{item.text}</p>
      <span className={styles.link}>
        <a href={item.url} target="_blank" rel="noreferrer">
          Open post →
        </a>
      </span>
    </li>
  )
}

export function XFeedPanel({
  watchlist = [],
  onFeedData,
  feedLoadEnabled,
  onFeedLoadEnabledChange,
}: {
  watchlist?: string[]
  onFeedData?: (data: XFeedResponse | null) => void
  feedLoadEnabled: boolean
  onFeedLoadEnabledChange: (enabled: boolean) => void
}) {
  const initialCustom = safeGet(X_FEED_USE_CUSTOM_STORAGE_KEY) === '1'
  const [useCustom, setUseCustom] = useState(initialCustom)
  const defaultPlaceholder = DEFAULT_CURATED_HANDLES.join('\n')
  const [handlesDraft, setHandlesDraft] = useState(
    () => safeGet(X_FEED_HANDLES_STORAGE_KEY) ?? '',
  )
  const [data, setData] = useState<XFeedResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState<XFeedFilterId>('all')

  const useCustomRef = useRef(useCustom)
  const draftRef = useRef(handlesDraft)
  const watchlistRef = useRef(watchlist)
  const feedLoadEnabledRef = useRef(feedLoadEnabled)
  useCustomRef.current = useCustom
  draftRef.current = handlesDraft
  watchlistRef.current = watchlist
  feedLoadEnabledRef.current = feedLoadEnabled

  const setDataAndNotify = useCallback(
    (next: XFeedResponse | null) => {
      setData(next)
      onFeedData?.(next)
    },
    [onFeedData],
  )

  const load = useCallback(async () => {
    if (!feedLoadEnabledRef.current) return
    setLoading(true)
    try {
      const uc = useCustomRef.current
      const draft = draftRef.current
      const wl = watchlistRef.current
      if (uc) {
        const handles = parseHandlesDraft(draft)
        if (handles.length === 0) {
          setDataAndNotify({
            fetchedAt: new Date().toISOString(),
            items: [],
            tickerAggregates: [],
            summary: null,
            error:
              'Custom list is empty — add at least one username (one per line or comma-separated, no @).',
            handlesUsed: [],
          })
          return
        }
        setDataAndNotify(
          await fetchXFeed({ handles, watchlist: wl }),
        )
        return
      }
      setDataAndNotify(await fetchXFeed({ watchlist: wl }))
    } catch {
      setDataAndNotify({
        fetchedAt: new Date().toISOString(),
        items: [],
        tickerAggregates: [],
        summary: null,
        error: 'Could not reach /api/x/feed — is the Express server running?',
      })
    } finally {
      setLoading(false)
    }
  }, [setDataAndNotify])

  const setDraftPersisted = (t: string) => {
    setHandlesDraft(t)
    safeSet(X_FEED_HANDLES_STORAGE_KEY, t)
  }

  const onUseCustomChange = (checked: boolean) => {
    useCustomRef.current = checked
    setUseCustom(checked)
    safeSet(X_FEED_USE_CUSTOM_STORAGE_KEY, checked ? '1' : '0')
    if (checked && !handlesDraft.trim()) {
      setDraftPersisted(defaultPlaceholder)
    }
    if (feedLoadEnabled) void load()
  }

  const resetToServerList = () => {
    useCustomRef.current = false
    setUseCustom(false)
    safeSet(X_FEED_USE_CUSTOM_STORAGE_KEY, '0')
    if (feedLoadEnabled) void load()
  }

  const listDetailsRef = useRef<HTMLDetailsElement>(null)

  useEffect(() => {
    if (!feedLoadEnabled) {
      setDataAndNotify(null)
      setLoading(false)
      return
    }
    void load()
  }, [feedLoadEnabled, load, setDataAndNotify])

  const watchJoin = useMemo(
    () => watchlist.map((s) => s.trim().toUpperCase()).sort().join(','),
    [watchlist],
  )
  const skipWatchReload = useRef(true)
  useEffect(() => {
    if (!feedLoadEnabled) return
    if (skipWatchReload.current) {
      skipWatchReload.current = false
      return
    }
    void load()
  }, [watchJoin, load, feedLoadEnabled])

  useEffect(() => {
    const el = listDetailsRef.current
    if (el && initialCustom) el.open = true
  }, [])

  const watchUpper = useMemo(
    () => watchlist.map((s) => s.trim().toUpperCase()).filter(Boolean),
    [watchlist],
  )

  const filteredItems = useMemo(() => {
    if (!data?.items) return []
    return filterXFeedItems(data.items, filter, watchUpper)
  }, [data?.items, filter, watchUpper])

  return (
    <section className={styles.wrap} aria-labelledby="x-feed-title">
      <h2 id="x-feed-title" className={styles.title}>
        Curated X feed · context layer
      </h2>
      <div className={styles.toolbar}>
        <label className={styles.enableRow}>
          <input
            type="checkbox"
            className={styles.enableInput}
            checked={feedLoadEnabled}
            onChange={(e) => onFeedLoadEnabledChange(e.target.checked)}
            aria-label="Load posts from X (uses API quota when on)"
          />
          <span className={styles.enableText}>
            <span className={styles.enableTitle}>Load X posts</span>
            <span className={styles.enableHint}>
              Off = no requests to X (handy for dev)
            </span>
          </span>
        </label>
        <button
          type="button"
          className={styles.btn}
          disabled={!feedLoadEnabled || loading}
          onClick={() => void load()}
        >
          {loading ? 'Loading…' : 'Refresh'}
        </button>
        {data?.fetchedAt && feedLoadEnabled && (
          <span className={styles.meta}>
            Updated {formatTime(data.fetchedAt)}
          </span>
        )}
      </div>
      {!feedLoadEnabled && (
        <p className={styles.disabledNote}>
          X feed is paused — enable &quot;Load X posts&quot; to fetch. Your
          choice is saved in this browser.
        </p>
      )}
      <details ref={listDetailsRef} className={styles.listEditor}>
        <summary className={styles.summary}>Edit feed list</summary>
        <div className={styles.listEditorInner}>
          <label className={styles.labelRow}>
            <input
              type="checkbox"
              checked={useCustom}
              onChange={(e) => onUseCustomChange(e.target.checked)}
            />
            <span>
              Use custom handles (saved in this browser) instead of server env /
              defaults
            </span>
          </label>
          {useCustom && (
            <>
              <textarea
                className={styles.textarea}
                value={handlesDraft}
                onChange={(e) => setDraftPersisted(e.target.value)}
                placeholder={defaultPlaceholder}
                spellCheck={false}
                aria-label="Custom X handles"
              />
              <p className={styles.hint}>
                <code>@</code> optional. One per line or comma-separated. Refresh
                sends this list to the server when enabled.
              </p>
              <div className={styles.rowBtns}>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  disabled={loading || !feedLoadEnabled}
                  onClick={() => void load()}
                >
                  Apply &amp; refresh
                </button>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  disabled={loading || !feedLoadEnabled}
                  onClick={resetToServerList}
                >
                  Use server list
                </button>
              </div>
            </>
          )}
        </div>
      </details>
      {!data?.error &&
        data?.handlesUsed &&
        data.handlesUsed.length > 0 && (
          <p className={styles.handlesMeta}>
            Sources {data.handlesUsed.map((h) => `@${h}`).join(', ')}
          </p>
        )}
      {data?.error && (
        <>
          <p className={styles.error}>{data.error}</p>
          {(data.error === X_FEED_ERR_NO_BEARER ||
            data.error === X_FEED_ERR_NO_HANDLES) && (
            <EnvHealthHint active={feedLoadEnabled} />
          )}
          {data.error === X_FEED_ERR_NO_BEARER && (
            <details className={styles.details}>
              <summary className={styles.summary}>Setup checklist</summary>
              <SetupSteps variant="bearer" />
            </details>
          )}
          {data.error === X_FEED_ERR_NO_HANDLES && (
            <details className={styles.details} open>
              <summary className={styles.summary}>Handles</summary>
              <SetupSteps variant="handles" />
            </details>
          )}
        </>
      )}
      {!data?.error && data && data.items.length > 0 && (
        <div className={styles.filterRow} role="toolbar" aria-label="Feed filters">
          {FILTER_CHIPS.map((c) => (
            <button
              key={c.id}
              type="button"
              className={
                filter === c.id ? styles.filterChipOn : styles.filterChip
              }
              onClick={() => setFilter(c.id)}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}
      {!data?.error && data && data.items.length === 0 && !loading && (
        <p className={styles.empty}>No recent posts returned from X.</p>
      )}
      {!data?.error &&
        data &&
        data.items.length > 0 &&
        filteredItems.length === 0 &&
        !loading && (
          <p className={styles.empty}>No posts match this filter.</p>
        )}
      {!data?.error && filteredItems.length > 0 && (
        <ul className={styles.list}>
          {filteredItems.map((item) => (
            <FeedItem key={`${item.id}-${item.handle}`} item={item} />
          ))}
        </ul>
      )}
    </section>
  )
}
