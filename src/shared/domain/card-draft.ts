import { CARD_DEAL_SIZE } from '../constants/card-draft.ts'
import type { MainDeckCardCount } from '../constants/setup.ts'
import {
  CARD_DRAFT_PHASES,
  type CardDraftCreationResult,
  type CardDraftSession,
  type CardDraftTransitionResult,
  type CardId,
  type PlayerCardDraft,
} from '../types/card-draft.ts'

export type CardDraftRandomSource = () => number

export interface CardDraftSetupKeyInput {
  ownerPlayerId: string
  players: ReadonlyArray<{ id: string; name: string }>
  mainDeckCardCount: MainDeckCardCount
  teamAssignmentSignature: string
}

function isMainDeckCardCount(value: unknown): value is MainDeckCardCount {
  return value === 3 || value === 4 || value === 5
}

function normalizeRandomValue(value: number) {
  return Number.isFinite(value) ? Math.min(Math.max(value, 0), 0.9999999999999999) : 0
}

function shuffleCardIds(cardIds: readonly CardId[], random: CardDraftRandomSource) {
  const shuffled = [...cardIds]
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(normalizeRandomValue(random()) * (index + 1))
    ;[shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]]
  }
  return shuffled
}

function getCurrentPlayerDraft(session: CardDraftSession) {
  return session.playerDrafts[session.currentPlayerIndex]
}

function replaceCurrentPlayerDraft(
  session: CardDraftSession,
  playerDraft: PlayerCardDraft,
  phase: CardDraftSession['phase'],
): CardDraftSession {
  return {
    ...session,
    phase,
    playerDrafts: session.playerDrafts.map((current, index) =>
      index === session.currentPlayerIndex ? playerDraft : current,
    ),
  }
}

function reject(
  reason: Extract<CardDraftTransitionResult, { kind: 'rejected' }>['reason'],
): CardDraftTransitionResult {
  return { kind: 'rejected', reason }
}

function isPlayerSelectionComplete(playerDraft: PlayerCardDraft, mainDeckCardCount: number) {
  return (
    playerDraft.selectedMainCardIds.length === mainDeckCardCount &&
    playerDraft.lightningCardId !== null &&
    !playerDraft.selectedMainCardIds.includes(playerDraft.lightningCardId)
  )
}

export function createCardDraftSetupKey(input: CardDraftSetupKeyInput) {
  return JSON.stringify({
    ownerPlayerId: input.ownerPlayerId,
    players: input.players.map((player) => [player.id, player.name]),
    mainDeckCardCount: input.mainDeckCardCount,
    teamAssignmentSignature: input.teamAssignmentSignature,
  })
}

export function createCardDraftSession(
  playerIds: readonly string[],
  cardIds: readonly CardId[],
  mainDeckCardCount: MainDeckCardCount,
  setupKey: string,
  random: CardDraftRandomSource,
): CardDraftCreationResult {
  if (
    playerIds.length === 0 ||
    playerIds.some((playerId) => !playerId.trim()) ||
    new Set(playerIds).size !== playerIds.length
  ) {
    return { kind: 'rejected', reason: 'invalid-players' }
  }
  if (!isMainDeckCardCount(mainDeckCardCount)) {
    return { kind: 'rejected', reason: 'invalid-main-count' }
  }
  if (!setupKey.trim()) return { kind: 'rejected', reason: 'invalid-setup-key' }
  if (
    cardIds.length === 0 ||
    cardIds.some((cardId) => !/^card-\d{3}$/.test(cardId)) ||
    new Set(cardIds).size !== cardIds.length
  ) {
    return { kind: 'rejected', reason: 'invalid-catalog' }
  }
  if (playerIds.length * CARD_DEAL_SIZE > cardIds.length) {
    return { kind: 'rejected', reason: 'insufficient-cards' }
  }

  const shuffledCardIds = shuffleCardIds(cardIds, random)
  const playerDrafts = playerIds.map((playerId, playerIndex): PlayerCardDraft => ({
    playerId,
    dealCardIds: shuffledCardIds.slice(
      playerIndex * CARD_DEAL_SIZE,
      (playerIndex + 1) * CARD_DEAL_SIZE,
    ),
    selectedMainCardIds: [],
    lightningCardId: null,
  }))

  return {
    kind: 'created',
    session: {
      setupKey,
      mainDeckCardCount,
      playerDrafts,
      currentPlayerIndex: 0,
      phase: CARD_DRAFT_PHASES.handoff,
    },
  }
}

export function getCardDraftSessionErrors(
  session: CardDraftSession,
  expectedSetupKey: string,
  expectedPlayerIds: readonly string[],
  catalogCardIds: readonly CardId[],
): string[] {
  const errors: string[] = []
  const catalogIdSet = new Set(catalogCardIds)
  const dealtCardIds = session.playerDrafts.flatMap((playerDraft) => playerDraft.dealCardIds)

  if (session.setupKey !== expectedSetupKey) errors.push('setup-key')
  if (!isMainDeckCardCount(session.mainDeckCardCount)) errors.push('main-count')
  if (!Object.values(CARD_DRAFT_PHASES).some((phase) => phase === session.phase)) {
    errors.push('phase')
  }
  if (
    session.playerDrafts.length !== expectedPlayerIds.length ||
    session.playerDrafts.some(
      (playerDraft, index) => playerDraft.playerId !== expectedPlayerIds[index],
    )
  ) {
    errors.push('player-order')
  }
  if (new Set(dealtCardIds).size !== dealtCardIds.length) errors.push('duplicate-deal-card')

  session.playerDrafts.forEach((playerDraft, playerIndex) => {
    const dealSet = new Set(playerDraft.dealCardIds)
    if (playerDraft.dealCardIds.length !== CARD_DEAL_SIZE || dealSet.size !== CARD_DEAL_SIZE) {
      errors.push(`deal-${playerIndex}`)
    }
    if (playerDraft.dealCardIds.some((cardId) => !catalogIdSet.has(cardId))) {
      errors.push(`unknown-deal-card-${playerIndex}`)
    }
    if (
      new Set(playerDraft.selectedMainCardIds).size !== playerDraft.selectedMainCardIds.length ||
      playerDraft.selectedMainCardIds.length > session.mainDeckCardCount ||
      playerDraft.selectedMainCardIds.some((cardId) => !dealSet.has(cardId))
    ) {
      errors.push(`main-selection-${playerIndex}`)
    }
    if (
      playerDraft.lightningCardId !== null &&
      (!dealSet.has(playerDraft.lightningCardId) ||
        playerDraft.selectedMainCardIds.includes(playerDraft.lightningCardId) ||
        playerDraft.selectedMainCardIds.length !== session.mainDeckCardCount)
    ) {
      errors.push(`lightning-selection-${playerIndex}`)
    }
  })

  const isComplete = session.phase === CARD_DRAFT_PHASES.complete
  if (isComplete) {
    if (session.currentPlayerIndex !== session.playerDrafts.length) errors.push('complete-index')
    if (
      session.playerDrafts.some(
        (playerDraft) =>
          !isPlayerSelectionComplete(playerDraft, session.mainDeckCardCount),
      )
    ) {
      errors.push('incomplete-player')
    }
    return errors
  }

  if (
    session.currentPlayerIndex < 0 ||
    session.currentPlayerIndex >= session.playerDrafts.length
  ) {
    errors.push('current-player-index')
    return errors
  }

  session.playerDrafts.forEach((playerDraft, playerIndex) => {
    if (
      playerIndex < session.currentPlayerIndex &&
      !isPlayerSelectionComplete(playerDraft, session.mainDeckCardCount)
    ) {
      errors.push(`incomplete-previous-player-${playerIndex}`)
    }
    if (
      playerIndex > session.currentPlayerIndex &&
      (playerDraft.selectedMainCardIds.length > 0 || playerDraft.lightningCardId !== null)
    ) {
      errors.push(`premature-future-selection-${playerIndex}`)
    }
  })

  const currentPlayerDraft = getCurrentPlayerDraft(session)
  if (!currentPlayerDraft) return [...errors, 'missing-current-player']
  if (
    session.phase === CARD_DRAFT_PHASES.selectingMain &&
    currentPlayerDraft.lightningCardId !== null
  ) {
    errors.push('main-phase-lightning')
  }
  if (
    session.phase === CARD_DRAFT_PHASES.selectingLightning &&
    (currentPlayerDraft.selectedMainCardIds.length !== session.mainDeckCardCount ||
      currentPlayerDraft.lightningCardId !== null)
  ) {
    errors.push('lightning-phase-selection')
  }
  if (
    session.phase === CARD_DRAFT_PHASES.ready &&
    !isPlayerSelectionComplete(currentPlayerDraft, session.mainDeckCardCount)
  ) {
    errors.push('ready-phase-selection')
  }

  return errors
}

export function revealCurrentPlayerCards(session: CardDraftSession): CardDraftTransitionResult {
  if (session.phase !== CARD_DRAFT_PHASES.handoff) return reject('invalid-phase')
  const currentPlayerDraft = getCurrentPlayerDraft(session)
  if (!currentPlayerDraft) return reject('missing-current-player')

  return {
    kind: 'success',
    session: replaceCurrentPlayerDraft(
      session,
      { ...currentPlayerDraft, lightningCardId: null },
      CARD_DRAFT_PHASES.selectingMain,
    ),
  }
}

export function concealCurrentPlayerCards(session: CardDraftSession): CardDraftTransitionResult {
  if (session.phase === CARD_DRAFT_PHASES.complete) return reject('invalid-phase')
  if (!getCurrentPlayerDraft(session)) return reject('missing-current-player')
  return {
    kind: 'success',
    session:
      session.phase === CARD_DRAFT_PHASES.handoff
        ? session
        : { ...session, phase: CARD_DRAFT_PHASES.handoff },
  }
}

export function toggleMainCard(
  session: CardDraftSession,
  cardId: CardId,
): CardDraftTransitionResult {
  if (session.phase !== CARD_DRAFT_PHASES.selectingMain) return reject('invalid-phase')
  const currentPlayerDraft = getCurrentPlayerDraft(session)
  if (!currentPlayerDraft) return reject('missing-current-player')
  if (!currentPlayerDraft.dealCardIds.includes(cardId)) return reject('unknown-card')

  const isSelected = currentPlayerDraft.selectedMainCardIds.includes(cardId)
  if (!isSelected && currentPlayerDraft.selectedMainCardIds.length >= session.mainDeckCardCount) {
    return reject('main-quota-reached')
  }

  const selectedMainCardIds = isSelected
    ? currentPlayerDraft.selectedMainCardIds.filter((selectedId) => selectedId !== cardId)
    : [...currentPlayerDraft.selectedMainCardIds, cardId]

  return {
    kind: 'success',
    session: replaceCurrentPlayerDraft(
      session,
      { ...currentPlayerDraft, selectedMainCardIds, lightningCardId: null },
      CARD_DRAFT_PHASES.selectingMain,
    ),
  }
}

export function confirmMainCards(session: CardDraftSession): CardDraftTransitionResult {
  if (
    session.phase === CARD_DRAFT_PHASES.selectingLightning ||
    session.phase === CARD_DRAFT_PHASES.ready
  ) {
    return reject('main-selection-already-confirmed')
  }
  if (session.phase !== CARD_DRAFT_PHASES.selectingMain) return reject('invalid-phase')

  const currentPlayerDraft = getCurrentPlayerDraft(session)
  if (!currentPlayerDraft) return reject('missing-current-player')

  const selectedMainCardIds = currentPlayerDraft.selectedMainCardIds
  if (
    !isMainDeckCardCount(session.mainDeckCardCount) ||
    selectedMainCardIds.length !== session.mainDeckCardCount ||
    new Set(selectedMainCardIds).size !== session.mainDeckCardCount
  ) {
    return reject('main-quota-incomplete')
  }
  if (selectedMainCardIds.some((cardId) => !currentPlayerDraft.dealCardIds.includes(cardId))) {
    return reject('unknown-card')
  }

  return {
    kind: 'success',
    session: replaceCurrentPlayerDraft(
      session,
      { ...currentPlayerDraft, lightningCardId: null },
      CARD_DRAFT_PHASES.selectingLightning,
    ),
  }
}

export function editMainCards(session: CardDraftSession): CardDraftTransitionResult {
  if (
    session.phase !== CARD_DRAFT_PHASES.selectingLightning &&
    session.phase !== CARD_DRAFT_PHASES.ready
  ) {
    return reject('invalid-phase')
  }
  const currentPlayerDraft = getCurrentPlayerDraft(session)
  if (!currentPlayerDraft) return reject('missing-current-player')
  return {
    kind: 'success',
    session: replaceCurrentPlayerDraft(
      session,
      { ...currentPlayerDraft, lightningCardId: null },
      CARD_DRAFT_PHASES.selectingMain,
    ),
  }
}

export function toggleLightningCard(
  session: CardDraftSession,
  cardId: CardId,
): CardDraftTransitionResult {
  if (
    session.phase !== CARD_DRAFT_PHASES.selectingLightning &&
    session.phase !== CARD_DRAFT_PHASES.ready
  ) {
    return reject('invalid-phase')
  }
  const currentPlayerDraft = getCurrentPlayerDraft(session)
  if (!currentPlayerDraft) return reject('missing-current-player')
  if (currentPlayerDraft.selectedMainCardIds.length !== session.mainDeckCardCount) {
    return reject('main-quota-incomplete')
  }
  if (!currentPlayerDraft.dealCardIds.includes(cardId)) return reject('unknown-card')
  if (currentPlayerDraft.selectedMainCardIds.includes(cardId)) {
    return reject('lightning-must-be-distinct')
  }

  const lightningCardId = currentPlayerDraft.lightningCardId === cardId ? null : cardId
  return {
    kind: 'success',
    session: replaceCurrentPlayerDraft(
      session,
      { ...currentPlayerDraft, lightningCardId },
      lightningCardId ? CARD_DRAFT_PHASES.ready : CARD_DRAFT_PHASES.selectingLightning,
    ),
  }
}

export function saveCurrentPlayerDraft(session: CardDraftSession): CardDraftTransitionResult {
  if (session.phase !== CARD_DRAFT_PHASES.ready) return reject('invalid-phase')
  const currentPlayerDraft = getCurrentPlayerDraft(session)
  if (!currentPlayerDraft) return reject('missing-current-player')
  if (currentPlayerDraft.selectedMainCardIds.length !== session.mainDeckCardCount) {
    return reject('main-quota-incomplete')
  }
  if (!currentPlayerDraft.lightningCardId) return reject('lightning-required')
  if (currentPlayerDraft.selectedMainCardIds.includes(currentPlayerDraft.lightningCardId)) {
    return reject('lightning-must-be-distinct')
  }

  const nextPlayerIndex = session.currentPlayerIndex + 1
  const isComplete = nextPlayerIndex === session.playerDrafts.length
  return {
    kind: 'success',
    session: {
      ...session,
      currentPlayerIndex: nextPlayerIndex,
      phase: isComplete ? CARD_DRAFT_PHASES.complete : CARD_DRAFT_PHASES.handoff,
    },
  }
}
