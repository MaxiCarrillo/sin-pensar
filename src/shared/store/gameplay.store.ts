import { create } from 'zustand'

import {
  concealActiveGameplayTurn,
  createGameplayState,
  expireGameplayTurn,
  getCompatibleGameplayState,
  markGameplayCardCorrect,
  passGameplayCard,
  prepareNextGameplayStage,
  showGameplayResults,
  shuffleRemainingGameplayCards,
  startGameplayTurn,
  validateGameplaySetup,
  type GameplayRandomSource,
} from '../domain/gameplay.ts'
import type { CardId } from '../types/card-draft.ts'
import type {
  GameplaySetupInput,
  GameplayStartResult,
  GameplayState,
  GameplayTransitionResult,
} from '../types/gameplay.ts'

interface GameplayStoreState {
  game: GameplayState | null
  initializeGameplay: (
    input: GameplaySetupInput,
    random?: GameplayRandomSource,
  ) => GameplayStartResult
  concealForPrivacy: () => GameplayTransitionResult
  startTurn: (now?: number) => GameplayTransitionResult
  markCorrect: (cardId: CardId, now?: number) => GameplayTransitionResult
  passCard: (cardId: CardId, now?: number) => GameplayTransitionResult
  expireTurn: (now?: number) => GameplayTransitionResult
  shuffleRemaining: (random?: GameplayRandomSource) => GameplayTransitionResult
  prepareNextStage: (random?: GameplayRandomSource) => GameplayTransitionResult
  showResults: () => GameplayTransitionResult
  resetGameplay: () => void
}

function missingGame(): GameplayTransitionResult {
  return { kind: 'rejected', reason: 'missing-game' }
}

export const useGameplayStore = create<GameplayStoreState>()((set, get) => {
  const apply = (result: GameplayTransitionResult) => {
    if (result.kind === 'success') set({ game: result.state })
    return result
  }

  return {
    game: null,
    initializeGameplay: (input, random = Math.random) => {
      const validation = validateGameplaySetup(input)
      if (validation.kind === 'rejected') return validation

      const existing = getCompatibleGameplayState(get().game, validation.setupKey)
      if (existing) return { kind: 'existing', state: existing }

      const creation = createGameplayState(input, random)
      if (creation.kind === 'rejected') return creation
      set({ game: creation.state })
      return { kind: 'started', state: creation.state }
    },
    concealForPrivacy: () => {
      const game = get().game
      return game ? apply(concealActiveGameplayTurn(game)) : missingGame()
    },
    startTurn: (now = Date.now()) => {
      const game = get().game
      return game ? apply(startGameplayTurn(game, now)) : missingGame()
    },
    markCorrect: (cardId, now = Date.now()) => {
      const game = get().game
      return game ? apply(markGameplayCardCorrect(game, cardId, now)) : missingGame()
    },
    passCard: (cardId, now = Date.now()) => {
      const game = get().game
      return game ? apply(passGameplayCard(game, cardId, now)) : missingGame()
    },
    expireTurn: (now = Date.now()) => {
      const game = get().game
      return game ? apply(expireGameplayTurn(game, now)) : missingGame()
    },
    shuffleRemaining: (random = Math.random) => {
      const game = get().game
      return game ? apply(shuffleRemainingGameplayCards(game, random)) : missingGame()
    },
    prepareNextStage: (random = Math.random) => {
      const game = get().game
      return game ? apply(prepareNextGameplayStage(game, random)) : missingGame()
    },
    showResults: () => {
      const game = get().game
      return game ? apply(showGameplayResults(game)) : missingGame()
    },
    resetGameplay: () => set({ game: null }),
  }
})
