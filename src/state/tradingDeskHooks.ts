import { useContext, useMemo } from 'react'
import type { RiskPanelData } from '../domain/types'
import { computeJournalMetrics } from '../services/journalStore'
import {
  TradingDeskContext,
  type TradingDeskValue,
} from './tradingDeskContext'

export function useTradingDesk(): TradingDeskValue {
  const v = useContext(TradingDeskContext)
  if (!v) throw new Error('useTradingDesk must be used within TradingDeskProvider')
  return v
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

export function useJournalMetrics() {
  const { journal } = useTradingDesk()
  return useMemo(() => computeJournalMetrics(journal), [journal])
}

export function useRiskPanelData(): RiskPanelData {
  const { settings, positions, journal } = useTradingDesk()
  return useMemo(() => {
    const openRisk = positions
      .filter((p) => p.status === 'open')
      .reduce((s, p) => s + p.initialRiskDollars, 0)
    const closedToday = journal.filter((e) => e.date === todayISO()).length
    const openCount = positions.filter((p) => p.status === 'open').length
    const tradesTaken = closedToday + openCount
    return {
      accountSize: settings.accountSize,
      riskPerTrade: settings.riskPerTrade,
      dailyMaxLoss: settings.dailyMaxLoss,
      tradesTaken,
      tradesMax: settings.maxTradesPerDay,
      openRiskExposure: Math.round(openRisk * 100) / 100,
    }
  }, [journal, positions, settings])
}
