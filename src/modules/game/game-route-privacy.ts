import { GAMEPLAY_PHASES } from '../../shared/types/gameplay.ts'
import type {
  GameplayState,
  GameplayTransitionResult,
} from '../../shared/types/gameplay.ts'

interface GameplayRoutePrivacyState {
  game: GameplayState | null
  concealForPrivacy: (now?: number) => GameplayTransitionResult
}

interface GameplayRoutePrivacyStore {
  getState: () => GameplayRoutePrivacyState
}

export function concealActiveGameplayForRoute(
  store: GameplayRoutePrivacyStore,
  now = Date.now(),
) {
  const { game, concealForPrivacy } = store.getState()
  if (
    game?.phase !== GAMEPLAY_PHASES.activeTurn &&
    game?.phase !== GAMEPLAY_PHASES.lightningAttribution
  ) {
    return null
  }
  return concealForPrivacy(now)
}
