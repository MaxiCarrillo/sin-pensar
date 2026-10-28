import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { concealActiveGameplayForRoute } from '../src/modules/game/game-route-privacy.ts'
import { GAMEPLAY_STAGE_PRESENTATIONS } from '../src/modules/game/game-stage-presentation.ts'
import { getKeyboardDecision, getSwipeDecision } from '../src/modules/game/swipe.ts'
import {
  getGameplayTimerPresentation,
  rebaseGameplayTimerClock,
} from '../src/modules/game/use-gameplay-timer.ts'
import { CARD_IDS } from '../src/shared/catalog/card-catalog.ts'
import { createCardDraftSetupKey } from '../src/shared/domain/card-draft.ts'
import {
  awardLightningCardAttribution,
  beginLightningCardAttribution,
  cancelLightningCardAttribution,
  concealActiveGameplayTurn,
  createGameplaySetupKey,
  createGameplayState,
  expireGameplayTurn,
  getCompatibleGameplayState,
  getCurrentGameplayCardId,
  getCurrentTurnParticipant,
  getGameplayTurnDurationSeconds,
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

function cssLengthToPixels(value, label) {
  const absoluteLength = value.match(/^(\d+(?:\.\d+)?)(px|rem)$/)
  assert.ok(absoluteLength, `${label} must resolve to a px or rem length`)
  return Number(absoluteLength[1]) * (absoluteLength[2] === 'rem' ? 16 : 1)
}

function getSingleShadowMetrics(value, label) {
  assert.equal(typeof value, 'string', `${label} must be defined`)
  const shadow = value.match(
    /^(-?\d+(?:\.\d+)?)(?:px)?\s+(-?\d+(?:\.\d+)?)px\s+(\d+(?:\.\d+)?)px(?:\s+(-?\d+(?:\.\d+)?)px)?\s+(.+)$/,
  )
  assert.ok(shadow, `${label} must be one CSS box shadow`)
  return {
    offsetX: Number(shadow[1]),
    offsetY: Number(shadow[2]),
    blurRadius: Number(shadow[3]),
    spreadRadius: shadow[4] ? Number(shadow[4]) : 0,
    color: shadow[5],
  }
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

function placeGameAtStage(state, stageIndex) {
  const stage = GAMEPLAY_STAGES[stageIndex]
  assert.ok(stage)
  const sourceCardIds = stage.source === 'main'
    ? state.mainDeckCardIds
    : state.lightningDeckCardIds
  return {
    ...state,
    phase: GAMEPLAY_PHASES.handoff,
    stageIndex: stage.index,
    stageKind: stage.kind,
    pendingCardIds: [...sourceCardIds],
    startedAt: null,
    deadline: null,
  }
}

function createActiveStage(teamSizes, stageIndex, startedAt, seed = 1) {
  const game = createGame(teamSizes, seed).state
  return expectTransition(startGameplayTurn(placeGameAtStage(game, stageIndex), startedAt))
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

assert.deepEqual(
  GAMEPLAY_STAGES.map(({ index, kind, label, name, rule, source }) => ({
    index,
    kind,
    label,
    name,
    rule,
    source,
  })),
  [
    {
      index: 0,
      kind: 'talk',
      label: 'RONDA 1',
      name: 'Ronda 1',
      rule: 'Todo vale',
      source: 'main',
    },
    {
      index: 1,
      kind: 'mime',
      label: 'RONDA 2',
      name: 'Ronda 2',
      rule: 'Una palabra',
      source: 'main',
    },
    {
      index: 2,
      kind: 'lightning',
      label: 'RELÁMPAGO',
      name: 'Relámpago',
      rule: 'Tres categorías',
      source: 'lightning',
    },
    {
      index: 3,
      kind: 'sounds',
      label: 'RONDA 3',
      name: 'Ronda 3',
      rule: 'Mímica',
      source: 'main',
    },
  ],
)
assert.deepEqual(GAMEPLAY_STAGES.map((stage) => stage.index), [0, 1, 2, 3])
assert.equal(GAMEPLAY_STAGES.at(-1)?.kind, 'sounds')
assert.deepEqual(GAMEPLAY_STAGE_PRESENTATIONS, {
  0: {
    attempts: 'Ilimitados',
    allowed: 'Hablar, actuar, hacer sonidos, señalar, cantar, tararear y más.',
    forbidden: 'Mencionar palabras que haya que adivinar o la palabra clave.',
  },
  1: {
    attempts: 'Un intento por carta y jugador',
    allowed: 'Decir exactamente una palabra y actuar.',
    forbidden:
      'Mencionar palabras que haya que adivinar o la palabra clave; decir más de una palabra; tararear, cantar o hacer sonidos.',
  },
  2: {
    attempts: 'Un intento por carta y jugador',
    allowed: 'Leer únicamente las tres categorías.',
    forbidden: 'Mencionar la palabra clave.',
  },
  3: {
    attempts: 'Un intento por carta y jugador',
    allowed: 'Hacer mímica o actuar sin emitir sonidos.',
    forbidden:
      'Mencionar palabras que haya que adivinar o la palabra clave; hacer cualquier sonido.',
  },
})

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

for (const invalidTimestamp of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
  expectTransitionRejected(
    startGameplayTurn(exactDeckGame.state, invalidTimestamp),
    'invalid-timestamp',
  )
}

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

const timestampActive = createActiveStage([2, 2], 0, 50_000, 81)
const timestampCardId = getCurrentGameplayCardId(timestampActive)
assert.ok(timestampCardId)
for (const invalidTimestamp of [
  timestampActive.startedAt - 1,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
]) {
  expectTransitionRejected(
    markGameplayCardCorrect(timestampActive, timestampCardId, invalidTimestamp),
    'invalid-timestamp',
  )
  expectTransitionRejected(
    passGameplayCard(timestampActive, timestampCardId, invalidTimestamp),
    'invalid-timestamp',
  )
}
const correctAtStart = expectTransition(
  markGameplayCardCorrect(timestampActive, timestampCardId, timestampActive.startedAt),
)
assert.equal(correctAtStart.turnStats.correct, 1)
const passAtStart = expectTransition(
  passGameplayCard(timestampActive, timestampCardId, timestampActive.startedAt),
)
assert.equal(passAtStart.turnStats.passed, 1)
const passAtDeadline = expectTransition(
  passGameplayCard(timestampActive, timestampCardId, timestampActive.deadline),
)
assert.equal(passAtDeadline.phase, GAMEPLAY_PHASES.activeTurn)
assert.equal(passAtDeadline.turnStats.passed, 1)
const passAfterDeadline = expectTransition(
  passGameplayCard(timestampActive, timestampCardId, timestampActive.deadline + 1),
)
assert.equal(passAfterDeadline.phase, GAMEPLAY_PHASES.timeExpired)
for (const invalidTimestamp of [
  timestampActive.startedAt - 1,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
]) {
  expectTransitionRejected(
    concealActiveGameplayTurn(timestampActive, invalidTimestamp),
    'invalid-timestamp',
  )
}
const concealedAtStart = expectTransition(
  concealActiveGameplayTurn(timestampActive, timestampActive.startedAt),
)
expectTransitionRejected(
  startGameplayTurn(concealedAtStart, timestampActive.startedAt - 1),
  'invalid-timestamp',
)
for (const invalidTimestamp of [
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
]) {
  expectTransitionRejected(
    startGameplayTurn(concealedAtStart, invalidTimestamp),
    'invalid-timestamp',
  )
}
assert.equal(
  expectTransition(startGameplayTurn(concealedAtStart, timestampActive.startedAt)).phase,
  GAMEPLAY_PHASES.activeTurn,
)
const concealedAtDeadline = expectTransition(
  concealActiveGameplayTurn(timestampActive, timestampActive.deadline),
)
assert.equal(
  expectTransition(startGameplayTurn(concealedAtDeadline, timestampActive.deadline)).phase,
  GAMEPLAY_PHASES.activeTurn,
)

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
const concealedTurn = expectTransition(concealActiveGameplayTurn(sequenceState, 1_500))
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
for (const invalidTimestamp of [
  timeoutActive.startedAt - 1,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
]) {
  expectTransitionRejected(expireGameplayTurn(timeoutActive, invalidTimestamp), 'invalid-timestamp')
}
expectTransitionRejected(
  expireGameplayTurn(timeoutActive, timeoutActive.startedAt),
  'deadline-not-reached',
)
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
expectTransitionRejected(expireGameplayTurn(timeoutState, Number.NaN), 'invalid-timestamp')

const concealedExpiryBase = createGame([2, 2], 18).state
const activeBeforeRemount = expectTransition(startGameplayTurn(concealedExpiryBase, 8_000))
const concealedPastDeadline = expectTransition(
  concealActiveGameplayTurn(activeBeforeRemount, 8_500),
)
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

const lightningRaceActive = createActiveStage([2, 2], 2, 20_000, 30)
const lightningRaceCardId = getCurrentGameplayCardId(lightningRaceActive)
assert.ok(lightningRaceCardId)
assert.equal(lightningRaceActive.deadline, 30_000)
assert.equal(
  getGameplayTurnDurationSeconds(GAMEPLAY_STAGES[2], lightningRaceActive.turnDuration),
  10,
)
for (const invalidTimestamp of [
  lightningRaceActive.startedAt - 1,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
]) {
  expectTransitionRejected(
    beginLightningCardAttribution(lightningRaceActive, lightningRaceCardId, invalidTimestamp),
    'invalid-timestamp',
  )
}
const attributionAtStart = expectTransition(
  beginLightningCardAttribution(
    lightningRaceActive,
    lightningRaceCardId,
    lightningRaceActive.startedAt,
  ),
)
assert.equal(attributionAtStart.phase, GAMEPLAY_PHASES.lightningAttribution)
assert.equal(attributionAtStart.pendingAttribution.decidedAt, lightningRaceActive.startedAt)
expectTransitionRejected(
  markGameplayCardCorrect(lightningRaceActive, lightningRaceCardId, 20_001),
  'attribution-required',
)
const lightningPass = expectTransition(
  passGameplayCard(lightningRaceActive, lightningRaceCardId, 20_001),
)
assert.equal(lightningPass.phase, GAMEPLAY_PHASES.activeTurn)
assert.equal(lightningPass.turnStats.passed, 1)
assert.equal(lightningPass.pendingCardIds.at(-1), lightningRaceCardId)
assert.equal('pendingAttribution' in lightningPass, false)
const exactDeadlineAttribution = expectTransition(
  beginLightningCardAttribution(
    lightningRaceActive,
    lightningRaceCardId,
    lightningRaceActive.deadline,
  ),
)
assert.equal(exactDeadlineAttribution.phase, GAMEPLAY_PHASES.lightningAttribution)
assert.deepEqual(exactDeadlineAttribution.pendingAttribution, {
  cardId: lightningRaceCardId,
  decidedAt: lightningRaceActive.deadline,
  pausedAt: lightningRaceActive.deadline,
})
expectTransitionRejected(
  expireGameplayTurn(exactDeadlineAttribution, lightningRaceActive.deadline + 10_000),
  'invalid-phase',
)
const exactDeadlineAward = expectTransition(
  awardLightningCardAttribution(
    exactDeadlineAttribution,
    lightningRaceCardId,
    'player-1',
    lightningRaceActive.deadline + 10_000,
  ),
)
assert.equal(exactDeadlineAward.phase, GAMEPLAY_PHASES.activeTurn)
assert.equal(exactDeadlineAward.deadline, lightningRaceActive.deadline + 10_000)
assert.equal(exactDeadlineAward.scores[0].score, 1)
const lateLightningAttribution = expectTransition(
  beginLightningCardAttribution(
    lightningRaceActive,
    lightningRaceCardId,
    lightningRaceActive.deadline + 1,
  ),
)
assert.equal(lateLightningAttribution.phase, GAMEPLAY_PHASES.timeExpired)
assert.deepEqual(lateLightningAttribution.pendingCardIds, lightningRaceActive.pendingCardIds)
const lightningTimeoutFirst = expectTransition(
  expireGameplayTurn(lightningRaceActive, lightningRaceActive.deadline + 1),
)
expectTransitionRejected(
  beginLightningCardAttribution(
    lightningTimeoutFirst,
    lightningRaceCardId,
    lightningRaceActive.deadline,
  ),
  'invalid-phase',
)

const normalStageForAttribution = createActiveStage([2, 2], 1, 40_000, 31)
const normalStageCardId = getCurrentGameplayCardId(normalStageForAttribution)
assert.ok(normalStageCardId)
expectTransitionRejected(
  beginLightningCardAttribution(normalStageForAttribution, normalStageCardId, 40_001),
  'invalid-stage',
)
expectTransitionRejected(
  beginLightningCardAttribution(
    placeGameAtStage(createGame([2, 2], 32).state, 2),
    lightningRaceCardId,
    40_001,
  ),
  'invalid-phase',
)
expectTransitionRejected(
  beginLightningCardAttribution(
    lightningRaceActive,
    lightningRaceActive.pendingCardIds[1],
    20_001,
  ),
  'stale-card',
)

const cancelActive = createActiveStage([2, 2], 2, 100_000, 33)
const cancelCardId = getCurrentGameplayCardId(cancelActive)
assert.ok(cancelCardId)
const cancelPending = expectTransition(
  beginLightningCardAttribution(cancelActive, cancelCardId, 104_000),
)
const cancelSnapshot = {
  pendingCardIds: [...cancelPending.pendingCardIds],
  scores: cancelPending.scores.map((score) => ({ ...score })),
  turnStats: { ...cancelPending.turnStats },
}
for (const invalidTimestamp of [
  cancelPending.pendingAttribution.pausedAt - 1,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
]) {
  expectTransitionRejected(
    cancelLightningCardAttribution(cancelPending, cancelCardId, invalidTimestamp),
    'invalid-timestamp',
  )
  expectTransitionRejected(
    concealActiveGameplayTurn(cancelPending, invalidTimestamp),
    'invalid-timestamp',
  )
}
const cancelAtPauseStart = expectTransition(
  cancelLightningCardAttribution(
    cancelPending,
    cancelCardId,
    cancelPending.pendingAttribution.pausedAt,
  ),
)
assert.equal(cancelAtPauseStart.startedAt, cancelActive.startedAt)
assert.equal(cancelAtPauseStart.deadline, cancelActive.deadline)
expectTransitionRejected(
  cancelLightningCardAttribution(
    cancelPending,
    cancelPending.pendingCardIds[1],
    105_000,
  ),
  'stale-card',
)
const cancelResolvedAt = 109_500
const cancelledAttribution = expectTransition(
  cancelLightningCardAttribution(cancelPending, cancelCardId, cancelResolvedAt),
)
assert.equal(cancelledAttribution.phase, GAMEPLAY_PHASES.activeTurn)
assert.equal(cancelledAttribution.startedAt, cancelActive.startedAt + 5_500)
assert.equal(cancelledAttribution.deadline, cancelActive.deadline + 5_500)
assert.equal(
  cancelledAttribution.deadline - cancelResolvedAt,
  cancelActive.deadline - cancelPending.pendingAttribution.decidedAt,
)
assert.deepEqual(cancelledAttribution.pendingCardIds, cancelSnapshot.pendingCardIds)
assert.deepEqual(cancelledAttribution.scores, cancelSnapshot.scores)
assert.deepEqual(cancelledAttribution.turnStats, cancelSnapshot.turnStats)
assert.equal('pendingAttribution' in cancelledAttribution, false)
expectTransitionRejected(
  cancelLightningCardAttribution(cancelledAttribution, cancelCardId, cancelResolvedAt + 1),
  'invalid-phase',
)

const awardActive = createActiveStage([2, 2], 2, 200_000, 34)
const awardCardId = getCurrentGameplayCardId(awardActive)
assert.ok(awardCardId)
const awardPending = expectTransition(
  beginLightningCardAttribution(awardActive, awardCardId, 204_000),
)
for (const invalidTimestamp of [
  awardPending.pendingAttribution.pausedAt - 1,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
]) {
  expectTransitionRejected(
    awardLightningCardAttribution(awardPending, awardCardId, 'player-3', invalidTimestamp),
    'invalid-timestamp',
  )
}
const awardAtPauseStart = expectTransition(
  awardLightningCardAttribution(
    awardPending,
    awardCardId,
    'player-3',
    awardPending.pendingAttribution.pausedAt,
  ),
)
assert.equal(awardAtPauseStart.startedAt, awardActive.startedAt)
assert.equal(awardAtPauseStart.deadline, awardActive.deadline)
expectTransitionRejected(
  awardLightningCardAttribution(
    awardPending,
    awardPending.pendingCardIds[1],
    'player-3',
    205_000,
  ),
  'stale-card',
)
expectTransitionRejected(
  awardLightningCardAttribution(awardPending, awardCardId, 'unknown-player', 205_000),
  'invalid-player-membership',
)
const duplicateMembershipState = {
  ...awardPending,
  teams: awardPending.teams.map((team, index) =>
    index === 1 ? { ...team, playerIds: [...team.playerIds, 'player-1'] } : team,
  ),
}
expectTransitionRejected(
  awardLightningCardAttribution(duplicateMembershipState, awardCardId, 'player-1', 205_000),
  'invalid-player-membership',
)
const awardedAttribution = expectTransition(
  awardLightningCardAttribution(awardPending, awardCardId, 'player-3', 209_000),
)
assert.equal(awardedAttribution.phase, GAMEPLAY_PHASES.activeTurn)
assert.equal(awardedAttribution.startedAt, awardActive.startedAt + 5_000)
assert.equal(awardedAttribution.deadline, awardActive.deadline + 5_000)
assert.equal(awardedAttribution.deadline - 209_000, 6_000)
assert.equal(awardedAttribution.scores[0].score, 0)
assert.equal(awardedAttribution.scores[1].score, 1)
assert.equal(awardedAttribution.turnStats.correct, 1)
assert.ok(!awardedAttribution.pendingCardIds.includes(awardCardId))
const runningTimerClock = {
  now: awardPending.pendingAttribution.decidedAt - 100,
  startedAt: awardPending.startedAt,
  deadline: awardPending.deadline,
  frozenAt: null,
}
const frozenTimerClock = rebaseGameplayTimerClock(runningTimerClock, {
  startedAt: awardPending.startedAt,
  deadline: awardPending.deadline,
  frozenAt: awardPending.pendingAttribution.decidedAt,
})
assert.equal(frozenTimerClock.now, awardPending.pendingAttribution.decidedAt)
const resumedTimerClock = rebaseGameplayTimerClock(frozenTimerClock, {
  startedAt: awardedAttribution.startedAt,
  deadline: awardedAttribution.deadline,
  frozenAt: null,
})
assert.equal(resumedTimerClock.now, 209_000)
assert.deepEqual(
  getGameplayTimerPresentation(
    resumedTimerClock.startedAt,
    resumedTimerClock.deadline,
    resumedTimerClock.now,
  ),
  { progress: 0.4, remainingSeconds: 6 },
)
assert.equal(getGameplayTimerPresentation(1_000, 11_000, 0).progress, 0)
assert.equal(getGameplayTimerPresentation(1_000, 11_000, 12_000).progress, 1)
assert.strictEqual(
  rebaseGameplayTimerClock(resumedTimerClock, {
    startedAt: resumedTimerClock.startedAt,
    deadline: resumedTimerClock.deadline,
    frozenAt: resumedTimerClock.frozenAt,
  }),
  resumedTimerClock,
)
assert.equal(
  rebaseGameplayTimerClock(
    { now: 50_500, startedAt: 50_000, deadline: 80_000, frozenAt: null },
    { startedAt: 51_000, deadline: 81_000, frozenAt: null },
  ).now,
  51_500,
)
assert.equal(
  rebaseGameplayTimerClock(
    { now: 50_500, startedAt: 50_000, deadline: 80_000, frozenAt: null },
    { startedAt: 90_000, deadline: 100_000, frozenAt: null },
  ).now,
  90_000,
)
expectTransitionRejected(
  awardLightningCardAttribution(awardedAttribution, awardCardId, 'player-3', 209_001),
  'invalid-phase',
)
expectTransitionRejected(
  cancelLightningCardAttribution(awardedAttribution, awardCardId, 209_001),
  'invalid-phase',
)

const membershipSetup = createSetup([2, 2])
for (const player of membershipSetup.players) {
  const playerAwardActive = createActiveStage([2, 2], 2, 300_000, 35)
  const playerAwardCardId = getCurrentGameplayCardId(playerAwardActive)
  assert.ok(playerAwardCardId)
  const playerAwardPending = expectTransition(
    beginLightningCardAttribution(playerAwardActive, playerAwardCardId, 301_000),
  )
  const playerAwarded = expectTransition(
    awardLightningCardAttribution(playerAwardPending, playerAwardCardId, player.id, 302_000),
  )
  const expectedTeam = playerAwardActive.teams.find((team) =>
    team.playerIds.includes(player.id),
  )
  assert.ok(expectedTeam)
  assert.equal(
    playerAwarded.scores.reduce((total, score) => total + score.score, 0),
    1,
  )
  for (const score of playerAwarded.scores) {
    assert.equal(score.score, score.teamId === expectedTeam.id ? 1 : 0)
  }
}

const finalLightningActiveBase = createActiveStage([2, 2], 2, 400_000, 36)
const finalLightningCardId = getCurrentGameplayCardId(finalLightningActiveBase)
assert.ok(finalLightningCardId)
const finalLightningActive = {
  ...finalLightningActiveBase,
  pendingCardIds: [finalLightningCardId],
}
const finalLightningPresenter = getCurrentTurnParticipant(finalLightningActive)
assert.ok(finalLightningPresenter)
const finalLightningPending = expectTransition(
  beginLightningCardAttribution(finalLightningActive, finalLightningCardId, 401_000),
)
const completedLightningStage = expectTransition(
  awardLightningCardAttribution(
    finalLightningPending,
    finalLightningCardId,
    'player-3',
    402_000,
  ),
)
assert.equal(completedLightningStage.phase, GAMEPLAY_PHASES.stageComplete)
assert.equal(completedLightningStage.completedTurns.at(-1)?.teamId, finalLightningPresenter.team.id)
assert.equal(
  completedLightningStage.completedTurns.at(-1)?.playerId,
  finalLightningPresenter.playerId,
)
assert.equal(completedLightningStage.completedStages.at(-1)?.completedByTeamId, 'team-2')
assert.equal(completedLightningStage.completedStages.at(-1)?.completedByPlayerId, 'player-3')
const rondaThreeHandoff = expectTransition(
  prepareNextGameplayStage(completedLightningStage, () => 0.5),
)
assert.equal(rondaThreeHandoff.stageIndex, 3)
assert.equal(rondaThreeHandoff.stageKind, 'sounds')
assert.deepEqual(
  [...rondaThreeHandoff.pendingCardIds].sort(),
  [...rondaThreeHandoff.mainDeckCardIds].sort(),
)
const rondaThreeStartedAt = 500_000
const rondaThreeActive = expectTransition(
  startGameplayTurn(rondaThreeHandoff, rondaThreeStartedAt),
)
assert.equal(
  rondaThreeActive.deadline,
  rondaThreeStartedAt + rondaThreeActive.turnDuration * 1_000,
)

const routeLightningActive = createActiveStage([2, 2], 2, 600_000, 37)
const routeLightningCardId = getCurrentGameplayCardId(routeLightningActive)
assert.ok(routeLightningCardId)
const routeLightningPending = expectTransition(
  beginLightningCardAttribution(routeLightningActive, routeLightningCardId, 604_000),
)
useGameplayStore.setState({ game: routeLightningPending })
const routeLightningConcealResult = concealActiveGameplayForRoute(
  useGameplayStore,
  609_000,
)
assert.ok(routeLightningConcealResult)
const routeLightningConcealed = expectTransition(routeLightningConcealResult)
assert.equal(routeLightningConcealed.phase, GAMEPLAY_PHASES.concealedActive)
assert.equal(routeLightningConcealed.startedAt, routeLightningActive.startedAt + 5_000)
assert.equal(routeLightningConcealed.deadline, routeLightningActive.deadline + 5_000)
assert.equal(routeLightningConcealed.deadline - 609_000, 6_000)
assert.equal('pendingAttribution' in routeLightningConcealed, false)
assert.deepEqual(routeLightningConcealed.pendingCardIds, routeLightningActive.pendingCardIds)
assert.deepEqual(routeLightningConcealed.scores, routeLightningActive.scores)
assert.deepEqual(routeLightningConcealed.turnStats, routeLightningActive.turnStats)
const routeLightningResumed = expectTransition(
  useGameplayStore.getState().startTurn(609_000),
)
assert.equal(routeLightningResumed.phase, GAMEPLAY_PHASES.activeTurn)
assert.equal(routeLightningResumed.deadline - 609_000, 6_000)

const synchronousLightningActive = createActiveStage([2, 2], 2, 700_000, 38)
const synchronousLightningCardId = getCurrentGameplayCardId(synchronousLightningActive)
assert.ok(synchronousLightningCardId)
useGameplayStore.setState({ game: synchronousLightningActive })
let synchronouslyObservedAttribution = null
const unsubscribeFromSynchronousAttribution = useGameplayStore.subscribe((state) => {
  synchronouslyObservedAttribution = state.game
})
const synchronousAttribution = useGameplayStore
  .getState()
  .beginLightningAttribution(synchronousLightningCardId, 701_000)
unsubscribeFromSynchronousAttribution()
assert.equal(synchronousAttribution.kind, 'success')
assert.strictEqual(useGameplayStore.getState().game, synchronousAttribution.state)
assert.strictEqual(synchronouslyObservedAttribution, synchronousAttribution.state)
assert.equal(synchronousAttribution.state.phase, GAMEPLAY_PHASES.lightningAttribution)

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
  let elapsed = 1
  while (current.phase === GAMEPLAY_PHASES.activeTurn) {
    const cardId = getCurrentGameplayCardId(current)
    assert.ok(cardId)
    if (current.stageKind === 'lightning') {
      const attribution = expectTransition(
        beginLightningCardAttribution(current, cardId, now + elapsed),
      )
      const scorerId = current.teams[0].playerIds[0]
      assert.ok(scorerId)
      current = expectTransition(
        awardLightningCardAttribution(
          attribution,
          cardId,
          scorerId,
          now + elapsed + 1,
        ),
      )
      elapsed += 2
    } else {
      current = expectTransition(markGameplayCardCorrect(current, cardId, now + elapsed))
      elapsed += 1
    }
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
assert.deepEqual(singleWinners.map((winner) => winner.name), ['Equipo 2'])
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
  for (const stage of GAMEPLAY_STAGES) {
    const startedAt = 800_000 + stage.index * 100_000
    const stageHandoff = placeGameAtStage(durationCreation.state, stage.index)
    const durationActive = expectTransition(startGameplayTurn(stageHandoff, startedAt))
    const expectedDuration = stage.kind === 'lightning' ? 10 : turnDuration
    assert.equal(
      getGameplayTurnDurationSeconds(stage, turnDuration),
      expectedDuration,
    )
    assert.equal(durationActive.deadline, startedAt + expectedDuration * 1_000)

    if (stage.index !== 0) continue
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
const appDrawerSource = await readFile(
  new URL('../src/modules/common/components/app-drawer/app-drawer.tsx', import.meta.url),
  'utf8',
)
const appDrawerStyles = await readFile(
  new URL('../src/modules/common/components/app-drawer/app-drawer.module.css', import.meta.url),
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
const lightningAttributionChooserSource = await readFile(
  new URL(
    '../src/modules/game/components/lightning-attribution-chooser/lightning-attribution-chooser.tsx',
    import.meta.url,
  ),
  'utf8',
)
const lightningAttributionChooserStyles = await readFile(
  new URL(
    '../src/modules/game/components/lightning-attribution-chooser/lightning-attribution-chooser.module.css',
    import.meta.url,
  ),
  'utf8',
)
const gameplayTimerSource = await readFile(
  new URL('../src/modules/game/use-gameplay-timer.ts', import.meta.url),
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
const rootTokens = getRootTokens(globalStyles)
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
assert.match(handoffSource, /getGameplayTurnDurationSeconds\(stage, game\.turnDuration\)/)
assert.match(handoffSource, /GAMEPLAY_STAGE_PRESENTATIONS\[stage\.index\]/)
assert.doesNotMatch(handoffSource, /stagePresentation\.mainAllowed/)
assert.match(
  handoffSource,
  /<p className=\{styles\.turnLabel\}>Turno de:<\/p>\s*<h1 id="game-handoff-player">\{playerName\}<\/h1>\s*<p className=\{styles\.privacyInstruction\}>/,
)
assert.match(
  handoffSource,
  /Controla el dispositivo\. Todos pueden acertar y la carta se mantiene oculta hasta continuar\./,
)
assert.match(
  handoffSource,
  /<dt>\{isLightning \? 'Control' : 'Equipo'\}<\/dt>\s*<dd>\{isLightning \? playerName : participant\.team\.name\}<\/dd>/,
)
assert.match(
  handoffSource,
  /<dt>Cartas<\/dt>\s*<dd>\{game\.pendingCardIds\.length\}<\/dd>/,
)
assert.match(
  handoffSource,
  /<dt>\{isLightning \? 'Participan' : 'Puntaje'\}<\/dt>\s*<dd>\{isLightning \? 'Todos' : score\}<\/dd>/,
)
assert.match(
  handoffSource,
  /La carta sigue oculta\. El tiempo original no se reiniciará al continuar\./,
)
assert.match(
  handoffSource,
  /Pasá el dispositivo\. La carta se mostrará solo cuando esta persona toque el botón\./,
)
assert.doesNotMatch(handoffSource, /JUEGAN TODOS|\$\{playerCount\} jugadores/)
assert.doesNotMatch(handoffSource, /\bplayerCount\b/)
const handoffReadingOrder = [
  'styles.turnLabel',
  'styles.privacyInstruction',
  'styles.stageTitle',
  'styles.roundSummary',
  'styles.roundRules',
  'styles.turnSummary',
  'styles.bottomButton',
].map((marker) => handoffSource.indexOf(marker))
assert.ok(handoffReadingOrder.every((position) => position >= 0))
assert.deepEqual([...handoffReadingOrder].sort((left, right) => left - right), handoffReadingOrder)
assert.match(
  gamePageSource,
  /import \{ FieldTimeOutlined, LikeOutlined, MessageOutlined, UserOutlined \} from '@ant-design\/icons'/,
)
assert.match(
  handoffSource,
  /<span className=\{styles\.factLabel\}>\s*Duración<span className="visually-hidden">: <\/span>\s*<\/span>\s*<span className=\{`\$\{styles\.factIcon\} \$\{styles\.stopwatchVisual\}`\}>\s*<FieldTimeOutlined className=\{styles\.stopwatchIcon\} aria-hidden="true" \/>\s*<strong className=\{styles\.stopwatchValue\}>\s*\{stageDuration\}\s*<span aria-hidden="true">s<\/span>\s*<span className="visually-hidden"> segundos<\/span>/,
)
assert.equal(handoffSource.match(/ segundos/g)?.length, 1)
assert.doesNotMatch(handoffSource, /<svg|StopwatchFactIcon|AttemptsFactIcon/)
assert.match(
  handoffSource,
  /<span className=\{`\$\{styles\.factIcon\} \$\{styles\.attemptsIcon\}`\} aria-hidden="true">\s*<UserOutlined className=\{styles\.attemptsUserIcon\} \/>\s*<MessageOutlined className=\{styles\.attemptsMessageIcon\} \/>/,
)
assert.match(
  handoffSource,
  /<span className=\{styles\.factIcon\} aria-hidden="true">\s*<LikeOutlined className=\{styles\.allowedIcon\} \/>/,
)
assert.match(handoffSource, /<dt>Podés<\/dt>\s*<dd>\{stagePresentation\.allowed\}<\/dd>/)
assert.match(handoffSource, /<dt>No podés<\/dt>\s*<dd>\{stagePresentation\.forbidden\}<\/dd>/)
assert.match(
  handoffSource,
  /<h2 className=\{styles\.stageTitle\}>\{stage\.name\}<\/h2>/,
)
assert.doesNotMatch(handoffSource, /<h2 className=\{styles\.stageTitle\}>\{stage\.rule\}<\/h2>/)
assert.match(
  handoffSource,
  /<span className=\{styles\.factLabel\}>Regla<\/span>\s*<strong className=\{styles\.factValue\}>\{stage\.rule\}<\/strong>/,
)
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
assert.match(activeTurnViewSource, /\{stage\.label\} · \{stage\.rule\}/)
assert.match(
  gamePageSource,
  /Sigue \{nextStage\.name\}: <strong>\{nextStage\.rule\}<\/strong>\./,
)
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
assert.match(
  activeTurnViewSource,
  /<header className=\{styles\.activeHeader\}>[\s\S]*<\/header>\s*<GameplayCard/,
)
assert.match(activeTurnViewSource, /cardRegionClassName=\{styles\.cardViewport\}/)
assert.doesNotMatch(
  activeTurnViewSource,
  /<div className=\{styles\.cardViewport\}>/,
)
assert.doesNotMatch(activeTurnViewSource, /styles\.status/)
assert.match(
  activeTurnViewSource,
  /game\.phase === GAMEPLAY_PHASES\.lightningAttribution/,
)
assert.match(
  activeTurnViewSource,
  /frozenAt: isAwaitingAttribution \? game\.pendingAttribution\.decidedAt : null/,
)
assert.match(activeTurnViewSource, /disabled=\{isAwaitingAttribution\}/)
assert.match(activeTurnViewSource, /<LightningAttributionChooser/)
assert.match(
  activeTurnViewSource,
  /open=\{attributionChooserCardId === game\.pendingAttribution\.cardId\}/,
)
assert.match(lightningAttributionChooserSource, /<AppDrawer/)
assert.match(lightningAttributionChooserSource, /title="¿Quién acertó\?"/)
assert.match(lightningAttributionChooserSource, /onClose=\{cancel\}/)
assert.match(
  lightningAttributionChooserSource,
  /<ul className=\{styles\.playerList\} aria-label="Jugadores que pueden recibir el acierto">/,
)
assert.match(lightningAttributionChooserSource, /<button\s+type="button"/)
assert.match(
  lightningAttributionChooserSource,
  /aria-label=\{`Atribuir acierto a \$\{player\.name\}, \$\{team\.name\}`\}/,
)
assert.match(
  lightningAttributionChooserSource,
  /<strong>\{player\.name\}<\/strong>[\s\S]*<span>\{team\.name\}<\/span>/,
)
assert.match(
  lightningAttributionChooserSource,
  /onClick=\{\(\) => onAward\(cardId, player\.id, Date\.now\(\)\)\}/,
)
assert.match(lightningAttributionChooserSource, />\s*Cancelar\s*<\/Button>/)
assert.doesNotMatch(lightningAttributionChooserSource, /setTimeout|setInterval/)
assert.match(appDrawerSource, /aria-describedby=\{descriptionId\}/)
assert.match(appDrawerSource, /aria-labelledby=\{titleId\}/)
assert.match(appDrawerSource, /closable=\{false\}/)
assert.match(appDrawerSource, /focusable=\{\{ trap: true, focusTriggerAfterClose: true \}\}/)
assert.match(appDrawerSource, /\skeyboard\s/)
assert.match(appDrawerSource, /placement="bottom"/)
assert.match(appDrawerSource, /onClose=\{onClose\}/)
assert.match(
  appDrawerSource,
  /<hgroup[\s\S]*<h2 id=\{titleId\}>\{title\}<\/h2>[\s\S]*<p id=\{descriptionId\}>\{description\}<\/p>/,
)
assert.doesNotMatch(appDrawerSource, /mask=\{false\}/)
const appDrawerContentRule = getRuleBody(
  appDrawerStyles,
  '\\.content',
  'Shared Drawer mobile content cap',
)
assert.match(appDrawerContentRule, /width:\s*min\(var\(--mobile-breakpoint\), 100%\);/)
assert.match(appDrawerContentRule, /margin-inline:\s*auto;/)
assert.match(
  lightningAttributionChooserStyles,
  /\.playerButton\s*\{[^}]*min-height:\s*52px;/,
)
assert.match(
  lightningAttributionChooserStyles,
  /\.playerButton strong,\s*\.playerButton span\s*\{[^}]*overflow-wrap:\s*anywhere;/,
)
assert.match(
  lightningAttributionChooserStyles,
  /\.playerButton:focus-visible\s*\{[^}]*outline:\s*3px solid var\(--color-focus\);[^}]*outline-offset:\s*2px;/,
)
assert.match(
  lightningAttributionChooserStyles,
  /\.playerButton\s*\{[^}]*box-shadow:\s*var\(--shadow-control\);/,
)
const playerListRule = getRuleBody(
  lightningAttributionChooserStyles,
  '\\.playerList',
  'Lightning attribution player-list shadow gutter',
)
for (const contract of [
  /width:\s*calc\(100% \+ var\(--space-shadow-gutter\) \+ var\(--space-shadow-gutter\)\);/,
  /max-height:\s*min\(52dvh, 26rem\);/,
  /margin-block:\s*0;/,
  /margin-inline:\s*calc\(-1 \* var\(--space-shadow-gutter\)\);/,
  /padding-block-start:\s*var\(--space-shadow-gutter\);/,
  /padding-block-end:\s*var\(--space-xl\);/,
  /padding-inline:\s*var\(--space-shadow-gutter\);/,
  /overflow-x:\s*hidden;/,
  /overflow-y:\s*auto;/,
]) {
  assert.match(playerListRule, contract)
}
assert.doesNotMatch(playerListRule, /padding-block:\s*/)
assert.doesNotMatch(playerListRule, /overflow-x:\s*visible;/)
const playerListCloseIndex = lightningAttributionChooserSource.indexOf('</ul>')
const attributionCancelIndex = lightningAttributionChooserSource.indexOf(
  '<Button className={styles.cancelButton}',
)
assert.ok(playerListCloseIndex >= 0 && attributionCancelIndex > playerListCloseIndex)
assert.match(gameplayTimerSource, /useEffect, useLayoutEffect, useState/)
assert.match(gameplayTimerSource, /const synchronizedClock = rebaseGameplayTimerClock\(clock, facts\)/)
const timerLayoutEffectStart = gameplayTimerSource.indexOf('useLayoutEffect(() => {')
const timerLayoutEffectEnd = gameplayTimerSource.indexOf(
  '}, [deadline, frozenAt, startedAt])',
  timerLayoutEffectStart,
)
assert.ok(timerLayoutEffectStart >= 0 && timerLayoutEffectEnd > timerLayoutEffectStart)
const timerLayoutEffectSource = gameplayTimerSource.slice(
  timerLayoutEffectStart,
  timerLayoutEffectEnd,
)
assert.match(
  timerLayoutEffectSource,
  /setClock\(\(currentClock\) =>[\s\S]*rebaseGameplayTimerClock\(currentClock, \{ startedAt, deadline, frozenAt \}\)/,
)
assert.match(gameplayTimerSource, /const displayedNow = frozenAt \?\? synchronizedClock\.now/)
const timerSchedulingEffectStart = gameplayTimerSource.indexOf(
  'useEffect(() => {',
  timerLayoutEffectEnd,
)
const timerSchedulingEffectEnd = gameplayTimerSource.indexOf(
  '}, [deadline, frozenAt, onExpire, startedAt])',
  timerSchedulingEffectStart,
)
assert.ok(
  timerSchedulingEffectStart >= 0 && timerSchedulingEffectEnd > timerSchedulingEffectStart,
)
const timerSchedulingEffectSource = gameplayTimerSource.slice(
  timerSchedulingEffectStart,
  timerSchedulingEffectEnd,
)
const frozenSchedulingGuardIndex = timerSchedulingEffectSource.indexOf(
  'if (frozenAt !== null) return',
)
const deadlineTimeoutIndex = timerSchedulingEffectSource.indexOf('window.setTimeout')
const cadenceIntervalIndex = timerSchedulingEffectSource.indexOf('window.setInterval')
assert.ok(frozenSchedulingGuardIndex >= 0)
assert.ok(deadlineTimeoutIndex > frozenSchedulingGuardIndex)
assert.ok(cadenceIntervalIndex > frozenSchedulingGuardIndex)
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
  'Acierto registrado. Elegí quién acertó.',
  'Atribución cancelada. El turno continúa.',
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

const privacyGateStart = gamePageSource.indexOf('blockInitialActiveCard &&')
const privacyGateEnd = gamePageSource.indexOf('const handleReveal', privacyGateStart)
assert.ok(privacyGateStart >= 0 && privacyGateEnd > privacyGateStart)
assert.doesNotMatch(
  gamePageSource.slice(privacyGateStart, privacyGateEnd),
  /CARD_CATALOG_BY_ID|getCurrentGameplayCardId|GameplayCard/,
)
assert.match(
  gamePageSource.slice(privacyGateStart, privacyGateEnd),
  /GAMEPLAY_PHASES\.lightningAttribution/,
)

const commitDecisionStart = gameplayCardSource.indexOf('const commitDecision')
const commitDecisionEnd = gameplayCardSource.indexOf('const releasePointer', commitDecisionStart)
assert.ok(commitDecisionStart >= 0 && commitDecisionEnd > commitDecisionStart)
const commitDecisionSource = gameplayCardSource.slice(commitDecisionStart, commitDecisionEnd)
const duplicateLockIndex = commitDecisionSource.indexOf('resolvingRef.current = true')
const capturedTimeIndex = commitDecisionSource.indexOf('const decidedAt = Date.now()')
const visualIdIndex = commitDecisionSource.indexOf('const visualId = nextVisualIdRef.current')
const visualSnapshotIndex = commitDecisionSource.indexOf(
  'const outgoingCard = createOutgoingCardSnapshot(',
)
const visualAppendIndex = commitDecisionSource.indexOf(
  'setOutgoingCards((currentCards) => [...currentCards, outgoingCard])',
)
const visualLockIndex = commitDecisionSource.indexOf('setIsResolving(true)')
const domainDecisionIndex = commitDecisionSource.indexOf(
  'onDecision(decision, card.id, decidedAt)',
)
const interactionDelayIndex = commitDecisionSource.indexOf('window.setTimeout')
assert.ok(duplicateLockIndex >= 0)
assert.ok(capturedTimeIndex > duplicateLockIndex)
assert.ok(visualIdIndex > capturedTimeIndex)
assert.ok(visualSnapshotIndex > visualIdIndex)
assert.ok(visualAppendIndex > visualSnapshotIndex)
assert.ok(visualLockIndex > visualAppendIndex)
assert.ok(domainDecisionIndex > visualLockIndex)
assert.ok(interactionDelayIndex > domainDecisionIndex)
assert.match(commitDecisionSource, /nextVisualIdRef\.current \+= 1;/)
assert.match(
  commitDecisionSource,
  /if \(!prefersReducedMotion\) \{\s*setOutgoingCards\(\(currentCards\) => \[\.\.\.currentCards, outgoingCard\]\);\s*\}/,
)
assert.doesNotMatch(commitDecisionSource, /CONTROL_DECISION_VISUAL_MS|1800/)

assert.doesNotMatch(gamePageSource, /<GameplayCard\s+key=/)
assert.match(gameplayCardSource, /onDecisionInteractionComplete\?:/)
assert.match(activeTurnViewSource, /onDecisionInteractionComplete=/)
assert.doesNotMatch(
  `${gameplayCardSource}\n${gamePageSource}`,
  /onDecisionAnimationComplete/,
)
assert.match(gameplayCardSource, /getKeyboardDecision\(event\.key, event\.repeat\)/)
assert.match(gameplayCardSource, /onPointerDown=/)
assert.match(gameplayCardSource, /onPointerMove=/)
assert.match(gameplayCardSource, /onPointerUp=/)
assert.match(gameplayCardSource, /aria-disabled=\{isResolving \|\| disabled\}/)
assert.match(gameplayCardSource, /↓ Acertó/)
assert.match(gameplayCardSource, /↑ Pasar/)
assert.doesNotMatch(gameplayCardSource, /selectedMain|selectedLightning|unselected/)

const scrollResetStart = gameplayCardSource.indexOf('useLayoutEffect(() => {')
const scrollResetEnd = gameplayCardSource.indexOf('}, [card.id]);', scrollResetStart)
const cardFocusEffectStart = gameplayCardSource.indexOf(
  'useEffect(() => {',
  scrollResetEnd,
)
assert.ok(scrollResetStart >= 0 && scrollResetEnd > scrollResetStart)
assert.ok(cardFocusEffectStart > scrollResetEnd)
const scrollResetSource = gameplayCardSource.slice(scrollResetStart, scrollResetEnd)
assert.match(scrollResetSource, /const cardElement = cardRef\.current;/)
assert.match(scrollResetSource, /if \(cardElement\) cardElement\.scrollTop = 0;/)
assert.doesNotMatch(scrollResetSource, /setOutgoingCards|focus\(|scrollTo\(/)

const pointerDownStart = gameplayCardSource.indexOf('const handlePointerDown')
const pointerMoveStart = gameplayCardSource.indexOf('const handlePointerMove', pointerDownStart)
assert.ok(pointerDownStart >= 0 && pointerMoveStart > pointerDownStart)
const pointerDownSource = gameplayCardSource.slice(pointerDownStart, pointerMoveStart)
const nativeScrollTouchIndex = pointerDownSource.indexOf('const isNativeScrollTouch')
const activePointerAssignmentIndex = pointerDownSource.indexOf('activePointerRef.current = {')
const pointerCaptureIndex = pointerDownSource.indexOf('setPointerCapture(event.pointerId)')
assert.ok(nativeScrollTouchIndex >= 0)
assert.ok(activePointerAssignmentIndex > nativeScrollTouchIndex)
assert.ok(pointerCaptureIndex > activePointerAssignmentIndex)
assert.match(pointerDownSource, /event\.pointerType === 'touch'/)
assert.match(
  pointerDownSource,
  /window\.getComputedStyle\(event\.currentTarget\)\.touchAction\.includes\('pan-y'\)/,
)
assert.match(pointerDownSource, /event\.button !== 0 \|\|\s*isNativeScrollTouch/)

const pointerCancelStart = gameplayCardSource.indexOf('const handlePointerCancel')
const lostPointerCaptureStart = gameplayCardSource.indexOf(
  'const handleLostPointerCapture',
  pointerCancelStart,
)
assert.ok(pointerCancelStart >= 0 && lostPointerCaptureStart > pointerCancelStart)
const pointerCancelSource = gameplayCardSource.slice(
  pointerCancelStart,
  lostPointerCaptureStart,
)
assert.match(pointerCancelSource, /activePointerRef\.current = null;/)
assert.match(pointerCancelSource, /setIsDragging\(false\);/)
assert.match(pointerCancelSource, /releasePointer\(event\);/)
assert.match(pointerCancelSource, /setDragPosition\(RESTING_POSITION\);/)

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
assert.match(
  passButtonSource,
  /onClick=\{\(\) => commitDecision\('pass', 'button', RESTING_POSITION\)\}/,
)
assert.match(passButtonSource, /↑ Pasar/)
const passActionIndex = gameplayActionsSource.indexOf(
  "onClick={() => commitDecision('pass', 'button', RESTING_POSITION)}",
)
const correctActionIndex = gameplayActionsSource.indexOf(
  "onClick={() => commitDecision('correct', 'button', RESTING_POSITION)}",
)
assert.ok(passActionIndex >= 0 && correctActionIndex > passActionIndex)
assert.match(gameplayActionsSource, /className=\{styles\.correctButton\}/)
assert.equal(gameplayActionsSource.match(/disabled=\{isResolving \|\| disabled\}/g)?.length, 2)

assert.match(gameplayCardSource, /cardRegionClassName\?: string;/)
assert.match(
  gameplayCardSource,
  /const cardRegionClasses = cardRegionClassName[\s\S]*styles\.interaction;/,
)
assert.match(
  gameplayCardSource,
  /<>\s*<div className=\{cardRegionClasses\}>[\s\S]*<div className=\{styles\.cardStack\}>[\s\S]*<\/div>\s*<\/div>\s*<div className=\{styles\.actions\}/,
)

const gameplayInteractionRule = getRuleBody(
  gameplayCardStyles,
  '\\.interaction',
  'Active gameplay card region',
)
for (const contract of [
  /display:\s*grid;/,
  /height:\s*100%;/,
  /min-width:\s*0;/,
  /min-height:\s*0;/,
  /grid-template-rows:\s*auto minmax\(0, 1fr\);/,
]) {
  assert.match(gameplayInteractionRule, contract)
}
const gameplayCardStackRule = getRuleBody(
  gameplayCardStyles,
  '\\.cardStack',
  'Active gameplay card stack',
)
assert.match(gameplayCardStackRule, /width:\s*100%;/)
assert.match(gameplayCardStackRule, /min-width:\s*0;/)
assert.match(gameplayCardStackRule, /min-height:\s*0;/)
assert.equal(
  getDeclarationValue(gameplayCardStackRule, 'padding', 'Active gameplay card stack'),
  'var(--space-sm)',
)
assert.match(gameplayCardStackRule, /grid-template-rows:\s*minmax\(0, 1fr\);/)
assert.match(gameplayCardStackRule, /container-name:\s*gameplay-card-stack;/)
assert.match(gameplayCardStackRule, /container-type:\s*size;/)
const gameplayStackedCardRule = getRuleBody(
  gameplayCardStyles,
  '\\.cardStack > \\.card',
  'Active and outgoing card stack placement',
)
assert.match(gameplayStackedCardRule, /grid-area:\s*1 \/ 1;/)

const gameplayCardRule = gameplayCardStyles.match(/^\.card\s*\{([^}]*)\}/m)
assert.ok(gameplayCardRule)
assert.match(gameplayCardRule[1], /box-sizing:\s*border-box;/)
const gameplayCardAspectRatio = getDeclarationValue(
  gameplayCardRule[1],
  'aspect-ratio',
  'Responsive gameplay card',
).match(/^(\d+)\s*\/\s*(\d+)$/)
assert.ok(gameplayCardAspectRatio)
const cardInlineRatio = Number(gameplayCardAspectRatio[1])
const cardBlockRatio = Number(gameplayCardAspectRatio[2])
assert.deepEqual([cardInlineRatio, cardBlockRatio], [9, 16])
assert.equal(gameplayCardStyles.match(/(?:^|\n)\s*aspect-ratio\s*:/g)?.length, 1)

const gameplayCardWidthEquation = getDeclarationValue(
  gameplayCardRule[1],
  'width',
  'Responsive gameplay card',
)
const gameplayCardWidthTerms = gameplayCardWidthEquation.match(
  /^min\(100%,\s*(\d+(?:\.\d+)?)px,\s*(\d+(?:\.\d+)?)cqh\)$/,
)
assert.ok(gameplayCardWidthTerms)
const cardInlineCap = Number(gameplayCardWidthTerms[1])
const cardBlockToInlineScale = Number(gameplayCardWidthTerms[2]) / 100
const cardAspectRatio = cardInlineRatio / cardBlockRatio
assert.equal(cardInlineCap, 300)
assert.equal(cardBlockToInlineScale, cardAspectRatio)

assert.match(
  globalStyles,
  /\*,\s*\*::before,\s*\*::after\s*\{[^}]*box-sizing:\s*border-box;/,
)
const cardStackPadding = cssLengthToPixels(
  resolveRootToken(rootTokens, '--space-sm'),
  'Gameplay card-stack padding',
)
const cardFaceShadow = getSingleShadowMetrics(
  rootTokens.get('--shadow-card-face'),
  'Gameplay card-face shadow',
)
const cardBorderWidth = Number(
  getDeclarationValue(gameplayCardRule[1], 'border', 'Responsive gameplay card'),
)
const shadowReach = {
  inlineStart: Math.max(
    0,
    cardFaceShadow.blurRadius - cardFaceShadow.offsetX + cardFaceShadow.spreadRadius,
  ),
  inlineEnd: Math.max(
    0,
    cardFaceShadow.blurRadius + cardFaceShadow.offsetX + cardFaceShadow.spreadRadius,
  ),
  blockStart: Math.max(
    0,
    cardFaceShadow.blurRadius - cardFaceShadow.offsetY + cardFaceShadow.spreadRadius,
  ),
  blockEnd: Math.max(
    0,
    cardFaceShadow.blurRadius + cardFaceShadow.offsetY + cardFaceShadow.spreadRadius,
  ),
}
assert.equal(cardStackPadding, 12)
assert.equal(cardBorderWidth, 0)
assert.deepEqual(shadowReach, {
  inlineStart: 6,
  inlineEnd: 10,
  blockStart: 4,
  blockEnd: 12,
})
for (const reach of Object.values(shadowReach)) {
  assert.ok(cardStackPadding >= cardBorderWidth + reach)
}
assert.doesNotMatch(gameplayCardRule[1], /(?:^|\n)\s*padding(?:-[\w-]+)?:/)

const responsiveCardCases = [
  {
    label: '320px shell',
    outerInline: 296,
    outerBlock: 600,
    expectedInnerInline: 272,
    expectedInnerBlock: 576,
    expectedInline: 272,
    expectedBlock: 272 / cardAspectRatio,
  },
  {
    label: '390px shell',
    outerInline: 358,
    outerBlock: 600,
    expectedInnerInline: 334,
    expectedInnerBlock: 576,
    expectedInline: 300,
    expectedBlock: 300 / cardAspectRatio,
  },
  {
    label: 'Short card stack',
    outerInline: 358,
    outerBlock: 400,
    expectedInnerInline: 334,
    expectedInnerBlock: 376,
    expectedInline: 211.5,
    expectedBlock: 376,
  },
  {
    label: 'Native-pan boundary',
    outerInline: 296,
    outerBlock: 239,
    expectedInnerInline: 272,
    expectedInnerBlock: 215,
    expectedInline: 120.9375,
    expectedBlock: 215,
  },
]
for (const cardCase of responsiveCardCases) {
  const availableInline = cardCase.outerInline - 2 * cardStackPadding
  const availableBlock = cardCase.outerBlock - 2 * cardStackPadding
  const inlineSize = Math.min(
    availableInline,
    cardInlineCap,
    availableBlock * cardBlockToInlineScale,
  )
  const blockSize = inlineSize / cardAspectRatio
  const inlineCenteringSpace = (availableInline - inlineSize) / 2
  const blockCenteringSpace = (availableBlock - blockSize) / 2
  const epsilon = 1e-9
  assert.equal(availableInline, cardCase.expectedInnerInline)
  assert.equal(availableBlock, cardCase.expectedInnerBlock)
  assert.ok(
    Math.abs(inlineSize - cardCase.expectedInline) < epsilon,
    `${cardCase.label} must choose the expected limiting dimension`,
  )
  assert.ok(
    Math.abs(blockSize - cardCase.expectedBlock) < epsilon,
    `${cardCase.label} must preserve the 9:16 box`,
  )
  assert.ok(
    inlineSize <= availableInline + epsilon,
    `${cardCase.label} must fit the card stack content-box inline size`,
  )
  assert.ok(
    blockSize <= availableBlock + epsilon,
    `${cardCase.label} must fit the card stack content-box block size`,
  )
  assert.ok(
    cardStackPadding + inlineCenteringSpace >= cardBorderWidth + shadowReach.inlineStart,
    `${cardCase.label} must contain the card's inline-start border and shadow`,
  )
  assert.ok(
    cardStackPadding + inlineCenteringSpace >= cardBorderWidth + shadowReach.inlineEnd,
    `${cardCase.label} must contain the card's inline-end border and shadow`,
  )
  assert.ok(
    cardStackPadding + blockCenteringSpace >= cardBorderWidth + shadowReach.blockStart,
    `${cardCase.label} must contain the card's block-start border and shadow`,
  )
  assert.ok(
    cardStackPadding + blockCenteringSpace >= cardBorderWidth + shadowReach.blockEnd,
    `${cardCase.label} must contain the card's block-end border and shadow`,
  )
}

assert.match(gameplayCardRule[1], /height:\s*auto;/)
assert.match(gameplayCardRule[1], /min-width:\s*0;/)
assert.match(gameplayCardRule[1], /max-height:\s*100%;/)
assert.match(gameplayCardRule[1], /min-height:\s*0;/)
assert.match(gameplayCardRule[1], /margin:\s*auto;/)
assert.match(
  gameplayCardRule[1],
  /grid-template-rows:\s*minmax\(38px, 0\.45fr\) repeat\(3, minmax\(72px, 1fr\)\) minmax\(92px, 1\.15fr\);/,
)
assert.doesNotMatch(gameplayCardRule[1], /\b(?:d|s|l)?v(?:h|w)\b/)
assert.match(gameplayCardRule[1], /gap:\s*var\(--space-card-band-gutter\);/)
assert.match(gameplayCardRule[1], /overflow:\s*hidden;/)
assert.match(gameplayCardRule[1], /touch-action:\s*none;/)
assert.match(gameplayCardRule[1], /border:\s*0;/)
assert.match(gameplayCardRule[1], /border-radius:\s*var\(--radius-card-face\);/)
assert.doesNotMatch(gameplayCardRule[1], /--radius-control-pill/)
assert.match(gameplayCardRule[1], /background:\s*var\(--color-card-surface\);/)
assert.match(gameplayCardRule[1], /box-shadow:\s*var\(--shadow-card-face\);/)
assert.doesNotMatch(gameplayCardRule[1], /transparent/)
assert.doesNotMatch(gameplayCardStyles, /--shadow-card-selected|--border-card-selected/)

const normalCardMinimumHeight = 38 + 3 * 72 + 92 + 4 * 7
assert.equal(normalCardMinimumHeight, 374)
const compactCardStart = gameplayCardStyles.indexOf(
  '@container gameplay-card-stack (max-height: 469px)',
)
const compactOverflowStart = gameplayCardStyles.indexOf(
  '@container gameplay-card-stack (max-height: 215px)',
  compactCardStart,
)
const gameplayReducedMotionStart = gameplayCardStyles.indexOf(
  '@media (prefers-reduced-motion: reduce)',
  compactOverflowStart,
)
assert.ok(compactCardStart >= 0)
assert.ok(compactOverflowStart > compactCardStart)
assert.ok(gameplayReducedMotionStart > compactOverflowStart)
const compactCardStyles = gameplayCardStyles.slice(compactCardStart, compactOverflowStart)
const compactOverflowStyles = gameplayCardStyles.slice(
  compactOverflowStart,
  gameplayReducedMotionStart,
)
const compactCardRule = getRuleBody(
  compactCardStyles,
  '\\.card',
  'Compact active gameplay card',
)
const compactRows = compactCardRule.match(
  /grid-template-rows:\s*(\d+)px repeat\(3, minmax\((\d+)px, 1fr\)\) minmax\((\d+)px, 1\.1fr\);/,
)
assert.ok(compactRows)
assert.equal(
  getDeclarationValue(compactCardRule, 'gap', 'Compact active gameplay card'),
  'clamp(3px, 1cqh, var(--space-card-band-gutter))',
)
assert.doesNotMatch(compactCardRule, /(?:^|\n)\s*(?:height|min-height|max-height):/)
const compactMinimumHeight =
  Number(compactRows[1]) + 3 * Number(compactRows[2]) + Number(compactRows[3]) + 4 * 3
assert.equal(compactMinimumHeight, 214)
const practicalCompactHeight = 216
assert.ok(compactMinimumHeight <= practicalCompactHeight)
assert.equal(469 + 2 * cardStackPadding, 493)
assert.equal(215 + 2 * cardStackPadding, 239)

const compactCardSectionRule = getRuleBody(
  compactCardStyles,
  '\\.cardSection',
  'Compact card-section spacing',
)
assert.match(compactCardSectionRule, /padding-block:\s*clamp\(2px, 1\.2cqh, 6px\);/)
assert.match(compactCardSectionRule, /padding-inline:\s*var\(--space-xs\);/)
const compactSemanticBandsRule = getRuleBody(
  compactCardStyles,
  '\\.titleSection,\\s*\\.characterSection,\\s*\\.everythingSection',
  'Compact semantic-band flow',
)
assert.match(compactSemanticBandsRule, /align-content:\s*stretch;/)
assert.match(
  compactSemanticBandsRule,
  /grid-template-rows:\s*minmax\(min-content, 1fr\) auto;/,
)
assert.match(compactSemanticBandsRule, /row-gap:\s*clamp\(1px, 0\.5cqh, 2px\);/)
const compactSectionValueRule = getRuleBody(
  compactCardStyles,
  '\\.sectionValue',
  'Compact card value type',
)
assert.match(
  compactSectionValueRule,
  /font-size:\s*clamp\(0\.75rem, 4cqh, 1\.125rem\);/,
)
assert.match(compactSectionValueRule, /line-height:\s*1;/)
const compactSupportingTypeRule = getRuleBody(
  compactCardStyles,
  '\\.sectionSubtype,\\s*\\.keywordLabel',
  'Compact supporting type',
)
assert.match(
  compactSupportingTypeRule,
  /font-size:\s*clamp\(0\.5625rem, 2\.3cqh, 0\.6875rem\);/,
)
assert.match(compactSupportingTypeRule, /line-height:\s*1;/)
const compactSubtypeRule = getRuleBody(
  compactCardStyles,
  '\\.sectionSubtype',
  'Compact subtype flow',
)
for (const contract of [
  /position:\s*static;/,
  /width:\s*100%;/,
  /max-width:\s*100%;/,
  /align-self:\s*end;/,
  /justify-self:\s*end;/,
]) {
  assert.match(compactSubtypeRule, contract)
}
const compactKeywordSectionRule = getRuleBody(
  compactCardStyles,
  '\\.keywordSection',
  'Compact keyword flow',
)
assert.match(
  compactKeywordSectionRule,
  /grid-template-rows:\s*auto minmax\(min-content, 1fr\);/,
)
assert.match(compactKeywordSectionRule, /row-gap:\s*clamp\(1px, 0\.5cqh, 2px\);/)
const compactKeywordValueRule = getRuleBody(
  compactCardStyles,
  '\\.keywordValue',
  'Compact keyword value type',
)
assert.match(
  compactKeywordValueRule,
  /font-size:\s*clamp\(1rem, 4\.5cqh, 1\.375rem\);/,
)
assert.match(compactKeywordValueRule, /line-height:\s*1;/)
assert.doesNotMatch(compactCardStyles, /position:\s*absolute;/)
assert.doesNotMatch(compactCardStyles, /(?:white-space:\s*nowrap|text-overflow:\s*ellipsis)/)
assert.doesNotMatch(compactCardStyles, /\.actions/)
assert.doesNotMatch(compactCardStyles, /touch-action:/)
const compactOverflowRule = getRuleBody(
  compactOverflowStyles,
  '\\.card:not\\(\\.outgoingCard\\)',
  'Below-minimum compact card overflow',
)
assert.match(compactOverflowRule, /overflow-x:\s*hidden;/)
assert.match(compactOverflowRule, /overflow-y:\s*auto;/)
assert.match(compactOverflowRule, /overscroll-behavior-y:\s*contain;/)
assert.match(compactOverflowRule, /touch-action:\s*pan-y;/)
assert.doesNotMatch(compactOverflowStyles, /\.actions/)

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
const gameplayActionsRule = getRuleBody(
  gameplayCardStyles,
  '\\.actions',
  'Ordinary-flow active gameplay actions',
)
for (const contract of [
  /display:\s*grid;/,
  /width:\s*100%;/,
  /min-width:\s*0;/,
  /grid-row:\s*3;/,
  /grid-template-columns:\s*1fr 1fr;/,
]) {
  assert.match(gameplayActionsRule, contract)
}
assert.doesNotMatch(gameplayActionsRule, /position:\s*(?:absolute|fixed|sticky);/)
assert.doesNotMatch(
  gameplayCardStyles,
  /@media \(max-height: 680px\)[\s\S]*?\.card\s*\{[^}]*height:\s*400px;/,
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
assert.deepEqual(getDeclaredProperties(correctButtonRule), ['background', 'box-shadow'])
assert.equal(
  getDeclarationValue(correctButtonRule, 'background', 'Stage-aware correct action'),
  'var(--stage-action-color)',
)
assert.equal(
  getDeclarationValue(correctButtonRule, 'box-shadow', 'Stage-aware correct action'),
  'none !important',
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

assert.match(
  gameplayCardSource,
  /const \[outgoingCards, setOutgoingCards\] = useState<OutgoingCardSnapshot\[]>\(\[\]\);/,
)
assert.doesNotMatch(gameplayCardSource, /useState<OutgoingCardSnapshot \| null>/)
assert.match(gameplayCardSource, /const nextVisualIdRef = useRef\(1\);/)
assert.match(gameplayCardSource, /readonly visualId: number;/)

const removeOutgoingCardStart = gameplayCardSource.indexOf('const removeOutgoingCard')
const releaseDecisionInteractionStart = gameplayCardSource.indexOf(
  'const releaseDecisionInteraction',
  removeOutgoingCardStart,
)
const completeDecisionInteractionStart = gameplayCardSource.indexOf(
  'const completeDecisionInteraction',
  releaseDecisionInteractionStart,
)
assert.ok(removeOutgoingCardStart >= 0)
assert.ok(releaseDecisionInteractionStart > removeOutgoingCardStart)
assert.ok(completeDecisionInteractionStart > releaseDecisionInteractionStart)
assert.ok(commitDecisionStart > completeDecisionInteractionStart)
const removeOutgoingCardSource = gameplayCardSource.slice(
  removeOutgoingCardStart,
  releaseDecisionInteractionStart,
)
const releaseDecisionInteractionSource = gameplayCardSource.slice(
  releaseDecisionInteractionStart,
  completeDecisionInteractionStart,
)
const completeDecisionInteractionSource = gameplayCardSource.slice(
  completeDecisionInteractionStart,
  commitDecisionStart,
)
assert.match(
  removeOutgoingCardSource,
  /currentCards\.filter\(\(snapshot\) => snapshot\.visualId !== visualId\)/,
)
assert.match(
  removeOutgoingCardSource,
  /remainingCards\.length === currentCards\.length \? currentCards : remainingCards/,
)
assert.doesNotMatch(removeOutgoingCardSource, /setOutgoingCards\(\[\]\)|interactionTimerRef/)
assert.match(releaseDecisionInteractionSource, /interactionTimerRef\.current !== null/)
assert.match(releaseDecisionInteractionSource, /window\.clearTimeout\(interactionTimerRef\.current\)/)
assert.match(releaseDecisionInteractionSource, /resolvingRef\.current = false;/)
assert.match(releaseDecisionInteractionSource, /setIsResolving\(false\);/)
assert.doesNotMatch(releaseDecisionInteractionSource, /setOutgoingCards|onDecisionInteractionComplete/)
assert.match(completeDecisionInteractionSource, /if \(!resolvingRef\.current\) return;/)
assert.match(completeDecisionInteractionSource, /releaseDecisionInteraction\(\);/)
assert.match(
  completeDecisionInteractionSource,
  /onDecisionInteractionComplete\?\.\(decision, cardId\);/,
)
assert.doesNotMatch(completeDecisionInteractionSource, /setOutgoingCards|removeOutgoingCard/)

const rejectionBranchStart = commitDecisionSource.indexOf("if (result.kind === 'rejected')")
const rejectionBranchEnd = commitDecisionSource.indexOf(
  'if (prefersReducedMotion)',
  rejectionBranchStart,
)
assert.ok(rejectionBranchStart >= 0 && rejectionBranchEnd > rejectionBranchStart)
const rejectionBranchSource = commitDecisionSource.slice(
  rejectionBranchStart,
  rejectionBranchEnd,
)
assert.match(
  rejectionBranchSource,
  /removeOutgoingCard\(visualId\);\s*releaseDecisionInteraction\(\);\s*return;/,
)
assert.doesNotMatch(
  rejectionBranchSource,
  /onDecisionInteractionComplete|completeDecisionInteraction|setOutgoingCards\(\[\]\)/,
)

const outgoingVisualStart = gameplayCardSource.indexOf('function OutgoingGameplayCard')
const gameplayCardComponentStart = gameplayCardSource.indexOf(
  'export function GameplayCard',
  outgoingVisualStart,
)
assert.ok(outgoingVisualStart >= 0 && gameplayCardComponentStart > outgoingVisualStart)
const outgoingVisualSource = gameplayCardSource.slice(
  outgoingVisualStart,
  gameplayCardComponentStart,
)
assert.ok(outgoingVisualSource.includes('className={`${styles.card} ${styles.outgoingCard}'))
assert.match(outgoingVisualSource, /aria-hidden="true"/)
assert.match(outgoingVisualSource, /<GameplayCardContents card=\{snapshot\.card\} \/>/)
assert.match(
  outgoingVisualSource,
  /snapshot\.decision === 'correct'[\s\S]*styles\.outgoingCorrect[\s\S]*styles\.outgoingPass/,
)
assert.match(
  outgoingVisualSource,
  /snapshot\.decisionOrigin === 'pointer' \? '' : styles\.outgoingControlOrigin/,
)
assert.doesNotMatch(outgoingVisualSource, /onClick=|onKeyDown=|onPointer|tabIndex=/)
assert.match(
  outgoingVisualSource,
  /onAnimationEnd=\{\(event\) => \{\s*if \(event\.target === event\.currentTarget\) onVisualComplete\(snapshot\.visualId\);/,
)
assert.match(
  outgoingVisualSource,
  /addEventListener\('animationcancel', handleAnimationCancel\)/,
)
assert.match(
  outgoingVisualSource,
  /removeEventListener\('animationcancel', handleAnimationCancel\)/,
)
assert.match(
  outgoingVisualSource,
  /const cleanupTimer = window\.setTimeout\([\s\S]*visualDuration \+ OUTGOING_CARD_CLEANUP_GRACE_MS/,
)
assert.match(outgoingVisualSource, /window\.clearTimeout\(cleanupTimer\);/)
assert.doesNotMatch(outgoingVisualSource, /releaseDecisionInteraction|interactionTimerRef/)
assert.equal(outgoingVisualSource.match(/window\.setTimeout/g)?.length, 1)

const outgoingCardsRenderStart = gameplayCardSource.indexOf('{outgoingCards.map')
const outgoingCardsRenderEnd = gameplayCardSource.indexOf('</div>', outgoingCardsRenderStart)
assert.ok(outgoingCardsRenderStart >= 0 && outgoingCardsRenderEnd > outgoingCardsRenderStart)
const outgoingCardsRenderSource = gameplayCardSource.slice(
  outgoingCardsRenderStart,
  outgoingCardsRenderEnd,
)
assert.match(
  outgoingCardsRenderSource,
  /outgoingCards\.map\(\(outgoingCard\) => \([\s\S]*key=\{outgoingCard\.visualId\}[\s\S]*snapshot=\{outgoingCard\}[\s\S]*onVisualComplete=\{removeOutgoingCard\}/,
)
assert.match(
  gameplayCardStyles,
  /\.outgoingCard\s*\{[^}]*pointer-events:\s*none;/,
)
const outgoingCardRule = getRuleBody(
  gameplayCardStyles,
  '\\.outgoingCard',
  'Outgoing gameplay card',
)
assert.doesNotMatch(
  outgoingCardRule,
  /(?:^|\n)\s*(?:aspect-ratio|(?:min-|max-)?(?:width|height))\s*:/,
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
  /\.outgoingControlOrigin\s*\{[^}]*animation-duration:\s*1800ms;[^}]*animation-timing-function:\s*cubic-bezier\(0\.22, 1, 0\.36, 1\);/,
)
assert.match(gameplayCardSource, /const POINTER_DECISION_INTERACTION_LOCK_MS = 180;/)
assert.match(gameplayCardSource, /const CONTROL_DECISION_INTERACTION_LOCK_MS = 320;/)
assert.match(gameplayCardSource, /const POINTER_DECISION_VISUAL_MS = 180;/)
assert.match(gameplayCardSource, /const CONTROL_DECISION_VISUAL_MS = 1800;/)
assert.match(gameplayCardSource, /const OUTGOING_CARD_CLEANUP_GRACE_MS = 100;/)
assert.doesNotMatch(gameplayCardSource, /REDUCED_MOTION_DECISION_ANIMATION_MS/)
assert.match(
  gameplayCardSource,
  /window\.matchMedia\('\(prefers-reduced-motion: reduce\)'\)\.matches/,
)
const reducedMotionBranchStart = commitDecisionSource.indexOf('if (prefersReducedMotion)')
const reducedMotionBranchEnd = commitDecisionSource.indexOf(
  'const interactionLockDuration',
  reducedMotionBranchStart,
)
assert.ok(reducedMotionBranchStart >= 0 && reducedMotionBranchEnd > reducedMotionBranchStart)
const reducedMotionBranch = commitDecisionSource.slice(
  reducedMotionBranchStart,
  reducedMotionBranchEnd,
)
assert.match(
  reducedMotionBranch,
  /completeDecisionInteraction\(decision, card\.id\);\s*return;/,
)
assert.doesNotMatch(reducedMotionBranch, /setTimeout|setOutgoingCards|OutgoingGameplayCard/)
assert.equal(commitDecisionSource.match(/window\.setTimeout/g)?.length, 1)
assert.ok(interactionDelayIndex > reducedMotionBranchEnd)
assert.match(
  commitDecisionSource,
  /decisionOrigin === 'pointer'[\s\S]*POINTER_DECISION_INTERACTION_LOCK_MS[\s\S]*CONTROL_DECISION_INTERACTION_LOCK_MS/,
)
assert.match(
  commitDecisionSource,
  /interactionTimerRef\.current = window\.setTimeout\([\s\S]*completeDecisionInteraction\(decision, card\.id\)[\s\S]*interactionLockDuration/,
)
assert.equal(
  gameplayCardSource.match(/interactionTimerRef\.current = window\.setTimeout/g)?.length,
  1,
)
assert.match(
  gameplayCardSource,
  /commitDecision\(decision, 'pointer', \{[\s\S]*x: event\.clientX - activePointer\.startX,[\s\S]*y: event\.clientY - activePointer\.startY/,
)
assert.match(
  gameplayCardSource,
  /commitDecision\(decision, 'keyboard', RESTING_POSITION\)/,
)
assert.match(
  gameplayCardStyles,
  /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.outgoingCard\s*\{[^}]*animation:\s*none;/,
)
assert.doesNotMatch(gameplayCardStyles, /animation-duration:\s*1ms;/)
assert.match(
  gameplayCardStyles,
  /@keyframes outgoing-card-down[\s\S]*calc\(100dvh \+ 100%\)/,
)
assert.match(
  gameplayCardStyles,
  /@keyframes outgoing-card-up[\s\S]*calc\(-100dvh - 100%\)/,
)
assert.match(
  activeTurnViewSource,
  /onDecisionInteractionComplete=\{\(decision, decisionCardId\) => \{\s*if \(decision === 'correct'\) setAttributionChooserCardId\(decisionCardId\)/,
)

assert.match(gamePageSource, /'--timer-progress-scale': progress,/)
assert.doesNotMatch(gamePageSource, /'--timer-progress':/)
assert.doesNotMatch(gamePageSource, /progress \* 100/)
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
      kind: 'lightning',
      backgroundColor: 'var(--color-primary-dark)',
      actionColor: 'var(--color-primary)',
    },
    {
      kind: 'sounds',
      backgroundColor: 'var(--color-secondary-dark)',
      actionColor: 'var(--color-secondary)',
    },
  ],
)
const pageRule = getRuleBody(gameStyles, '\\.page', 'Gameplay page stacking context')
assert.match(pageRule, /--route-inline-gutter:\s*var\(--space-md\);/)
assert.match(pageRule, /position:\s*relative;/)
assert.match(pageRule, /isolation:\s*isolate;/)
assert.match(
  gameStyles,
  /\.activeTurn\s*\{\s*display:\s*grid;\s*grid-template-rows:\s*auto minmax\(0, 1fr\) auto;\s*gap:\s*var\(--space-xs\);\s*\}/,
)
const activeCardViewportRule = getRuleBody(
  gameStyles,
  '\\.cardViewport',
  'Active gameplay flexible middle region',
)
for (const contract of [
  /min-width:\s*0;/,
  /min-height:\s*0;/,
  /grid-row:\s*2;/,
  /overflow-x:\s*hidden;/,
  /overflow-y:\s*hidden;/,
]) {
  assert.match(activeCardViewportRule, contract)
}
assert.doesNotMatch(activeCardViewportRule, /position:\s*(?:absolute|fixed|sticky);/)
const scrollableStateRule = getRuleBody(
  gameStyles,
  '\\.scrollableState',
  'Gameplay completion and results shadow gutter',
)
for (const contract of [
  /width:\s*calc\(100% \+ var\(--route-inline-gutter\) \+ var\(--route-inline-gutter\)\);/,
  /margin-inline:\s*calc\(-1 \* var\(--route-inline-gutter\)\);/,
  /padding:\s*var\(--space-sm\) var\(--space-shadow-gutter\);/,
  /overflow-x:\s*hidden;/,
  /overflow-y:\s*auto;/,
  /overscroll-behavior-y:\s*contain;/,
]) {
  assert.match(scrollableStateRule, contract)
}
assert.doesNotMatch(scrollableStateRule, /overflow-x:\s*visible;/)
assert.match(
  gameStyles,
  /@media \(max-width: 350px\)[\s\S]*\.page\s*\{[^}]*--route-inline-gutter:\s*var\(--space-sm\);[^}]*padding-inline:\s*max\(var\(--space-sm\), env\(safe-area-inset-left\)\)\s*max\(var\(--space-sm\), env\(safe-area-inset-right\)\);/,
)
const pageBackgroundRule = getRuleBody(
  gameStyles,
  '\\.page::before',
  'Base viewport background layer',
)
assert.equal(getDeclarationValue(pageBackgroundRule, 'content', 'Base viewport background layer'), "''")
assert.equal(getDeclarationValue(pageBackgroundRule, 'position', 'Base viewport background layer'), 'fixed')
assert.equal(getDeclarationValue(pageBackgroundRule, 'z-index', 'Base viewport background layer'), '-2')
assert.equal(getDeclarationValue(pageBackgroundRule, 'inset', 'Base viewport background layer'), '0')
assert.equal(
  getDeclarationValue(pageBackgroundRule, 'background', 'Base viewport background layer'),
  'var(--color-background)',
)
const activePageRule = getRuleBody(gameStyles, '\\.activePage', 'Active game stage tokens')
assert.match(activePageRule, /--timer-progress-scale:\s*0;/)
assert.match(activePageRule, /--stage-background-color:\s*var\(--color-primary-dark\);/)
assert.match(activePageRule, /--stage-action-color:\s*var\(--color-primary\);/)
const activeOverlayRule = getRuleBody(
  gameStyles,
  '\\.activePage::after',
  'Active timer stage-color overlay',
)
assert.equal(getDeclarationValue(activeOverlayRule, 'content', 'Active timer stage-color overlay'), "''")
assert.equal(
  getDeclarationValue(activeOverlayRule, 'position', 'Active timer stage-color overlay'),
  'fixed',
)
assert.equal(
  getDeclarationValue(activeOverlayRule, 'z-index', 'Active timer stage-color overlay'),
  '-1',
)
assert.equal(getDeclarationValue(activeOverlayRule, 'inset', 'Active timer stage-color overlay'), '0')
assert.equal(
  getDeclarationValue(activeOverlayRule, 'background', 'Active timer stage-color overlay'),
  'var(--stage-background-color)',
)
assert.equal(
  getDeclarationValue(activeOverlayRule, 'pointer-events', 'Active timer stage-color overlay'),
  'none',
)
assert.equal(
  getDeclarationValue(activeOverlayRule, 'transform', 'Active timer stage-color overlay'),
  'scaleY(var(--timer-progress-scale))',
)
assert.equal(
  getDeclarationValue(activeOverlayRule, 'transform-origin', 'Active timer stage-color overlay'),
  'bottom',
)
assert.equal(
  getDeclarationValue(activeOverlayRule, 'transition', 'Active timer stage-color overlay'),
  'transform 100ms linear',
)
assert.equal(
  getDeclarationValue(activeOverlayRule, 'will-change', 'Active timer stage-color overlay'),
  'transform',
)
assert.equal(gameStyles.match(/will-change\s*:/g)?.length, 1)
assert.doesNotMatch(gameStyles, /\.activePage::before\s*\{/)
assert.doesNotMatch([activePageRule, activeOverlayRule].join('\n'), /linear-gradient\s*\(/)
assert.doesNotMatch(gameStyles, /--timer-progress\s*:/)
assert.doesNotMatch(
  gameStyles,
  /\.(?:handoffPage|timeoutPage|stageCompletePage|gameCompletePage|resultsPage)::after/,
)
assert.match(gameStyles, /\.timeoutPage::before\s*\{\s*background:\s*var\(--color-secondary\);/)
assert.match(gameStyles, /\.gameCompletePage::before\s*\{\s*background:\s*var\(--color-primary\);/)

for (const [label, selectorPattern] of [
  ['Active header', '\\.activeHeader'],
  ['Active card region', '\\.cardViewport'],
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
const reducedMotionStart = gameStyles.indexOf('@media (prefers-reduced-motion: reduce)')
assert.ok(reducedMotionStart >= 0, 'Missing reduced-motion gameplay styles')
const reducedMotionStyles = gameStyles.slice(reducedMotionStart)
const reducedMotionActiveOverlayRule = getRuleBody(
  reducedMotionStyles,
  '\\.activePage::after',
  'Reduced-motion active timer overlay',
)
assert.deepEqual(getDeclaredProperties(reducedMotionActiveOverlayRule), ['transition'])
assert.equal(
  getDeclarationValue(
    reducedMotionActiveOverlayRule,
    'transition',
    'Reduced-motion active timer overlay',
  ),
  'none',
)
assert.match(
  gameStyles,
  /@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*\.activeHeader,\s*\.cardViewport\s*\{[^}]*animation:\s*none;/,
)
assert.doesNotMatch(gameStyles, /\.status(?:\s|:|\{)/)
const handoffRule = getRuleBody(gameStyles, '\\.handoff,\\s*\\.terminalState', 'Handoff rows')
assert.match(handoffRule, /grid-template-rows:\s*minmax\(0, 1fr\) auto;/)
const handoffContentRule = getRuleBody(
  gameStyles,
  '\\.handoffContent,\\s*\\.terminalContent,\\s*\\.centeredState',
  'Scrollable handoff content',
)
assert.match(handoffContentRule, /min-height:\s*0;/)
assert.match(handoffContentRule, /overflow-y:\s*auto;/)
assert.match(handoffContentRule, /justify-content:\s*safe center;/)
const roundSummaryRule = getRuleBody(gameStyles, '\\.roundSummary', 'Round summary')
assert.match(roundSummaryRule, /grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\);/)
assert.match(roundSummaryRule, /width:\s*100%;/)
assert.match(roundSummaryRule, /border-block:\s*1px solid var\(--color-border\);/)
const factIconRule = getRuleBody(gameStyles, '\\.factIcon', 'Shared handoff fact icon box')
assert.match(factIconRule, /width:\s*2\.75rem;/)
assert.match(factIconRule, /height:\s*2\.75rem;/)
assert.match(factIconRule, /color:\s*var\(--color-primary\);/)
assert.match(
  getRuleBody(gameStyles, '\\.stopwatchIcon', 'Ant handoff time icon'),
  /font-size:\s*2\.5rem;/,
)
const stopwatchVisualRule = getRuleBody(
  gameStyles,
  '\\.stopwatchVisual',
  'Centered stopwatch composition',
)
assert.match(stopwatchVisualRule, /position:\s*relative;/)
assert.doesNotMatch(stopwatchVisualRule, /grid-template-rows:/)
const stopwatchValueRule = getRuleBody(
  gameStyles,
  '\\.stopwatchValue',
  'Centered stopwatch seconds overlay',
)
assert.match(stopwatchValueRule, /position:\s*absolute;/)
assert.match(stopwatchValueRule, /top:\s*50%;/)
assert.match(stopwatchValueRule, /left:\s*44\.5%;/)
assert.match(stopwatchValueRule, /transform:\s*translate\(-50%, -50%\);/)
assert.match(stopwatchValueRule, /background:\s*var\(--color-surface\);/)
assert.match(
  stopwatchValueRule,
  /border-radius:\s*var\(--radius-control-pill\);/,
)
assert.match(
  getRuleBody(gameStyles, '\\.attemptsUserIcon', 'Ant handoff user icon'),
  /font-size:\s*2\.25rem;/,
)
assert.match(
  gameStyles,
  /\.attemptsMessageIcon\s*\{[^}]*font-size:\s*1\.5rem;/,
)
assert.doesNotMatch(gameStyles, /\.factIconSvg/)
assert.match(
  getRuleBody(gameStyles, '\\.roundSummary li', 'Round summary column'),
  /min-width:\s*0;/,
)
assert.match(
  getRuleBody(gameStyles, '\\.factValue', 'Round summary value'),
  /overflow-wrap:\s*anywhere;/,
)
const roundRulesRule = getRuleBody(gameStyles, '\\.roundRules', 'Compact semantic round rules')
assert.match(roundRulesRule, /width:\s*100%;/)
assert.match(
  getRuleBody(gameStyles, '\\.roundRules div', 'Vertically centered round rule row'),
  /align-items:\s*center;/,
)
assert.match(gameStyles, /\.roundRules dt\s*\{[^}]*font-size:\s*0\.6875rem;/)
assert.match(gameStyles, /\.roundRules dd\s*\{[^}]*font-size:\s*0\.75rem;/)
assert.match(gameStyles, /@media \(max-width: 350px\)[\s\S]*\.factValue/)
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
  /color:\s*var\(--color-surface\);/,
)

assert.equal(rootTokens.get('--color-surface'), '#fff')
assert.equal(rootTokens.get('--color-primary'), '#00aab7')
assert.equal(rootTokens.get('--color-primary-dark'), '#007f89')
assert.equal(rootTokens.get('--color-secondary'), '#de2c6e')
assert.equal(rootTokens.get('--color-secondary-dark'), '#b91f59')
assert.equal(rootTokens.get('--color-tertiary'), '#11b087')
assert.equal(rootTokens.get('--color-tertiary-dark'), '#0c8c6c')
assert.equal(rootTokens.get('--color-text-strong'), '#000')
assert.equal(rootTokens.get('--radius-control-pill'), '999px')
assert.equal(rootTokens.get('--shadow-control'), '0 8px 20px rgba(0, 91, 99, 0.12)')
assert.equal(rootTokens.get('--space-shadow-gutter'), 'var(--space-lg)')
assert.equal(resolveRootToken(rootTokens, '--space-shadow-gutter'), '1.5rem')
assert.equal(rootTokens.get('--space-xl'), '2rem')

const playerListBlockStartPixels = cssLengthToPixels(
  resolveRootToken(rootTokens, '--space-shadow-gutter'),
  'Player-list block-start gutter',
)
const playerListBlockEndPixels = cssLengthToPixels(
  resolveRootToken(rootTokens, '--space-xl'),
  'Player-list block-end gutter',
)
const controlShadow = getSingleShadowMetrics(
  rootTokens.get('--shadow-control'),
  'Control shadow',
)
const controlShadowBlockStartReach = Math.max(
  0,
  controlShadow.blurRadius - controlShadow.offsetY + controlShadow.spreadRadius,
)
const controlShadowBlockEndReach = Math.max(
  0,
  controlShadow.blurRadius + controlShadow.offsetY + controlShadow.spreadRadius,
)
assert.equal(playerListBlockStartPixels, 24)
assert.equal(playerListBlockEndPixels, 32)
assert.equal(controlShadowBlockStartReach, 12)
assert.equal(controlShadowBlockEndReach, 28)
assert.ok(playerListBlockStartPixels >= controlShadowBlockStartReach)
assert.ok(playerListBlockEndPixels >= controlShadowBlockEndReach)
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
assert.match(gamePageSource, /FIN DE LA PARTIDA/)
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
  /beginLightningAttribution:[\s\S]*apply\(beginLightningCardAttribution\(game, cardId, now\)\)/,
)
assert.match(
  gameplayStoreSource,
  /awardLightningAttribution:[\s\S]*apply\(awardLightningCardAttribution\(game, cardId, playerId, now\)\)/,
)
assert.match(
  gameplayStoreSource,
  /cancelLightningAttribution:[\s\S]*apply\(cancelLightningCardAttribution\(game, cardId, now\)\)/,
)
assert.match(
  gameplayStoreSource,
  /passCard:[\s\S]*return game \? apply\(passGameplayCard\(game, cardId, now\)\)/,
)
assert.match(cardsPageSource, /Comenzar partida/)
assert.match(cardsPageSource, /initializeGameplay\(/)
assert.match(routesSource, /<Route path="\/game" element=\{<GamePage \/>\} \/>/)

console.log(
  'Gameplay verification passed: behavioral Node checks cover finite and ordered timestamp boundaries, inclusive deadlines, Lightning attribution/scoring, pause arithmetic, pure timer rebasing, exact decks, rotation, completion, setup compatibility, and transient store transitions; structural source checks cover exact shared stage rules across handoff/active/preview contexts, private handoff reading order and catalog exclusion, one accessible runtime-duration string with visible stopwatch seconds and hidden decorative geometry, primary decorative visuals, equal responsive summary columns, independently scrolling handoff information with a bottom action, the chooser, live regions, timer scheduling guards, the composited timer overlay, separate interaction/visual timing, monotonic concurrent outgoing snapshots, independent animation cleanup, reduced-motion completion, the three-row active layout, ordinary-flow actions, the padded size-container content box, the single 9:16 inline/block equation, independent border-and-shadow containment arithmetic, representative source calculations, named height-query compact geometry, in-flow compact subtypes, the pan-y fallback policy, pointer-cancel cleanup, card-ID scroll reset before focus, gameplay and asymmetric Drawer shadow gutters, action colors, and card layout. No browser rendering was exercised: handoff icon/text painting, 320px/390px and short-height layout, screen-reader output, Drawer mask/Escape/focus behavior, timer first-paint and scheduling behavior, Pointer Event and overlapping-animation timing, native pan-y cancellation/scrolling, the painted scroll-reset frame, shadow rendering, and short-height compact rendering remain manual checks.',
)
