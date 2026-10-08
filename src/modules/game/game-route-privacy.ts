import { GAMEPLAY_PHASES } from '../../shared/types/gameplay.ts'
import type {
  GameplayState,
  GameplayTransitionResult,
} from '../../shared/types/gameplay.ts'

interface GameplayRoutePrivacyState {
  game: GameplayState | null
  concealForPrivacy: () => GameplayTransitionResult
}

interface GameplayRoutePrivacyStore {
  getState: () => GameplayRoutePrivacyState
}

export function concealActiveGameplayForRoute(store: GameplayRoutePrivacyStore) {
  const { game, concealForPrivacy } = store.getState()
  if (game?.phase !== GAMEPLAY_PHASES.activeTurn) return null
  return concealForPrivacy()
}
