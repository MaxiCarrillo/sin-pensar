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

function assertRuleUsesPill(source, selectorPattern, label) {
  assert.match(
    getRuleBody(source, selectorPattern, label),
    /border-radius:\s*var\(--radius-control-pill\);/,
    `${label} must use the shared control pill radius`,
  )
}

function getAntdButtonSource(source, className) {
  const classMarker = `className={styles.${className}}`
  const classIndex = source.indexOf(classMarker)
  assert.ok(classIndex >= 0, `Missing Ant Design button class: ${className}`)
  const buttonStart = source.lastIndexOf('<Button', classIndex)
  const buttonClose = source.slice(classIndex).match(/\n\s*\/>/)
  assert.ok(buttonStart >= 0 && buttonClose, `Invalid Ant Design button: ${className}`)
  const buttonEnd = classIndex + buttonClose.index + buttonClose[0].length
  return { buttonSource: source.slice(buttonStart, buttonEnd), classIndex }
}

function assertCircleIconButton(source, className) {
  const { buttonSource, classIndex } = getAntdButtonSource(source, className)
  assert.match(buttonSource, /shape="circle"/)
  assert.match(buttonSource, /aria-label=/)
  const tooltipStart = source.lastIndexOf('<Tooltip', classIndex)
  const tooltipEnd = source.indexOf('</Tooltip>', classIndex)
  assert.ok(tooltipStart >= 0 && tooltipEnd > classIndex, `${className} must retain its tooltip`)
}

function getJsxOpeningElementNames(source) {
  return [...source.matchAll(/<([A-Za-z][\w.]*)\b/g)].map(([, elementName]) => elementName)
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
    compatibleSetup.mainDeckCardCount,
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
    compatibleSetup.mainDeckCardCount,
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
    5,
    compatiblePlayers.map((player) => player.id),
    CARD_IDS,
  ),
  ['setup-key', 'main-count-mismatch'],
)

const staleQuotaDraft = {
  ...compatibleDraft.session,
  setupKey: changedConfigSetupKey,
}
assert.deepEqual(
  getCardDraftSessionErrors(
    staleQuotaDraft,
    changedConfigSetupKey,
    5,
    compatiblePlayers.map((player) => player.id),
    CARD_IDS,
  ),
  ['main-count-mismatch'],
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
    compatibleSetup.mainDeckCardCount,
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
    getCardDraftSessionErrors(
      session,
      draft.setupKey,
      mainDeckCardCount,
      draft.playerIds,
      CARD_IDS,
    ),
    [],
  )
}

const setupStoreSource = await readFile(
  new URL('../src/shared/store/setup.store.ts', import.meta.url),
  'utf8',
)
const homePageSource = await readFile(
  new URL('../src/modules/home/home.page.tsx', import.meta.url),
  'utf8',
)
const homeStyles = await readFile(
  new URL('../src/modules/home/home.module.css', import.meta.url),
  'utf8',
)
const avatarInputSource = await readFile(
  new URL('../src/modules/common/components/avatar-input/avatar-input.tsx', import.meta.url),
  'utf8',
)
const avatarInputStyles = await readFile(
  new URL(
    '../src/modules/common/components/avatar-input/avatar-input.module.css',
    import.meta.url,
  ),
  'utf8',
)
const playersPageSource = await readFile(
  new URL('../src/modules/players/players.page.tsx', import.meta.url),
  'utf8',
)
const playersStyles = await readFile(
  new URL('../src/modules/players/players.module.css', import.meta.url),
  'utf8',
)
const teamsPageSource = await readFile(
  new URL('../src/modules/teams/teams.page.tsx', import.meta.url),
  'utf8',
)
const teamsStyles = await readFile(
  new URL('../src/modules/teams/teams.module.css', import.meta.url),
  'utf8',
)
const cardsPageSource = await readFile(
  new URL('../src/modules/cards/cards.page.tsx', import.meta.url),
  'utf8',
)
const cardsStyles = await readFile(
  new URL('../src/modules/cards/cards.module.css', import.meta.url),
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
const themeSource = await readFile(
  new URL('../src/core/theme/theme.ts', import.meta.url),
  'utf8',
)
const routesSource = await readFile(
  new URL('../src/core/routes/routes.tsx', import.meta.url),
  'utf8',
)

assert.ok(setupStoreSource.includes("players.length >= MAX_PLAYERS) return { kind: 'limit-reached' }"))
assert.ok(playersPageSource.includes('disabled={hasReachedPlayerLimit}'))
assert.ok(teamsPageSource.includes('disabled={draftResult.kind === \'invalid\'}'))
assert.ok(teamsPageSource.includes("navigate('/cards')"))
assert.ok(routesSource.includes('<Route path="/cards" element={<CardsPage />} />'))

const moveSelectedPlayerStart = teamsPageSource.indexOf('const moveSelectedPlayer')
const removeFromTeamStart = teamsPageSource.indexOf('const removeFromTeam', moveSelectedPlayerStart)
assert.ok(moveSelectedPlayerStart >= 0)
assert.ok(removeFromTeamStart > moveSelectedPlayerStart)
const moveSelectedPlayerSource = teamsPageSource.slice(moveSelectedPlayerStart, removeFromTeamStart)
for (const contract of [
  /const destinationIndex = teamIds\.indexOf\(teamId\);/,
  /const capacity = targetSizes\[destinationIndex\];/,
  /const destinationOccupants = players\.filter\(\(player\) => assignmentDraft\[player\.id\] === teamId\)\.length;/,
  /if \(destinationOccupants >= capacity\) \{[\s\S]*setStatusMessage\(`El Equipo \$\{destinationIndex \+ 1\} está completo\.`\);[\s\S]*return;/,
]) {
  assert.match(moveSelectedPlayerSource, contract)
}
const capacityGuardIndex = moveSelectedPlayerSource.indexOf('if (destinationOccupants >= capacity)')
assert.ok(capacityGuardIndex >= 0)
assert.ok(
  moveSelectedPlayerSource.indexOf('return;', capacityGuardIndex) <
    moveSelectedPlayerSource.indexOf('const nextDraft'),
)
assert.ok(
  moveSelectedPlayerSource.indexOf('const nextDraft') <
    moveSelectedPlayerSource.indexOf('setAssignmentDraft(nextDraft)'),
)

const teamDestinationsStart = teamsPageSource.indexOf('teamIds.map((teamId, index) => {')
const teamDestinationsEnd = teamsPageSource.indexOf('</section>', teamDestinationsStart)
assert.ok(teamDestinationsStart >= 0)
assert.ok(teamDestinationsEnd > teamDestinationsStart)
const teamDestinationsSource = teamsPageSource.slice(teamDestinationsStart, teamDestinationsEnd)
for (const contract of [
  /const capacity = targetSizes\[index\];/,
  /const isAtCapacity = teamPlayers\.length >= capacity;/,
  /\{teamPlayers\.length\} \/ \{capacity\} jugadores/,
  /disabled=\{isSelectedDestination \|\| isAtCapacity\}/,
  /isSelectedDestination[\s\S]*`\$\{selectedPlayer\.name\} ya está aquí`[\s\S]*isAtCapacity[\s\S]*'Equipo completo'[\s\S]*selectedTeamId[\s\S]*'Mover aquí'[\s\S]*'Asignar aquí'/,
]) {
  assert.match(teamDestinationsSource, contract)
}

const teamCardRule = getRuleBody(teamsStyles, '\\.teamCard', 'Team card entry animation')
assert.match(teamCardRule, /animation:\s*team-card-enter 240ms ease-out both;/)
const playerRowRule = getRuleBody(teamsStyles, '\\.teamPlayers li', 'Team player entry animation')
assert.match(playerRowRule, /animation:\s*player-row-enter 180ms ease-out both;/)
for (const [animationName, animationSource] of [
  ['team-card-enter', teamsStyles.match(/@keyframes team-card-enter\s*\{([\s\S]*?)\n\}/)?.[1]],
  ['player-row-enter', teamsStyles.match(/@keyframes player-row-enter\s*\{([\s\S]*?)\n\}/)?.[1]],
]) {
  assert.ok(animationSource, `Missing ${animationName} keyframes`)
  assert.match(animationSource, /from\s*\{[\s\S]*opacity:\s*0;[\s\S]*transform:\s*translateY\(/)
  assert.match(animationSource, /to\s*\{[\s\S]*opacity:\s*1;[\s\S]*transform:\s*translateY\(0\);/)
  assert.doesNotMatch(animationSource, /scale\(|infinite/)
}
assert.match(
  teamsStyles,
  /@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*\.teamCard,\s*\.teamPlayers li\s*\{[^}]*animation:\s*none;/,
)

const settingsOptionCardStart = playersPageSource.indexOf('interface SettingsOptionCardProps')
const playersPageStart = playersPageSource.indexOf('function PlayersPage')
assert.ok(settingsOptionCardStart >= 0)
assert.ok(playersPageStart > settingsOptionCardStart)
const settingsOptionCardSource = playersPageSource.slice(settingsOptionCardStart, playersPageStart)
for (const contract of [
  /<Radio\b/,
  /className=\{styles\.optionCard\}/,
  /icon: styles\.optionCardRadio/,
  /CheckCircleFilled aria-hidden="true"/,
  /className="visually-hidden">Seleccionado</,
  /className=\{styles\.optionCardValue\}>\{valueText\}<\/[\s\S]*className=\{styles\.optionCardSupportingText\}>\{supportingText\}</,
  /disabled=\{disabled\}/,
]) {
  assert.match(settingsOptionCardSource, contract)
}
assert.doesNotMatch(settingsOptionCardSource, /\bicon\??:\s*ReactNode\b|\bicon=\{|optionCardIcon/)
assert.doesNotMatch(playersPageSource, /\bReactNode\b/)
assert.doesNotMatch(playersPageSource, /\b(?:CreditCardOutlined|TeamOutlined)\b/)

const settingsDrawerStart = playersPageSource.indexOf('<div className={styles.settingsContent}>')
const settingsDrawerEnd = playersPageSource.indexOf('</AppDrawer>', settingsDrawerStart)
assert.ok(settingsDrawerStart >= 0)
assert.ok(settingsDrawerEnd > settingsDrawerStart)
const settingsDrawerSource = playersPageSource.slice(settingsDrawerStart, settingsDrawerEnd)
assert.equal(settingsDrawerSource.match(/<Radio\.Group/g)?.length, 3)
assert.equal(settingsDrawerSource.match(/<SettingsOptionCard/g)?.length, 3)
assert.equal(settingsDrawerSource.match(/styles\.threeColumnOptionGrid/g)?.length, 2)
assert.equal(settingsDrawerSource.match(/styles\.teamOptionGrid/g)?.length, 1)
assert.doesNotMatch(settingsDrawerSource, /\boptions=/)
for (const groupName of ['turn-duration', 'main-deck-card-count', 'team-count']) {
  assert.ok(settingsDrawerSource.includes(`name="${groupName}"`))
}
for (const contract of [
  /TURN_DURATION_OPTIONS\.map[\s\S]*valueText=\{`\$\{option\.value\}s`\}/,
  /MAIN_DECK_CARD_OPTIONS\.map[\s\S]*supportingText="cartas de 10"[\s\S]*valueText=\{String\(option\.value\)\}/,
  /validTeamCounts\.map[\s\S]*supportingText=\{getTeamSizeSummary\(players\.length, count\)\}/,
  /className=\{styles\.settingsRequirement\} role="status"/,
]) {
  assert.match(settingsDrawerSource, contract)
}
assert.match(playersPageSource, /deriveValidTeamCounts\(players\.length\)/)
assert.match(playersPageSource, /deriveBalancedTeamSizes\(playerCount, teamCount\)/)
assert.match(
  playersPageSource,
  /const handleSaveSettings[\s\S]*setTurnDuration\(durationDraft\)[\s\S]*setMainDeckCardCount\(cardCountDraft\)[\s\S]*setTeamCount\(teamCountDraft\)[\s\S]*setSettingsOpen\(false\)/,
)

const optionCardStylesStart = playersStyles.indexOf('.settingsGroup .optionCardGrid')
const optionCardStylesEnd = playersStyles.indexOf('.settingsRequirement', optionCardStylesStart)
assert.ok(optionCardStylesStart >= 0)
assert.ok(optionCardStylesEnd > optionCardStylesStart)
const optionCardStyles = playersStyles.slice(optionCardStylesStart, optionCardStylesEnd)
assert.doesNotMatch(optionCardStyles, /--radius-control-pill/)
assert.doesNotMatch(optionCardStyles, /(?:#000(?:000)?\b|\bblack\b)/i)
assert.doesNotMatch(optionCardStyles, /:hover\b|transform\s*:/)
assert.doesNotMatch(playersStyles, /\.optionCardIcon\b/)
assert.doesNotMatch(playersStyles, /:global\([^)]*ant-radio/i)

const settingsContentRule = getRuleBody(playersStyles, '\\.settingsContent', 'Settings groups')
assert.match(settingsContentRule, /gap:\s*var\(--space-lg\);/)
const optionCardGridRule = getRuleBody(
  playersStyles,
  '\\.settingsGroup \\.optionCardGrid',
  'Settings legend-to-options spacing',
)
assert.match(optionCardGridRule, /margin-top:\s*var\(--space-xs\);/)

const optionCardRule = getRuleBody(
  playersStyles,
  '\\.optionCardGrid \\.optionCard',
  'Player settings option card',
)
for (const contract of [
  /min-height:\s*72px;/,
  /box-shadow:\s*0 0 10px 1px var\(--color-border\);/,
  /border-radius:\s*var\(--radius-md\);/,
  /background:\s*var\(--color-surface\);/,
  /color:\s*var\(--color-primary\);/,
  /transition:/,
]) {
  assert.match(optionCardRule, contract)
}
for (const contract of [
  /\.threeColumnOptionGrid\s*\{[^}]*repeat\(3, minmax\(0, 1fr\)\)/,
  /\.teamOptionGrid\s*\{[^}]*repeat\(2, minmax\(0, 1fr\)\)/,
  /\.optionCardValue\s*\{[^}]*font-size:\s*clamp\(1\.5rem, 8vw, 2\.5rem\);[^}]*font-weight:\s*var\(--font-weight-bold\);/,
  /\.optionCardSupportingText\s*\{[^}]*overflow-wrap:\s*anywhere;/,
  /\.optionCardSelectedIndicator\s*\{[^}]*position:\s*absolute;[^}]*top:\s*-0\.25rem;[^}]*right:\s*-0\.9rem;[^}]*display:\s*grid;/,
  /\.optionCardGrid \.optionCardRadio\s*\{[^}]*position:\s*absolute;[^}]*opacity:\s*0;/,
  /\.optionCard:has\(input:checked\)\s*\{[^}]*background:\s*var\(--color-primary\);[^}]*box-shadow:\s*var\(--shadow-control\);[^}]*color:\s*var\(--color-surface\);/,
  /\.optionCard:has\(input:focus-visible\)\s*\{[^}]*outline:\s*3px solid var\(--color-focus\);[^}]*outline-offset:\s*3px;/,
  /\.optionCard:has\(input:disabled\)\s*\{[^}]*color:\s*var\(--color-text-muted\);/,
  /@media \(max-width: 350px\)[\s\S]*\.optionCardGrid \.optionCard\s*\{[^}]*padding-inline:\s*0\.35rem;/,
  /@media \(max-width: 350px\)[\s\S]*\.threeColumnOptionGrid \.optionCard\s*\{[^}]*aspect-ratio:\s*auto;/,
]) {
  assert.match(playersStyles, contract)
}
assert.match(globalStyles, /@media \(prefers-reduced-motion: reduce\)/)

assert.match(themeSource, /const CONTROL_PILL_RADIUS = 999/)
const globalThemeTokenBlock = themeSource.match(/token:\s*\{([\s\S]*?)\n\s*\},/)
assert.ok(globalThemeTokenBlock)
assert.match(globalThemeTokenBlock[1], /borderRadius:\s*16,/)
assert.match(globalThemeTokenBlock[1], /borderRadiusLG:\s*24,/)
assert.doesNotMatch(globalThemeTokenBlock[1], /CONTROL_PILL_RADIUS/)
for (const componentName of ['Button', 'Input']) {
  const componentBlock = themeSource.match(
    new RegExp(`${componentName}:\\s*\\{([\\s\\S]*?)\\n\\s*\\},`),
  )
  assert.ok(componentBlock, `Missing ${componentName} theme overrides`)
  for (const radiusToken of ['borderRadius', 'borderRadiusSM', 'borderRadiusLG']) {
    assert.match(
      componentBlock[1],
      new RegExp(`${radiusToken}:\\s*CONTROL_PILL_RADIUS,`),
      `${componentName}.${radiusToken} must use the pill radius`,
    )
  }
}

assertRuleUsesPill(homeStyles, '\\.playButton', 'Home play button')
assertRuleUsesPill(avatarInputStyles, '\\.nicknameInput', 'Nickname input wrapper')
assertRuleUsesPill(playersStyles, '\\.playerInput', 'Player input wrapper')
assertRuleUsesPill(playersStyles, '\\.addButton', 'Add-player button')
assertRuleUsesPill(playersStyles, '\\.actions button', 'Player footer buttons')
assertRuleUsesPill(playersStyles, '\\.settingsContent > button', 'Settings save button')
assertRuleUsesPill(
  teamsStyles,
  '\\.actions button,\\s*\\.drawerContent > button,\\s*\\.assignButton',
  'Team assignment and action buttons',
)
assertRuleUsesPill(
  cardsStyles,
  '\\.revealButton,\\s*\\.completionActions button,\\s*\\.selectionActions button',
  'Card-flow action buttons',
)
assert.ok(homePageSource.includes('className={styles.playButton}'))
assert.ok(avatarInputSource.includes('className={styles.nicknameInput}'))

for (const className of ['contactButton']) assertCircleIconButton(homePageSource, className)
for (const className of ['backButton', 'helpButton', 'removeButton']) {
  assertCircleIconButton(playersPageSource, className)
}
for (const className of ['backButton', 'removePlayerButton']) {
  assertCircleIconButton(teamsPageSource, className)
}
assertCircleIconButton(cardsPageSource, 'selectionBackButton')
const playerRemoveRule = getRuleBody(playersStyles, '\\.removeButton', 'Player remove button')
assert.match(playerRemoveRule, /width:\s*40px !important;/)
assert.match(playerRemoveRule, /min-width:\s*40px !important;/)
assert.match(playerRemoveRule, /height:\s*40px !important;/)
const teamRemoveRule = getRuleBody(teamsStyles, '\\.removePlayerButton', 'Team remove button')
assert.match(teamRemoveRule, /width:\s*44px !important;/)
assert.match(teamRemoveRule, /min-width:\s*44px !important;/)
assert.match(teamRemoveRule, /height:\s*44px !important;/)
const selectionBackRule = getRuleBody(
  cardsStyles,
  '\\.selectionBackButton',
  'Card selection back button',
)
assert.match(selectionBackRule, /width:\s*40px !important;/)
assert.match(selectionBackRule, /min-width:\s*40px !important;/)
assert.match(selectionBackRule, /height:\s*40px !important;/)
assert.match(
  selectionBackRule,
  /box-shadow:\s*var\(--shadow-edge-control\) !important;/,
)
assert.match(
  cardsStyles,
  /\.selectionBackButton:hover,\s*\.selectionBackButton:active,\s*\.selectionBackButton:focus\s*\{[^}]*box-shadow:\s*var\(--shadow-edge-control\) !important;/,
)
const selectionBackFocusRule = getRuleBody(
  cardsStyles,
  '\\.selectionBackButton:focus-visible',
  'Keyboard-focused card selection back button',
)
assert.match(selectionBackFocusRule, /outline:\s*3px solid var\(--color-focus\);/)
assert.match(selectionBackFocusRule, /outline-offset:\s*3px;/)
assert.match(
  selectionBackFocusRule,
  /box-shadow:\s*var\(--shadow-edge-control\) !important;/,
)
assert.doesNotMatch(globalStyles, /border-radius:\s*var\(--radius-control-pill\)/)

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

const primaryHeaderStart = primaryBranchSource.indexOf(
  '<header className={styles.selectionHeader}>',
)
const primaryHeaderEnd = primaryBranchSource.indexOf('</header>', primaryHeaderStart)
assert.ok(primaryHeaderStart >= 0)
assert.ok(primaryHeaderEnd > primaryHeaderStart)
const primaryHeaderSource = primaryBranchSource.slice(primaryHeaderStart, primaryHeaderEnd)
assert.deepEqual(getJsxOpeningElementNames(primaryHeaderSource), ['header', 'h1', 'p'])
assert.match(
  primaryHeaderSource,
  /<h1 id="main-selection-title">SELECCIÓN PRINCIPAL<\/h1>/,
)
assert.match(
  primaryHeaderSource,
  /<p className=\{styles\.progress\}>\s*\{selectedMainCount\} \/ \{mainDeckCardCount\}\s*<\/p>/,
)
assert.doesNotMatch(
  primaryHeaderSource,
  /currentPlayer|styles\.(?:eyebrow|instruction|feedback)|role="status"|aria-live=|<Button|<Tooltip/,
)

const primaryLiveRegionStart = primaryBranchSource.indexOf(
  '<p className="visually-hidden"',
  primaryHeaderEnd,
)
const primaryLiveRegionEnd = primaryBranchSource.indexOf('</p>', primaryLiveRegionStart)
assert.ok(primaryLiveRegionStart > primaryHeaderEnd)
assert.ok(primaryLiveRegionEnd > primaryLiveRegionStart)
assert.equal(primaryBranchSource.match(/className="visually-hidden"/g)?.length, 1)
const primaryLiveRegionSource = primaryBranchSource.slice(
  primaryLiveRegionStart,
  primaryLiveRegionEnd,
)
for (const contract of [
  /role="status"/,
  /aria-live="polite"/,
  /aria-atomic="true"/,
  /\{currentPlayer\.name\}/,
  /\{feedback\}/,
]) {
  assert.match(primaryLiveRegionSource, contract)
}

const primaryFooterStart = primaryBranchSource.indexOf('<footer')
const primaryFooterEnd = primaryBranchSource.indexOf('</footer>', primaryFooterStart)
assert.ok(primaryFooterStart >= 0)
assert.ok(primaryFooterEnd > primaryFooterStart)
const primaryFooterSource = primaryBranchSource.slice(primaryFooterStart, primaryFooterEnd)
assert.equal(primaryFooterSource.match(/<Button\b/g)?.length, 1)
assert.doesNotMatch(primaryFooterSource, /<p\b/)

const lightningFilterSource = cardsPageSource.slice(lightningFilterIndex, lightningMapIndex)
assert.match(
  lightningFilterSource,
  /\.filter\(\s*\(cardId\) => !currentPlayerDraft\.selectedMainCardIds\.includes\(cardId\),?\s*\)/,
)
const lightningBranchSource = cardsPageSource.slice(lightningFilterIndex)
assert.ok(!lightningBranchSource.includes('currentPlayerDraft.dealCardIds.map'))
assert.ok(lightningBranchSource.includes('disabled={!isReady}'))
assert.ok(!cardsPageSource.includes('Cambiar principales'))

const lightningHeaderStart = lightningBranchSource.indexOf(
  '<header className={`${styles.selectionHeader} ${styles.lightningSelectionHeader}`}>',
)
const lightningHeaderEnd = lightningBranchSource.indexOf('</header>', lightningHeaderStart)
assert.ok(lightningHeaderStart >= 0)
assert.ok(lightningHeaderEnd > lightningHeaderStart)
const lightningHeaderSource = lightningBranchSource.slice(
  lightningHeaderStart,
  lightningHeaderEnd,
)
assert.deepEqual(getJsxOpeningElementNames(lightningHeaderSource), [
  'header',
  'Tooltip',
  'Button',
  'ArrowLeftOutlined',
  'h1',
  'p',
])
assert.match(
  lightningHeaderSource,
  /<h1 id="lightning-selection-title">SELECCIÓN RELÁMPAGO<\/h1>/,
)
assert.match(
  lightningHeaderSource,
  /<p className=\{`\$\{styles\.progress\} \$\{styles\.lightningProgress\}`\}>\s*\{lightningSelectedCount\} \/ 1\s*<\/p>/,
)
assert.doesNotMatch(
  lightningHeaderSource,
  /currentPlayer|styles\.(?:eyebrow|instruction|feedback)|role="status"|aria-live=/,
)

const { buttonSource: selectionBackButtonSource, classIndex: selectionBackButtonIndex } =
  getAntdButtonSource(cardsPageSource, 'selectionBackButton')
for (const contract of [
  /shape="circle"/,
  /icon=\{<ArrowLeftOutlined \/>\}/,
  /aria-label="Volver a selección principal"/,
  /onClick=\{handleEditMain\}/,
]) {
  assert.match(selectionBackButtonSource, contract)
}
assert.ok(lightningHeaderSource.includes('className={styles.selectionBackButton}'))
const selectionBackTooltipStart = cardsPageSource.lastIndexOf(
  '<Tooltip',
  selectionBackButtonIndex,
)
const selectionBackTooltipEnd = cardsPageSource.indexOf('</Tooltip>', selectionBackButtonIndex)
assert.ok(selectionBackTooltipStart >= 0)
assert.ok(selectionBackTooltipEnd > selectionBackButtonIndex)
assert.match(
  cardsPageSource.slice(selectionBackTooltipStart, selectionBackTooltipEnd),
  /<Tooltip title="Volver a selección principal">/,
)

const lightningLiveRegionStart = lightningBranchSource.indexOf(
  '<p className="visually-hidden"',
  lightningHeaderEnd,
)
const lightningLiveRegionEnd = lightningBranchSource.indexOf('</p>', lightningLiveRegionStart)
assert.ok(lightningLiveRegionStart > lightningHeaderEnd)
assert.ok(lightningLiveRegionEnd > lightningLiveRegionStart)
assert.equal(lightningBranchSource.match(/className="visually-hidden"/g)?.length, 1)
const lightningLiveRegionSource = lightningBranchSource.slice(
  lightningLiveRegionStart,
  lightningLiveRegionEnd,
)
for (const contract of [
  /role="status"/,
  /aria-live="polite"/,
  /aria-atomic="true"/,
  /\{currentPlayer\.name\}/,
  /\{feedback\}/,
]) {
  assert.match(lightningLiveRegionSource, contract)
}

const lightningFooterStart = lightningBranchSource.indexOf('<footer')
const lightningFooterEnd = lightningBranchSource.indexOf('</footer>', lightningFooterStart)
const lightningScrollerStart = lightningBranchSource.indexOf(
  '<div className={styles.cardScroller}>',
)
assert.ok(lightningScrollerStart > lightningHeaderEnd)
assert.ok(lightningFooterStart >= 0)
assert.ok(lightningFooterStart > lightningScrollerStart)
assert.ok(lightningFooterEnd > lightningFooterStart)
const lightningFooterSource = lightningBranchSource.slice(
  lightningFooterStart,
  lightningFooterEnd,
)
assert.equal(lightningFooterSource.match(/<Button\b/g)?.length, 1)
assert.ok(lightningFooterSource.includes('Guardar selección'))
assert.doesNotMatch(lightningFooterSource, /<p\b|handleEditMain/)

for (const helpId of ['main-selection-help', 'lightning-selection-help']) {
  assert.ok(!cardsPageSource.includes(helpId))
}
assert.doesNotMatch(cardsPageSource, /aria-describedby=/)
assert.doesNotMatch(cardsStyles, /\.(?:instruction|feedback|saveHelp)\b/)

const cardsPageRule = getRuleBody(cardsStyles, '\\.page', 'Card-draft route gutter')
assert.match(cardsPageRule, /--route-inline-gutter:\s*var\(--space-md\);/)
const selectionLayoutRule = getRuleBody(
  cardsStyles,
  '\\.selectionLayout(?=\\s*\\{\\s*display:\\s*grid;)',
  'Card selection clipped layout',
)
assert.match(selectionLayoutRule, /grid-template-rows:\s*auto minmax\(0, 1fr\) auto;/)
assert.match(selectionLayoutRule, /overflow:\s*hidden;/)
for (const contract of [
  /width:\s*calc\(100% \+ var\(--route-inline-gutter\) \+ var\(--route-inline-gutter\)\);/,
  /margin-inline:\s*calc\(-1 \* var\(--route-inline-gutter\)\);/,
  /padding-inline:\s*var\(--route-inline-gutter\);/,
  /grid-template-columns:\s*minmax\(0, 1fr\);/,
]) {
  assert.match(selectionLayoutRule, contract)
}
const cardScrollerRule = getRuleBody(
  cardsStyles,
  '\\.cardScroller',
  'Card selection scrolling row',
)
for (const contract of [
  /min-width:\s*0;/,
  /min-height:\s*0;/,
  /overflow-x:\s*hidden;/,
  /overflow-y:\s*auto;/,
]) {
  assert.match(cardScrollerRule, contract)
}
const completionRule = getRuleBody(
  cardsStyles,
  '\\.completion',
  'Card-draft completion shadow gutter',
)
for (const contract of [
  /width:\s*calc\(100% \+ var\(--route-inline-gutter\) \+ var\(--route-inline-gutter\)\);/,
  /margin-inline:\s*calc\(-1 \* var\(--route-inline-gutter\)\);/,
  /padding:\s*var\(--space-sm\) var\(--space-shadow-gutter\);/,
  /overflow-x:\s*hidden;/,
  /overflow-y:\s*auto;/,
  /overscroll-behavior-y:\s*contain;/,
]) {
  assert.match(completionRule, contract)
}
assert.doesNotMatch(completionRule, /overflow-x:\s*visible;/)
assert.match(
  cardsStyles,
  /@media \(max-width: 350px\)[\s\S]*\.page\s*\{[^}]*--route-inline-gutter:\s*var\(--space-sm\);/,
)

const selectionHeaderRule = getRuleBody(
  cardsStyles,
  '\\.selectionHeader',
  'Compact card selection header',
)
assert.match(selectionHeaderRule, /min-width:\s*0;/)
assert.match(selectionHeaderRule, /grid-template-columns:\s*minmax\(0, 1fr\);/)
assert.match(selectionHeaderRule, /grid-template-areas:\s*'title'\s*'progress';/)
assert.match(selectionHeaderRule, /align-items:\s*center;/)
assert.match(selectionHeaderRule, /row-gap:\s*4px;/)
const lightningHeaderRule = getRuleBody(
  cardsStyles,
  '\\.lightningSelectionHeader',
  'Compact lightning selection header',
)
for (const contract of [
  /width:\s*calc\(100% \+ var\(--route-inline-gutter\) \+ var\(--route-inline-gutter\)\);/,
  /margin-inline:\s*calc\(-1 \* var\(--route-inline-gutter\)\);/,
  /padding-inline:\s*var\(--route-inline-gutter\);/,
  /justify-self:\s*start;/,
]) {
  assert.match(lightningHeaderRule, contract)
}
assert.doesNotMatch(
  lightningHeaderRule,
  /padding-inline:\s*var\(--space-shadow-gutter\);/,
)
assert.match(
  lightningHeaderRule,
  /grid-template-columns:\s*40px minmax\(0, 1fr\) 40px;/,
)
assert.match(
  lightningHeaderRule,
  /grid-template-areas:\s*'back title balance'\s*'progress progress progress';/,
)
assert.match(selectionBackRule, /grid-area:\s*back;/)
assert.match(selectionBackRule, /align-self:\s*center;/)
const lightningBalanceRule = getRuleBody(
  cardsStyles,
  '\\.lightningSelectionHeader::after',
  'Lightning header balancing spacer',
)
assert.match(lightningBalanceRule, /content:\s*'';/)
assert.match(lightningBalanceRule, /width:\s*40px;/)
assert.match(lightningBalanceRule, /height:\s*40px;/)
assert.match(lightningBalanceRule, /grid-area:\s*balance;/)
const selectionTitleRule = getRuleBody(
  cardsStyles,
  '\\.selectionHeader h1',
  'Compact card selection title',
)
assert.match(selectionTitleRule, /width:\s*100%;/)
assert.match(selectionTitleRule, /min-width:\s*0;/)
assert.match(selectionTitleRule, /grid-area:\s*title;/)
assert.match(selectionTitleRule, /justify-self:\s*center;/)
assert.match(selectionTitleRule, /overflow-wrap:\s*anywhere;/)
assert.match(selectionTitleRule, /text-align:\s*center;/)
const selectionProgressRule = getRuleBody(
  cardsStyles,
  '\\.progress',
  'Compact card selection progress',
)
assert.match(selectionProgressRule, /grid-area:\s*progress;/)
assert.match(selectionProgressRule, /justify-self:\s*center;/)
assert.match(selectionProgressRule, /text-align:\s*center;/)

for (const [label, selectorPattern] of [
  ['Handoff content', '\\.handoffContent'],
  ['Handoff reveal action', '\\.revealButton'],
  ['Completion icon', '\\.completionIcon'],
  ['Completion copy', '\\.completionCopy'],
  ['Completion actions', '\\.completionActions'],
  ['Selection header', '\\.selectionHeader'],
  ['Selection card item', '\\.cardList li'],
  ['Selection footer', '\\.selectionActions'],
]) {
  assert.match(
    getRuleBody(cardsStyles, selectorPattern, `${label} entry animation`),
    /animation:\s*card-flow-enter \d+ms ease-out(?: \d+ms)? both;/,
  )
}
const cardFlowAnimation = cardsStyles.match(
  /@keyframes card-flow-enter\s*\{([\s\S]*?)\n\}/,
)?.[1]
assert.ok(cardFlowAnimation, 'Missing card-flow-enter keyframes')
assert.match(cardFlowAnimation, /from\s*\{[\s\S]*opacity:\s*0;[\s\S]*transform:\s*translateY\(/)
assert.match(
  cardFlowAnimation,
  /to\s*\{[\s\S]*opacity:\s*1;[\s\S]*transform:\s*translateY\(0\);/,
)
assert.doesNotMatch(cardFlowAnimation, /scale\(|infinite|flash/i)
assert.match(
  cardsStyles,
  /@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*\.handoffContent,\s*\.revealButton,\s*\.completionIcon,\s*\.completionCopy,\s*\.completionActions,\s*\.selectionHeader,\s*\.cardList li,\s*\.selectionActions\s*\{[^}]*animation:\s*none;/,
)

for (const removedCategoryLabel of ['TÍTULOS', 'PERSONAJES', 'TODO']) {
  assert.ok(!draftCardSource.includes(removedCategoryLabel))
}
assert.ok(!draftCardSource.includes('sectionLabel'))
assert.equal(draftCardSource.match(/styles\.sectionSubtype/g)?.length, 3)
assert.ok(draftCardSource.includes('styles.cardCap'))
assert.ok(draftCardSource.includes('PALABRA CLAVE'))
assert.ok(draftCardSource.includes('{card.keyword}'))
assert.ok(draftCardSource.includes("main: 'Principal'"))
assert.ok(draftCardSource.includes("lightning: 'Relámpago'"))

assert.match(draftCardStyles, /\.unselected\s*\{\s*opacity: 0\.4;/)
const selectedCardRule = draftCardStyles.match(
  /\.selectedMain,\s*\.selectedLightning\s*\{([^}]*)\}/,
)
assert.ok(selectedCardRule)
assert.match(selectedCardRule[1], /opacity:\s*1;/)
assert.match(selectedCardRule[1], /box-shadow:\s*var\(--shadow-card-selected\);/)
assert.deepEqual(
  [...selectedCardRule[1].matchAll(/^\s*([\w-]+)\s*:/gm)].map(([, property]) => property),
  ['opacity', 'box-shadow'],
)
assert.doesNotMatch(selectedCardRule[1], /\bborder(?:-[\w-]+)?\s*:/)
assert.doesNotMatch(draftCardStyles, /\.selected(?:Main|Lightning)::(?:before|after)/)
assert.doesNotMatch(draftCardStyles, /--border-card-selected/)

const cardButtonRule = draftCardStyles.match(/\.cardButton\s*\{([^}]*)\}/)
assert.ok(cardButtonRule)
assert.match(cardButtonRule[1], /box-sizing:\s*border-box;/)
assert.match(cardButtonRule[1], /width:\s*100%;/)
assert.match(cardButtonRule[1], /min-height:\s*490px;/)
assert.match(cardButtonRule[1], /gap:\s*var\(--space-card-band-gutter\);/)
assert.match(cardButtonRule[1], /border:\s*0;/)
assert.match(cardButtonRule[1], /border-radius:\s*var\(--radius-card-face\);/)
assert.doesNotMatch(cardButtonRule[1], /--radius-control-pill/)
assert.match(cardButtonRule[1], /background:\s*var\(--color-card-surface\);/)
assert.match(cardButtonRule[1], /box-shadow:\s*var\(--shadow-card-face\);/)
assert.doesNotMatch(cardButtonRule[1], /transparent/)

assert.match(
  draftCardStyles,
  /\.titleSection,\s*\.characterSection,\s*\.everythingSection\s*\{[^}]*color:\s*var\(--color-card-band-text\);/,
)
assert.match(
  draftCardStyles,
  /\.titleSection\s*\{[^}]*background:\s*var\(--color-card-band-title\);/,
)
assert.match(
  draftCardStyles,
  /\.characterSection\s*\{[^}]*background:\s*var\(--color-card-band-character\);/,
)
assert.match(
  draftCardStyles,
  /\.everythingSection\s*\{[^}]*background:\s*var\(--color-card-band-everything\);/,
)
const cardSectionRule = draftCardStyles.match(/\.cardSection\s*\{([^}]*)\}/)
assert.ok(cardSectionRule)
assert.match(cardSectionRule[1], /position:\s*relative;/)
assert.match(cardSectionRule[1], /display:\s*grid;/)
assert.match(cardSectionRule[1], /padding:\s*var\(--space-sm\);/)
assert.match(cardSectionRule[1], /place-items:\s*center;/)
assert.doesNotMatch(cardSectionRule[1], /grid-template-rows:/)
assert.match(
  draftCardStyles,
  /\.sectionValue\s*\{[^}]*align-self:\s*center;[^}]*justify-self:\s*stretch;[^}]*overflow-wrap:\s*anywhere;[^}]*text-align:\s*center;/,
)
assert.match(
  draftCardStyles,
  /\.sectionSubtype\s*\{[^}]*position:\s*absolute;[^}]*right:\s*var\(--space-sm\);[^}]*bottom:\s*var\(--space-sm\);[^}]*max-width:\s*calc\(100% - var\(--space-sm\) - var\(--space-sm\)\);[^}]*overflow-wrap:\s*anywhere;[^}]*text-align:\s*right;/,
)
assert.match(
  draftCardStyles,
  /\.keywordSection\s*\{[^}]*align-content:\s*center;[^}]*justify-items:\s*center;[^}]*background:\s*var\(--color-card-surface\);[^}]*text-align:\s*center;/,
)
assert.match(
  draftCardStyles,
  /\.keywordLabel\s*\{[^}]*color:\s*var\(--color-card-keyword-muted\);[^}]*text-align:\s*center;/,
)
assert.match(
  draftCardStyles,
  /\.keywordValue\s*\{[^}]*width:\s*100%;[^}]*color:\s*var\(--color-primary\);[^}]*overflow-wrap:\s*anywhere;[^}]*text-align:\s*center;/,
)
assert.match(
  draftCardStyles,
  /\.cardCap\s*\{[^}]*background:\s*var\(--color-card-surface\);/,
)
assert.ok(!draftCardStyles.includes('.sectionLabel'))
assert.doesNotMatch(draftCardStyles, /--radius-control-pill/)
assert.doesNotMatch(draftCardStyles, /#(?:de2c6e|11b087|00aab7|fff(?:fff)?)\b/i)

const rootTokens = getRootTokens(globalStyles)
assert.equal(rootTokens.get('--color-background'), '#fff')
assert.equal(rootTokens.get('--color-surface'), '#fff')
assert.equal(rootTokens.get('--color-primary'), '#00aab7')
assert.equal(rootTokens.get('--color-secondary'), '#de2c6e')
assert.equal(rootTokens.get('--color-tertiary'), '#11b087')
assert.equal(rootTokens.get('--radius-control-pill'), '999px')
assert.equal(
  rootTokens.get('--shadow-edge-control'),
  '0 6px 12px rgba(0, 170, 183, 0.27)',
)
assert.equal(rootTokens.get('--space-shadow-gutter'), 'var(--space-lg)')
assert.equal(resolveRootToken(rootTokens, '--space-shadow-gutter'), '1.5rem')
assert.equal(rootTokens.get('--mobile-breakpoint'), '390px')
assert.match(
  globalStyles,
  /\*,\s*\*::before,\s*\*::after\s*\{[^}]*box-sizing:\s*border-box;/,
)
assert.match(
  getRuleBody(globalStyles, '#root', 'Interactive mobile shell'),
  /width:\s*min\(var\(--mobile-breakpoint\), 100%\);/,
)

const mobileShellCapPixels = cssLengthToPixels(
  rootTokens.get('--mobile-breakpoint'),
  'Mobile shell cap',
)
const selectionControlTrackPixels = 40
let minimumRouteGutterPixels = Number.POSITIVE_INFINITY
for (const geometry of [
  {
    viewportWidth: 320,
    routeGutterToken: '--space-sm',
    expected: {
      shellWidth: 320,
      pageContentWidth: 296,
      selectionBorderWidth: 320,
      selectionContentWidth: 296,
      headerBorderWidth: 320,
      headerContentWidth: 296,
      fixedColumnsWidth: 80,
      titleTrackWidth: 216,
      cardScrollerWidth: 296,
      footerWidth: 296,
    },
  },
  {
    viewportWidth: 390,
    routeGutterToken: '--space-md',
    expected: {
      shellWidth: 390,
      pageContentWidth: 358,
      selectionBorderWidth: 390,
      selectionContentWidth: 358,
      headerBorderWidth: 390,
      headerContentWidth: 358,
      fixedColumnsWidth: 80,
      titleTrackWidth: 278,
      cardScrollerWidth: 358,
      footerWidth: 358,
    },
  },
  {
    viewportWidth: 768,
    routeGutterToken: '--space-md',
    expected: {
      shellWidth: 390,
      pageContentWidth: 358,
      selectionBorderWidth: 390,
      selectionContentWidth: 358,
      headerBorderWidth: 390,
      headerContentWidth: 358,
      fixedColumnsWidth: 80,
      titleTrackWidth: 278,
      cardScrollerWidth: 358,
      footerWidth: 358,
    },
  },
]) {
  const shellWidth = Math.min(geometry.viewportWidth, mobileShellCapPixels)
  const routeGutterPixels = cssLengthToPixels(
    resolveRootToken(rootTokens, geometry.routeGutterToken),
    `${geometry.viewportWidth}px route gutter`,
  )
  minimumRouteGutterPixels = Math.min(minimumRouteGutterPixels, routeGutterPixels)

  const pageContentWidth = shellWidth - 2 * routeGutterPixels
  const selectionBorderWidth = pageContentWidth + 2 * routeGutterPixels
  const selectionContentWidth = selectionBorderWidth - 2 * routeGutterPixels
  const headerBorderWidth = selectionContentWidth + 2 * routeGutterPixels
  const headerContentWidth = headerBorderWidth - 2 * routeGutterPixels
  const fixedColumnsWidth = 2 * selectionControlTrackPixels
  const titleTrackWidth = headerContentWidth - fixedColumnsWidth

  assert.deepEqual(
    {
      shellWidth,
      pageContentWidth,
      selectionBorderWidth,
      selectionContentWidth,
      headerBorderWidth,
      headerContentWidth,
      fixedColumnsWidth,
      titleTrackWidth,
      cardScrollerWidth: selectionContentWidth,
      footerWidth: selectionContentWidth,
    },
    geometry.expected,
  )
}
assert.equal(minimumRouteGutterPixels, 12)

const edgeControlShadow = getSingleShadowMetrics(
  rootTokens.get('--shadow-edge-control'),
  'Edge-control shadow',
)
assert.deepEqual(edgeControlShadow, {
  offsetX: 0,
  offsetY: 6,
  blurRadius: 12,
  spreadRadius: 0,
  color: 'rgba(0, 170, 183, 0.27)',
})
const edgeControlHorizontalReach =
  Math.abs(edgeControlShadow.offsetX) +
  edgeControlShadow.blurRadius +
  Math.max(0, edgeControlShadow.spreadRadius)
assert.ok(edgeControlHorizontalReach <= minimumRouteGutterPixels)

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

console.log(
  'Card draft verification passed: catalog=200, deal=20x10, explicit main confirmation=valid, lightning exclusion=valid for quotas 3/4/5, configured/draft quota compatibility=valid, per-player privacy flow=valid, setup invalidation=valid, compact selection headers with hidden live feedback, accessible Relámpago back action, edge-shadow clearance source contract, independent nested border-box arithmetic at 320px/390px/wider widths, bounded card scroller, and fixed footer row=valid, expanded completion scrollport with internal shadow space=valid, completion and card-flow reduced-motion-safe entry animations=valid, Teams capacity UI and guarded assignment plus reduced-motion-safe entry animations=valid, native Player settings radio-card groups with icon-free deck/team typography, legend spacing, static hover behavior, and responsive selected/focus/indicator styles=valid, pill Button/Input contracts and explicit circle icon controls=valid, centered 16px card faces with absolute lower-right subtypes, keyword color hierarchy, and borderless shadow-only selection=valid. No browser rendering was exercised: actual shadow painting, focus rendering, and viewport layout remain manual checks.',
)
