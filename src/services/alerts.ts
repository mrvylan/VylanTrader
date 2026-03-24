import type { TradePlan } from '../domain/types'

export type AlertKind = 'entry_cross' | 'breakout_confirmed' | 'pullback_bounce'

export interface AlertPayload {
  kind: AlertKind
  ticker: string
  message: string
}

function crossedUp(prev: number, next: number, level: number): boolean {
  return prev < level && next >= level
}

/**
 * Deterministic alert rules from last vs previous print.
 */
export function evaluatePlanAlerts(
  plan: TradePlan,
  lastPrice: number,
  prevPrice: number,
): AlertPayload[] {
  if (plan.alertEnabled === false) return []
  if (plan.status !== 'watching' && plan.status !== 'approved') return []

  const out: AlertPayload[] = []
  const { ticker, entry, setupKind } = plan

  if (crossedUp(prevPrice, lastPrice, entry)) {
    out.push({
      kind: 'entry_cross',
      ticker,
      message: `${ticker} crossed entry ${entry.toFixed(2)}`,
    })
  }

  if (setupKind === 'breakout_retest' || setupKind === 'orb_continuation') {
    const level = entry / 1.002
    if (lastPrice >= level * 1.002 && prevPrice < level * 1.002) {
      out.push({
        kind: 'breakout_confirmed',
        ticker,
        message: `${ticker} continuation / breakout confirmed`,
      })
    }
  }

  if (setupKind === 'trend_pullback') {
    if (lastPrice >= entry * 0.998 && prevPrice < entry * 0.998) {
      out.push({
        kind: 'pullback_bounce',
        ticker,
        message: `${ticker} pullback bounce vs plan`,
      })
    }
  }

  return out
}

function playBeep(): void {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.connect(g)
    g.connect(ctx.destination)
    o.frequency.value = 880
    g.gain.value = 0.04
    o.start()
    setTimeout(() => {
      o.stop()
      ctx.close()
    }, 120)
  } catch {
    /* ignore */
  }
}

export async function deliverAlert(
  title: string,
  body: string,
  options: { sound?: boolean; webhookUrl?: string },
): Promise<void> {
  if (typeof window !== 'undefined' && 'Notification' in window) {
    if (Notification.permission === 'default') {
      await Notification.requestPermission()
    }
    if (Notification.permission === 'granted') {
      new Notification(title, { body })
    }
  }

  if (options.sound) playBeep()

  const url = options.webhookUrl?.trim()
  if (url && typeof fetch !== 'undefined') {
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body, ts: Date.now() }),
        mode: 'no-cors',
      })
    } catch {
      /* optional webhook */
    }
  }
}
