import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
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
import {
  createDefaultMarketDataProvider,
  getMarketDataSourceLabel,
} from '../providers/createMarketDataProvider'
import type { MarketDataProvider, MarketQuote } from '../providers/types'
import { deliverAlert, evaluatePlanAlerts } from '../services/alerts'
import { sparklineDataUrl } from '../services/chartSnapshot'
import {
  appendJournalEntry,
  deleteJournalEntry as deleteJournalEntryFromStore,
  loadJournal,
} from '../services/journalStore'
import { closes } from '../services/indicators'
import { sharesFromRisk } from '../services/planner'
import {
  formatMorningPlanRejection,
  tryBuildMorningTradePlan,
} from '../services/scanner'
import { buildManualQuoteTradePlan } from '../services/buildManualQuoteTradePlan'
import {
  whyCannotApprove,
} from '../services/dailyPlanApproval'
import { generateUptrendBreakoutDailyBars } from '../demo/demoPassingDailyBars'
import {
  loadDailyPlan,
  saveDailyPlan,
} from '../persistence/dailyPlanStorage'
import {
  loadPlanHistory,
  savePlanHistory,
} from '../persistence/planHistoryStorage'
import { loadTradePlans, saveTradePlans } from '../persistence/tradePlansStorage'
import {
  DEFAULT_SETTINGS,
  DEFAULT_WATCHLIST,
  loadOpenPositions,
  loadSettings,
  loadWatchlist,
  saveOpenPositions,
  saveSettings,
  saveWatchlist,
} from '../persistence/settingsStorage'
import {
  TradingDeskContext,
  type TradingDeskValue,
} from './tradingDeskContext'
import {
  applyMarkToMarket,
  buildOpenPositionFromPlan,
  closePositionMetrics,
  withPartialShares,
  withUpdatedStop,
} from '../services/positionState'

type DemoDataNoticeConsumer = {
  consumeDemoDataNotice?: () => string | null
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function loadInitialTradePlansAndDailyPlan(): {
  tradePlans: TradePlan[]
  dailyPlan: DailyPlan | null
} {
  const tradePlans = loadTradePlans()
  const ids = new Set(tradePlans.map((p) => p.id))
  let dailyPlan = loadDailyPlan()
  if (
    dailyPlan &&
    dailyPlan.approvedPlans.some((id) => !ids.has(id))
  ) {
    dailyPlan = {
      ...dailyPlan,
      approvedPlans: dailyPlan.approvedPlans.filter((id) => ids.has(id)),
    }
  }
  return { tradePlans, dailyPlan }
}

export function TradingDeskProvider({
  children,
  provider: providerProp,
}: {
  children: ReactNode
  provider?: MarketDataProvider
}) {
  const providerRef = useRef<MarketDataProvider>(
    providerProp ?? createDefaultMarketDataProvider(),
  )
  const settingsRef = useRef<UserSettings>(DEFAULT_SETTINGS)
  const initialDesk = loadInitialTradePlansAndDailyPlan()
  const tradePlansRef = useRef<TradePlan[]>(initialDesk.tradePlans)
  const positionsRef = useRef<Position[]>([])
  const lastPricesRef = useRef<Record<string, number>>({})
  const lastQuotesRef = useRef<Record<string, MarketQuote>>({})
  const watchlistRef = useRef<string[]>(DEFAULT_WATCHLIST)
  const marketRef = useRef<MarketBiasResult | null>(null)
  const [settings, setSettingsState] = useState<UserSettings>(DEFAULT_SETTINGS)
  const [watchlist, setWatchlistState] = useState<string[]>(DEFAULT_WATCHLIST)
  const [market] = useState<MarketBiasResult | null>(null)
  const [watchlistRows] = useState<WatchlistTableRow[]>([])
  const [watchlistScans] = useState<WatchlistScanDetail[]>([])
  const [tradePlans, setTradePlans] = useState<TradePlan[]>(
    initialDesk.tradePlans,
  )
  const [positions, setPositions] = useState<Position[]>([])
  const [journal, setJournal] = useState<TradeJournalEntry[]>([])
  const [planHistory, setPlanHistory] = useState<PlanHistoryEntry[]>(() =>
    loadPlanHistory(),
  )
  const [planActionError, setPlanActionError] = useState<string | null>(null)
  const [lastPrices, setLastPrices] = useState<Record<string, number>>({})
  const [lastQuotes, setLastQuotes] = useState<Record<string, MarketQuote>>({})
  const [lastPriceRefreshAt, setLastPriceRefreshAt] = useState<number | null>(
    null,
  )
  const [dailyPlan, setDailyPlan] = useState<DailyPlan | null>(
    initialDesk.dailyPlan,
  )
  const dailyPlanRef = useRef<DailyPlan | null>(null)
  const alertDedupe = useRef(new Set<string>())

  const [dataFallbackNotice, setDataFallbackNotice] = useState<string | null>(
    null,
  )

  useEffect(() => {
    settingsRef.current = settings
  }, [settings])

  useEffect(() => {
    watchlistRef.current = watchlist
  }, [watchlist])

  useEffect(() => {
    tradePlansRef.current = tradePlans
    saveTradePlans(tradePlans)
  }, [tradePlans])

  useEffect(() => {
    positionsRef.current = positions
  }, [positions])

  useEffect(() => {
    lastPricesRef.current = lastPrices
  }, [lastPrices])

  useEffect(() => {
    lastQuotesRef.current = lastQuotes
  }, [lastQuotes])

  useEffect(() => {
    marketRef.current = market
  }, [market])

  useEffect(() => {
    dailyPlanRef.current = dailyPlan
  }, [dailyPlan])

  useEffect(() => {
    saveDailyPlan(dailyPlan)
  }, [dailyPlan])

  useEffect(() => {
    setSettingsState(loadSettings())
    setWatchlistState(loadWatchlist())
    setJournal(loadJournal())
    setPositions(loadOpenPositions())
  }, [])

  useEffect(() => {
    savePlanHistory(planHistory)
  }, [planHistory])

  const setSettings = useCallback((s: UserSettings) => {
    setSettingsState(s)
    saveSettings(s)
  }, [])

  const setWatchlist = useCallback((w: string[]) => {
    const next = w.map((t) => t.trim().toUpperCase()).filter(Boolean).slice(0, 10)
    setWatchlistState(next)
    saveWatchlist(next)
  }, [])

  const refreshPrices = useCallback(async () => {
    setDataFallbackNotice(null)
    const tickers = new Set<string>()
    watchlistRef.current.forEach((t) => tickers.add(t))
    positionsRef.current.forEach((p) => tickers.add(p.ticker))
    tradePlansRef.current.forEach((p) => tickers.add(p.ticker))
    tickers.add('SPY')
    tickers.add('QQQ')

    const prevSnapshot = { ...lastPricesRef.current }
    const prevQuotes = { ...lastQuotesRef.current }
    const next: Record<string, number> = { ...prevSnapshot }
    const nextQuotes: Record<string, MarketQuote> = { ...prevQuotes }

    for (const t of tickers) {
      try {
        const q = await providerRef.current.getQuote(t)
        next[t] = q.last
        nextQuotes[t] = q
      } catch {
        try {
          const lp = await providerRef.current.getLastPrice(t)
          next[t] = lp
          nextQuotes[t] = { ...(prevQuotes[t] ?? {}), last: lp }
        } catch {
          /* keep prior snapshot for this ticker */
        }
      }
    }

    lastPricesRef.current = next
    lastQuotesRef.current = nextQuotes
    setLastPrices(next)
    setLastQuotes(nextQuotes)

    const st = settingsRef.current
    for (const plan of tradePlansRef.current) {
      const lp = next[plan.ticker]
      const pp = prevSnapshot[plan.ticker] ?? lp
      if (lp == null || pp == null) continue
      if (plan.status === 'entered' || plan.status === 'closed') continue
      const alerts = evaluatePlanAlerts(plan, lp, pp)
      for (const a of alerts) {
        const key = `${plan.id}:${a.kind}`
        if (alertDedupe.current.has(key)) continue
        alertDedupe.current.add(key)
        await deliverAlert('Trade UI', a.message, {
          sound: st.alertSound,
          webhookUrl: st.alertWebhookUrl,
        })
      }
    }

    setPositions((ps) => {
      const mapped = ps.map((p) => {
        if (p.status !== 'open') return p
        const q = next[p.ticker]
        if (q == null) return p
        const updated = applyMarkToMarket(p, q)
        if (import.meta.env.DEV) {
          console.debug('[Trade UI] Position mark', {
            ticker: updated.ticker,
            entryPrice: updated.entryPrice,
            currentPrice: updated.currentPrice,
            stopPrice: updated.stopPrice,
            shares: updated.shares,
            riskPerShare: updated.initialRiskPerShare,
            initialRiskDollars: updated.initialRiskDollars,
            unrealizedPnL: updated.unrealizedPnL,
            unrealizedR: updated.unrealizedR,
          })
        }
        return updated
      })
      saveOpenPositions(mapped)
      return mapped
    })

    setLastPriceRefreshAt(Date.now())

    const c = providerRef.current as DemoDataNoticeConsumer
    const notice = typeof c.consumeDemoDataNotice === 'function' ? c.consumeDemoDataNotice() : null
    if (notice) setDataFallbackNotice(notice)
  }, [])

  useEffect(() => {
    const t = window.setInterval(() => {
      void refreshPrices()
    }, 45_000)
    return () => window.clearInterval(t)
  }, [refreshPrices])

  useEffect(() => {
    void refreshPrices()
  }, [positions.length, refreshPrices])

  const dismissPlanActionError = useCallback(() => {
    setPlanActionError(null)
  }, [])

  const createDailyPlan = useCallback(() => {
    setDailyPlan((existing) => {
      if (
        existing?.status === 'finalized' ||
        existing?.status === 'active'
      ) {
        return existing
      }
      const wl = watchlistRef.current
      const st = settingsRef.current
      const m = marketRef.current
      const next: DailyPlan = {
        id: `daily-${Date.now()}`,
        date: todayISO(),
        marketBias: m?.marketTrend ?? 'neutral',
        regime: m?.regime ?? 'chop',
        selectedTickers: [...wl],
        approvedPlans: [],
        maxTrades: st.maxTradesPerDay,
        maxDailyLoss: st.dailyMaxLoss,
        notes: '',
        status: 'draft',
        createdAt: new Date().toISOString(),
      }
      return next
    })
  }, [])

  const finalizeDailyPlan = useCallback(() => {
    setDailyPlan((dp) =>
      dp?.status === 'draft' ? { ...dp, status: 'finalized' } : dp,
    )
  }, [])

  const startTradingDay = useCallback(() => {
    setDailyPlan((dp) =>
      dp?.status === 'finalized' ? { ...dp, status: 'active' } : dp,
    )
  }, [])

  const closeTradingDay = useCallback(() => {
    setDailyPlan((dp) =>
      dp?.status === 'active' ? { ...dp, status: 'closed' } : dp,
    )
  }, [])

  const updateDailyPlan = useCallback(
    (
      id: string,
      patch: {
        selectedTickers: string[]
        maxTrades: number
        maxDailyLoss: number
        notes?: string
      },
    ) => {
      setDailyPlan((dp) =>
        dp?.id === id
          ? {
              ...dp,
              selectedTickers: patch.selectedTickers,
              maxTrades: patch.maxTrades,
              maxDailyLoss: patch.maxDailyLoss,
              notes: patch.notes,
            }
          : dp,
      )
    },
    [],
  )

  const approvePlan = useCallback((id: string) => {
    const plan = tradePlansRef.current.find((p) => p.id === id)
    const dp = dailyPlanRef.current
    if (!plan || plan.status !== 'watching') return
    if (dp && dp.status === 'closed') return
    if (dp && whyCannotApprove(dp, tradePlansRef.current, plan) !== 'none') {
      return
    }

    setTradePlans((plans) => {
      const next = plans.map((p) =>
        p.id === id && p.status === 'watching'
          ? { ...p, status: 'approved' as const }
          : p,
      )
      tradePlansRef.current = next
      return next
    })
    setDailyPlan((d) => {
      if (
        !d ||
        (d.status !== 'draft' &&
          d.status !== 'finalized' &&
          d.status !== 'active')
      ) {
        return d
      }
      if (d.approvedPlans.includes(id)) return d
      const next = { ...d, approvedPlans: [...d.approvedPlans, id] }
      dailyPlanRef.current = next
      return next
    })
  }, [])

  const rejectPlan = useCallback((id: string) => {
    if (dailyPlanRef.current?.status === 'closed') return

    setTradePlans((plans) => {
      const next = plans.map((p) =>
        p.id === id &&
        (p.status === 'watching' || p.status === 'approved')
          ? { ...p, status: 'rejected' as const }
          : p,
      )
      tradePlansRef.current = next
      return next
    })
    setDailyPlan((dp) =>
      dp
        ? {
            ...dp,
            approvedPlans: dp.approvedPlans.filter((x) => x !== id),
          }
        : dp,
    )
  }, [])

  const rejectPositionPlan = useCallback(
    (positionId: string, reason?: string) => {
      if (dailyPlanRef.current?.status === 'closed') return
      const pos = positionsRef.current.find((p) => p.id === positionId)
      if (!pos || pos.status !== 'open') return

      const planId = pos.tradePlanId
      const r = reason?.trim()
      setPlanActionError(null)

      setTradePlans((plans) => {
        const next = plans.map((p) => {
          if (p.id !== planId) return p
          if (
            p.status !== 'watching' &&
            p.status !== 'approved' &&
            p.status !== 'entered'
          ) {
            return p
          }
          return {
            ...p,
            status: 'rejected' as const,
            notes: r ? r : p.notes,
          }
        })
        tradePlansRef.current = next
        return next
      })

      setDailyPlan((dp) =>
        dp
          ? {
              ...dp,
              approvedPlans: dp.approvedPlans.filter((x) => x !== planId),
            }
          : dp,
      )

      // Close the open position so it disappears from ActivePositions.
      // We store reason in Position.notes as well (even though UI hides closed positions).
      setPositions((ps) => {
        const next = ps.map((p) =>
          p.id === positionId && p.status === 'open'
            ? {
                ...p,
                status: 'closed' as const,
                closedAt: Date.now(),
                notes: r ? r : p.notes,
                realizedPnL: p.realizedPnL ?? 0,
                realizedR: p.realizedR ?? null,
              }
            : p,
        )
        saveOpenPositions(next)
        return next
      })
    },
    [],
  )

  const unapprovePlan = useCallback((id: string) => {
    if (dailyPlanRef.current?.status === 'closed') return

    setTradePlans((plans) => {
      const next = plans.map((p) =>
        p.id === id && p.status === 'approved'
          ? { ...p, status: 'watching' as const }
          : p,
      )
      tradePlansRef.current = next
      return next
    })
    setDailyPlan((dp) =>
      dp
        ? {
            ...dp,
            approvedPlans: dp.approvedPlans.filter((x) => x !== id),
          }
        : dp,
    )
  }, [])

  const togglePlanAlert = useCallback((id: string) => {
    setTradePlans((plans) => {
      const next = plans.map((p) =>
        p.id === id
          ? { ...p, alertEnabled: p.alertEnabled === false }
          : p,
      )
      tradePlansRef.current = next
      return next
    })
  }, [])

  const updatePlan = useCallback((id: string, patch: TradePlanEditPatch) => {
    const st = settingsRef.current
    setTradePlans((plans) => {
      const next = plans.map((p) => {
        if (p.id !== id) return p
        const entry = patch.entry
        const stop = patch.stop
        const target = patch.target
        const short = p.bias === 'bearish'
        const riskPerShare = short ? stop - entry : entry - stop
        if (riskPerShare <= 0) return p
        const fromPatch =
          patch.positionSize != null && patch.positionSize >= 1
            ? Math.floor(patch.positionSize)
            : null
        const shares =
          fromPatch ??
          (sharesFromRisk(st.riskPerTrade, entry, stop) ?? 0)
        if (shares <= 0) return p
        const rewardPerShare = short ? entry - target : target - entry
        if (rewardPerShare <= 0) return p
        const rMultiple =
          Math.round((rewardPerShare / riskPerShare) * 100) / 100
        const expectedR =
          riskPerShare > 0 ? rewardPerShare / riskPerShare : 0
        return {
          ...p,
          entry,
          stop,
          target,
          notes: patch.notes !== undefined ? patch.notes : p.notes,
          positionSize: shares,
          riskAmount: Math.round(shares * riskPerShare * 100) / 100,
          riskPerShare,
          rMultiple: Number.isFinite(rMultiple) ? rMultiple : p.rMultiple,
          expectedR: Number.isFinite(expectedR)
            ? Math.round(expectedR * 100) / 100
            : p.expectedR,
        }
      })
      tradePlansRef.current = next
      return next
    })
  }, [])

  const createManualQuotePlan = useCallback(
    (
      ticker: string,
      patch: TradePlanEditPatch,
      bias: MarketTrend,
    ) => {
      setPlanActionError(null)
      const shares =
        patch.positionSize != null && patch.positionSize >= 1
          ? Math.floor(patch.positionSize)
          : 0
      if (shares < 1) return
      const plan = buildManualQuoteTradePlan(ticker, {
        entry: patch.entry,
        stop: patch.stop,
        target: patch.target,
        positionSize: shares,
        notes: patch.notes,
        bias: bias === 'neutral' ? 'bullish' : bias,
      })
      setTradePlans((plans) => {
        const next = [...plans, plan]
        tradePlansRef.current = next
        return next
      })
    },
    [],
  )

  const createPlanFromScan = useCallback(
    async (scan: WatchlistScanDetail): Promise<boolean> => {
      setPlanActionError(null)
      const prepScore = scan.score ?? scan.debug?.score
      if (!scan.candidate || prepScore == null) {
        setPlanActionError(
          'No scanner setup data for this symbol — the watchlist row has no candidate.',
        )
        return false
      }

      const sym = scan.ticker.toUpperCase()

      try {
        const useSyntheticBars = scan.useSyntheticBarsForEngine === true
        const bars = useSyntheticBars
          ? generateUptrendBreakoutDailyBars()
          : await providerRef.current.getDailyBars(sym)
        const m = marketRef.current
        const mb: MarketBiasResult =
          m ?? {
            marketTrend: scan.marketBias,
            regime: 'chop',
            spyTrend: 'flat',
            qqqTrend: 'flat',
            volatility: 'medium',
          }
        const result = tryBuildMorningTradePlan(
          sym,
          bars,
          settingsRef.current,
          scan.marketBias,
          mb,
          `plan-${sym}-${Date.now()}`,
          {
            scoreTime: new Date(),
          },
        )
        if (!result.ok) {
          setPlanActionError(formatMorningPlanRejection(result))
          return false
        }

        setTradePlans((plans) => {
          const filtered = plans.filter(
            (p) =>
              !(
                p.ticker.toUpperCase() === sym &&
                p.status === 'watching'
              ),
          )
          const next = [...filtered, result.plan]
          tradePlansRef.current = next
          return next
        })
        return true
      } catch (e) {
        setPlanActionError(
          e instanceof Error
            ? e.message
            : 'Could not load bars for this symbol.',
        )
        return false
      }
    },
    [],
  )

  const enterPlan = useCallback(
    async (id: string, opts?: { fillPrice?: number }) => {
      setPlanActionError(null)
      const plan = tradePlansRef.current.find((p) => p.id === id)
      if (!plan) {
        setPlanActionError('No trade plan found for that id.')
        return
      }
      if (plan.status !== 'approved') {
        setPlanActionError(
          plan.status === 'entered'
            ? 'This setup is already marked entered.'
            : 'Approve the setup in Daily Plan before marking entered.',
        )
        return
      }

      const dp = dailyPlanRef.current
      if (dp?.status === 'closed') {
        setPlanActionError('Trading day is closed — reopen the daily plan to enter.')
        return
      }

      try {
        const bars = await providerRef.current.getDailyBars(plan.ticker)
        const c = closes(bars).slice(-48)
        const entryChart = sparklineDataUrl(c)

        const px = await providerRef.current.getLastPrice(plan.ticker)
        const quoteIsSimulated = getMarketDataSourceLabel() === 'mock'

        const pos = buildOpenPositionFromPlan(plan, {
          id: `pos-${plan.id}`,
          fillPrice: opts?.fillPrice,
          quoteIsSimulated,
          currentPrice: px,
          chartEntryDataUrl: entryChart,
        })

        if (!pos) {
          setPlanActionError(
            'Cannot open position: fill must be above stop and stop below entry (check fill price vs plan).',
          )
          return
        }

        console.info('[Trade UI] Position opened', {
          ticker: pos.ticker,
          tradePlanId: pos.tradePlanId,
          entryPrice: pos.entryPrice,
          currentPrice: pos.currentPrice,
          shares: pos.shares,
          initialRiskDollars: pos.initialRiskDollars,
          quoteIsSimulated: pos.quoteIsSimulated,
        })

        setPositions((ps) => {
          const next = [...ps.filter((p) => p.tradePlanId !== plan.id), pos]
          saveOpenPositions(next)
          return next
        })
        setTradePlans((plans) => {
          const next = plans.map((p) =>
            p.id === id ? { ...p, status: 'entered' as const } : p,
          )
          tradePlansRef.current = next
          return next
        })
      } catch (e) {
        setPlanActionError(
          e instanceof Error
            ? e.message
            : 'Could not load bars or last price for this symbol.',
        )
      }
    },
    [],
  )

  const closePosition = useCallback(
    async (positionId: string, exit: number, followedRules: boolean, notes?: string) => {
      const pos = positionsRef.current.find((p) => p.id === positionId)
      if (!pos || pos.status !== 'open') return

      const plan = tradePlansRef.current.find((p) => p.id === pos.tradePlanId)
      const setupType = plan?.setupType ?? 'Unknown'
      const regime = marketRef.current?.regime

      const bars = await providerRef.current.getDailyBars(pos.ticker)
      const c = closes(bars).slice(-48)
      const exitChart = sparklineDataUrl(c)

      const { realizedPnL, realizedR } = closePositionMetrics(pos, exit)
      const rMult = realizedR ?? 0
      const result = realizedPnL >= 0 ? 'win' : 'loss'

      console.info('[Trade UI] Position closed', {
        ticker: pos.ticker,
        entryPrice: pos.entryPrice,
        exitPrice: exit,
        shares: pos.shares,
        initialRiskDollars: pos.initialRiskDollars,
        realizedPnL,
        realizedR: realizedR,
      })

      const jr: TradeJournalEntry = {
        id: `jr-${Date.now()}`,
        date: todayISO(),
        ticker: pos.ticker,
        setupType,
        setupKind: plan?.setupKind,
        regime,
        planScore: plan?.score,
        entry: pos.entryPrice,
        exit,
        stop: pos.stopPrice,
        target: pos.targetPrice,
        positionSize: pos.shares,
        pnlDollars: realizedPnL,
        rMultiple: Math.round(rMult * 100) / 100,
        result,
        followedRules,
        notes,
        chartEntryDataUrl: pos.chartEntryDataUrl,
        chartExitDataUrl: exitChart,
      }

      const nextJournal = appendJournalEntry(jr)
      setJournal(nextJournal)

      setTradePlans((plans) => {
        const next = plans.map((p) =>
          p.id === pos.tradePlanId ? { ...p, status: 'closed' as const } : p,
        )
        tradePlansRef.current = next
        return next
      })

      setPositions((ps) => {
        const next = ps.filter((p) => p.id !== positionId)
        saveOpenPositions(next)
        return next
      })
    },
    [],
  )

  const deleteJournalEntry = useCallback((entryId: string) => {
    const nextJournal = deleteJournalEntryFromStore(entryId)
    setJournal(nextJournal)
  }, [])

  const updatePositionStop = useCallback((positionId: string, stop: number) => {
    setPositions((ps) => {
      const next = ps.map((p) => {
        if (p.id !== positionId || p.status !== 'open') return p
        const moved = withUpdatedStop(p, stop)
        return applyMarkToMarket(moved, moved.currentPrice)
      })
      saveOpenPositions(next)
      return next
    })
  }, [])

  const takePartialPosition = useCallback((positionId: string) => {
    setPositions((ps) => {
      const next = ps.map((p) => {
        if (p.id !== positionId || p.status !== 'open') return p
        if (p.shares <= 1) return p
        const newSize = Math.max(1, Math.floor(p.shares / 2))
        return withPartialShares(p, newSize)
      })
      saveOpenPositions(next)
      return next
    })
  }, [])

  const updatePositionNotes = useCallback(
    (positionId: string, notes: string) => {
      setPositions((ps) => {
        const next = ps.map((p) =>
          p.id === positionId ? { ...p, notes } : p,
        )
        saveOpenPositions(next)
        return next
      })
    },
    [],
  )

  /**
   * Record a final outcome for a plan without going through ActivePositions.
   * Does not write TradeJournalEntry (v1); see PlanHistoryEntry.source.
   */
  const reconcileTradePlan = useCallback(
    (planId: string, payload: PlanReconcilePayload) => {
      setPlanActionError(null)
      const plan = tradePlansRef.current.find((p) => p.id === planId)
      if (!plan) {
        setPlanActionError('Plan not found.')
        return
      }
      if (plan.status === 'closed') {
        setPlanActionError('Plan is already closed.')
        return
      }
      const hasOpenPosition = positionsRef.current.some(
        (p) => p.tradePlanId === planId && p.status === 'open',
      )
      if (plan.status === 'entered' && hasOpenPosition) {
        setPlanActionError(
          'Close the open position from Active positions first — outcome is recorded there.',
        )
        return
      }
      const allowedPrior = ['watching', 'approved', 'rejected', 'entered'] as const
      if (!allowedPrior.includes(plan.status as (typeof allowedPrior)[number])) {
        setPlanActionError('This plan cannot be reconciled from here.')
        return
      }

      let pnlDollars = payload.pnlDollars
      let rMultiple = payload.rMultiple
      const ex = payload.exitPrice
      if (ex != null && Number.isFinite(ex)) {
        const shares = plan.positionSize
        const isShort = plan.bias === 'bearish'
        const rawPnl = isShort
          ? (plan.entry - ex) * shares
          : (ex - plan.entry) * shares
        if (pnlDollars == null || !Number.isFinite(pnlDollars)) {
          pnlDollars = Math.round(rawPnl * 100) / 100
        }
        if (
          (rMultiple == null || !Number.isFinite(rMultiple)) &&
          plan.riskAmount > 0
        ) {
          rMultiple = Math.round((pnlDollars / plan.riskAmount) * 100) / 100
        }
      }

      const row: PlanHistoryEntry = {
        id: `ph-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        reconciledAt: new Date().toISOString(),
        tradePlanId: plan.id,
        ticker: plan.ticker,
        setupType: plan.setupType,
        setupKind: plan.setupKind,
        bias: plan.bias,
        entry: plan.entry,
        stop: plan.stop,
        target: plan.target,
        positionSize: plan.positionSize,
        priorStatus: plan.status,
        result: payload.result,
        followedRules: payload.followedRules,
        notes: payload.notes,
        exitPrice: payload.exitPrice,
        pnlDollars,
        rMultiple,
        source: 'manual_reconcile',
      }

      setPlanHistory((prev) => [row, ...prev])

      setTradePlans((plans) => {
        const next = plans.map((p) =>
          p.id === planId ? { ...p, status: 'closed' as const } : p,
        )
        tradePlansRef.current = next
        return next
      })
      setDailyPlan((dp) => {
        if (!dp) return dp
        const next = {
          ...dp,
          approvedPlans: dp.approvedPlans.filter((x) => x !== planId),
        }
        dailyPlanRef.current = next
        return next
      })
    },
    [],
  )

  const clearPlanHistory = useCallback(() => {
    setPlanHistory([])
  }, [])

  const value = useMemo<TradingDeskValue>(
    () => ({
      settings,
      setSettings,
      watchlist,
      setWatchlist,
      market,
      watchlistRows,
      watchlistScans,
      tradePlans,
      positions,
      journal,
      planHistory,
      reconcileTradePlan,
      clearPlanHistory,
      planActionError,
      dismissPlanActionError,
      approvePlan,
      rejectPlan,
      unapprovePlan,
      rejectPositionPlan,
      togglePlanAlert,
      updatePlan,
      createManualQuotePlan,
      createPlanFromScan,
      enterPlan,
      updatePositionStop,
      takePartialPosition,
      updatePositionNotes,
      closePosition,
      deleteJournalEntry,
      refreshPrices,
      lastPrices,
      lastQuotes,
      lastPriceRefreshAt,
      marketDataSource: getMarketDataSourceLabel(),
      dataFallbackNotice,
      dailyPlan,
      createDailyPlan,
      finalizeDailyPlan,
      startTradingDay,
      closeTradingDay,
      updateDailyPlan,
    }),
    [
      settings,
      setSettings,
      watchlist,
      setWatchlist,
      market,
      watchlistRows,
      watchlistScans,
      tradePlans,
      positions,
      journal,
      planHistory,
      reconcileTradePlan,
      clearPlanHistory,
      planActionError,
      dismissPlanActionError,
      approvePlan,
      rejectPlan,
      unapprovePlan,
      togglePlanAlert,
      updatePlan,
      createManualQuotePlan,
      createPlanFromScan,
      enterPlan,
      updatePositionStop,
      takePartialPosition,
      updatePositionNotes,
      closePosition,
      deleteJournalEntry,
      refreshPrices,
      lastPrices,
      lastQuotes,
      lastPriceRefreshAt,
      dailyPlan,
      createDailyPlan,
      finalizeDailyPlan,
      startTradingDay,
      closeTradingDay,
      updateDailyPlan,
      dataFallbackNotice,
    ],
  )

  return (
    <TradingDeskContext.Provider value={value}>{children}</TradingDeskContext.Provider>
  )
}
