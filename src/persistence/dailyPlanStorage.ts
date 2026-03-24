import type { DailyPlan } from '../domain/types'

const KEY = 'trade-ui-daily-plan-v1'

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

export function loadDailyPlan(): DailyPlan | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const p = JSON.parse(raw) as DailyPlan
    if (!p?.id || !p.date || !p.status) return null
    if (p.date !== todayISO()) return null
    return p
  } catch {
    return null
  }
}

export function saveDailyPlan(plan: DailyPlan | null): void {
  if (plan == null) {
    localStorage.removeItem(KEY)
    return
  }
  localStorage.setItem(KEY, JSON.stringify(plan))
}
