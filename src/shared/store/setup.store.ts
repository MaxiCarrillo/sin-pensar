import { z } from 'zod'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

import {
  SETUP_PROFILE_DEFAULTS,
  setupProfileSchema,
} from '@/shared/schemas/setup-profile.schema'
import type {
  AddPlayerResult,
  AvatarId,
  Player,
  RenamePlayerResult,
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
  setAvatar: (avatar: AvatarId) => void
  setNickname: (nickname: string) => void
  initializeProfile: (nickname: string) => void
  addPlayer: (name: string) => AddPlayerResult
  renamePlayer: (playerId: string, name: string) => RenamePlayerResult
  removePlayer: (playerId: string) => void
}

let playerSequence = 0

function createPlayer(name: string): Player {
  playerSequence += 1
  return { id: `player-${playerSequence}`, name }
}

export const useSetupStore = create<SetupState>()(
  persist(
    (set, get) => ({
      ...SETUP_PROFILE_DEFAULTS,
      players: [],
      ownerPlayerId: null,
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
        })
      },
      addPlayer: (name) => {
        const trimmedName = name.trim()
        if (!trimmedName) return { kind: 'empty' }

        const normalizedName = trimmedName.toLocaleLowerCase('es')
        const duplicate = get().players.some(
          (player) => player.name.toLocaleLowerCase('es') === normalizedName,
        )
        if (duplicate) return { kind: 'duplicate', name: trimmedName }

        const player = createPlayer(trimmedName)
        set((state) => ({ players: [...state.players, player] }))
        return { kind: 'added', player }
      },
      renamePlayer: (playerId, name) => {
        const trimmedName = name.trim()
        if (!trimmedName) return { kind: 'empty' }

        const { ownerPlayerId, players } = get()
        const playerIndex = players.findIndex((player) => player.id === playerId)
        if (playerIndex < 0) return { kind: 'missing' }

        const normalizedName = trimmedName.toLocaleLowerCase('es')
        const duplicate = players.some(
          (player) =>
            player.id !== playerId &&
            player.name.toLocaleLowerCase('es') === normalizedName,
        )
        if (duplicate) return { kind: 'duplicate', name: trimmedName }

        const player = { ...players[playerIndex], name: trimmedName }
        set({
          players: players.map((currentPlayer) =>
            currentPlayer.id === playerId ? player : currentPlayer,
          ),
          ...(playerId === ownerPlayerId ? { nickname: trimmedName } : {}),
        })
        return { kind: 'updated', player }
      },
      removePlayer: (playerId) => {
        set((state) => ({
          players: state.players.filter((player) => player.id !== playerId),
          ownerPlayerId: state.ownerPlayerId === playerId ? null : state.ownerPlayerId,
        }))
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
