/**
 * Morning swing scanner + trade plan builder (re-export).
 */
export {
  evaluateSymbolScan,
  rawHits,
  scanAndBuildTradePlan,
  scanTicker,
  tryBuildMorningTradePlan,
} from './strategyEngine'
export type { MorningPlanBuildResult } from './morningPlanResult'
export type {
  SymbolScanDebug,
  SymbolScanResult,
} from '../domain/types'
export { formatMorningPlanRejection } from './morningPlanResult'
