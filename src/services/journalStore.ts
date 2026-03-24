import type { JournalMetrics, TradeJournalEntry } from '../domain/types'

const KEY = 'trade-ui-journal-v1'

export function loadJournal(): TradeJournalEntry[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as TradeJournalEntry[]
    if (!Array.isArray(parsed)) return []
    return parsed.map((e) => ({
      ...e,
      pnlDollars:
        typeof e.pnlDollars === 'number'
          ? e.pnlDollars
          : Math.round((e.exit - e.entry) * e.positionSize * 100) / 100,
    }))
  } catch {
    return []
  }
}

export function saveJournal(entries: TradeJournalEntry[]): void {
  localStorage.setItem(KEY, JSON.stringify(entries))
}

export function appendJournalEntry(entry: TradeJournalEntry): TradeJournalEntry[] {
  const all = loadJournal()
  const next = [entry, ...all]
  saveJournal(next)
  return next
}

export function deleteJournalEntry(entryId: string): TradeJournalEntry[] {
  const all = loadJournal()
  const next = all.filter((entry) => entry.id !== entryId)
  saveJournal(next)
  return next
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

export function computeJournalMetrics(
  entries: TradeJournalEntry[],
): JournalMetrics {
  const tday = todayISO()
  const tradesToday = entries.filter((e) => e.date === tday).length

  const lastFive = entries.slice(0, 5).map((e) => e.result)
  const wins = entries.filter((e) => e.result === 'win')
  const winRatePct =
    entries.length === 0
      ? 0
      : Math.round((wins.length / entries.length) * 1000) / 10

  const avgR =
    entries.length === 0
      ? 0
      : entries.reduce((s, e) => s + e.rMultiple, 0) / entries.length

  const totalR = entries.reduce((s, e) => s + e.rMultiple, 0)

  const bySetup = new Map<string, number>()
  for (const e of entries) {
    const prev = bySetup.get(e.setupType) ?? 0
    bySetup.set(e.setupType, prev + e.rMultiple)
  }
  let bestSetup = '—'
  let bestR = -Infinity
  for (const [k, v] of bySetup) {
    if (v > bestR) {
      bestR = v
      bestSetup = k
    }
  }

  return {
    lastFive,
    winRatePct,
    avgR: Math.round(avgR * 100) / 100,
    totalR: Math.round(totalR * 100) / 100,
    bestSetup,
    tradesToday,
  }
}
