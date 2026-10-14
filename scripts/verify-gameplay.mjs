import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { concealActiveGameplayForRoute } from '../src/modules/game/game-route-privacy.ts'
import { getKeyboardDecision, getSwipeDecision } from '../src/modules/game/swipe.ts'
import { CARD_IDS } from '../src/shared/catalog/card-catalog.ts'
import { createCardDraftSetupKey } from '../src/shared/domain/card-draft.ts'
import {
  concealActiveGameplayTurn,
  createGameplaySetupKey,
  createGameplayState,
  expireGameplayTurn,
  getCompatibleGameplayState,
  getCurrentGameplayCardId,
  getCurrentTurnParticipant,
  getWinningTeams,
  markGameplayCardCorrect,
  passGameplayCard,
  prepareNextGameplayStage,
  showGameplayResults,
  shuffleRemainingGameplayCards,
  startGameplayTurn,
  validateGameplaySetup,
} from '../src/shared/domain/gameplay.ts'
import { createProfileIdentityState } from '../src/shared/domain/profile-identity.ts'
import { useGameplayStore } from '../src/shared/store/gameplay.store.ts'
import { replaceProfileIdentity } from '../src/shared/store/profile-identity.actions.ts'
import { CARD_DRAFT_PHASES } from '../src/shared/types/card-draft.ts'
import { GAMEPLAY_PHASES, GAMEPLAY_STAGES } from '../src/shared/types/gameplay.ts'

function createSeededRandom(seed) {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0x100000000
  }
}

function expectTransition(result) {
  assert.equal(result.kind, 'success')
  return result.state
}

function expectTransitionRejected(result, reason) {
  assert.deepEqual(result, { kind: 'rejected', reason })
}

function expectSetupRejected(result, reason) {
  assert.deepEqual(result, { kind: 'rejected', reason })
}

function getRootTokens(source) {
  const rootBlock = source.match(/:root\s*\{([\s\S]*?)\}/)
  assert.ok(rootBlock)
  return new Map(
    [...rootBlock[1].matchAll(/^\s*(--[\w-]+)\s*:\s*([^;]+);/gm)].map(
      ([, token, value]) => [token, value.trim().toLowerCase()],
    ),
  )
}

function resolveRootToken(rootTokens, token, ancestors = []) {
  assert.ok(!ancestors.includes(token), `Circular root token reference: ${[...ancestors, token].join(' -> ')}`)
  const value = rootTokens.get(token)
  assert.ok(value, `Missing root token: ${token}`)
  return value.replace(/var\((--[\w-]+)\)/g, (_, referencedToken) =>
    resolveRootToken(rootTokens, referencedToken, [...ancestors, token]),
  )
}

function getRuleBody(source, selectorPattern, label) {
  const rule = source.match(new RegExp(`${selectorPattern}\\s*\\{([^}]*)\\}`))
  assert.ok(rule, `Missing CSS rule: ${label}`)
  return rule[1]
}

function getDeclarationValue(ruleBody, property, label) {
  const declaration = ruleBody.match(
    new RegExp(`(?:^|\\n)\\s*${property}:\\s*([^;]+);`),
  )
  assert.ok(declaration, `Missing ${property} declaration: ${label}`)
  return declaration[1].trim()
}

function getDeclaredProperties(ruleBody) {
  return [...ruleBody.matchAll(/^\s*([\w-]+)\s*:/gm)].map(([, property]) => property)
}

function assertRuleUsesPill(source, selectorPattern, label) {
  assert.match(
    getRuleBody(source, selectorPattern, label),
    /border-radius:\s*var\(--radius-control-pill\);/,
    `${label} must use the shared control pill radius`,
  )
}

function getTeamSignature(teamAssignment) {
  return teamAssignment.teams
    .map((team) => `${team.teamId}:${team.playerIds.join(',')}`)
    .join('|')
}

function withCurrentDraftSetupKey(input) {
  return {
    ...input,
    cardDraft: {
      ...input.cardDraft,
      setupKey: createCardDraftSetupKey({
        ownerPlayerId: input.ownerPlayerId,
        players: input.players,
        mainDeckCardCount: input.mainDeckCardCount,
        teamAssignmentSignature: getTeamSignature(input.teamAssignment),
      }),
    },
  }
}

function createSetup(teamSizes, options = {}) {
  const mainDeckCardCount = options.mainDeckCardCount ?? 3
  const turnDuration = options.turnDuration ?? 30
  const playerCount = teamSizes.reduce((total, size) => total + size, 0)
  const players = Array.from({ length: playerCount }, (_, index) => ({
    id: `player-${index + 1}`,
    name: `Player ${index + 1}`,
  }))
  let playerOffset = 0
  const teamAssignment = {
    teams: teamSizes.map((size, index) => {
      const playerIds = players
        .slice(playerOffset, playerOffset + size)
        .map((player) => player.id)
      playerOffset += size
      return { teamId: `team-${index + 1}`, playerIds }
    }),
  }
  const playerDrafts = players.map((player, index) => {
    const dealCardIds = CARD_IDS.slice(index * 10, (index + 1) * 10)
    return {
      playerId: player.id,
      dealCardIds,
      selectedMainCardIds: dealCardIds.slice(0, mainDeckCardCount),
      lightningCardId: dealCardIds[mainDeckCardCount],
    }
  })
  const input = {
    ownerPlayerId: players[0].id,
    players,
    turnDuration,
    mainDeckCardCount,
    teamCount: teamSizes.length,
    teamAssignment,
    cardDraft: {
      setupKey: '',
      mainDeckCardCount,
      playerDrafts,
      currentPlayerIndex: players.length,
      phase: CARD_DRAFT_PHASES.complete,
    },
    knownCardIds: CARD_IDS,
  }
  return withCurrentDraftSetupKey(input)
}

function createGame(teamSizes, seed = 1) {
  const input = createSetup(teamSizes)
  const result = createGameplayState(input, createSeededRandom(seed))
  assert.equal(result.kind, 'created')
  return { input, state: result.state }
}

function getTurnIdentity(state) {
  const participant = getCurrentTurnParticipant(state)
  assert.ok(participant)
  return `${participant.team.id}:${participant.playerId}`
}

function rotateAfterTimeout(state, now, random = () => 0.5) {
  const active = expectTransition(startGameplayTurn(state, now))
  const expired = expectTransition(expireGameplayTurn(active, active.deadline + 1))
  return expectTransition(shuffleRemainingGameplayCards(expired, random))
}

function verifyRotation(teamSizes, expectedTurns) {
  let state = createGame(teamSizes, teamSizes.length).state
  const turns = []
  for (let index = 0; index < expectedTurns.length; index += 1) {
    turns.push(getTurnIdentity(state))
    state = rotateAfterTimeout(state, 100_000 + index * 40_000)
  }
  assert.deepEqual(turns, expectedTurns)
}

verifyRotation([2, 3], [
  'team-1:player-1',
  'team-2:player-3',
  'team-1:player-2',
  'team-2:player-4',
  'team-1:player-1',
  'team-2:player-5',
  'team-1:player-2',
  'team-2:player-3',
])
verifyRotation([3, 2, 2], [
  'team-1:player-1',
  'team-2:player-4',
  'team-3:player-6',
  'team-1:player-2',
  'team-2:player-5',
  'team-3:player-7',
  'team-1:player-3',
  'team-2:player-4',
])
verifyRotation([2, 2, 2, 2], [
  'team-1:player-1',
  'team-2:player-3',
  'team-3:player-5',
  'team-4:player-7',
  'team-1:player-2',
  'team-2:player-4',
  'team-3:player-6',
  'team-4:player-8',
  'team-1:player-1',
])

const exactDeckGame = createGame([2, 2], 22)
const expectedMainDeck = exactDeckGame.input.cardDraft.playerDrafts.flatMap(
  (draft) => draft.selectedMainCardIds,
)
const expectedLightningDeck = exactDeckGame.input.cardDraft.playerDrafts.map(
  (draft) => draft.lightningCardId,
)
assert.deepEqual(exactDeckGame.state.mainDeckCardIds, expectedMainDeck)
assert.deepEqual(exactDeckGame.state.lightningDeckCardIds, expectedLightningDeck)
assert.equal(new Set(exactDeckGame.state.mainDeckCardIds).size, expectedMainDeck.length)
assert.equal(new Set(exactDeckGame.state.lightningDeckCardIds).size, expectedLightningDeck.length)
assert.deepEqual(
  [...exactDeckGame.state.pendingCardIds].sort(),
  [...expectedMainDeck].sort(),
)

const sequenceGame = createGame([2, 2], 8).state
expectTransitionRejected(
  markGameplayCardCorrect(sequenceGame, sequenceGame.pendingCardIds[0], 1),
  'invalid-phase',
)
let sequenceState = expectTransition(startGameplayTurn(sequenceGame, 1_000))
const originalQueue = [...sequenceState.pendingCardIds]
sequenceState = expectTransition(passGameplayCard(sequenceState, originalQueue[0], 1_001))
assert.equal(sequenceState.scores[0].score, 0)
assert.equal(sequenceState.turnStats.passed, 1)
assert.deepEqual(sequenceState.pendingCardIds, [...originalQueue.slice(1), originalQueue[0]])
const correctCardId = sequenceState.pendingCardIds[0]
sequenceState = expectTransition(markGameplayCardCorrect(sequenceState, correctCardId, 1_002))
assert.equal(sequenceState.scores[0].score, 1)
assert.equal(sequenceState.turnStats.correct, 1)
assert.ok(!sequenceState.pendingCardIds.includes(correctCardId))
expectTransitionRejected(markGameplayCardCorrect(sequenceState, correctCardId, 1_003), 'stale-card')

const synchronousStoreBase = createGame([2, 2], 9).state
const synchronousStoreActive = expectTransition(startGameplayTurn(synchronousStoreBase, 3_000))
const synchronousStoreCardId = synchronousStoreActive.pendingCardIds[0]
useGameplayStore.setState({ game: synchronousStoreActive })
let synchronouslyObservedGame = null
const unsubscribeFromSynchronousDecision = useGameplayStore.subscribe((state) => {
  synchronouslyObservedGame = state.game
})
const synchronousStoreDecision = useGameplayStore
  .getState()
  .markCorrect(synchronousStoreCardId, 3_001)
unsubscribeFromSynchronousDecision()
assert.equal(synchronousStoreDecision.kind, 'success')
assert.strictEqual(useGameplayStore.getState().game, synchronousStoreDecision.state)
assert.strictEqual(synchronouslyObservedGame, synchronousStoreDecision.state)
assert.equal(synchronousStoreDecision.state.scores[0].score, 1)
assert.ok(!synchronousStoreDecision.state.pendingCardIds.includes(synchronousStoreCardId))

const beforeConcealment = {
  startedAt: sequenceState.startedAt,
  deadline: sequenceState.deadline,
  pendingCardIds: [...sequenceState.pendingCardIds],
  scores: sequenceState.scores.map((score) => ({ ...score })),
  turnStats: { ...sequenceState.turnStats },
  turnIdentity: getTurnIdentity(sequenceState),
}
const concealedTurn = expectTransition(concealActiveGameplayTurn(sequenceState))
assert.equal(concealedTurn.phase, GAMEPLAY_PHASES.concealedActive)
assert.equal(concealedTurn.startedAt, beforeConcealment.startedAt)
assert.equal(concealedTurn.deadline, beforeConcealment.deadline)
assert.deepEqual(concealedTurn.pendingCardIds, beforeConcealment.pendingCardIds)
assert.deepEqual(concealedTurn.scores, beforeConcealment.scores)
assert.deepEqual(concealedTurn.turnStats, beforeConcealment.turnStats)
assert.equal(getTurnIdentity(concealedTurn), beforeConcealment.turnIdentity)
const resumedTurn = expectTransition(startGameplayTurn(concealedTurn, 2_000))
assert.equal(resumedTurn.phase, GAMEPLAY_PHASES.activeTurn)
assert.equal(resumedTurn.startedAt, beforeConcealment.startedAt)
assert.equal(resumedTurn.deadline, beforeConcealment.deadline)
assert.equal(resumedTurn.deadline - 2_000, 29_000)
assert.deepEqual(resumedTurn.turnStats, beforeConcealment.turnStats)

const routeRemountBase = createGame([2, 2], 10).state
const routeRemountActive = expectTransition(startGameplayTurn(routeRemountBase, 4_000))
useGameplayStore.setState({ game: routeRemountActive })
const routeConcealmentResult = concealActiveGameplayForRoute(useGameplayStore)
assert.ok(routeConcealmentResult)
const routeConcealedTurn = expectTransition(routeConcealmentResult)
assert.strictEqual(useGameplayStore.getState().game, routeConcealedTurn)
assert.equal(routeConcealedTurn.phase, GAMEPLAY_PHASES.concealedActive)
assert.equal(routeConcealedTurn.startedAt, routeRemountActive.startedAt)
assert.equal(routeConcealedTurn.deadline, routeRemountActive.deadline)
assert.deepEqual(routeConcealedTurn.pendingCardIds, routeRemountActive.pendingCardIds)
const routeResumeResult = useGameplayStore.getState().startTurn(5_000)
const routeResumedTurn = expectTransition(routeResumeResult)
assert.equal(routeResumedTurn.phase, GAMEPLAY_PHASES.activeTurn)
assert.equal(routeResumedTurn.startedAt, routeRemountActive.startedAt)
assert.equal(routeResumedTurn.deadline, routeRemountActive.deadline)

const timeoutGame = createGame([2, 2], 17).state
const timeoutActive = expectTransition(startGameplayTurn(timeoutGame, 5_000))
expectTransitionRejected(expireGameplayTurn(timeoutActive, timeoutActive.deadline - 1), 'deadline-not-reached')
expectTransitionRejected(expireGameplayTurn(timeoutActive, timeoutActive.deadline), 'deadline-not-reached')
const queueBeforeTimeout = [...timeoutActive.pendingCardIds]
const timeoutState = expectTransition(expireGameplayTurn(timeoutActive, timeoutActive.deadline + 1))
assert.equal(timeoutState.phase, GAMEPLAY_PHASES.timeExpired)
assert.deepEqual(timeoutState.pendingCardIds, queueBeforeTimeout)
assert.equal(timeoutState.completedTurns.length, 1)
const duplicateTimeout = expireGameplayTurn(timeoutState, timeoutActive.deadline + 10_000)
assert.equal(duplicateTimeout.kind, 'success')
assert.strictEqual(duplicateTimeout.state, timeoutState)
assert.equal(duplicateTimeout.state.completedTurns.length, 1)

const concealedExpiryBase = createGame([2, 2], 18).state
const activeBeforeRemount = expectTransition(startGameplayTurn(concealedExpiryBase, 8_000))
const concealedPastDeadline = expectTransition(concealActiveGameplayTurn(activeBeforeRemount))
const resumedAfterDeadline = expectTransition(
  startGameplayTurn(concealedPastDeadline, activeBeforeRemount.deadline + 1),
)
assert.equal(resumedAfterDeadline.phase, GAMEPLAY_PHASES.timeExpired)
assert.equal(resumedAfterDeadline.completedTurns.length, 1)
assert.deepEqual(resumedAfterDeadline.pendingCardIds, activeBeforeRemount.pendingCardIds)
const repeatedConcealedExpiry = expireGameplayTurn(
  resumedAfterDeadline,
  activeBeforeRemount.deadline + 2,
)
assert.equal(repeatedConcealedExpiry.kind, 'success')
assert.strictEqual(repeatedConcealedExpiry.state, resumedAfterDeadline)

const nextPlayerHandoff = expectTransition(
  shuffleRemainingGameplayCards(resumedAfterDeadline, () => 0.5),
)
const nextPlayerStartedAt = activeBeforeRemount.deadline + 5_000
const nextPlayerActive = expectTransition(startGameplayTurn(nextPlayerHandoff, nextPlayerStartedAt))
assert.equal(nextPlayerActive.startedAt, nextPlayerStartedAt)
assert.equal(
  nextPlayerActive.deadline,
  nextPlayerStartedAt + nextPlayerActive.turnDuration * 1_000,
)
assert.notEqual(getTurnIdentity(nextPlayerActive), getTurnIdentity(activeBeforeRemount))

const boundaryBase = createGame([2, 2], 29).state
const boundaryActive = expectTransition(startGameplayTurn(boundaryBase, 10_000))
const boundaryCardId = boundaryActive.pendingCardIds[0]
const oneCardAtDeadline = {
  ...boundaryActive,
  pendingCardIds: [boundaryCardId],
}
const deadlineOutcome = expectTransition(
  markGameplayCardCorrect(oneCardAtDeadline, boundaryCardId, oneCardAtDeadline.deadline),
)
assert.equal(deadlineOutcome.phase, GAMEPLAY_PHASES.stageComplete)
assert.equal(deadlineOutcome.scores[0].score, 1)
assert.deepEqual(deadlineOutcome.pendingCardIds, [])
assert.equal(deadlineOutcome.completedTurns.length, 1)
assert.equal(deadlineOutcome.completedStages.length, 1)
expectTransitionRejected(
  markGameplayCardCorrect(deadlineOutcome, boundaryCardId, oneCardAtDeadline.deadline),
  'invalid-phase',
)
expectTransitionRejected(
  expireGameplayTurn(deadlineOutcome, oneCardAtDeadline.deadline + 1),
  'invalid-phase',
)
assert.equal(deadlineOutcome.completedTurns.length, 1)
assert.equal(deadlineOutcome.completedStages.length, 1)

const lateDecisionOutcome = expectTransition(
  markGameplayCardCorrect(oneCardAtDeadline, boundaryCardId, oneCardAtDeadline.deadline + 1),
)
assert.equal(lateDecisionOutcome.phase, GAMEPLAY_PHASES.timeExpired)
assert.equal(lateDecisionOutcome.scores[0].score, 0)
assert.deepEqual(lateDecisionOutcome.pendingCardIds, [boundaryCardId])
assert.equal(lateDecisionOutcome.completedTurns.length, 1)
const expiryAfterLateDecision = expireGameplayTurn(
  lateDecisionOutcome,
  oneCardAtDeadline.deadline + 2,
)
assert.equal(expiryAfterLateDecision.kind, 'success')
assert.strictEqual(expiryAfterLateDecision.state, lateDecisionOutcome)

const timerFirstOutcome = expectTransition(
  expireGameplayTurn(oneCardAtDeadline, oneCardAtDeadline.deadline + 1),
)
expectTransitionRejected(
  markGameplayCardCorrect(timerFirstOutcome, boundaryCardId, oneCardAtDeadline.deadline + 1),
  'invalid-phase',
)
assert.equal(timerFirstOutcome.completedTurns.length, 1)

const shuffleBase = createGame([2, 2], 31).state
let shuffleActive = expectTransition(startGameplayTurn(shuffleBase, 15_000))
shuffleActive = expectTransition(
  markGameplayCardCorrect(shuffleActive, shuffleActive.pendingCardIds[0], 15_001),
)
const pendingBeforeShuffle = [...shuffleActive.pendingCardIds]
const sourceBeforeShuffle = {
  main: [...shuffleActive.mainDeckCardIds],
  lightning: [...shuffleActive.lightningDeckCardIds],
}
const shuffleExpired = expectTransition(
  expireGameplayTurn(shuffleActive, shuffleActive.deadline + 1),
)
const outOfBoundsValues = [-4, Number.NaN, 8, 0.25]
let randomIndex = 0
const shuffledHandoff = expectTransition(
  shuffleRemainingGameplayCards(
    shuffleExpired,
    () => outOfBoundsValues[randomIndex++ % outOfBoundsValues.length],
  ),
)
assert.equal(shuffledHandoff.phase, GAMEPLAY_PHASES.handoff)
assert.deepEqual([...shuffledHandoff.pendingCardIds].sort(), [...pendingBeforeShuffle].sort())
assert.deepEqual(shuffledHandoff.mainDeckCardIds, sourceBeforeShuffle.main)
assert.deepEqual(shuffledHandoff.lightningDeckCardIds, sourceBeforeShuffle.lightning)
assert.equal(getTurnIdentity(shuffledHandoff), 'team-2:player-3')

function exhaustCurrentStage(state, now) {
  let current = expectTransition(startGameplayTurn(state, now))
  while (current.phase === GAMEPLAY_PHASES.activeTurn) {
    const cardId = getCurrentGameplayCardId(current)
    assert.ok(cardId)
    current = expectTransition(markGameplayCardCorrect(current, cardId, now + 1))
  }
  return current
}

let completeGame = createGame([2, 2], 41).state
const stagePlayers = []
for (const stage of GAMEPLAY_STAGES) {
  assert.equal(completeGame.stageIndex, stage.index)
  assert.equal(completeGame.stageKind, stage.kind)
  const expectedSource = stage.source === 'main'
    ? completeGame.mainDeckCardIds
    : completeGame.lightningDeckCardIds
  assert.deepEqual([...completeGame.pendingCardIds].sort(), [...expectedSource].sort())
  stagePlayers.push(getTurnIdentity(completeGame))
  completeGame = exhaustCurrentStage(completeGame, 30_000 + stage.index * 1_000)
  if (stage.index < GAMEPLAY_STAGES.length - 1) {
    assert.equal(completeGame.phase, GAMEPLAY_PHASES.stageComplete)
    completeGame = expectTransition(prepareNextGameplayStage(completeGame, () => 0.999999))
  }
}
assert.deepEqual(stagePlayers, [
  'team-1:player-1',
  'team-2:player-3',
  'team-1:player-2',
  'team-2:player-4',
])
assert.equal(completeGame.phase, GAMEPLAY_PHASES.gameComplete)
assert.equal(completeGame.completedStages.length, 4)
assert.equal(completeGame.completedTurns.length, 4)
assert.equal(
  completeGame.scores.reduce((total, score) => total + score.score, 0),
  completeGame.mainDeckCardIds.length * 3 + completeGame.lightningDeckCardIds.length,
)
const singleWinners = getWinningTeams(completeGame)
assert.deepEqual(singleWinners.map((winner) => winner.name), ['Equipo 1'])
completeGame = expectTransition(showGameplayResults(completeGame))
assert.equal(completeGame.phase, GAMEPLAY_PHASES.results)
expectTransitionRejected(showGameplayResults(completeGame), 'invalid-phase')

const threeTeamGame = createGame([2, 2, 2], 52).state
const tiedState = {
  ...threeTeamGame,
  scores: threeTeamGame.scores.map((score, index) => ({
    ...score,
    score: index < 2 ? 9 : 4,
  })),
}
assert.deepEqual(getWinningTeams(tiedState).map((winner) => winner.name), [
  'Equipo 1',
  'Equipo 2',
])

for (const turnDuration of [30, 45, 60]) {
  const durationSetup = createSetup([2, 2], { turnDuration })
  const durationCreation = createGameplayState(
    durationSetup,
    createSeededRandom(turnDuration),
  )
  assert.equal(durationCreation.kind, 'created')
  const startedAt = 100_000
  const durationActive = expectTransition(startGameplayTurn(durationCreation.state, startedAt))
  assert.equal(durationActive.deadline, startedAt + turnDuration * 1_000)
  const cardId = getCurrentGameplayCardId(durationActive)
  assert.ok(cardId)
  const exactDeadlineDecision = expectTransition(
    markGameplayCardCorrect(durationActive, cardId, durationActive.deadline),
  )
  assert.equal(exactDeadlineDecision.phase, GAMEPLAY_PHASES.activeTurn)
  assert.equal(exactDeadlineDecision.scores[0].score, 1)
  expectTransitionRejected(
    expireGameplayTurn(exactDeadlineDecision, durationActive.deadline),
    'deadline-not-reached',
  )
  assert.equal(
    expectTransition(
      expireGameplayTurn(exactDeadlineDecision, durationActive.deadline + 1),
    ).phase,
    GAMEPLAY_PHASES.timeExpired,
  )
}

const baseSetup = createSetup([2, 2])
const baseValidation = validateGameplaySetup(baseSetup)
assert.equal(baseValidation.kind, 'valid')

const mismatchedQuotaInput = withCurrentDraftSetupKey({
  ...baseSetup,
  mainDeckCardCount: 4,
})
expectSetupRejected(validateGameplaySetup(mismatchedQuotaInput), 'invalid-card-draft')
assert.notEqual(
  createGameplaySetupKey(mismatchedQuotaInput),
  createGameplaySetupKey({
    ...mismatchedQuotaInput,
    cardDraft: { ...mismatchedQuotaInput.cardDraft, mainDeckCardCount: 4 },
  }),
)

const changedTimerValidation = validateGameplaySetup({ ...baseSetup, turnDuration: 45 })
assert.equal(changedTimerValidation.kind, 'valid')
assert.notEqual(changedTimerValidation.setupKey, baseValidation.setupKey)

const reorderedTeamsInput = withCurrentDraftSetupKey({
  ...baseSetup,
  teamAssignment: {
    teams: baseSetup.teamAssignment.teams.map((team, index) => ({
      ...team,
      playerIds: index === 0 ? [...team.playerIds].reverse() : [...team.playerIds],
    })),
  },
})
const reorderedTeamsValidation = validateGameplaySetup(reorderedTeamsInput)
assert.equal(reorderedTeamsValidation.kind, 'valid')
assert.notEqual(reorderedTeamsValidation.setupKey, baseValidation.setupKey)

const changedSelectionDrafts = baseSetup.cardDraft.playerDrafts.map((draft, index) =>
  index === 0
    ? {
        ...draft,
        selectedMainCardIds: [
          draft.dealCardIds[4],
          draft.selectedMainCardIds[1],
          draft.selectedMainCardIds[2],
        ],
      }
    : draft,
)
const changedSelectionValidation = validateGameplaySetup({
  ...baseSetup,
  cardDraft: { ...baseSetup.cardDraft, playerDrafts: changedSelectionDrafts },
})
assert.equal(changedSelectionValidation.kind, 'valid')
assert.notEqual(changedSelectionValidation.setupKey, baseValidation.setupKey)
assert.equal(
  getCompatibleGameplayState(exactDeckGame.state, changedTimerValidation.setupKey),
  null,
)

const emptyTeamInput = {
  ...baseSetup,
  teamAssignment: {
    teams: [
      { ...baseSetup.teamAssignment.teams[0], playerIds: baseSetup.players.map((player) => player.id) },
      { ...baseSetup.teamAssignment.teams[1], playerIds: [] },
    ],
  },
}
expectSetupRejected(validateGameplaySetup(emptyTeamInput), 'invalid-team-assignment')
const stalePlayerInput = {
  ...baseSetup,
  teamAssignment: {
    teams: baseSetup.teamAssignment.teams.map((team, index) => ({
      ...team,
      playerIds: index === 0 ? ['stale-player', team.playerIds[1]] : [...team.playerIds],
    })),
  },
}
expectSetupRejected(validateGameplaySetup(stalePlayerInput), 'invalid-team-assignment')
expectSetupRejected(
  validateGameplaySetup({
    ...baseSetup,
    cardDraft: { ...baseSetup.cardDraft, phase: CARD_DRAFT_PHASES.handoff, currentPlayerIndex: 0 },
  }),
  'incomplete-card-draft',
)
const duplicateSourceDrafts = baseSetup.cardDraft.playerDrafts.map((draft, index) =>
  index === 1
    ? {
        ...draft,
        dealCardIds: [baseSetup.cardDraft.playerDrafts[0].dealCardIds[0], ...draft.dealCardIds.slice(1)],
        selectedMainCardIds: [
          baseSetup.cardDraft.playerDrafts[0].selectedMainCardIds[0],
          ...draft.selectedMainCardIds.slice(1),
        ],
      }
    : draft,
)
expectSetupRejected(
  validateGameplaySetup({
    ...baseSetup,
    cardDraft: { ...baseSetup.cardDraft, playerDrafts: duplicateSourceDrafts },
  }),
  'invalid-card-draft',
)
const emptyPendingState = { ...exactDeckGame.state, pendingCardIds: [] }
assert.equal(getCurrentGameplayCardId(emptyPendingState), null)
expectTransitionRejected(startGameplayTurn(emptyPendingState, 1), 'empty-deck')
expectTransitionRejected(prepareNextGameplayStage(exactDeckGame.state, Math.random), 'invalid-phase')

assert.equal(getSwipeDecision(0, 100), 'correct')
assert.equal(getSwipeDecision(0, -100), 'pass')
assert.equal(getSwipeDecision(0, 40), null)
assert.equal(getSwipeDecision(100, 80), null)
assert.equal(getSwipeDecision(Number.NaN, 100), null)
assert.equal(getKeyboardDecision('ArrowDown', false), 'correct')
assert.equal(getKeyboardDecision('ArrowUp', false), 'pass')
assert.equal(getKeyboardDecision('ArrowDown', true), null)
assert.equal(getKeyboardDecision('ArrowUp', true), null)
assert.equal(getKeyboardDecision('Enter', false), null)

const initializedProfileIdentity = createProfileIdentityState(
  '  New owner  ',
  { id: 'new-owner', name: 'Stale owner' },
  { turnDuration: 45, mainDeckCardCount: 4, teamCount: 2 },
)
assert.deepEqual(initializedProfileIdentity, {
  nickname: 'New owner',
  players: [{ id: 'new-owner', name: 'New owner' }],
  ownerPlayerId: 'new-owner',
  turnDuration: 45,
  mainDeckCardCount: 4,
  teamCount: 2,
  teamAssignment: { teams: [] },
  cardDraft: null,
})
assert.equal(
  createProfileIdentityState('', { id: 'new-owner', name: 'Old owner' }, {
    turnDuration: 45,
    mainDeckCardCount: 4,
    teamCount: 2,
  }),
  null,
)

useGameplayStore.setState({ game: routeResumedTurn })
let seededSetupState = {
  avatar: 'avatar-4',
  nickname: 'Old owner',
  players: baseSetup.players.map((player) => ({ ...player })),
  ownerPlayerId: baseSetup.ownerPlayerId,
  turnDuration: 60,
  mainDeckCardCount: 5,
  teamCount: baseSetup.teamCount,
  teamAssignment: {
    teams: baseSetup.teamAssignment.teams.map((team) => ({
      ...team,
      playerIds: [...team.playerIds],
    })),
  },
  cardDraft: baseSetup.cardDraft,
}
const identityReplacementOrder = []
const replacementIdentity = replaceProfileIdentity(
  {
    nickname: '  Replacement owner  ',
    ownerPlayer: { id: 'replacement-owner', name: 'Ignored stale name' },
    defaults: { turnDuration: 45, mainDeckCardCount: 4, teamCount: 2 },
  },
  {
    resetGameplay: () => {
      identityReplacementOrder.push('gameplay-reset')
      useGameplayStore.getState().resetGameplay()
    },
    replaceSetup: (nextIdentity) => {
      assert.equal(useGameplayStore.getState().game, null)
      identityReplacementOrder.push('setup-replaced')
      seededSetupState = { ...seededSetupState, ...nextIdentity }
    },
  },
)
assert.deepEqual(identityReplacementOrder, ['gameplay-reset', 'setup-replaced'])
assert.equal(useGameplayStore.getState().game, null)
assert.deepEqual(replacementIdentity, {
  nickname: 'Replacement owner',
  players: [{ id: 'replacement-owner', name: 'Replacement owner' }],
  ownerPlayerId: 'replacement-owner',
  turnDuration: 45,
  mainDeckCardCount: 4,
  teamCount: 2,
  teamAssignment: { teams: [] },
  cardDraft: null,
})
assert.deepEqual(seededSetupState, {
  avatar: 'avatar-4',
  ...replacementIdentity,
})

const invalidIdentityActions = []
assert.equal(
  replaceProfileIdentity(
    {
      nickname: '   ',
      ownerPlayer: { id: 'unused-owner', name: 'Unused owner' },
      defaults: { turnDuration: 45, mainDeckCardCount: 4, teamCount: 2 },
    },
    {
      resetGameplay: () => invalidIdentityActions.push('gameplay-reset'),
      replaceSetup: () => invalidIdentityActions.push('setup-replaced'),
    },
  ),
  null,
)
assert.deepEqual(invalidIdentityActions, [])

const gamePageSource = await readFile(
  new URL('../src/modules/game/game.page.tsx', import.meta.url),
  'utf8',
)
const gameplayCardSource = await readFile(
  new URL('../src/modules/game/components/gameplay-card/gameplay-card.tsx', import.meta.url),
  'utf8',
)
const gameplayCardStyles = await readFile(
  new URL(
    '../src/modules/game/components/gameplay-card/gameplay-card.module.css',
    import.meta.url,
  ),
  'utf8',
)
const homePageSource = await readFile(
  new URL('../src/modules/home/home.page.tsx', import.meta.url),
  'utf8',
)
const gameStyles = await readFile(
  new URL('../src/modules/game/game.module.css', import.meta.url),
  'utf8',
)
const globalStyles = await readFile(new URL('../src/index.css', import.meta.url), 'utf8')
const setupStoreSource = await readFile(
  new URL('../src/shared/store/setup.store.ts', import.meta.url),
  'utf8',
)
const gameplayStoreSource = await readFile(
  new URL('../src/shared/store/gameplay.store.ts', import.meta.url),
  'utf8',
)
const cardsPageSource = await readFile(
  new URL('../src/modules/cards/cards.page.tsx', import.meta.url),
  'utf8',
)
const routesSource = await readFile(
  new URL('../src/core/routes/routes.tsx', import.meta.url),
  'utf8',
)

const handoffStart = gamePageSource.indexOf('function HandoffView')
const handoffEnd = gamePageSource.indexOf('interface ActiveTurnViewProps', handoffStart)
assert.ok(handoffStart >= 0 && handoffEnd > handoffStart)
const handoffSource = gamePageSource.slice(handoffStart, handoffEnd)
assert.doesNotMatch(handoffSource, /CARD_CATALOG_BY_ID|GameplayCard|card\.title|card\.character/)
assert.match(handoffSource, /Tocá para ver la carta/)
assert.match(handoffSource, /Continuar turno/)
assert.match(handoffSource, /GAMEPLAY_PHASES\.concealedActive/)
assert.match(handoffSource, /game\.pendingCardIds\.length/)
assert.match(gamePageSource, /blockInitialActiveCard/)
assert.match(gamePageSource, /setBlockInitialActiveCard\(false\)[\s\S]*startTurn\(Date\.now\(\)\)/)
const removedInitialStatus = [
  'Turno iniciado',
  'Abajo es acierto; arriba es pasar',
].join('. ')
assert.ok(!gamePageSource.includes(removedInitialStatus))
const activeTurnViewStart = gamePageSource.indexOf('function ActiveTurnView')
const activeTurnViewEnd = gamePageSource.indexOf('interface ScoreTableProps', activeTurnViewStart)
assert.ok(activeTurnViewStart >= 0 && activeTurnViewEnd > activeTurnViewStart)
const activeTurnViewSource = gamePageSource.slice(activeTurnViewStart, activeTurnViewEnd)
for (const liveRegionValue of ['statusMessage', 'liveAnnouncement']) {
  assert.match(
    activeTurnViewSource,
    new RegExp(
      `<p className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">\\s*\\{${liveRegionValue}\\}\\s*</p>`,
    ),
  )
}
assert.equal(
  activeTurnViewSource.match(
    /<p className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">/g,
  )?.length,
  2,
)
assert.doesNotMatch(activeTurnViewSource, /styles\.status/)
const handleRevealStart = gamePageSource.indexOf('const handleReveal = () => {')
const handleRevealEnd = gamePageSource.indexOf('const handleDecision', handleRevealStart)
assert.ok(handleRevealStart >= 0 && handleRevealEnd > handleRevealStart)
const handleRevealSource = gamePageSource.slice(handleRevealStart, handleRevealEnd)
assert.match(
  handleRevealSource,
  /result\.kind === 'success'\s*\?\s*''\s*:\s*'No se pudo iniciar el turno\.'/,
)
for (const meaningfulStatus of [
  'No se pudo aplicar esa acción.',
  'El tiempo terminó antes de resolver la carta.',
  'Carta pasada. Sigue disponible en este turno.',
]) {
  assert.ok(gamePageSource.includes(meaningfulStatus))
}
const routePrivacyEffectStart = gamePageSource.indexOf('useEffect(() => {')
const routePrivacyEffectEnd = gamePageSource.indexOf('}, [])', routePrivacyEffectStart)
assert.ok(routePrivacyEffectStart >= 0 && routePrivacyEffectEnd > routePrivacyEffectStart)
const routePrivacyEffectSource = gamePageSource.slice(
  routePrivacyEffectStart,
  routePrivacyEffectEnd,
)
assert.equal(
  routePrivacyEffectSource.match(/concealActiveGameplayForRoute\(useGameplayStore\)/g)
    ?.length,
  2,
)
assert.match(routePrivacyEffectSource, /return \(\) =>/)

const privacyGateStart = gamePageSource.indexOf('if (blockInitialActiveCard')
const privacyGateEnd = gamePageSource.indexOf('const handleReveal', privacyGateStart)
assert.ok(privacyGateStart >= 0 && privacyGateEnd > privacyGateStart)
assert.doesNotMatch(
  gamePageSource.slice(privacyGateStart, privacyGateEnd),
  /CARD_CATALOG_BY_ID|getCurrentGameplayCardId|GameplayCard/,
)

const commitDecisionStart = gameplayCardSource.indexOf('const commitDecision')
const commitDecisionEnd = gameplayCardSource.indexOf('const releasePointer', commitDecisionStart)
assert.ok(commitDecisionStart >= 0 && commitDecisionEnd > commitDecisionStart)
const commitDecisionSource = gameplayCardSource.slice(commitDecisionStart, commitDecisionEnd)
const duplicateLockIndex = commitDecisionSource.indexOf('resolvingRef.current = true')
const capturedTimeIndex = commitDecisionSource.indexOf('const decidedAt = Date.now()')
const visualSnapshotIndex = commitDecisionSource.indexOf(
  'setOutgoingCard(createOutgoingCardSnapshot(card, decision, origin, decidedAt))',
)
const visualLockIndex = commitDecisionSource.indexOf('setIsResolving(true)')
const domainDecisionIndex = commitDecisionSource.indexOf(
  'onDecision(decision, card.id, decidedAt)',
)
const presentationDelayIndex = commitDecisionSource.indexOf('window.setTimeout')
assert.ok(duplicateLockIndex >= 0)
assert.ok(capturedTimeIndex > duplicateLockIndex)
assert.ok(visualSnapshotIndex > capturedTimeIndex)
assert.ok(visualLockIndex > visualSnapshotIndex)
assert.ok(domainDecisionIndex > visualLockIndex)
assert.ok(presentationDelayIndex > domainDecisionIndex)

assert.doesNotMatch(gamePageSource, /<GameplayCard\s+key=/)
assert.match(gameplayCardSource, /getKeyboardDecision\(event\.key, event\.repeat\)/)
assert.match(gameplayCardSource, /onPointerDown=/)
assert.match(gameplayCardSource, /onPointerMove=/)
assert.match(gameplayCardSource, /onPointerUp=/)
assert.match(gameplayCardSource, /aria-disabled=\{isResolving\}/)
assert.match(gameplayCardSource, /↓ Acertó/)
assert.match(gameplayCardSource, /↑ Pasar/)
assert.doesNotMatch(gameplayCardSource, /selectedMain|selectedLightning|unselected/)

const gameplayActionsStart = gameplayCardSource.indexOf(
  '<div className={styles.actions} aria-label="Acciones de la carta">',
)
const gameplayActionsEnd = gameplayCardSource.indexOf('</div>', gameplayActionsStart)
assert.ok(gameplayActionsStart >= 0 && gameplayActionsEnd > gameplayActionsStart)
const gameplayActionsSource = gameplayCardSource.slice(gameplayActionsStart, gameplayActionsEnd)
const passButtonStart = gameplayActionsSource.indexOf('<Button')
const passButtonEnd = gameplayActionsSource.indexOf('</Button>', passButtonStart)
assert.ok(passButtonStart >= 0 && passButtonEnd > passButtonStart)
const passButtonSource = gameplayActionsSource.slice(passButtonStart, passButtonEnd)
assert.match(passButtonSource, /className=\{styles\.passButton\}/)
assert.match(passButtonSource, /onClick=\{\(\) => commitDecision\('pass'\)\}/)
assert.match(passButtonSource, /↑ Pasar/)
const passActionIndex = gameplayActionsSource.indexOf("onClick={() => commitDecision('pass')}")
const correctActionIndex = gameplayActionsSource.indexOf(
  "onClick={() => commitDecision('correct')}",
)
assert.ok(passActionIndex >= 0 && correctActionIndex > passActionIndex)
assert.match(gameplayActionsSource, /className=\{styles\.correctButton\}/)
assert.equal(gameplayActionsSource.match(/disabled=\{isResolving\}/g)?.length, 2)

const gameplayCardRule = gameplayCardStyles.match(/^\.card\s*\{([^}]*)\}/m)
assert.ok(gameplayCardRule)
assert.match(gameplayCardRule[1], /box-sizing:\s*border-box;/)
assert.match(gameplayCardRule[1], /width:\s*100%;/)
assert.match(gameplayCardRule[1], /height:\s*clamp\(400px, 62dvh, 500px\);/)
assert.match(gameplayCardRule[1], /gap:\s*var\(--space-card-band-gutter\);/)
assert.match(gameplayCardRule[1], /border:\s*0;/)
assert.match(gameplayCardRule[1], /border-radius:\s*var\(--radius-card-face\);/)
assert.doesNotMatch(gameplayCardRule[1], /--radius-control-pill/)
assert.match(gameplayCardRule[1], /background:\s*var\(--color-card-surface\);/)
assert.match(gameplayCardRule[1], /box-shadow:\s*var\(--shadow-card-face\);/)
assert.doesNotMatch(gameplayCardRule[1], /transparent/)
assert.doesNotMatch(gameplayCardStyles, /--shadow-card-selected|--border-card-selected/)

assert.match(
  gameplayCardStyles,
  /\.titleSection,\s*\.characterSection,\s*\.everythingSection\s*\{[^}]*color:\s*var\(--color-card-band-text\);/,
)
assert.match(
  gameplayCardStyles,
  /\.titleSection\s*\{[^}]*background:\s*var\(--color-card-band-title\);/,
)
assert.match(
  gameplayCardStyles,
  /\.characterSection\s*\{[^}]*background:\s*var\(--color-card-band-character\);/,
)
assert.match(
  gameplayCardStyles,
  /\.everythingSection\s*\{[^}]*background:\s*var\(--color-card-band-everything\);/,
)
const cardSectionRule = gameplayCardStyles.match(/\.cardSection\s*\{([^}]*)\}/)
assert.ok(cardSectionRule)
assert.match(cardSectionRule[1], /position:\s*relative;/)
assert.match(cardSectionRule[1], /display:\s*grid;/)
assert.match(cardSectionRule[1], /padding:\s*var\(--space-sm\);/)
assert.match(cardSectionRule[1], /place-items:\s*center;/)
assert.doesNotMatch(cardSectionRule[1], /grid-template-rows:/)
assert.match(
  gameplayCardStyles,
  /\.sectionValue\s*\{[^}]*align-self:\s*center;[^}]*justify-self:\s*stretch;[^}]*overflow-wrap:\s*anywhere;[^}]*text-align:\s*center;/,
)
assert.match(
  gameplayCardStyles,
  /\.sectionSubtype\s*\{[^}]*position:\s*absolute;[^}]*right:\s*var\(--space-sm\);[^}]*bottom:\s*var\(--space-sm\);[^}]*max-width:\s*calc\(100% - var\(--space-sm\) - var\(--space-sm\)\);[^}]*overflow-wrap:\s*anywhere;[^}]*text-align:\s*right;/,
)
assert.match(
  gameplayCardStyles,
  /\.keywordSection\s*\{[^}]*align-content:\s*center;[^}]*justify-items:\s*center;[^}]*background:\s*var\(--color-card-surface\);[^}]*text-align:\s*center;/,
)
assert.match(
  gameplayCardStyles,
  /\.keywordLabel\s*\{[^}]*color:\s*var\(--color-card-keyword-muted\);[^}]*text-align:\s*center;/,
)
assert.match(
  gameplayCardStyles,
  /\.keywordValue\s*\{[^}]*width:\s*100%;[^}]*color:\s*var\(--color-primary\);[^}]*overflow-wrap:\s*anywhere;[^}]*text-align:\s*center;/,
)
assert.match(
  gameplayCardStyles,
  /\.cardCap\s*\{[^}]*background:\s*var\(--color-card-surface\);/,
)
assert.doesNotMatch(gameplayCardStyles, /#(?:de2c6e|11b087|00aab7|fff(?:fff)?)\b/i)
assertRuleUsesPill(
  gameplayCardStyles,
  '\\.actions button',
  'Visible pass and correct buttons',
)
const passButtonRule = getRuleBody(
  gameplayCardStyles,
  '\\.actions \\.passButton:not\\(:disabled\\)',
  'Enabled pass action',
)
const passButtonHoverRule = getRuleBody(
  gameplayCardStyles,
  '\\.actions \\.passButton:not\\(:disabled\\):hover',
  'Hovered pass action',
)
const passButtonFocusRule = getRuleBody(
  gameplayCardStyles,
  '\\.actions \\.passButton:not\\(:disabled\\):focus-visible',
  'Keyboard-focused pass action',
)
const passButtonActiveRule = getRuleBody(
  gameplayCardStyles,
  '\\.actions \\.passButton:not\\(:disabled\\):active',
  'Active pass action',
)
const passButtonStableDeclarations = new Map([
  ['border-color', 'var(--color-border) !important'],
  ['background', 'var(--color-surface) !important'],
  ['box-shadow', 'var(--shadow-control) !important'],
])
assert.equal(
  getDeclarationValue(passButtonRule, 'color', 'Enabled pass action'),
  'var(--stage-action-color) !important',
)
assert.deepEqual(getDeclaredProperties(passButtonRule), [
  'border-color',
  'color',
  'background',
  'box-shadow',
])
assert.deepEqual(getDeclaredProperties(passButtonHoverRule), [
  'border-color',
  'color',
  'background',
  'box-shadow',
])
assert.deepEqual(getDeclaredProperties(passButtonFocusRule), [
  'border-color',
  'color',
  'background',
  'box-shadow',
  'outline',
  'outline-offset',
])
assert.deepEqual(getDeclaredProperties(passButtonActiveRule), [
  'border-color',
  'color',
  'background',
  'box-shadow',
])
for (const [property, expectedValue] of passButtonStableDeclarations) {
  assert.equal(
    getDeclarationValue(passButtonRule, property, 'Enabled pass action'),
    expectedValue,
  )
  assert.equal(
    getDeclarationValue(passButtonHoverRule, property, 'Hovered pass action'),
    expectedValue,
  )
  assert.equal(
    getDeclarationValue(passButtonFocusRule, property, 'Keyboard-focused pass action'),
    expectedValue,
  )
  assert.equal(
    getDeclarationValue(passButtonActiveRule, property, 'Active pass action'),
    expectedValue,
  )
}
assert.equal(
  getDeclarationValue(passButtonHoverRule, 'color', 'Hovered pass action'),
  'var(--stage-background-color) !important',
)
assert.equal(
  getDeclarationValue(passButtonFocusRule, 'color', 'Keyboard-focused pass action'),
  'var(--stage-action-color) !important',
)
assert.equal(
  getDeclarationValue(passButtonFocusRule, 'outline', 'Keyboard-focused pass action'),
  '3px solid var(--color-focus)',
)
assert.equal(
  getDeclarationValue(passButtonFocusRule, 'outline-offset', 'Keyboard-focused pass action'),
  '3px',
)
assert.equal(
  getDeclarationValue(passButtonActiveRule, 'color', 'Active pass action'),
  'var(--stage-action-color) !important',
)
assert.doesNotMatch(
  `${passButtonRule}${passButtonFocusRule}${passButtonActiveRule}`,
  /var\(--stage-background-color\)/,
)
assert.doesNotMatch(passButtonHoverRule, /var\(--stage-action-color\)/)
const passButtonSelectors =
  gameplayCardStyles.match(/\.actions \.passButton[^,{]*\s*\{/g) ?? []
assert.equal(passButtonSelectors.length, 4)
for (const selector of passButtonSelectors) {
  assert.match(selector, /:not\(:disabled\)/)
}
const correctButtonRule = getRuleBody(
  gameplayCardStyles,
  '\\.actions \\.correctButton:not\\(:disabled\\)',
  'Stage-aware correct action',
)
const correctButtonHoverRule = getRuleBody(
  gameplayCardStyles,
  '\\.actions \\.correctButton:not\\(:disabled\\):hover',
  'Hovered correct action',
)
const correctButtonFocusRule = getRuleBody(
  gameplayCardStyles,
  '\\.actions \\.correctButton:not\\(:disabled\\):focus-visible',
  'Keyboard-focused correct action',
)
const correctButtonActiveRule = getRuleBody(
  gameplayCardStyles,
  '\\.actions \\.correctButton:not\\(:disabled\\):active',
  'Active correct action',
)
assert.deepEqual(getDeclaredProperties(correctButtonRule), ['background'])
assert.equal(
  getDeclarationValue(correctButtonRule, 'background', 'Stage-aware correct action'),
  'var(--stage-action-color)',
)
const correctButtonStateRules = new Map([
  ['Hovered correct action', correctButtonHoverRule],
  ['Keyboard-focused correct action', correctButtonFocusRule],
  ['Active correct action', correctButtonActiveRule],
])
for (const [label, rule] of correctButtonStateRules) {
  assert.equal(
    getDeclarationValue(rule, 'border-color', label),
    'var(--stage-action-color) !important',
  )
  assert.equal(
    getDeclarationValue(rule, 'background', label),
    'var(--stage-action-color) !important',
  )
}
assert.deepEqual(getDeclaredProperties(correctButtonHoverRule), [
  'border-color',
  'background',
])
assert.deepEqual(getDeclaredProperties(correctButtonFocusRule), [
  'border-color',
  'background',
  'outline',
  'outline-offset',
])
assert.deepEqual(getDeclaredProperties(correctButtonActiveRule), [
  'border-color',
  'background',
])
assert.equal(
  getDeclarationValue(correctButtonFocusRule, 'outline', 'Keyboard-focused correct action'),
  '3px solid var(--color-focus)',
)
assert.equal(
  getDeclarationValue(
    correctButtonFocusRule,
    'outline-offset',
    'Keyboard-focused correct action',
  ),
  '3px',
)
const correctButtonRules = [correctButtonRule, ...correctButtonStateRules.values()]
assert.doesNotMatch(
  correctButtonRules.join(''),
  /var\(--(?:color-primary|stage-background-color)\)/,
)
assert.doesNotMatch(correctButtonRules.join(''), /#[\da-f]{3,8}\b/i)
const correctButtonSelectors =
  gameplayCardStyles.match(/\.actions \.correctButton[^,{]*\s*\{/g) ?? []
assert.equal(correctButtonSelectors.length, 4)
for (const selector of correctButtonSelectors) {
  assert.match(selector, /:not\(:disabled\)/)
}

const outgoingCardStart = gameplayCardSource.indexOf('{outgoingCard ? (')
const outgoingCardEnd = gameplayCardSource.indexOf(') : null}', outgoingCardStart)
assert.ok(outgoingCardStart >= 0 && outgoingCardEnd > outgoingCardStart)
const outgoingCardSource = gameplayCardSource.slice(outgoingCardStart, outgoingCardEnd)
assert.ok(outgoingCardSource.includes('className={`${styles.card} ${styles.outgoingCard}'))
assert.match(outgoingCardSource, /aria-hidden="true"/)
assert.match(outgoingCardSource, /<GameplayCardContents card=\{outgoingCard\.card\} \/>/)
assert.match(
  outgoingCardSource,
  /outgoingCard\.decision === 'correct'[\s\S]*styles\.outgoingCorrect[\s\S]*styles\.outgoingPass/,
)
assert.doesNotMatch(
  outgoingCardSource,
  /onClick=|onKeyDown=|onPointer|tabIndex=/,
)
assert.match(
  gameplayCardStyles,
  /\.outgoingCard\s*\{[^}]*pointer-events:\s*none;/,
)
assert.match(
  gameplayCardStyles,
  /\.outgoingCorrect\s*\{[^}]*animation:\s*outgoing-card-down 180ms ease-out forwards;/,
)
assert.match(
  gameplayCardStyles,
  /\.outgoingPass\s*\{[^}]*animation:\s*outgoing-card-up 180ms ease-out forwards;/,
)
assert.match(
  gameplayCardStyles,
  /@keyframes outgoing-card-down[\s\S]*calc\(100dvh \+ 100%\)/,
)
assert.match(
  gameplayCardStyles,
  /@keyframes outgoing-card-up[\s\S]*calc\(-100dvh - 100%\)/,
)

assert.match(gamePageSource, /'--timer-progress': `\$\{progress \* 100\}%`/)
assert.match(
  gamePageSource,
  /'--stage-background-color': stage\.backgroundColor,[\s\S]*'--stage-action-color': stage\.actionColor/,
)
assert.deepEqual(
  GAMEPLAY_STAGES.map(({ kind, backgroundColor, actionColor }) => ({
    kind,
    backgroundColor,
    actionColor,
  })),
  [
    {
      kind: 'talk',
      backgroundColor: 'var(--color-primary-dark)',
      actionColor: 'var(--color-primary)',
    },
    {
      kind: 'mime',
      backgroundColor: 'var(--color-tertiary-dark)',
      actionColor: 'var(--color-tertiary)',
    },
    {
      kind: 'sounds',
      backgroundColor: 'var(--color-secondary-dark)',
      actionColor: 'var(--color-secondary)',
    },
    {
      kind: 'lightning',
      backgroundColor: 'var(--color-primary-dark)',
      actionColor: 'var(--color-primary)',
    },
  ],
)
const activePageRule = getRuleBody(gameStyles, '\\.activePage', 'Active game stage tokens')
assert.match(activePageRule, /--stage-background-color:\s*var\(--color-primary-dark\);/)
assert.match(activePageRule, /--stage-action-color:\s*var\(--color-primary\);/)
assert.match(
  gameStyles,
  /\.activePage::before\s*\{[^}]*linear-gradient\([\s\S]*var\(--stage-background-color\) 0 var\(--timer-progress\),[\s\S]*var\(--color-background\) var\(--timer-progress\) 100%/,
)
assert.match(gameStyles, /\.timeoutPage::before\s*\{\s*background:\s*var\(--color-secondary\);/)
assert.match(gameStyles, /\.gameCompletePage::before\s*\{\s*background:\s*var\(--color-primary\);/)

for (const [label, selectorPattern] of [
  ['Active header', '\\.activeHeader'],
  ['Active card and action region', '\\.cardViewport'],
]) {
  assert.match(
    getRuleBody(gameStyles, selectorPattern, `${label} entry animation`),
    /animation:\s*active-game-enter \d+ms ease-out(?: \d+ms)? both;/,
  )
}
const activeGameAnimation = gameStyles.match(
  /@keyframes active-game-enter\s*\{([\s\S]*?)\n\}/,
)?.[1]
assert.ok(activeGameAnimation, 'Missing active-game-enter keyframes')
assert.match(
  activeGameAnimation,
  /from\s*\{[\s\S]*opacity:\s*0;[\s\S]*transform:\s*translateY\(/,
)
assert.match(
  activeGameAnimation,
  /to\s*\{[\s\S]*opacity:\s*1;[\s\S]*transform:\s*translateY\(0\);/,
)
assert.doesNotMatch(activeGameAnimation, /scale\(|infinite|flash/i)
assert.match(
  gameStyles,
  /@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*\.activeHeader,\s*\.cardViewport\s*\{[^}]*animation:\s*none;/,
)
assert.doesNotMatch(gameStyles, /\.status(?:\s|:|\{)/)
assertRuleUsesPill(
  gameStyles,
  '\\.bottomButton,\\s*\\.resultActions button',
  'Gameplay handoff, terminal, and result buttons',
)
assert.match(
  getRuleBody(
    gameStyles,
    '\\.gameCompletePage \\.terminalContent',
    'Game-complete terminal content',
  ),
  /color:\s*var\(--color-text-strong\);/,
)

const rootTokens = getRootTokens(globalStyles)
assert.equal(rootTokens.get('--color-surface'), '#fff')
assert.equal(rootTokens.get('--color-primary'), '#00aab7')
assert.equal(rootTokens.get('--color-primary-dark'), '#007f89')
assert.equal(rootTokens.get('--color-secondary'), '#de2c6e')
assert.equal(rootTokens.get('--color-secondary-dark'), '#b91f59')
assert.equal(rootTokens.get('--color-tertiary'), '#11b087')
assert.equal(rootTokens.get('--color-tertiary-dark'), '#0c8c6c')
assert.equal(rootTokens.get('--color-text-strong'), '#000')
assert.equal(rootTokens.get('--radius-control-pill'), '999px')
assert.doesNotMatch(globalStyles, /border-radius:\s*var\(--radius-control-pill\)/)

const expectedCardTokenValues = new Map([
  ['--color-card-surface', 'var(--color-surface)'],
  ['--color-card-band-title', 'var(--color-secondary)'],
  ['--color-card-band-character', 'var(--color-tertiary)'],
  ['--color-card-band-everything', 'var(--color-primary)'],
  ['--color-card-band-text', '#fff'],
  ['--color-card-keyword-muted', 'hsla(225, 6%, 59%, 1)'],
  ['--color-card-selection', 'var(--color-tertiary)'],
  ['--shadow-card-face', '2px 4px 8px 0 rgba(0, 0, 0, 0.25)'],
  [
    '--shadow-card-selected',
    '0 0 8px 1px var(--color-card-selection), var(--shadow-card-face)',
  ],
  ['--radius-card-face', '16px'],
  ['--space-card-band-gutter', '7px'],
])
for (const [token, expectedValue] of expectedCardTokenValues) {
  assert.equal(rootTokens.get(token), expectedValue)
}
assert.equal(resolveRootToken(rootTokens, '--color-card-surface'), '#fff')
assert.equal(resolveRootToken(rootTokens, '--color-card-band-title'), '#de2c6e')
assert.equal(resolveRootToken(rootTokens, '--color-card-band-character'), '#11b087')
assert.equal(resolveRootToken(rootTokens, '--color-card-band-everything'), '#00aab7')
assert.equal(resolveRootToken(rootTokens, '--color-card-band-text'), '#fff')
assert.equal(
  resolveRootToken(rootTokens, '--color-card-keyword-muted'),
  'hsla(225, 6%, 59%, 1)',
)
assert.equal(resolveRootToken(rootTokens, '--color-primary'), '#00aab7')
assert.equal(rootTokens.has('--border-card-selected'), false)
assert.equal(
  resolveRootToken(rootTokens, '--shadow-card-selected'),
  '0 0 8px 1px #11b087, 2px 4px 8px 0 rgba(0, 0, 0, 0.25)',
)
assert.match(gamePageSource, /SE ACABÓ EL TIEMPO/)
assert.match(gamePageSource, /Mezclar mazo/)
assert.match(gamePageSource, /PARTIDA TERMINADA/)
assert.match(gamePageSource, /Ver equipo ganador/)

const partializeSource = setupStoreSource.slice(
  setupStoreSource.indexOf('partialize:'),
  setupStoreSource.indexOf('migrate:'),
)
assert.match(partializeSource, /nickname:\s*state\.nickname/)
assert.match(partializeSource, /avatar:\s*state\.avatar/)
for (const forbiddenField of ['players:', 'teamAssignment:', 'cardDraft:', 'game:']) {
  assert.ok(!partializeSource.includes(forbiddenField))
}
assert.ok(!homePageSource.includes('state.setNickname'))
assert.match(homePageSource, /useState\(\(\) => nickname\)/)
assert.match(homePageSource, /onNicknameChange=\{setNicknameDraft\}/)
assert.ok(!setupStoreSource.includes('setNickname:'))
const initializeProfileStart = setupStoreSource.indexOf('initializeProfile: (nickname) =>')
const initializeProfileEnd = setupStoreSource.indexOf('addPlayer: () =>', initializeProfileStart)
assert.ok(initializeProfileStart >= 0 && initializeProfileEnd > initializeProfileStart)
const initializeProfileSource = setupStoreSource.slice(
  initializeProfileStart,
  initializeProfileEnd,
)
assert.match(initializeProfileSource, /replaceProfileIdentity\(/)
assert.match(initializeProfileSource, /resetGameplay,/)
assert.match(initializeProfileSource, /replaceSetup: \(profileIdentity\) => set\(profileIdentity\)/)
assert.ok(!gameplayStoreSource.includes('persist('))
assert.ok(!gameplayStoreSource.includes('setTimeout'))
assert.match(
  gameplayStoreSource,
  /markCorrect:[\s\S]*return game \? apply\(markGameplayCardCorrect\(game, cardId, now\)\)/,
)
assert.match(
  gameplayStoreSource,
  /passCard:[\s\S]*return game \? apply\(passGameplayCard\(game, cardId, now\)\)/,
)
assert.match(cardsPageSource, /Comenzar partida/)
assert.match(cardsPageSource, /initializeGameplay\(/)
assert.match(routesSource, /<Route path="\/game" element=\{<GamePage \/>\} \/>/)

console.log(
  'Gameplay verification passed: synchronous store decisions, independent outgoing-card overlays, inclusive deadline ordering, route conceal/resume deadline continuity, 30/45/60-second timers, quota compatibility, behavioral identity replacement ordering, exact decks, rotation, stage completion, privacy structure, hidden active live regions with empty initial feedback and later meaningful announcements, dark-background/normal-action stage pairings, reduced-motion-safe active entry animation, pill action controls, centered 16px card faces with absolute lower-right subtypes, keyword color hierarchy, shared borderless card tokens, and persistence boundaries are valid.',
)
