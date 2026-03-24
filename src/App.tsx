import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import type { XFeedResponse } from './services/xFeed'
import { ActivePositions } from './components/ActivePositions'
import { DailyPlanPanel } from './components/DailyPlanPanel'
import { DeskHeader } from './components/DeskHeader'
import { EditDailyPlanModal } from './components/EditDailyPlanModal'
import { JournalMini } from './components/JournalMini'
import { JournalModal } from './components/JournalModal'
import { PricesModal } from './components/PricesModal'
import { MarketCard } from './components/MarketCard'
import { RiskCard } from './components/RiskCard'
import { SettingsModal } from './components/SettingsModal'
import { EditPlanModal } from './components/EditPlanModal'
import { ManualQuotePlanModal } from './components/ManualQuotePlanModal'
import { PlanHistoryPanel } from './components/PlanHistoryPanel'
import { ReconcilePlanModal } from './components/ReconcilePlanModal'
import { TradeCard } from './components/TradeCard'
import { WatchlistSetupDrawer } from './components/WatchlistSetupDrawer'
import { WatchlistQuotesCard } from './components/WatchlistQuotesCard'
import { WatchlistTable } from './components/WatchlistTable'
import { XFeedPanel } from './components/XFeedPanel'
import { XFeedSummaryCard } from './components/XFeedSummaryCard'
import type { WatchlistScanDetail } from './domain/types'
import {
  loadWatchlistTableVisible,
  saveWatchlistTableVisible,
} from './persistence/watchlistTableUiStorage'
import {
  loadXFeedLoadEnabled,
  saveXFeedLoadEnabled,
} from './persistence/xFeedUiStorage'
import { TradingDeskProvider } from './state/TradingDeskProvider'
import {
  useJournalMetrics,
  useRiskPanelData,
  useTradingDesk,
} from './state/tradingDeskHooks'
import styles from './App.module.css'

function Desk() {
  const {
    market,
    watchlistRows,
    watchlistScans,
    tradePlans,
    positions,
    journal,
    approvePlan,
    rejectPlan,
    unapprovePlan,
    togglePlanAlert,
    updatePlan,
    createManualQuotePlan,
    createPlanFromScan,
    planActionError,
    dismissPlanActionError,
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
    marketDataSource,
    settings,
    setSettings,
    watchlist,
    setWatchlist,
    dailyPlan,
    createDailyPlan,
    finalizeDailyPlan,
    startTradingDay,
    closeTradingDay,
    updateDailyPlan,
    dataFallbackNotice,
    planHistory,
    reconcileTradePlan,
  } = useTradingDesk()

  const metrics = useJournalMetrics()
  const risk = useRiskPanelData()

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsResetToken, setSettingsResetToken] = useState(0)
  const [journalOpen, setJournalOpen] = useState(false)
  const [pricesOpen, setPricesOpen] = useState(false)
  const [setupTicker, setSetupTicker] = useState<string | null>(null)
  const [editPlanId, setEditPlanId] = useState<string | null>(null)
  const [createPlanBusy, setCreatePlanBusy] = useState(false)
  const [editDailyPlanOpen, setEditDailyPlanOpen] = useState(false)
  const [xFeedData, setXFeedData] = useState<XFeedResponse | null>(null)
  const [xFeedLoadEnabled, setXFeedLoadEnabled] = useState(loadXFeedLoadEnabled)
  const [watchlistTableVisible, setWatchlistTableVisible] = useState(
    loadWatchlistTableVisible,
  )
  const [quotePlanUi, setQuotePlanUi] = useState<
    null | { kind: 'create'; ticker: string } | { kind: 'edit'; planId: string }
  >(null)
  const [deskView, setDeskView] = useState<'desk' | 'history'>('desk')
  const [reconcilePlanId, setReconcilePlanId] = useState<string | null>(null)
  const onXFeedLoadEnabledChange = useCallback((enabled: boolean) => {
    saveXFeedLoadEnabled(enabled)
    setXFeedLoadEnabled(enabled)
    if (!enabled) setXFeedData(null)
  }, [])

  const scanByTicker = useMemo(() => {
    const m = new Map<string, WatchlistScanDetail>()
    for (const s of watchlistScans) m.set(s.ticker, s)
    return m
  }, [watchlistScans])

  const setupDetail: WatchlistScanDetail | null = useMemo(() => {
    if (!setupTicker) return null
    const hit = scanByTicker.get(setupTicker)
    if (hit) return hit
    return {
      ticker: setupTicker,
      candidate: null,
      marketBias: market?.marketTrend ?? 'neutral',
      summary:
        'No saved scan row for this symbol yet. Use watchlist quotes to add manual plans, or open prices to refresh quotes.',
    }
  }, [setupTicker, scanByTicker, market])
  const editPlan = editPlanId
    ? tradePlans.find((p) => p.id === editPlanId) ?? null
    : null

  const handleEnterPlan = useCallback(
    async (planId: string) => {
      const plan = tradePlans.find((p) => p.id === planId)
      const def = plan != null ? plan.entry.toFixed(2) : ''
      const raw = window.prompt(
        `Fill price (leave blank to use plan entry${def ? ` $${def}` : ''})`,
        def,
      )
      if (raw === null) return
      const trimmed = raw.trim()
      const fillPrice =
        trimmed === '' ? undefined : Number(trimmed)
      if (fillPrice !== undefined && !Number.isFinite(fillPrice)) return
      await enterPlan(planId, { fillPrice })
    },
    [enterPlan, tradePlans],
  )

  const executionPlans = useMemo(
    () =>
      tradePlans.filter(
        (p) => p.status === 'approved' || p.status === 'entered',
      ),
    [tradePlans],
  )

  const manualQuotePlans = useMemo(
    () => tradePlans.filter((p) => p.planOrigin === 'manual_quotes'),
    [tradePlans],
  )

  useEffect(() => {
    if (quotePlanUi?.kind !== 'edit') return
    if (!tradePlans.some((p) => p.id === quotePlanUi.planId)) {
      setQuotePlanUi(null)
    }
  }, [quotePlanUi, tradePlans])

  const quoteModalTicker =
    quotePlanUi == null
      ? ''
      : quotePlanUi.kind === 'create'
        ? quotePlanUi.ticker
        : (tradePlans.find((p) => p.id === quotePlanUi.planId)?.ticker ?? '')

  const quoteEditPlan =
    quotePlanUi?.kind === 'edit'
      ? tradePlans.find((p) => p.id === quotePlanUi.planId) ?? null
      : null

  const quoteModalOpen =
    quotePlanUi != null &&
    (quotePlanUi.kind === 'create' ||
      (quotePlanUi.kind === 'edit' && quoteEditPlan != null))

  const openReconcile = useCallback((planId: string) => {
    dismissPlanActionError()
    setReconcilePlanId(planId)
  }, [dismissPlanActionError])

  const reconcilePlan = reconcilePlanId
    ? tradePlans.find((p) => p.id === reconcilePlanId) ?? null
    : null

  const quoteLastForModal = useMemo(() => {
    const sym = quoteModalTicker.toUpperCase()
    const q = lastQuotes[sym]
    const last = q?.last
    if (last == null || !Number.isFinite(last)) return null
    return last
  }, [quoteModalTicker, lastQuotes])

  return (
    <div className={styles.deskRoot}>
      <DeskHeader
        planActionError={planActionError}
        onDismissPlanActionError={dismissPlanActionError}
        marketDataSource={marketDataSource}
        dataFallbackNotice={dataFallbackNotice}
        onOpenSettings={() => {
          setSettingsResetToken((t) => t + 1)
          setSettingsOpen(true)
        }}
        onOpenJournal={() => setJournalOpen(true)}
        onOpenPrices={() => setPricesOpen(true)}
        deskView={deskView}
        onOpenHistory={() => setDeskView('history')}
        onOpenDesk={() => setDeskView('desk')}
      />

      {deskView === 'history' ? (
        <PlanHistoryPanel
          planHistory={planHistory}
          tradePlans={tradePlans}
          positions={positions}
          onBackToDesk={() => setDeskView('desk')}
          onReconcile={openReconcile}
        />
      ) : null}

      {deskView === 'desk' ? (
      <Fragment>
      <section className={styles.xFeedBlock}>
        <XFeedSummaryCard
          data={xFeedData}
          loadEnabled={xFeedLoadEnabled}
        />
        <XFeedPanel
          watchlist={watchlist}
          onFeedData={setXFeedData}
          feedLoadEnabled={xFeedLoadEnabled}
          onFeedLoadEnabledChange={onXFeedLoadEnabledChange}
        />
      </section>

      <div className={styles.topRow}>
        <div
          className={
            watchlistTableVisible ? styles.cellMarket : styles.cellMarketWide
          }
        >
          <MarketCard data={market} />
        </div>
        {watchlistTableVisible ? (
          <div className={styles.cellWatchlist}>
            <WatchlistTable
              rows={watchlistRows}
              onRowClick={(t) => {
                dismissPlanActionError()
                setSetupTicker(t)
              }}
            />
          </div>
        ) : null}
      </div>

      <div className={styles.quotesRow}>
        <WatchlistQuotesCard
          watchlist={watchlist}
          quotes={lastQuotes}
          lastPriceRefreshAt={lastPriceRefreshAt}
          onRefresh={refreshPrices}
          manualQuotePlans={manualQuotePlans}
          positions={positions}
          onReconcileManualPlan={openReconcile}
          onAddManualPlan={(ticker) =>
            setQuotePlanUi({ kind: 'create', ticker })
          }
          onEditManualPlan={(planId) =>
            setQuotePlanUi({ kind: 'edit', planId })
          }
        />
      </div>

      <DailyPlanPanel
        dailyPlan={dailyPlan}
        tradePlans={tradePlans}
        positions={positions}
        onCreate={createDailyPlan}
        onFinalize={finalizeDailyPlan}
        onEdit={() => setEditDailyPlanOpen(true)}
        onStart={startTradingDay}
        onClose={closeTradingDay}
        onApprove={approvePlan}
        onReject={rejectPlan}
        onUnapprove={unapprovePlan}
        onEditTradePlan={(id) => setEditPlanId(id)}
        onTogglePlanAlert={togglePlanAlert}
        onReconcile={openReconcile}
      />

      <EditDailyPlanModal
        plan={dailyPlan}
        open={editDailyPlanOpen}
        onClose={() => setEditDailyPlanOpen(false)}
        onSave={(id, patch) => updateDailyPlan(id, patch)}
      />

      <section
        className={styles.executionBlock}
        aria-labelledby="execution-heading"
      >
        <div className={styles.executionInner}>
          <h2 id="execution-heading" className={styles.sectionLabel}>
            Execution · approved
          </h2>
          {tradePlans.length === 0 ? (
            <p className={styles.executionEmpty}>
              No trade plans yet. Add plans from watchlist quotes or the daily
              plan, then approve them here.
            </p>
          ) : executionPlans.length === 0 ? (
            <p className={styles.executionEmpty}>
              Approve setups in Daily Plan to execute trades here (broker fills
              are manual).
            </p>
          ) : (
            <div className={styles.tradeStack}>
              {executionPlans.map((t) => (
                <TradeCard
                  key={t.id}
                  trade={t}
                  hideApprovalActions
                  onEnter={handleEnterPlan}
                  onEdit={(id) => setEditPlanId(id)}
                  onToggleAlert={togglePlanAlert}
                  onReconcile={openReconcile}
                  planHasOpenPosition={positions.some(
                    (p) =>
                      p.tradePlanId === t.id && p.status === 'open',
                  )}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      <ActivePositions
        positions={positions}
        onClose={closePosition}
        onMoveStop={updatePositionStop}
        onTakePartial={takePartialPosition}
        onUpdateNotes={updatePositionNotes}
      />

      <div className={styles.bottomRow}>
        <div className={styles.cellRisk}>
          <RiskCard data={risk} />
        </div>
        <div className={styles.cellJournal}>
          <JournalMini metrics={metrics} />
        </div>
      </div>
      </Fragment>
      ) : null}

      <SettingsModal
        open={settingsOpen}
        resetToken={settingsResetToken}
        settings={settings}
        watchlistCsv={watchlist.join(', ')}
        watchlistTableVisible={watchlistTableVisible}
        onClose={() => setSettingsOpen(false)}
        onSave={(s, wl, showWatchlistTable) => {
          setSettings(s)
          setWatchlist(wl)
          saveWatchlistTableVisible(showWatchlistTable)
          setWatchlistTableVisible(showWatchlistTable)
        }}
      />

      <JournalModal
        open={journalOpen}
        entries={journal}
        onClose={() => setJournalOpen(false)}
        onDeleteEntry={deleteJournalEntry}
      />

      <PricesModal
        open={pricesOpen}
        lastPrices={lastPrices}
        lastPriceRefreshAt={lastPriceRefreshAt}
        onClose={() => setPricesOpen(false)}
        onRefresh={refreshPrices}
      />

      <WatchlistSetupDrawer
        detail={setupDetail}
        dailyPlan={dailyPlan}
        tradePlans={tradePlans}
        riskPerTrade={settings.riskPerTrade}
        planError={planActionError}
        onDismissPlanError={dismissPlanActionError}
        busy={createPlanBusy}
        xFeedData={xFeedData}
        xFeedLoadEnabled={xFeedLoadEnabled}
        onClose={() => {
          dismissPlanActionError()
          setSetupTicker(null)
        }}
        onCreatePlan={async (scanDetail) => {
          setCreatePlanBusy(true)
          try {
            const ok = await createPlanFromScan(scanDetail)
            if (ok) setSetupTicker(null)
          } finally {
            setCreatePlanBusy(false)
          }
        }}
      />

      <ManualQuotePlanModal
        key={
          quotePlanUi == null
            ? 'mq-closed'
            : quotePlanUi.kind === 'edit'
              ? `mq-edit-${quotePlanUi.planId}`
              : `mq-create-${quotePlanUi.ticker}`
        }
        open={quoteModalOpen}
        mode={quotePlanUi?.kind === 'edit' ? 'edit' : 'create'}
        ticker={quoteModalTicker}
        plan={quoteEditPlan}
        quoteLast={quoteLastForModal}
        riskPerTrade={settings.riskPerTrade}
        marketTrend={market?.marketTrend ?? 'neutral'}
        onClose={() => setQuotePlanUi(null)}
        onCreate={(patch, bias) => {
          createManualQuotePlan(quoteModalTicker, patch, bias)
        }}
        onSaveEdit={(id, patch) => updatePlan(id, patch)}
      />

      <EditPlanModal
        plan={editPlan}
        open={editPlanId != null}
        onClose={() => setEditPlanId(null)}
        onSave={(id, patch) => updatePlan(id, patch)}
      />

      <ReconcilePlanModal
        plan={reconcilePlan}
        open={reconcilePlanId != null && reconcilePlan != null}
        onClose={() => setReconcilePlanId(null)}
        onConfirm={(id, payload) => {
          reconcileTradePlan(id, payload)
          setReconcilePlanId(null)
        }}
      />
    </div>
  )
}

export default function App() {
  return (
    <TradingDeskProvider>
      <div className={styles.shell}>
        <div className={styles.frame}>
          <div className={styles.grid}>
            <Desk />
          </div>
        </div>
      </div>
    </TradingDeskProvider>
  )
}
