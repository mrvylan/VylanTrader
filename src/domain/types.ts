/** OHLCV bar (daily or intraday aggregate). */
export interface OHLCV {
  t: number
  o: number
  h: number
  l: number
  c: number
  v: number
}

export type MarketTrend = 'bullish' | 'neutral' | 'bearish'

/** SPY-led macro state (no intraday “pullback regime”). */
export type Regime = 'trend' | 'chop' | 'distribution'

export type VolatilityState = 'low' | 'medium' | 'high'

/** UI-friendly mirror of index trend arrows. */
export type TrendArrow = 'up' | 'flat' | 'down'

export interface MarketBiasResult {
  marketTrend: MarketTrend
  regime: Regime
  spyTrend: TrendArrow
  qqqTrend: TrendArrow
  volatility: VolatilityState
}

/** Morning swing edge — discretionary large-cap only. */
export type StrategyKind =
  | 'breakout_retest'
  | 'trend_pullback'
  | 'orb_continuation'

export interface ScannerCandidate {
  ticker: string
  strategyKind: StrategyKind
  level: number
  ema9: number
  ema20: number
  relVolume: number
  trendArrow: TrendArrow
  nearResistancePct: number
}

export interface RankedSetup extends ScannerCandidate {
  score: number
}

export type PlanSetupKind = StrategyKind

export type TradePlanStatus =
  | 'watching'
  | 'approved'
  | 'entered'
  | 'rejected'
  | 'closed'

/** Payload when saving manual plan edits from the edit modal. */
export type TradePlanEditPatch = {
  entry: number
  stop: number
  target: number
  notes?: string
  /** When set, use this share count instead of sizing from settings risk/trade. */
  positionSize?: number
}

export interface TradePlan {
  id: string
  ticker: string
  setupKind: PlanSetupKind
  /** Display label, e.g. "Breakout", "ORB" */
  setupType: string
  bias: MarketTrend
  entry: number
  stop: number
  target: number
  positionSize: number
  riskAmount: number
  /** entry − stop (long). */
  riskPerShare: number
  rMultiple: number
  /** (target − entry) / (entry − stop) at plan creation. */
  expectedR: number
  status: TradePlanStatus
  notes?: string
  score?: number
  createdAt: string
  /** When false, price alerts are suppressed for this plan. */
  alertEnabled?: boolean
  /** `manual_quotes` = created from watchlist quotes UI. */
  planOrigin?: 'manual_quotes'
}

/** Outcome when a plan is reconciled (master history / manual close-the-loop). */
export type PlanHistoryResult =
  | 'win'
  | 'loss'
  | 'breakeven'
  | 'no_trade'
  | 'skipped'

/** How the history row was created (journal-only closes stay out until mirrored). */
export type PlanHistorySource = 'manual_reconcile' | 'position_close'

/** User input when reconciling a plan without using ActivePositions close. */
export type PlanReconcilePayload = {
  result: PlanHistoryResult
  followedRules: boolean
  notes?: string
  exitPrice?: number
  pnlDollars?: number
  rMultiple?: number
}

/** One closed-plan row in the master history report (denormalized snapshot). */
export interface PlanHistoryEntry {
  id: string
  reconciledAt: string
  tradePlanId: string
  ticker: string
  setupType: string
  setupKind: PlanSetupKind
  bias: MarketTrend
  entry: number
  stop: number
  target: number
  positionSize: number
  priorStatus: TradePlanStatus
  result: PlanHistoryResult
  followedRules: boolean
  notes?: string
  exitPrice?: number
  pnlDollars?: number
  rMultiple?: number
  source: PlanHistorySource
}

export type PositionStatus = 'open' | 'closed'

/**
 * Open long position — P/L and R use `initialRiskDollars` frozen at entry
 * (trailing `stopPrice` does not rewrite R denominator).
 */
export interface Position {
  id: string
  tradePlanId: string
  ticker: string
  side: 'long'
  entryPrice: number
  currentPrice: number
  stopPrice: number
  targetPrice: number
  shares: number
  /** entryPrice − stop at open (frozen). */
  initialRiskPerShare: number
  /** initialRiskPerShare × shares (frozen at open; scales on partial only). */
  initialRiskDollars: number
  unrealizedPnL: number
  unrealizedR: number | null
  realizedPnL: number
  realizedR: number | null
  status: PositionStatus
  openedAt: number
  closedAt?: number
  exitPrice?: number
  /** True when last quote came from mock / deterministic provider. */
  quoteIsSimulated?: boolean
  chartEntryDataUrl?: string
  notes?: string
}

export type JournalResult = 'win' | 'loss'

export interface TradeJournalEntry {
  id: string
  date: string
  ticker: string
  setupType: string
  /** Strategy kind for analytics. */
  setupKind?: StrategyKind
  /** Market regime at log time. */
  regime?: Regime
  /** Plan score at approval (if known). */
  planScore?: number
  entry: number
  exit: number
  stop: number
  target: number
  positionSize: number
  /** Realized P/L in dollars (full close). */
  pnlDollars: number
  rMultiple: number
  result: JournalResult
  followedRules: boolean
  notes?: string
  chartEntryDataUrl?: string
  chartExitDataUrl?: string
}

export interface UserSettings {
  accountSize: number
  /** Absolute dollars at risk per trade. */
  riskPerTrade: number
  dailyMaxLoss: number
  maxTradesPerDay: number
  alertSound: boolean
  alertWebhookUrl: string
}

export interface JournalMetrics {
  lastFive: JournalResult[]
  winRatePct: number
  avgR: number
  totalR: number
  bestSetup: string
  /** Closed trades logged today (PT calendar day via ISO date). */
  tradesToday: number
}

export interface RiskPanelData {
  accountSize: number
  riskPerTrade: number
  dailyMaxLoss: number
  tradesTaken: number
  tradesMax: number
  openRiskExposure: number
}

/** Scanner outcome per symbol. */
export type SymbolScanStatus =
  | 'no_setup'
  | 'watching'
  | 'approved_candidate'

/**
 * UI tier: structural candidate vs approvable vs rejected by gates.
 * - `approvable` — passes morning score/R/size + tape checks from scan.
 * - `rejected` — setup or plan visible but fails one or more approval gates.
 * - `candidate` — intermediate (e.g. scan-only edge case).
 * - `no_setup` — nothing actionable from patterns.
 */
export type CandidateTier =
  | 'no_setup'
  | 'candidate'
  | 'approvable'
  | 'rejected'

/** Seven-bucket morning score (sums to total score, max 100). */
export interface MorningScoreBreakdown {
  marketAlignmentScore: number
  setupQualityScore: number
  relativeVolumeScore: number
  trendQualityScore: number
  levelClarityScore: number
  rewardRiskScore: number
  executionFitScore: number
}

/** Structured gate failure context for copy + learning. */
export interface PlanRejectionDetail {
  actualScore?: number
  requiredScore?: number
  actualExpectedR?: number
  requiredExpectedR?: number
  positionSize?: number
  /** Minimum whole shares required (1 for a sized trade). */
  requiredPositionSize?: number
  riskBudgetPerTrade?: number
  riskPerShare?: number
  dailyBarsAvailable?: number
  requiredDailyBars?: number
  lastClose?: number
  minPrice?: number
  avg20DayVolume?: number
  minAvg20DayVolume?: number
  earningsStatus?: 'known' | 'unknown'
}

export type UniverseStatus = 'pass' | 'fail' | 'insufficient_data'

/** Why a setup or plan is not approvable (visibility still allowed where noted). */
export type ScanRejectionReason =
  | 'score_below_threshold'
  | 'expected_r_below_minimum'
  | 'position_size_below_one'
  | 'stop_too_wide'
  | 'entry_not_above_stop'
  | 'target_not_above_entry'
  | 'market_not_aligned'
  | 'regime_not_supported'
  | 'daily_risk_cap_exceeded'
  | 'max_trades_reached'
  | 'morning_quality_not_met'
  | 'no_clear_target'
  | 'level_not_clear'
  | 'earnings_too_close'
  | 'price_below_minimum'
  | 'average_volume_low'
  | 'insufficient_bar_history'
  | 'no_valid_pattern'
  | 'rel_vol_too_low'

/** Deterministic diagnostics for a single-symbol scan. */
export interface SymbolScanDebug {
  ticker: string
  dailyBarsLength?: number
  intradayBarsLength?: number
  universeStatus?: UniverseStatus
  lastClose?: number | null
  avg20DayVolume?: number | null
  dailyEma20?: number | null
  detectedSetupType: StrategyKind | null
  recentHigh: number | null
  recentLow: number | null
  ema9: number | null
  ema20: number | null
  relVol: number | null
  entry: number | null
  stop: number | null
  target: number | null
  riskPerShare: number | null
  expectedR: number | null
  positionSize: number | null
  score: number | null
  status: SymbolScanStatus
  rejectionReasons: ScanRejectionReason[]
}

/** Full per-symbol morning scan outcome (pure, for prep + UI). */
export interface SymbolScanResult {
  status: SymbolScanStatus
  candidateTier: CandidateTier
  universeStatus?: UniverseStatus
  candidate: ScannerCandidate | null
  plan: TradePlan | null
  rejectionReasons: ScanRejectionReason[]
  rejectionDetail: PlanRejectionDetail
  scoreBreakdown: MorningScoreBreakdown | null
  rejectionSuggestions: string[]
  debug: SymbolScanDebug
}

export interface WatchlistTableRow {
  ticker: string
  trend: TrendArrow
  setup: string
  level: string
  /**
   * `no_setup` = filtered or no pattern.
   * `watching` = candidate visible; may not pass approval gates.
   * `ready` = approved_candidate (score/R/size gates pass).
   */
  status: 'watching' | 'ready' | 'no_setup'
  score?: number
  relVol?: string
}

/** Per-ticker scan snapshot for setup drawer (optional; often empty). */
export interface WatchlistScanDetail {
  ticker: string
  candidate: ScannerCandidate | null
  score?: number
  expectedR?: number
  positionSize?: number
  marketBias: MarketTrend
  regime?: Regime
  summary: string
  scanStatus?: SymbolScanStatus
  candidateTier?: CandidateTier
  rejectionReasons?: ScanRejectionReason[]
  rejectionDetail?: PlanRejectionDetail
  scoreBreakdown?: MorningScoreBreakdown | null
  rejectionSuggestions?: string[]
  debug?: SymbolScanDebug
  universeStatus?: UniverseStatus
  /** When true, plan builder uses synthetic daily bars (testing / special rows). */
  useSyntheticBarsForEngine?: boolean
}

export type DailyPlanStatus = 'draft' | 'finalized' | 'active' | 'closed'

/** One calendar-day trading plan. */
export interface DailyPlan {
  id: string
  /** ISO date `YYYY-MM-DD` (UTC, same as journal). */
  date: string
  marketBias: MarketTrend
  regime: Regime
  selectedTickers: string[]
  /** Trade plan ids the trader marked approved for today. */
  approvedPlans: string[]
  maxTrades: number
  maxDailyLoss: number
  notes?: string
  status: DailyPlanStatus
  createdAt: string
}
