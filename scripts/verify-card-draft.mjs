import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { CARD_CATALOG, CARD_IDS } from '../src/shared/catalog/card-catalog.ts'
import { validateCardCatalog } from '../src/shared/domain/card-catalog.ts'
import {
  concealCurrentPlayerCards,
  confirmMainCards,
  createCardDraftSession,
  createCardDraftSetupKey,
  editMainCards,
  getCardDraftSessionErrors,
  revealCurrentPlayerCards,
  saveCurrentPlayerDraft,
  toggleLightningCard,
  toggleMainCard,
} from '../src/shared/domain/card-draft.ts'
import { CARD_DRAFT_PHASES } from '../src/shared/types/card-draft.ts'

function createSeededRandom(seed) {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0x100000000
  }
}

function expectSuccess(result) {
  assert.equal(result.kind, 'success')
  return result.session
}

function expectRejected(result, reason) {
  assert.deepEqual(result, { kind: 'rejected', reason })
}

function getRelativeLuminance(hexColor) {
  const compactHex = hexColor.slice(1)
  const expandedHex =
    compactHex.length === 3
      ? [...compactHex].map((character) => `${character}${character}`).join('')
      : compactHex
  assert.match(expandedHex, /^[\da-f]{6}$/i)

  const channels = [0, 2, 4]
    .map((offset) => Number.parseInt(expandedHex.slice(offset, offset + 2), 16) / 255)
    .map((channel) =>
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
    )
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
}

function getContrastRatio(firstColor, secondColor) {
  const luminances = [getRelativeLuminance(firstColor), getRelativeLuminance(secondColor)].sort(
    (first, second) => second - first,
  )
  return (luminances[0] + 0.05) / (luminances[1] + 0.05)
}

function createSession(playerCount, mainDeckCardCount, seed = 1) {
  const playerIds = Array.from({ length: playerCount }, (_, index) => `player-${index + 1}`)
  const setupKey = `setup-${playerCount}-${mainDeckCardCount}`
  const result = createCardDraftSession(
    playerIds,
    CARD_IDS,
    mainDeckCardCount,
    setupKey,
    createSeededRandom(seed),
  )
  assert.equal(result.kind, 'created')
  return { session: result.session, playerIds, setupKey }
}

function completeCurrentPlayer(session, editMainSelection = false) {
  let nextSession = expectSuccess(revealCurrentPlayerCards(session))
  const playerDraft = nextSession.playerDrafts[nextSession.currentPlayerIndex]
  const dealCardIds = [...playerDraft.dealCardIds]

  assert.equal(dealCardIds.length, 10)
  expectRejected(saveCurrentPlayerDraft(nextSession), 'invalid-phase')
  expectRejected(revealCurrentPlayerCards(nextSession), 'invalid-phase')

  const earlyConfirmationSnapshot = JSON.stringify(nextSession)
  expectRejected(confirmMainCards(nextSession), 'main-quota-incomplete')
  assert.equal(JSON.stringify(nextSession), earlyConfirmationSnapshot)

  for (const cardId of dealCardIds.slice(0, nextSession.mainDeckCardCount)) {
    nextSession = expectSuccess(toggleMainCard(nextSession, cardId))
    assert.equal(nextSession.phase, CARD_DRAFT_PHASES.selectingMain)
  }

  const selectedMainCardIds = nextSession.playerDrafts[nextSession.currentPlayerIndex]
    .selectedMainCardIds
  assert.equal(selectedMainCardIds.length, nextSession.mainDeckCardCount)
  assert.equal(new Set(selectedMainCardIds).size, nextSession.mainDeckCardCount)
  assert.equal(nextSession.phase, CARD_DRAFT_PHASES.selectingMain)

  const lightningCandidateCardIds = dealCardIds.filter(
    (cardId) => !selectedMainCardIds.includes(cardId),
  )
  assert.equal(lightningCandidateCardIds.length, 10 - nextSession.mainDeckCardCount)
  assert.ok(selectedMainCardIds.every((cardId) => !lightningCandidateCardIds.includes(cardId)))
  expectRejected(
    toggleLightningCard(nextSession, lightningCandidateCardIds[0]),
    'invalid-phase',
  )

  const staleLightningSession = {
    ...nextSession,
    playerDrafts: nextSession.playerDrafts.map((currentPlayerDraft, index) =>
      index === nextSession.currentPlayerIndex
        ? { ...currentPlayerDraft, lightningCardId: lightningCandidateCardIds[0] }
        : currentPlayerDraft,
    ),
  }
  const clearedLightningSession = expectSuccess(confirmMainCards(staleLightningSession))
  assert.equal(clearedLightningSession.phase, CARD_DRAFT_PHASES.selectingLightning)
  assert.equal(
    clearedLightningSession.playerDrafts[clearedLightningSession.currentPlayerIndex]
      .lightningCardId,
    null,
  )

  nextSession = expectSuccess(confirmMainCards(nextSession))
  assert.equal(nextSession.phase, CARD_DRAFT_PHASES.selectingLightning)
  assert.equal(
    nextSession.playerDrafts[nextSession.currentPlayerIndex].lightningCardId,
    null,
  )
  const duplicateConfirmationSnapshot = JSON.stringify(nextSession)
  expectRejected(confirmMainCards(nextSession), 'main-selection-already-confirmed')
  assert.equal(JSON.stringify(nextSession), duplicateConfirmationSnapshot)
  expectRejected(saveCurrentPlayerDraft(nextSession), 'invalid-phase')
  expectRejected(toggleMainCard(nextSession, lightningCandidateCardIds[0]), 'invalid-phase')
  expectRejected(
    toggleLightningCard(nextSession, selectedMainCardIds[0]),
    'lightning-must-be-distinct',
  )

  nextSession = expectSuccess(toggleLightningCard(nextSession, lightningCandidateCardIds[0]))
  assert.equal(nextSession.phase, CARD_DRAFT_PHASES.ready)
  nextSession = expectSuccess(toggleLightningCard(nextSession, lightningCandidateCardIds[1]))
  assert.equal(nextSession.phase, CARD_DRAFT_PHASES.ready)
  assert.equal(
    nextSession.playerDrafts[nextSession.currentPlayerIndex].lightningCardId,
    lightningCandidateCardIds[1],
  )

  if (editMainSelection) {
    nextSession = expectSuccess(editMainCards(nextSession))
    assert.equal(nextSession.phase, CARD_DRAFT_PHASES.selectingMain)
    assert.equal(
      nextSession.playerDrafts[nextSession.currentPlayerIndex].lightningCardId,
      null,
    )
    expectRejected(saveCurrentPlayerDraft(nextSession), 'invalid-phase')
    expectRejected(
      toggleMainCard(nextSession, dealCardIds[nextSession.mainDeckCardCount + 1]),
      'main-quota-reached',
    )
    nextSession = expectSuccess(toggleMainCard(nextSession, dealCardIds[0]))
    nextSession = expectSuccess(
      toggleMainCard(nextSession, dealCardIds[nextSession.mainDeckCardCount + 1]),
    )
    assert.equal(nextSession.phase, CARD_DRAFT_PHASES.selectingMain)
    nextSession = expectSuccess(confirmMainCards(nextSession))
    nextSession = expectSuccess(
      toggleLightningCard(nextSession, dealCardIds[nextSession.mainDeckCardCount]),
    )
  }

  return expectSuccess(saveCurrentPlayerDraft(nextSession))
}

const integrity = validateCardCatalog(CARD_CATALOG)
assert.deepEqual(integrity.errors, [])
assert.equal(CARD_CATALOG.length, 200)
assert.equal(new Set(CARD_IDS).size, 200)
assert.deepEqual(
  CARD_IDS,
  Array.from({ length: 200 }, (_, index) => `card-${String(index + 1).padStart(3, '0')}`),
)
assert.deepEqual(
  CARD_CATALOG.slice(0, 3).map((card) => [
    card.title.value,
    card.character.value,
    card.everything.value,
    card.keyword,
  ]),
  [
    ['La llamada', 'Susana Giménez', 'Doctor Who', 'Teléfono'],
    ['Garfield', 'Donald Trump', 'Holanda', 'Naranja'],
    ['El mago de Oz', 'Cenicienta', 'El superagente 86', 'Zapato'],
  ],
)

const twentyPlayerDraft = createSession(20, 5, 2026)
const allDealtCardIds = twentyPlayerDraft.session.playerDrafts.flatMap(
  (playerDraft) => playerDraft.dealCardIds,
)
assert.equal(allDealtCardIds.length, 200)
assert.equal(new Set(allDealtCardIds).size, 200)
assert.ok(
  twentyPlayerDraft.session.playerDrafts.every(
    (playerDraft) =>
      playerDraft.dealCardIds.length === 10 && new Set(playerDraft.dealCardIds).size === 10,
  ),
)

const twentyOnePlayerResult = createCardDraftSession(
  Array.from({ length: 21 }, (_, index) => `player-${index + 1}`),
  CARD_IDS,
  4,
  'over-capacity',
  createSeededRandom(21),
)
assert.deepEqual(twentyOnePlayerResult, { kind: 'rejected', reason: 'insufficient-cards' })

const privacyDraft = createSession(4, 4, 44)
let concealedSession = expectSuccess(revealCurrentPlayerCards(privacyDraft.session))
for (const cardId of concealedSession.playerDrafts[0].dealCardIds.slice(0, 4)) {
  concealedSession = expectSuccess(toggleMainCard(concealedSession, cardId))
  assert.equal(concealedSession.phase, CARD_DRAFT_PHASES.selectingMain)
}
concealedSession = expectSuccess(concealCurrentPlayerCards(concealedSession))
assert.equal(concealedSession.phase, CARD_DRAFT_PHASES.handoff)
assert.equal(concealedSession.playerDrafts[0].selectedMainCardIds.length, 4)
concealedSession = expectSuccess(revealCurrentPlayerCards(concealedSession))
assert.equal(concealedSession.phase, CARD_DRAFT_PHASES.selectingMain)
assert.equal(concealedSession.playerDrafts[0].lightningCardId, null)

const invalidConfirmationDraft = createSession(4, 3, 303)
const invalidConfirmationSession = expectSuccess(
  revealCurrentPlayerCards(invalidConfirmationDraft.session),
)
const invalidConfirmationPlayer = invalidConfirmationSession.playerDrafts[0]
const duplicateMainCardId = invalidConfirmationPlayer.dealCardIds[0]
const duplicateMainSession = {
  ...invalidConfirmationSession,
  playerDrafts: invalidConfirmationSession.playerDrafts.map((playerDraft, index) =>
    index === 0
      ? {
          ...playerDraft,
          selectedMainCardIds: [duplicateMainCardId, duplicateMainCardId, duplicateMainCardId],
        }
      : playerDraft,
  ),
}
expectRejected(confirmMainCards(duplicateMainSession), 'main-quota-incomplete')

const undealtCardId = CARD_IDS.find(
  (cardId) => !invalidConfirmationPlayer.dealCardIds.includes(cardId),
)
assert.ok(undealtCardId)
const unknownMainSession = {
  ...invalidConfirmationSession,
  playerDrafts: invalidConfirmationSession.playerDrafts.map((playerDraft, index) =>
    index === 0
      ? {
          ...playerDraft,
          selectedMainCardIds: [
            invalidConfirmationPlayer.dealCardIds[0],
            invalidConfirmationPlayer.dealCardIds[1],
            undealtCardId,
          ],
        }
      : playerDraft,
  ),
}
expectRejected(confirmMainCards(unknownMainSession), 'unknown-card')

const compatiblePlayers = Array.from({ length: 4 }, (_, index) => ({
  id: `player-${index + 1}`,
  name: `Player ${index + 1}`,
}))
const compatibleSetup = {
  ownerPlayerId: compatiblePlayers[0].id,
  players: compatiblePlayers,
  mainDeckCardCount: 4,
  teamAssignmentSignature: 'team-1:player-1,player-2|team-2:player-3,player-4',
}
const compatibleSetupKey = createCardDraftSetupKey(compatibleSetup)
const compatibleDraft = createCardDraftSession(
  compatiblePlayers.map((player) => player.id),
  CARD_IDS,
  compatibleSetup.mainDeckCardCount,
  compatibleSetupKey,
  createSeededRandom(404),
)
assert.equal(compatibleDraft.kind, 'created')
assert.deepEqual(
  getCardDraftSessionErrors(
    compatibleDraft.session,
    compatibleSetupKey,
    compatiblePlayers.map((player) => player.id),
    CARD_IDS,
  ),
  [],
)

const changedRosterSetupKey = createCardDraftSetupKey({
  ...compatibleSetup,
  players: compatiblePlayers.map((player, index) =>
    index === 0 ? { ...player, name: 'Renamed player' } : player,
  ),
})
assert.notEqual(changedRosterSetupKey, compatibleSetupKey)
assert.deepEqual(
  getCardDraftSessionErrors(
    compatibleDraft.session,
    changedRosterSetupKey,
    compatiblePlayers.map((player) => player.id),
    CARD_IDS,
  ),
  ['setup-key'],
)

const changedConfigSetupKey = createCardDraftSetupKey({
  ...compatibleSetup,
  mainDeckCardCount: 5,
})
assert.notEqual(changedConfigSetupKey, compatibleSetupKey)
assert.deepEqual(
  getCardDraftSessionErrors(
    compatibleDraft.session,
    changedConfigSetupKey,
    compatiblePlayers.map((player) => player.id),
    CARD_IDS,
  ),
  ['setup-key'],
)

const changedTeamSetupKey = createCardDraftSetupKey({
  ...compatibleSetup,
  teamAssignmentSignature: 'team-1:player-1,player-3|team-2:player-2,player-4',
})
assert.notEqual(changedTeamSetupKey, compatibleSetupKey)
assert.deepEqual(
  getCardDraftSessionErrors(
    compatibleDraft.session,
    changedTeamSetupKey,
    compatiblePlayers.map((player) => player.id),
    CARD_IDS,
  ),
  ['setup-key'],
)

for (const mainDeckCardCount of [3, 4, 5]) {
  const draft = createSession(4, mainDeckCardCount, mainDeckCardCount)
  let session = draft.session

  for (let playerIndex = 0; playerIndex < draft.playerIds.length; playerIndex += 1) {
    session = completeCurrentPlayer(session, mainDeckCardCount === 4 && playerIndex === 0)
    if (playerIndex < draft.playerIds.length - 1) {
      assert.equal(session.phase, CARD_DRAFT_PHASES.handoff)
      assert.equal(session.currentPlayerIndex, playerIndex + 1)
      expectRejected(saveCurrentPlayerDraft(session), 'invalid-phase')
    }
  }

  assert.equal(session.phase, CARD_DRAFT_PHASES.complete)
  assert.equal(session.currentPlayerIndex, draft.playerIds.length)
  assert.ok(
    session.playerDrafts.every(
      (playerDraft) =>
        playerDraft.selectedMainCardIds.length === mainDeckCardCount &&
        playerDraft.lightningCardId !== null &&
        !playerDraft.selectedMainCardIds.includes(playerDraft.lightningCardId),
    ),
  )
  assert.deepEqual(
    getCardDraftSessionErrors(session, draft.setupKey, draft.playerIds, CARD_IDS),
    [],
  )
}

const setupStoreSource = await readFile(
  new URL('../src/shared/store/setup.store.ts', import.meta.url),
  'utf8',
)
const playersPageSource = await readFile(
  new URL('../src/modules/players/players.page.tsx', import.meta.url),
  'utf8',
)
const teamsPageSource = await readFile(
  new URL('../src/modules/teams/teams.page.tsx', import.meta.url),
  'utf8',
)
const cardsPageSource = await readFile(
  new URL('../src/modules/cards/cards.page.tsx', import.meta.url),
  'utf8',
)
const draftCardSource = await readFile(
  new URL('../src/modules/cards/components/draft-card/draft-card.tsx', import.meta.url),
  'utf8',
)
const draftCardStyles = await readFile(
  new URL('../src/modules/cards/components/draft-card/draft-card.module.css', import.meta.url),
  'utf8',
)
const globalStyles = await readFile(new URL('../src/index.css', import.meta.url), 'utf8')
const routesSource = await readFile(
  new URL('../src/core/routes/routes.tsx', import.meta.url),
  'utf8',
)

assert.ok(setupStoreSource.includes("players.length >= MAX_PLAYERS) return { kind: 'limit-reached' }"))
assert.ok(playersPageSource.includes('disabled={hasReachedPlayerLimit}'))
assert.ok(teamsPageSource.includes('disabled={draftResult.kind === \'invalid\'}'))
assert.ok(teamsPageSource.includes("navigate('/cards')"))
assert.ok(routesSource.includes('<Route path="/cards" element={<CardsPage />} />'))

const partializeSource = setupStoreSource.slice(
  setupStoreSource.indexOf('partialize:'),
  setupStoreSource.indexOf('migrate:'),
)
assert.ok(partializeSource.includes('nickname: state.nickname'))
assert.ok(partializeSource.includes('avatar: state.avatar'))
assert.ok(!partializeSource.includes('players:'))
assert.ok(!partializeSource.includes('cardDraft:'))
assert.ok(setupStoreSource.includes('confirmMainCards: () => CardDraftTransitionResult'))
assert.ok(setupStoreSource.includes('confirmCardDraftMainCards(current)'))

const handoffBranchStart = cardsPageSource.indexOf('if (!privateCardsAreUnlocked)')
const handoffBranchEnd = cardsPageSource.indexOf('const selectedMainCount', handoffBranchStart)
const primaryBranchStart = cardsPageSource.indexOf('if (isChoosingMain)')
const primaryMapIndex = cardsPageSource.indexOf('currentPlayerDraft.dealCardIds.map')
const lightningFilterIndex = cardsPageSource.indexOf(
  'const lightningCandidateCardIds = currentPlayerDraft.dealCardIds.filter',
)
const lightningMapIndex = cardsPageSource.indexOf('lightningCandidateCardIds.map')

assert.ok(handoffBranchStart >= 0)
assert.ok(handoffBranchEnd > handoffBranchStart)
assert.ok(primaryBranchStart > handoffBranchEnd)
assert.ok(primaryMapIndex > primaryBranchStart)
assert.ok(lightningFilterIndex > primaryMapIndex)
assert.ok(lightningMapIndex > lightningFilterIndex)

const handoffBranchSource = cardsPageSource.slice(handoffBranchStart, handoffBranchEnd)
assert.doesNotMatch(handoffBranchSource, /dealCardIds|selectedMainCardIds|lightningCardId/)

const primaryBranchSource = cardsPageSource.slice(primaryBranchStart, lightningFilterIndex)
assert.match(primaryBranchSource, /currentPlayerDraft\.dealCardIds\.map\(\(cardId\) =>/)
assert.ok(primaryBranchSource.includes('disabled={!mainQuotaIsComplete}'))
assert.ok(primaryBranchSource.includes('Continuar a Relámpago'))
assert.ok(!primaryBranchSource.includes('toggleLightningCard'))

const lightningFilterSource = cardsPageSource.slice(lightningFilterIndex, lightningMapIndex)
assert.match(
  lightningFilterSource,
  /\.filter\(\s*\(cardId\) => !currentPlayerDraft\.selectedMainCardIds\.includes\(cardId\),?\s*\)/,
)
const lightningBranchSource = cardsPageSource.slice(lightningFilterIndex)
assert.ok(!lightningBranchSource.includes('currentPlayerDraft.dealCardIds.map'))
assert.ok(lightningBranchSource.includes('Cambiar principales'))
assert.ok(lightningBranchSource.includes('disabled={!isReady}'))

for (const removedCategoryLabel of ['TÍTULOS', 'PERSONAJES', 'TODO']) {
  assert.ok(!draftCardSource.includes(removedCategoryLabel))
}
assert.ok(!draftCardSource.includes('sectionLabel'))
assert.equal(draftCardSource.match(/styles\.sectionSubtype/g)?.length, 3)
assert.ok(draftCardSource.includes('styles.cardCap'))
assert.ok(draftCardSource.includes('PALABRA CLAVE'))
assert.ok(draftCardSource.includes('{card.keyword}'))

assert.match(draftCardStyles, /\.unselected\s*\{\s*opacity: 0\.4;/)
assert.match(draftCardStyles, /\.selectedMain,[\s\S]*?opacity: 1;/)
assert.match(
  draftCardStyles,
  /\.cardButton\s*\{[^}]*border:\s*3px solid var\(--color-text\);/,
)
assert.match(
  draftCardStyles,
  /\.selectedMain\s*\{[^}]*border-color:\s*var\(--color-tertiary-dark\);[^}]*box-shadow:[^}]*var\(--color-tertiary\)/,
)
assert.match(
  draftCardStyles,
  /\.selectedLightning\s*\{[^}]*border-color:\s*var\(--color-secondary-dark\);[^}]*box-shadow:[^}]*var\(--color-secondary\)/,
)
assert.match(
  draftCardStyles,
  /\.titleSection\s*\{[^}]*background:\s*var\(--color-secondary\);/,
)
assert.match(
  draftCardStyles,
  /\.characterSection\s*\{[^}]*background:\s*var\(--color-tertiary\);/,
)
assert.match(
  draftCardStyles,
  /\.everythingSection\s*\{[^}]*background:\s*var\(--color-primary\);/,
)
assert.match(
  draftCardStyles,
  /\.keywordSection\s*\{[^}]*background:\s*var\(--color-surface\);/,
)
assert.match(
  draftCardStyles,
  /\.keywordValue\s*\{[^}]*color:\s*var\(--color-secondary\);/,
)
assert.match(
  draftCardStyles,
  /\.cardCap\s*\{[^}]*background:\s*var\(--color-surface\);/,
)
assert.match(draftCardStyles, /\.cardButton\s*\{[^}]*gap:\s*7px;/)
assert.match(draftCardStyles, /\.sectionValue\s*\{[^}]*overflow-wrap:\s*anywhere;/)
assert.match(draftCardStyles, /\.sectionSubtype\s*\{[^}]*justify-self:\s*end;/)
assert.ok(!draftCardStyles.includes('.sectionLabel'))
assert.doesNotMatch(draftCardStyles, /#(?:de2c6e|11b087|00aab7|fff(?:fff)?)\b/i)

const rootBlock = globalStyles.match(/:root\s*\{([\s\S]*?)\}/)
assert.ok(rootBlock)
const rootTokens = new Map(
  [...rootBlock[1].matchAll(/^\s*(--[\w-]+)\s*:\s*([^;]+);/gm)].map(([, token, value]) => [
    token,
    value.trim().toLowerCase(),
  ]),
)
assert.equal(rootTokens.get('--color-background'), '#fff')
assert.equal(rootTokens.get('--color-surface'), '#fff')
assert.equal(rootTokens.get('--color-text-strong'), '#000')
assert.equal(rootTokens.get('--color-primary'), '#00aab7')
assert.equal(rootTokens.get('--color-secondary'), '#de2c6e')
assert.equal(rootTokens.get('--color-tertiary'), '#11b087')
const bandTextColor = rootTokens.get('--color-text-strong')
assert.ok(bandTextColor)
for (const bandToken of ['--color-primary', '--color-secondary', '--color-tertiary']) {
  const bandColor = rootTokens.get(bandToken)
  assert.ok(bandColor)
  assert.ok(getContrastRatio(bandTextColor, bandColor) >= 4.5)
}

console.log(
  'Card draft verification passed: catalog=200, deal=20x10, explicit main confirmation=valid, lightning exclusion=valid for quotas 3/4/5, per-player privacy flow=valid, setup invalidation=valid, card structure/tokens/contrast=valid.',
)
