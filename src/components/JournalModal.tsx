import { useMemo, useState } from 'react'
import type { TradeJournalEntry } from '../domain/types'
import styles from './JournalModal.module.css'

export function JournalModal({
  open,
  entries,
  onClose,
  onDeleteEntry,
}: {
  open: boolean
  entries: TradeJournalEntry[]
  onClose: () => void
  onDeleteEntry: (entryId: string) => void
}) {
  const setups = useMemo(() => {
    const s = new Set(entries.map((e) => e.setupType))
    return ['All', ...Array.from(s).sort()]
  }, [entries])

  const [filter, setFilter] = useState('All')

  const rows = useMemo(
    () =>
      filter === 'All'
        ? entries
        : entries.filter((e) => e.setupType === filter),
    [entries, filter],
  )

  if (!open) return null

  return (
    <div className={styles.backdrop} role="presentation" onClick={onClose}>
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="journal-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.head}>
          <h2 id="journal-modal-title" className={styles.title}>
            Trade journal
          </h2>
          <button type="button" className={styles.closeX} onClick={onClose}>
            Close
          </button>
        </div>
        <label className={styles.filter}>
          Setup
          <select
            className={styles.select}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            {setups.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </label>
        <div className={styles.scroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Date</th>
                <th>Ticker</th>
                <th>Setup</th>
                <th>R</th>
                <th>P/L $</th>
                <th>Result</th>
                <th>Rules</th>
                <th>Notes</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id}>
                  <td>{e.date}</td>
                  <td className={styles.tk}>{e.ticker}</td>
                  <td>{e.setupType}</td>
                  <td>{e.rMultiple.toFixed(2)}</td>
                  <td
                    className={
                      e.pnlDollars >= 0 ? styles.win : styles.loss
                    }
                  >
                    {e.pnlDollars.toLocaleString('en-US', {
                      style: 'currency',
                      currency: 'USD',
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </td>
                  <td className={e.result === 'win' ? styles.win : styles.loss}>
                    {e.result.toUpperCase()}
                  </td>
                  <td>{e.followedRules ? 'Yes' : 'No'}</td>
                  <td className={styles.notes}>{e.notes ?? '—'}</td>
                  <td>
                    <button
                      type="button"
                      className={styles.deleteBtn}
                      onClick={() => onDeleteEntry(e.id)}
                      aria-label={`Delete journal entry for ${e.ticker} on ${e.date}`}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && (
            <p className={styles.empty}>No entries for this filter.</p>
          )}
        </div>
      </div>
    </div>
  )
}
