import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  appendPlanHistoryEntry,
  loadPlanHistory,
  savePlanHistory,
} from './planHistoryStorage'
import type { PlanHistoryEntry } from '../domain/types'

const KEY = 'trade-ui-plan-history-v1'
const store: Record<string, string> = {}

beforeAll(() => {
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => (k in store ? store[k]! : null),
    setItem: (k: string, v: string) => {
      store[k] = v
    },
    removeItem: (k: string) => {
      delete store[k]
    },
    clear: () => {
      for (const k of Object.keys(store)) delete store[k]
    },
    get length() {
      return Object.keys(store).length
    },
    key: (i: number) => Object.keys(store)[i] ?? null,
  } as Storage)
})

afterEach(() => {
  delete store[KEY]
})

function minimalEntry(over?: Partial<PlanHistoryEntry>): PlanHistoryEntry {
  const base: PlanHistoryEntry = {
    id: 'h1',
    reconciledAt: new Date().toISOString(),
    tradePlanId: 'p1',
    ticker: 'TEST',
    setupType: 'Breakout',
    setupKind: 'breakout_retest',
    bias: 'bullish',
    entry: 100,
    stop: 99,
    target: 102,
    positionSize: 10,
    priorStatus: 'watching',
    result: 'no_trade',
    followedRules: true,
    source: 'manual_reconcile',
  }
  return { ...base, ...over }
}

describe('planHistoryStorage', () => {
  it('round-trips entries', () => {
    const entries = [minimalEntry()]
    savePlanHistory(entries)
    expect(loadPlanHistory()).toEqual(entries)
  })

  it('returns [] for invalid JSON', () => {
    store[KEY] = 'not-json'
    expect(loadPlanHistory()).toEqual([])
  })

  it('filters out invalid rows', () => {
    store[KEY] = JSON.stringify([minimalEntry(), { id: 'x' }])
    const out = loadPlanHistory()
    expect(out).toHaveLength(1)
    expect(out[0]!.id).toBe('h1')
  })

  it('append prepends and persists', () => {
    savePlanHistory([minimalEntry({ id: 'a' })])
    const next = appendPlanHistoryEntry(minimalEntry({ id: 'b', tradePlanId: 'p2' }))
    expect(next).toHaveLength(2)
    expect(next[0]!.id).toBe('b')
    expect(loadPlanHistory()[0]!.id).toBe('b')
  })
})
