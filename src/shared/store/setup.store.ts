import { z } from 'zod'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

import {
  DEFAULT_MAIN_DECK_CARD_COUNT,
  DEFAULT_TEAM_COUNT,
  DEFAULT_TURN_DURATION,
} from '@/shared/constants/setup'
import {
  createBalancedTeamAssignment,
  isValidTeamCount,
  normalizeTeamCount,
  normalizePlayerName,
  type TeamAssignmentValidation,
  validateTeamAssignment,
} from '@/shared/domain/setup'
import {
  SETUP_PROFILE_DEFAULTS,
  setupProfileSchema,
} from '@/shared/schemas/setup-profile.schema'
import type {
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
  setAvatar: (avatar: AvatarId) => void
  setNickname: (nickname: string) => void
  initializeProfile: (nickname: string) => void
  addPlayer: () => Player
  renamePlayer: (playerId: string, name: string) => RenamePlayerResult
  removePlayer: (playerId: string) => void
  setTurnDuration: (turnDuration: TurnDuration) => void
  setMainDeckCardCount: (mainDeckCardCount: MainDeckCardCount) => void
  setTeamCount: (teamCount: TeamCount) => void
  commitTeamAssignment: (assignment: TeamAssignment) => TeamAssignmentValidation
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
      setAvatar: (avatar) => set({ avatar }),
      setNickname: (nickname) => set({ nickname }),
      initializeProfile: (nickname) => {
        const trimmedNickname = nickname.trim()
        if (!trimmedNickname) return

        const ownerPlayer = createPlayer(trimmedNickname)
        set({
          nickname: trimmedNickname,
          players: [ownerPlayer],
          ownerPlayerId: ownerPlayer.id,
          turnDuration: DEFAULT_TURN_DURATION,
          mainDeckCardCount: DEFAULT_MAIN_DECK_CARD_COUNT,
          teamCount: DEFAULT_TEAM_COUNT,
          teamAssignment: { teams: [] },
        })
      },
      addPlayer: () => {
        const player = createPlayer('')
        set((state) => ({
          players: [...state.players, player],
          teamAssignment: { teams: [] },
        }))
        return player
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
        const nextPlayers = players.map((currentPlayer) =>
          currentPlayer.id === playerId ? player : currentPlayer,
        )
        const assignmentValidation = validateTeamAssignment(
          nextPlayers,
          teamCount,
          teamAssignment,
        )
        set({
          players: nextPlayers,
          teamAssignment:
            assignmentValidation.kind === 'valid'
              ? teamAssignment
              : getBalancedAssignment(nextPlayers, teamCount),
          ...(playerId === ownerPlayerId ? { nickname: trimmedName } : {}),
        })
        return { kind: 'updated', player }
      },
      removePlayer: (playerId) => {
        set((state) => {
          const players = state.players.filter((player) => player.id !== playerId)
          const teamCount = normalizeTeamCount(players.length, state.teamCount)
          return {
            players,
            ownerPlayerId: state.ownerPlayerId === playerId ? null : state.ownerPlayerId,
            teamCount,
            teamAssignment: getBalancedAssignment(players, teamCount),
          }
        })
      },
      setTurnDuration: (turnDuration) => set({ turnDuration }),
      setMainDeckCardCount: (mainDeckCardCount) => set({ mainDeckCardCount }),
      setTeamCount: (teamCount) => {
        const players = get().players
        if (!isValidTeamCount(players.length, teamCount)) return
        set({
          teamCount,
          teamAssignment: getBalancedAssignment(players, teamCount),
        })
      },
      commitTeamAssignment: (assignment) => {
        const { players, teamCount } = get()
        const validation = validateTeamAssignment(players, teamCount, assignment)
        if (validation.kind === 'invalid') return validation
        set({
          teamAssignment: {
            teams: assignment.teams.map((team) => ({
              teamId: team.teamId,
              playerIds: [...team.playerIds],
            })),
          },
        })
        return validation
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
