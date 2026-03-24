import { useState } from 'react'
import type { UserSettings } from '../domain/types'
import styles from './SettingsModal.module.css'

function SettingsForm({
  settings,
  watchlistCsv,
  watchlistTableVisible,
  onSave,
  onClose,
}: {
  settings: UserSettings
  watchlistCsv: string
  watchlistTableVisible: boolean
  onSave: (
    s: UserSettings,
    watchlist: string[],
    showWatchlistTable: boolean,
  ) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState(settings)
  const [tickers, setTickers] = useState(watchlistCsv)
  const [showWatchlistTable, setShowWatchlistTable] =
    useState(watchlistTableVisible)

  return (
    <div
      className={styles.modal}
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
      onClick={(e) => e.stopPropagation()}
    >
      <h2 id="settings-title" className={styles.title}>
        Settings
      </h2>
      <div className={styles.grid}>
        <label className={styles.field}>
          Account size ($)
          <input
            type="number"
            className={styles.input}
            value={draft.accountSize}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                accountSize: Number(e.target.value) || 0,
              }))
            }
          />
        </label>
        <label className={styles.field}>
          Risk per trade ($)
          <input
            type="number"
            className={styles.input}
            value={draft.riskPerTrade}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                riskPerTrade: Number(e.target.value) || 0,
              }))
            }
          />
        </label>
        <label className={styles.field}>
          Daily max loss ($)
          <input
            type="number"
            className={styles.input}
            value={draft.dailyMaxLoss}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                dailyMaxLoss: Number(e.target.value) || 0,
              }))
            }
          />
        </label>
        <label className={styles.field}>
          Max trades / day
          <input
            type="number"
            className={styles.input}
            min={1}
            max={20}
            value={draft.maxTradesPerDay}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                maxTradesPerDay: Math.max(1, Number(e.target.value) || 1),
              }))
            }
          />
        </label>
      </div>
      <label className={styles.field}>
        Watchlist (comma-separated, max 10)
        <input
          type="text"
          className={styles.input}
          value={tickers}
          onChange={(e) => setTickers(e.target.value)}
          placeholder="NVDA, AMD, META"
        />
      </label>
      <label className={styles.check}>
        <input
          type="checkbox"
          checked={draft.alertSound}
          onChange={(e) =>
            setDraft((d) => ({ ...d, alertSound: e.target.checked }))
          }
        />
        Alert sound
      </label>
      <label className={styles.check}>
        <input
          type="checkbox"
          checked={showWatchlistTable}
          onChange={(e) => setShowWatchlistTable(e.target.checked)}
        />
        Show watchlist scan table
      </label>
      <label className={styles.field}>
        Webhook URL (optional)
        <input
          type="url"
          className={styles.input}
          value={draft.alertWebhookUrl}
          onChange={(e) =>
            setDraft((d) => ({ ...d, alertWebhookUrl: e.target.value }))
          }
          placeholder="https://…"
        />
      </label>
      <div className={styles.actions}>
        <button type="button" className={styles.cancel} onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className={styles.save}
          onClick={() => {
            const wl = tickers
              .split(/[,;\s]+/)
              .map((t) => t.trim().toUpperCase())
              .filter(Boolean)
              .slice(0, 10)
            onSave(draft, wl, showWatchlistTable)
            onClose()
          }}
        >
          Save
        </button>
      </div>
    </div>
  )
}

export function SettingsModal({
  open,
  resetToken,
  settings,
  watchlistCsv,
  watchlistTableVisible,
  onSave,
  onClose,
}: {
  open: boolean
  /** Increment when opening so the form remounts with fresh values. */
  resetToken: number
  settings: UserSettings
  watchlistCsv: string
  watchlistTableVisible: boolean
  onSave: (
    s: UserSettings,
    watchlist: string[],
    showWatchlistTable: boolean,
  ) => void
  onClose: () => void
}) {
  if (!open) return null

  return (
    <div className={styles.backdrop} role="presentation" onClick={onClose}>
      <SettingsForm
        key={resetToken}
        settings={settings}
        watchlistCsv={watchlistCsv}
        watchlistTableVisible={watchlistTableVisible}
        onSave={onSave}
        onClose={onClose}
      />
    </div>
  )
}
