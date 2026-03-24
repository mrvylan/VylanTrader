import type { StrategyKind } from '../domain/types'

export function strategyKindLabel(kind: StrategyKind): string {
  switch (kind) {
    case 'breakout_retest':
      return 'Breakout retest'
    case 'trend_pullback':
      return 'Trend pullback'
    case 'orb_continuation':
      return 'Opening range continuation'
  }
}
