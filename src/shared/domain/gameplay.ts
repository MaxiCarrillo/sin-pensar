import type { TurnDuration } from '../constants/setup.ts'
import { CARD_DRAFT_PHASES, type CardId } from '../types/card-draft.ts'
import {
  GAMEPLAY_PHASES,
  GAMEPLAY_STAGES,
  type CurrentTurnParticipant,
  type GameplayCreationResult,
  type GameplaySetupInput,
  type GameplaySetupValidation,
  type GameplayStage,
  type GameplayState,
  type GameplayTeam,
  type GameplayTeamScore,
  type GameplayTransitionRejectReason,
  type GameplayTransitionResult,
  type GameplayTurnResult,
  type WinningTeam,
} from '../types/gameplay.ts'

import { createCardDraftSetupKey, getCardDraftSessionErrors } from './card-draft.ts'

export type GameplayRandomSource = () => number

type ActiveGameplayState = Extract<GameplayState, { phase: 'active-turn' }>
type LightningAttributionGameplayState = Extract<
  GameplayState,
  { phase: 'lightning-attribution' }
>

const MIN_PLAYERS = 4
const MAX_PLAYERS = 20
const MIN_PLAYERS_PER_TEAM = 2
const VALID_TURN_DURATIONS = new Set([30, 45, 60])
const VALID_MAIN_CARD_COUNTS = new Set([3, 4, 5])

function normalizeName(name: string) {
  return name.trim().toLocaleLowerCase('es')
}

function normalizeRandomValue(value: number) {
  return Number.isFinite(value) ? Math.min(Math.max(value, 0), 0.9999999999999999) : 0
}

function shuffleCardIds(cardIds: readonly CardId[], random: GameplayRandomSource) {
  const shuffled = [...cardIds]
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(normalizeRandomValue(random()) * (index + 1))
    ;[shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]]
  }
  return shuffled
}

function getSourceCardIdsForStage(
  stage: GameplayStage,
  mainDeckCardIds: readonly CardId[],
  lightningDeckCardIds: readonly CardId[],
) {
  return stage.source === 'main' ? mainDeckCardIds : lightningDeckCardIds
}

function getDraftTeamSignature(input: GameplaySetupInput) {
  return input.teamAssignment.teams
    .map((team) => `${team.teamId}:${team.playerIds.join(',')}`)
    .join('|')
}

function hasValidRoster(input: GameplaySetupInput) {
  if (input.players.length < MIN_PLAYERS || input.players.length > MAX_PLAYERS) return false
  const ids = input.players.map((player) => player.id)
  const names = input.players.map((player) => normalizeName(player.name))
  return (
    ids.every(Boolean) &&
    names.every(Boolean) &&
    new Set(ids).size === ids.length &&
    new Set(names).size === names.length
  )
}

function resolveTeams(input: GameplaySetupInput): GameplayTeam[] | null {
  if (!Number.isInteger(input.teamCount) || input.teamCount < 2) return null
  if (input.teamAssignment.teams.length !== input.teamCount) return null

  const rosterIds = input.players.map((player) => player.id)
  const rosterIdSet = new Set(rosterIds)
  const assignedPlayerIds: string[] = []
  const teams: GameplayTeam[] = []

  for (const [index, membership] of input.teamAssignment.teams.entries()) {
    if (membership.teamId !== `team-${index + 1}`) return null
    if (membership.playerIds.length < MIN_PLAYERS_PER_TEAM) return null
    if (membership.playerIds.some((playerId) => !rosterIdSet.has(playerId))) return null
    assignedPlayerIds.push(...membership.playerIds)
    teams.push({
      id: membership.teamId,
      name: `Equipo ${index + 1}`,
      playerIds: [...membership.playerIds],
    })
  }

  const teamSizes = teams.map((team) => team.playerIds.length)
  if (Math.max(...teamSizes) - Math.min(...teamSizes) > 1) return null
  if (assignedPlayerIds.length !== rosterIds.length) return null
  if (new Set(assignedPlayerIds).size !== assignedPlayerIds.length) return null
  if (rosterIds.some((playerId) => !assignedPlayerIds.includes(playerId))) return null
  return teams
}

export function createGameplaySetupKey(input: GameplaySetupInput) {
  return JSON.stringify({
    ownerPlayerId: input.ownerPlayerId,
    players: input.players.map((player) => [player.id, player.name]),
    teams: input.teamAssignment.teams.map((team) => [team.teamId, [...team.playerIds]]),
    turnDuration: input.turnDuration,
    mainDeckCardCount: input.mainDeckCardCount,
    draftMainDeckCardCount: input.cardDraft.mainDeckCardCount,
    selections: input.cardDraft.playerDrafts.map((playerDraft) => [
      playerDraft.playerId,
      [...playerDraft.selectedMainCardIds].sort(),
      playerDraft.lightningCardId,
    ]),
  })
}

export function validateGameplaySetup(input: GameplaySetupInput): GameplaySetupValidation {
  if (
    !input.ownerPlayerId.trim() ||
    !input.players.some((player) => player.id === input.ownerPlayerId)
  ) {
    return { kind: 'rejected', reason: 'invalid-owner' }
  }
  if (!hasValidRoster(input)) return { kind: 'rejected', reason: 'invalid-roster' }
  if (!VALID_TURN_DURATIONS.has(input.turnDuration)) {
    return { kind: 'rejected', reason: 'invalid-turn-duration' }
  }
  if (!VALID_MAIN_CARD_COUNTS.has(input.mainDeckCardCount)) {
    return { kind: 'rejected', reason: 'invalid-main-count' }
  }

  const teams = resolveTeams(input)
  if (!teams) return { kind: 'rejected', reason: 'invalid-team-assignment' }
  if (input.cardDraft.phase !== CARD_DRAFT_PHASES.complete) {
    return { kind: 'rejected', reason: 'incomplete-card-draft' }
  }
  if (input.cardDraft.mainDeckCardCount !== input.mainDeckCardCount) {
    return { kind: 'rejected', reason: 'invalid-card-draft' }
  }

  const expectedDraftSetupKey = createCardDraftSetupKey({
    ownerPlayerId: input.ownerPlayerId,
    players: input.players,
    mainDeckCardCount: input.mainDeckCardCount,
    teamAssignmentSignature: getDraftTeamSignature(input),
  })
  const draftErrors = getCardDraftSessionErrors(
    input.cardDraft,
    expectedDraftSetupKey,
    input.mainDeckCardCount,
    input.players.map((player) => player.id),
    input.knownCardIds,
  )
  if (draftErrors.length > 0) return { kind: 'rejected', reason: 'invalid-card-draft' }

  const mainDeckCardIds = input.cardDraft.playerDrafts.flatMap(
    (playerDraft) => playerDraft.selectedMainCardIds,
  )
  const lightningDeckCardIds: CardId[] = []
  for (const playerDraft of input.cardDraft.playerDrafts) {
    if (!playerDraft.lightningCardId) {
      return { kind: 'rejected', reason: 'incomplete-card-draft' }
    }
    lightningDeckCardIds.push(playerDraft.lightningCardId)
  }

  if (mainDeckCardIds.length === 0) return { kind: 'rejected', reason: 'empty-main-deck' }
  if (lightningDeckCardIds.length === 0) {
    return { kind: 'rejected', reason: 'empty-lightning-deck' }
  }

  const allSourceCardIds = [...mainDeckCardIds, ...lightningDeckCardIds]
  if (
    new Set(mainDeckCardIds).size !== mainDeckCardIds.length ||
    new Set(lightningDeckCardIds).size !== lightningDeckCardIds.length ||
    new Set(allSourceCardIds).size !== allSourceCardIds.length
  ) {
    return { kind: 'rejected', reason: 'duplicate-source-card' }
  }

  return {
    kind: 'valid',
    setupKey: createGameplaySetupKey(input),
    teams,
    mainDeckCardIds,
    lightningDeckCardIds,
  }
}

export function createGameplayState(
  input: GameplaySetupInput,
  random: GameplayRandomSource,
): GameplayCreationResult {
  const validation = validateGameplaySetup(input)
  if (validation.kind === 'rejected') return validation

  const firstStage = GAMEPLAY_STAGES[0]
  const firstStageCardIds = getSourceCardIdsForStage(
    firstStage,
    validation.mainDeckCardIds,
    validation.lightningDeckCardIds,
  )
  const state: GameplayState = {
    phase: GAMEPLAY_PHASES.handoff,
    setupKey: validation.setupKey,
    turnDuration: input.turnDuration,
    mainDeckCardIds: [...validation.mainDeckCardIds],
    lightningDeckCardIds: [...validation.lightningDeckCardIds],
    stageIndex: firstStage.index,
    stageKind: firstStage.kind,
    pendingCardIds: shuffleCardIds(firstStageCardIds, random),
    teams: validation.teams,
    scores: validation.teams.map((team) => ({ teamId: team.id, score: 0 })),
    currentTeamIndex: 0,
    playerCursors: validation.teams.map(() => 0),
    turnNumber: 1,
    turnStats: { correct: 0, passed: 0 },
    completedTurns: [],
    completedStages: [],
    startedAt: null,
    deadline: null,
  }
  return { kind: 'created', state }
}

function reject(reason: GameplayTransitionRejectReason): GameplayTransitionResult {
  return { kind: 'rejected', reason }
}

function success(state: GameplayState): GameplayTransitionResult {
  return { kind: 'success', state }
}

export function getCurrentTurnParticipant(
  state: GameplayState,
): CurrentTurnParticipant | null {
  const team = state.teams[state.currentTeamIndex]
  const playerIndex = state.playerCursors[state.currentTeamIndex]
  if (!team || !Number.isInteger(playerIndex) || playerIndex < 0) return null
  const playerId = team.playerIds[playerIndex]
  if (!playerId) return null
  return { team, teamIndex: state.currentTeamIndex, playerId, playerIndex }
}

export function getCurrentGameplayCardId(state: GameplayState) {
  return state.pendingCardIds[0] ?? null
}

export function getGameplayTurnDurationSeconds(
  stage: GameplayStage,
  configuredTurnDuration: TurnDuration,
) {
  return stage.kind === 'lightning' ? 10 : configuredTurnDuration
}

function getNextRotation(state: GameplayState) {
  const participant = getCurrentTurnParticipant(state)
  if (!participant || state.teams.length < 2) return null

  const playerCursors = [...state.playerCursors]
  playerCursors[participant.teamIndex] =
    (participant.playerIndex + 1) % participant.team.playerIds.length
  return {
    currentTeamIndex: (participant.teamIndex + 1) % state.teams.length,
    playerCursors,
  }
}

function createTurnResult(
  state: GameplayState,
  participant: CurrentTurnParticipant,
  correct: number,
  passed: number,
  endReason: GameplayTurnResult['endReason'],
): GameplayTurnResult {
  return {
    turnNumber: state.turnNumber,
    stageIndex: state.stageIndex,
    stageKind: state.stageKind,
    teamId: participant.team.id,
    playerId: participant.playerId,
    correct,
    passed,
    endReason,
  }
}

export function startGameplayTurn(
  state: GameplayState,
  now: number,
): GameplayTransitionResult {
  if (
    state.phase !== GAMEPLAY_PHASES.handoff &&
    state.phase !== GAMEPLAY_PHASES.concealedActive
  ) {
    return reject('invalid-phase')
  }
  if (!Number.isFinite(now)) return reject('invalid-timestamp')

  if (state.phase === GAMEPLAY_PHASES.concealedActive) {
    if (now < state.startedAt) return reject('invalid-timestamp')
    if (now > state.deadline) return expireGameplayTurn(state, now)
    return success({ ...state, phase: GAMEPLAY_PHASES.activeTurn })
  }

  if (!getCurrentTurnParticipant(state)) return reject('invalid-participant')
  if (!getCurrentGameplayCardId(state)) return reject('empty-deck')
  const stage = GAMEPLAY_STAGES[state.stageIndex]
  if (!stage || stage.kind !== state.stageKind) return reject('invalid-stage')

  return success({
    ...state,
    phase: GAMEPLAY_PHASES.activeTurn,
    startedAt: now,
    deadline: now + getGameplayTurnDurationSeconds(stage, state.turnDuration) * 1_000,
  })
}

function resumeLightningAttribution(
  state: LightningAttributionGameplayState,
  now: number,
): ActiveGameplayState {
  const pauseDuration = now - state.pendingAttribution.pausedAt
  const { pendingAttribution, ...activeState } = state
  void pendingAttribution
  return {
    ...activeState,
    phase: GAMEPLAY_PHASES.activeTurn,
    startedAt: state.startedAt + pauseDuration,
    deadline: state.deadline + pauseDuration,
  }
}

export function concealActiveGameplayTurn(
  state: GameplayState,
  now: number,
): GameplayTransitionResult {
  if (
    state.phase !== GAMEPLAY_PHASES.activeTurn &&
    state.phase !== GAMEPLAY_PHASES.lightningAttribution &&
    state.phase !== GAMEPLAY_PHASES.concealedActive
  ) {
    return reject('invalid-phase')
  }
  if (!Number.isFinite(now)) return reject('invalid-timestamp')
  if (state.phase === GAMEPLAY_PHASES.lightningAttribution) {
    if (now < state.pendingAttribution.pausedAt) return reject('invalid-timestamp')
    const resumedState = resumeLightningAttribution(state, now)
    return success({
      ...resumedState,
      phase: GAMEPLAY_PHASES.concealedActive,
    })
  }
  if (now < state.startedAt) return reject('invalid-timestamp')
  if (state.phase === GAMEPLAY_PHASES.concealedActive) return success(state)
  return success({
    ...state,
    phase: GAMEPLAY_PHASES.concealedActive,
  })
}

export function expireGameplayTurn(
  state: GameplayState,
  now: number,
): GameplayTransitionResult {
  if (!Number.isFinite(now)) return reject('invalid-timestamp')
  if (state.phase === GAMEPLAY_PHASES.timeExpired) return success(state)
  if (
    state.phase !== GAMEPLAY_PHASES.activeTurn &&
    state.phase !== GAMEPLAY_PHASES.concealedActive
  ) {
    return reject('invalid-phase')
  }
  if (now < state.startedAt) return reject('invalid-timestamp')
  if (now <= state.deadline) return reject('deadline-not-reached')

  const participant = getCurrentTurnParticipant(state)
  if (!participant) return reject('invalid-participant')
  const completedTurn = createTurnResult(
    state,
    participant,
    state.turnStats.correct,
    state.turnStats.passed,
    'timeout',
  )
  return success({
    ...state,
    phase: GAMEPLAY_PHASES.timeExpired,
    completedTurns: [...state.completedTurns, completedTurn],
    startedAt: null,
    deadline: null,
  })
}

function expireAtBoundary(
  state: ActiveGameplayState,
  now: number,
) {
  return now > state.deadline ? expireGameplayTurn(state, now) : null
}

function reconcileActiveDecisionTimestamp(
  state: ActiveGameplayState,
  decidedAt: number,
) {
  if (!Number.isFinite(decidedAt) || decidedAt < state.startedAt) {
    return reject('invalid-timestamp')
  }
  return expireAtBoundary(state, decidedAt)
}

function getValidatedStage(state: GameplayState) {
  const stage = GAMEPLAY_STAGES[state.stageIndex]
  return stage?.kind === state.stageKind ? stage : null
}

function getUniquePlayerTeam(state: GameplayState, playerId: string) {
  const memberships = state.teams.flatMap((team) =>
    team.playerIds.flatMap((candidateId) => (candidateId === playerId ? [team] : [])),
  )
  return memberships.length === 1 ? memberships[0] : null
}

function applyCorrectGameplayCard(
  state: ActiveGameplayState,
  scoringTeam: GameplayTeam,
  scoringPlayerId: string,
): GameplayTransitionResult {
  const participant = getCurrentTurnParticipant(state)
  if (!participant) return reject('invalid-participant')
  const pendingCardIds = state.pendingCardIds.slice(1)
  const scores = state.scores.map((score) =>
    score.teamId === scoringTeam.id ? { ...score, score: score.score + 1 } : score,
  )
  const turnStats = { ...state.turnStats, correct: state.turnStats.correct + 1 }

  if (pendingCardIds.length > 0) {
    return success({ ...state, pendingCardIds, scores, turnStats })
  }

  const completedTurn = createTurnResult(
    state,
    participant,
    turnStats.correct,
    turnStats.passed,
    'stage-complete',
  )
  const completedStage = {
    stageIndex: state.stageIndex,
    stageKind: state.stageKind,
    completedByTeamId: scoringTeam.id,
    completedByPlayerId: scoringPlayerId,
    scores: scores.map((score) => ({ ...score })),
  }
  const isFinalStage = state.stageIndex === GAMEPLAY_STAGES.at(-1)?.index
  return success({
    ...state,
    phase: isFinalStage ? GAMEPLAY_PHASES.gameComplete : GAMEPLAY_PHASES.stageComplete,
    pendingCardIds,
    scores,
    turnStats,
    completedTurns: [...state.completedTurns, completedTurn],
    completedStages: [...state.completedStages, completedStage],
    startedAt: null,
    deadline: null,
  })
}

export function markGameplayCardCorrect(
  state: GameplayState,
  cardId: CardId,
  now: number,
): GameplayTransitionResult {
  if (state.phase !== GAMEPLAY_PHASES.activeTurn) return reject('invalid-phase')
  const timestampResult = reconcileActiveDecisionTimestamp(state, now)
  if (timestampResult) return timestampResult
  const stage = getValidatedStage(state)
  if (!stage) return reject('invalid-stage')
  if (stage.kind === 'lightning') return reject('attribution-required')
  if (!getCurrentGameplayCardId(state)) return reject('empty-deck')
  if (getCurrentGameplayCardId(state) !== cardId) return reject('stale-card')

  const participant = getCurrentTurnParticipant(state)
  if (!participant) return reject('invalid-participant')
  return applyCorrectGameplayCard(state, participant.team, participant.playerId)
}

export function beginLightningCardAttribution(
  state: GameplayState,
  cardId: CardId,
  decidedAt: number,
): GameplayTransitionResult {
  if (state.phase !== GAMEPLAY_PHASES.activeTurn) return reject('invalid-phase')
  const timestampResult = reconcileActiveDecisionTimestamp(state, decidedAt)
  if (timestampResult) return timestampResult
  const stage = getValidatedStage(state)
  if (!stage || stage.kind !== 'lightning') return reject('invalid-stage')
  const currentCardId = getCurrentGameplayCardId(state)
  if (!currentCardId) return reject('empty-deck')
  if (currentCardId !== cardId) return reject('stale-card')

  return success({
    ...state,
    phase: GAMEPLAY_PHASES.lightningAttribution,
    pendingAttribution: {
      cardId,
      decidedAt,
      pausedAt: decidedAt,
    },
  })
}

export function awardLightningCardAttribution(
  state: GameplayState,
  cardId: CardId,
  playerId: string,
  now: number,
): GameplayTransitionResult {
  if (state.phase !== GAMEPLAY_PHASES.lightningAttribution) return reject('invalid-phase')
  if (!Number.isFinite(now) || now < state.pendingAttribution.pausedAt) {
    return reject('invalid-timestamp')
  }
  if (
    state.pendingAttribution.cardId !== cardId ||
    getCurrentGameplayCardId(state) !== cardId
  ) {
    return reject('stale-card')
  }
  const scoringTeam = getUniquePlayerTeam(state, playerId)
  if (!scoringTeam) return reject('invalid-player-membership')
  const resumedState = resumeLightningAttribution(state, now)
  return applyCorrectGameplayCard(resumedState, scoringTeam, playerId)
}

export function cancelLightningCardAttribution(
  state: GameplayState,
  cardId: CardId,
  now: number,
): GameplayTransitionResult {
  if (state.phase !== GAMEPLAY_PHASES.lightningAttribution) return reject('invalid-phase')
  if (!Number.isFinite(now) || now < state.pendingAttribution.pausedAt) {
    return reject('invalid-timestamp')
  }
  if (
    state.pendingAttribution.cardId !== cardId ||
    getCurrentGameplayCardId(state) !== cardId
  ) {
    return reject('stale-card')
  }
  const resumedState = resumeLightningAttribution(state, now)
  return success(resumedState)
}

export function passGameplayCard(
  state: GameplayState,
  cardId: CardId,
  now: number,
): GameplayTransitionResult {
  if (state.phase !== GAMEPLAY_PHASES.activeTurn) return reject('invalid-phase')
  const timestampResult = reconcileActiveDecisionTimestamp(state, now)
  if (timestampResult) return timestampResult
  const currentCardId = getCurrentGameplayCardId(state)
  if (!currentCardId) return reject('empty-deck')
  if (currentCardId !== cardId) return reject('stale-card')

  return success({
    ...state,
    pendingCardIds: [...state.pendingCardIds.slice(1), currentCardId],
    turnStats: { ...state.turnStats, passed: state.turnStats.passed + 1 },
  })
}

export function shuffleRemainingGameplayCards(
  state: GameplayState,
  random: GameplayRandomSource,
): GameplayTransitionResult {
  if (state.phase !== GAMEPLAY_PHASES.timeExpired) return reject('invalid-phase')
  if (state.pendingCardIds.length === 0) return reject('empty-deck')
  const nextRotation = getNextRotation(state)
  if (!nextRotation) return reject('invalid-participant')

  return success({
    ...state,
    phase: GAMEPLAY_PHASES.handoff,
    pendingCardIds: shuffleCardIds(state.pendingCardIds, random),
    ...nextRotation,
    turnNumber: state.turnNumber + 1,
    turnStats: { correct: 0, passed: 0 },
    startedAt: null,
    deadline: null,
  })
}

export function prepareNextGameplayStage(
  state: GameplayState,
  random: GameplayRandomSource,
): GameplayTransitionResult {
  if (state.phase !== GAMEPLAY_PHASES.stageComplete) return reject('invalid-phase')
  const nextStage = GAMEPLAY_STAGES[state.stageIndex + 1]
  if (!nextStage) return reject('final-stage')
  const sourceCardIds = getSourceCardIdsForStage(
    nextStage,
    state.mainDeckCardIds,
    state.lightningDeckCardIds,
  )
  if (sourceCardIds.length === 0) return reject('empty-deck')
  const nextRotation = getNextRotation(state)
  if (!nextRotation) return reject('invalid-participant')

  return success({
    ...state,
    phase: GAMEPLAY_PHASES.handoff,
    stageIndex: nextStage.index,
    stageKind: nextStage.kind,
    pendingCardIds: shuffleCardIds(sourceCardIds, random),
    ...nextRotation,
    turnNumber: state.turnNumber + 1,
    turnStats: { correct: 0, passed: 0 },
    startedAt: null,
    deadline: null,
  })
}

export function showGameplayResults(state: GameplayState): GameplayTransitionResult {
  if (state.phase !== GAMEPLAY_PHASES.gameComplete) return reject('invalid-phase')
  return success({ ...state, phase: GAMEPLAY_PHASES.results })
}

export function getWinningTeams(state: GameplayState): WinningTeam[] {
  if (state.scores.length === 0) return []
  const highestScore = Math.max(...state.scores.map((score) => score.score))
  return state.scores.flatMap((score) => {
    if (score.score !== highestScore) return []
    const team = state.teams.find((candidate) => candidate.id === score.teamId)
    return team ? [{ id: team.id, name: team.name, score: score.score }] : []
  })
}

export function getCompatibleGameplayState(
  state: GameplayState | null,
  expectedSetupKey: string,
) {
  return state?.setupKey === expectedSetupKey ? state : null
}

export function getScoreForTeam(scores: readonly GameplayTeamScore[], teamId: string) {
  return scores.find((score) => score.teamId === teamId)?.score ?? 0
}
