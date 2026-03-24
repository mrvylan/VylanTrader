import { createContext } from 'react'
import type {
  DailyPlan,
  MarketBiasResult,
  MarketTrend,
  PlanHistoryEntry,
  PlanReconcilePayload,
  Position,
  TradeJournalEntry,
  TradePlan,
  TradePlanEditPatch,
  UserSettings,
  WatchlistScanDetail,
  WatchlistTableRow,
} from '../domain/types'
import type { MarketQuote } from '../providers/types'

export interface TradingDeskValue {
  settings: UserSettings
  setSettings: (s: UserSettings) => void
  watchlist: string[]
  setWatchlist: (w: string[]) => void
  market: MarketBiasResult | null
  watchlistRows: WatchlistTableRow[]
  watchlistScans: WatchlistScanDetail[]
  tradePlans: TradePlan[]
  positions: Position[]
  journal: TradeJournalEntry[]
  /** Master plan outcome history (manual reconcile rows; v1 excludes auto position_close mirror). */
  planHistory: PlanHistoryEntry[]
  reconcileTradePlan: (planId: string, payload: PlanReconcilePayload) => void
  /** Last error from create plan / plan actions (shown in UI). */
  planActionError: string | null
  dismissPlanActionError: () => void
  approvePlan: (id: string) => void
  rejectPlan: (id: string) => void
  unapprovePlan: (id: string) => void
  togglePlanAlert: (id: string) => void
  updatePlan: (id: string, patch: TradePlanEditPatch) => void
  /** Manual plan from watchlist quotes UI. */
  createManualQuotePlan: (
    ticker: string,
    patch: TradePlanEditPatch,
    bias: MarketTrend,
  ) => void
  /** Returns true if a plan was added. */
  createPlanFromScan: (detail: WatchlistScanDetail) => Promise<boolean>
  enterPlan: (id: string, opts?: { fillPrice?: number }) => Promise<void>
  updatePositionStop: (positionId: string, stop: number) => void
  takePartialPosition: (positionId: string) => void
  updatePositionNotes: (positionId: string, notes: string) => void
  closePosition: (
    positionId: string,
    exit: number,
    followedRules: boolean,
    notes?: string,
  ) => Promise<void>
  deleteJournalEntry: (entryId: string) => void
  refreshPrices: () => Promise<void>
  /** Last quotes from the most recent refresh (mock or live provider). */
  lastPrices: Record<string, number>
  /** Rich quote snapshots (prev close, volume when available). */
  lastQuotes: Record<string, MarketQuote>
  lastPriceRefreshAt: number | null
  marketDataSource:
    | 'mock'
    | 'massive'
    | 'polygon'
    | 'finnhub'
    | 'alphavantage'
    | 'layered'
    | 'layered_dev'
  /** Today’s daily plan (persisted; cleared when calendar date changes). */
  dailyPlan: DailyPlan | null
  createDailyPlan: () => void
  finalizeDailyPlan: () => void
  startTradingDay: () => void
  closeTradingDay: () => void
  updateDailyPlan: (
    id: string,
    patch: {
      selectedTickers: string[]
      maxTrades: number
      maxDailyLoss: number
      notes?: string
    },
  ) => void
  /** Shown when we fall back to demo/mock market data. */
  dataFallbackNotice: string | null
}

export const TradingDeskContext = createContext<TradingDeskValue | null>(null)
