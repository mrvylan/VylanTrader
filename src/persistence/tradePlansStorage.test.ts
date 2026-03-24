import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { loadTradePlans, saveTradePlans } from './tradePlansStorage'
import type { TradePlan } from '../domain/types'

const KEY = 'trade-ui-trade-plans-v1'
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

const minimalPlan = (): TradePlan => ({
  id: 'p1',
  ticker: 'TEST',
  setupKind: 'trend_pullback',
  setupType: 'Manual · quotes',
  bias: 'bullish',
  entry: 100,
  stop: 99,
  target: 102,
  positionSize: 10,
  riskAmount: 10,
  riskPerShare: 1,
  rMultiple: 2,
  expectedR: 2,
  status: 'watching',
  createdAt: new Date().toISOString(),
  planOrigin: 'manual_quotes',
})

describe('tradePlansStorage', () => {
  it('round-trips plans', () => {
    const plans = [minimalPlan()]
    saveTradePlans(plans)
    expect(loadTradePlans()).toEqual(plans)
  })

  it('returns [] for invalid JSON', () => {
    store[KEY] = 'not-json'
    expect(loadTradePlans()).toEqual([])
  })

  it('filters out invalid rows', () => {
    store[KEY] = JSON.stringify([minimalPlan(), { id: 'x' }])
    const out = loadTradePlans()
    expect(out).toHaveLength(1)
    expect(out[0]!.id).toBe('p1')
  })
})
