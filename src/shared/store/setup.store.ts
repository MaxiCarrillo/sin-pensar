import { z } from 'zod'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

import {
  DEFAULT_MAIN_DECK_CARD_COUNT,
  DEFAULT_TEAM_COUNT,
  DEFAULT_TURN_DURATION,
  MAX_PLAYERS,
} from '@/shared/constants/setup'
import {
  concealCurrentPlayerCards,
  confirmMainCards as confirmCardDraftMainCards,
  createCardDraftSession,
  createCardDraftSetupKey,
  editMainCards as editCardDraftMainCards,
  getCardDraftSessionErrors,
  revealCurrentPlayerCards,
  saveCurrentPlayerDraft as saveCardDraftPlayer,
  toggleLightningCard as toggleCardDraftLightningCard,
  toggleMainCard as toggleCardDraftMainCard,
  type CardDraftRandomSource,
} from '@/shared/domain/card-draft'
import {
  createBalancedTeamAssignment,
  getTeamAssignmentSignature,
  isRosterValid,
  isValidTeamCount,
  normalizePlayerName,
  normalizeTeamCount,
  type TeamAssignmentValidation,
  validateTeamAssignment,
} from '@/shared/domain/setup'
import {
  SETUP_PROFILE_DEFAULTS,
  setupProfileSchema,
} from '@/shared/schemas/setup-profile.schema'
import { useGameplayStore } from '@/shared/store/gameplay.store'
import { replaceProfileIdentity } from '@/shared/store/profile-identity.actions'
import type {
  CardDraftSession,
  CardDraftStartResult,
  CardDraftTransitionResult,
  CardId,
} from '@/shared/types/card-draft'
import type {
  AddPlayerResult,
  AvatarId,
  MainDeckCardCount,
  Player,
  RenamePlayerResult,
  TeamAssignment,
  TeamCount,
  TurnDuration,
} from '@/shared/types/setup'

const LEGACY_AVATAR_IDS = ['spark', 'wave', 'heart', 'leaf'] as const

const legacySetupProfileSchema = setupProfileSchema
  .omit({ avatar: true })
  .extend({ avatar: z.unknown().optional() })

function migrateLegacyProfile(persistedState: unknown) {
  const result = legacySetupProfileSchema.safeParse(persistedState)
  if (!result.success) return SETUP_PROFILE_DEFAULTS

  const legacyAvatar = result.data.avatar
  const isKnownLegacyAvatar = LEGACY_AVATAR_IDS.some((avatar) => avatar === legacyAvatar)
  const migratedProfile = {
    nickname: result.data.nickname,
    avatar: isKnownLegacyAvatar ? 'avatar-1' : SETUP_PROFILE_DEFAULTS.avatar,
  }

  const migratedResult = setupProfileSchema.safeParse(migratedProfile)
  return migratedResult.success ? migratedResult.data : SETUP_PROFILE_DEFAULTS
}

interface SetupState {
  avatar: AvatarId
  nickname: string
  players: Player[]
  ownerPlayerId: string | null
  turnDuration: TurnDuration
  mainDeckCardCount: MainDeckCardCount
  teamCount: TeamCount
  teamAssignment: TeamAssignment
  cardDraft: CardDraftSession | null
  setAvatar: (avatar: AvatarId) => void
  initializeProfile: (nickname: string) => void
  addPlayer: () => AddPlayerResult
  renamePlayer: (playerId: string, name: string) => RenamePlayerResult
  removePlayer: (playerId: string) => void
  setTurnDuration: (turnDuration: TurnDuration) => void
  setMainDeckCardCount: (mainDeckCardCount: MainDeckCardCount) => void
  setTeamCount: (teamCount: TeamCount) => void
  commitTeamAssignment: (assignment: TeamAssignment) => TeamAssignmentValidation
  startCardDraft: (
    cardIds: readonly CardId[],
    random?: CardDraftRandomSource,
  ) => CardDraftStartResult
  concealCardDraft: () => CardDraftTransitionResult
  revealCardDraft: () => CardDraftTransitionResult
  toggleMainCard: (cardId: CardId) => CardDraftTransitionResult
  confirmMainCards: () => CardDraftTransitionResult
  editMainCards: () => CardDraftTransitionResult
  toggleLightningCard: (cardId: CardId) => CardDraftTransitionResult
  saveCurrentPlayerDraft: () => CardDraftTransitionResult
  clearCardDraft: () => void
}

let playerSequence = 0

function createPlayer(name: string): Player {
  playerSequence += 1
  return { id: `player-${playerSequence}`, name }
}

function getBalancedAssignment(players: Player[], teamCount: TeamCount): TeamAssignment {
  const result = createBalancedTeamAssignment(players, teamCount)
  return result.kind === 'success' ? result.assignment : { teams: [] }
}

function getDraftSetupKey(state: SetupState) {
  return createCardDraftSetupKey({
    ownerPlayerId: state.ownerPlayerId ?? '',
    players: state.players,
    mainDeckCardCount: state.mainDeckCardCount,
    teamAssignmentSignature: getTeamAssignmentSignature(state.teamAssignment),
  })
}

function resetGameplay() {
  useGameplayStore.getState().resetGameplay()
}

export const useSetupStore = create<SetupState>()(
  persist(
    (set, get) => ({
      ...SETUP_PROFILE_DEFAULTS,
      players: [],
      ownerPlayerId: null,
      turnDuration: DEFAULT_TURN_DURATION,
      mainDeckCardCount: DEFAULT_MAIN_DECK_CARD_COUNT,
      teamCount: DEFAULT_TEAM_COUNT,
      teamAssignment: { teams: [] },
      cardDraft: null,
      setAvatar: (avatar) => set({ avatar }),
      initializeProfile: (nickname) => {
        const trimmedNickname = nickname.trim()
        if (!trimmedNickname) return

        const ownerPlayer = createPlayer(trimmedNickname)
        replaceProfileIdentity(
          {
            nickname: trimmedNickname,
            ownerPlayer,
            defaults: {
              turnDuration: DEFAULT_TURN_DURATION,
              mainDeckCardCount: DEFAULT_MAIN_DECK_CARD_COUNT,
              teamCount: DEFAULT_TEAM_COUNT,
            },
          },
          {
            resetGameplay,
            replaceSetup: (profileIdentity) => set(profileIdentity),
          },
        )
      },
      addPlayer: () => {
        if (get().players.length >= MAX_PLAYERS) return { kind: 'limit-reached' }
        const player = createPlayer('')
        resetGameplay()
        set((state) => ({
          players: [...state.players, player],
          teamAssignment: { teams: [] },
          cardDraft: null,
        }))
        return { kind: 'added', player }
      },
      renamePlayer: (playerId, name) => {
        const trimmedName = name.trim()
        if (!trimmedName) return { kind: 'empty' }

        const { ownerPlayerId, players, teamAssignment, teamCount } = get()
        const playerIndex = players.findIndex((player) => player.id === playerId)
        if (playerIndex < 0) return { kind: 'missing' }

        const normalizedName = normalizePlayerName(trimmedName)
        const duplicate = players.some(
          (player) =>
            player.id !== playerId &&
            normalizePlayerName(player.name) === normalizedName,
        )
        if (duplicate) return { kind: 'duplicate', name: trimmedName }

        const player = { ...players[playerIndex], name: trimmedName }
        if (player.name === players[playerIndex].name) return { kind: 'updated', player }
        const nextPlayers = players.map((currentPlayer) =>
          currentPlayer.id === playerId ? player : currentPlayer,
        )
        const assignmentValidation = validateTeamAssignment(
          nextPlayers,
          teamCount,
          teamAssignment,
        )
        resetGameplay()
        set({
          players: nextPlayers,
          teamAssignment:
            assignmentValidation.kind === 'valid'
              ? teamAssignment
              : getBalancedAssignment(nextPlayers, teamCount),
          cardDraft: null,
          ...(playerId === ownerPlayerId ? { nickname: trimmedName } : {}),
        })
        return { kind: 'updated', player }
      },
      removePlayer: (playerId) => {
        if (!get().players.some((player) => player.id === playerId)) return
        resetGameplay()
        set((state) => {
          const players = state.players.filter((player) => player.id !== playerId)
          const teamCount = normalizeTeamCount(players.length, state.teamCount)
          return {
            players,
            ownerPlayerId: state.ownerPlayerId === playerId ? null : state.ownerPlayerId,
            teamCount,
            teamAssignment: getBalancedAssignment(players, teamCount),
            cardDraft: null,
          }
        })
      },
      setTurnDuration: (turnDuration) => {
        if (get().turnDuration === turnDuration) return
        resetGameplay()
        set({ turnDuration })
      },
      setMainDeckCardCount: (mainDeckCardCount) => {
        if (get().mainDeckCardCount === mainDeckCardCount) return
        resetGameplay()
        set({ mainDeckCardCount, cardDraft: null })
      },
      setTeamCount: (teamCount) => {
        const { players, teamCount: currentTeamCount } = get()
        if (!isValidTeamCount(players.length, teamCount)) return
        if (teamCount === currentTeamCount) return
        resetGameplay()
        set({
          teamCount,
          teamAssignment: getBalancedAssignment(players, teamCount),
          cardDraft: null,
        })
      },
      commitTeamAssignment: (assignment) => {
        const { players, teamCount } = get()
        const validation = validateTeamAssignment(players, teamCount, assignment)
        if (validation.kind === 'invalid') return validation
        if (
          getTeamAssignmentSignature(get().teamAssignment) ===
          getTeamAssignmentSignature(assignment)
        ) {
          return validation
        }
        resetGameplay()
        set({
          teamAssignment: {
            teams: assignment.teams.map((team) => ({
              teamId: team.teamId,
              playerIds: [...team.playerIds],
            })),
          },
          cardDraft: null,
        })
        return validation
      },
      startCardDraft: (cardIds, random = Math.random) => {
        const state = get()
        const hasOwner =
          Boolean(state.nickname.trim()) &&
          state.ownerPlayerId !== null &&
          state.players.some((player) => player.id === state.ownerPlayerId)
        if (!hasOwner) return { kind: 'rejected', reason: 'invalid-owner' }
        if (!isRosterValid(state.players)) {
          return { kind: 'rejected', reason: 'invalid-roster' }
        }
        if (
          validateTeamAssignment(state.players, state.teamCount, state.teamAssignment).kind ===
          'invalid'
        ) {
          return { kind: 'rejected', reason: 'invalid-team-assignment' }
        }

        const setupKey = getDraftSetupKey(state)
        if (
          state.cardDraft &&
          getCardDraftSessionErrors(
            state.cardDraft,
            setupKey,
            state.mainDeckCardCount,
            state.players.map((player) => player.id),
            cardIds,
          ).length === 0
        ) {
          return { kind: 'existing', session: state.cardDraft }
        }

        const creation = createCardDraftSession(
          state.players.map((player) => player.id),
          cardIds,
          state.mainDeckCardCount,
          setupKey,
          random,
        )
        if (creation.kind === 'rejected') return creation
        resetGameplay()
        set({ cardDraft: creation.session })
        return { kind: 'started', session: creation.session }
      },
      concealCardDraft: () => {
        const current = get().cardDraft
        if (!current) return { kind: 'rejected', reason: 'missing-current-player' }
        const result = concealCurrentPlayerCards(current)
        if (result.kind === 'success') set({ cardDraft: result.session })
        return result
      },
      revealCardDraft: () => {
        const current = get().cardDraft
        if (!current) return { kind: 'rejected', reason: 'missing-current-player' }
        const result = revealCurrentPlayerCards(current)
        if (result.kind === 'success') set({ cardDraft: result.session })
        return result
      },
      toggleMainCard: (cardId) => {
        const current = get().cardDraft
        if (!current) return { kind: 'rejected', reason: 'missing-current-player' }
        const result = toggleCardDraftMainCard(current, cardId)
        if (result.kind === 'success') set({ cardDraft: result.session })
        return result
      },
      confirmMainCards: () => {
        const current = get().cardDraft
        if (!current) return { kind: 'rejected', reason: 'missing-current-player' }
        const result = confirmCardDraftMainCards(current)
        if (result.kind === 'success') set({ cardDraft: result.session })
        return result
      },
      editMainCards: () => {
        const current = get().cardDraft
        if (!current) return { kind: 'rejected', reason: 'missing-current-player' }
        const result = editCardDraftMainCards(current)
        if (result.kind === 'success') set({ cardDraft: result.session })
        return result
      },
      toggleLightningCard: (cardId) => {
        const current = get().cardDraft
        if (!current) return { kind: 'rejected', reason: 'missing-current-player' }
        const result = toggleCardDraftLightningCard(current, cardId)
        if (result.kind === 'success') set({ cardDraft: result.session })
        return result
      },
      saveCurrentPlayerDraft: () => {
        const current = get().cardDraft
        if (!current) return { kind: 'rejected', reason: 'missing-current-player' }
        const result = saveCardDraftPlayer(current)
        if (result.kind === 'success') set({ cardDraft: result.session })
        return result
      },
      clearCardDraft: () => {
        resetGameplay()
        set({ cardDraft: null })
      },
    }),
    {
      name: 'sin-pensar-setup-profile',
      version: 2,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        nickname: state.nickname,
        avatar: state.avatar,
      }),
      migrate: (persistedState, version) => {
        if (version === 1) return migrateLegacyProfile(persistedState)
        return SETUP_PROFILE_DEFAULTS
      },
      merge: (persistedState, currentState) => {
        const result = setupProfileSchema.safeParse(persistedState)
        const profile = result.success ? result.data : SETUP_PROFILE_DEFAULTS
        return { ...currentState, ...profile }
      },
    },
  ),
)
