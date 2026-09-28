import { create } from 'zustand'

import type { AddPlayerResult, AvatarId, Player } from '@/shared/types/setup'

interface SetupState {
  avatar: AvatarId
  nickname: string
  players: Player[]
  setAvatar: (avatar: AvatarId) => void
  initializeProfile: (nickname: string) => void
  addPlayer: (name: string) => AddPlayerResult
  removePlayer: (playerId: string) => void
}

let playerSequence = 0

function createPlayer(name: string): Player {
  playerSequence += 1
  return { id: `player-${playerSequence}`, name }
}

export const useSetupStore = create<SetupState>()((set, get) => ({
  avatar: 'spark',
  nickname: '',
  players: [],
  setAvatar: (avatar) => set({ avatar }),
  initializeProfile: (nickname) => {
    const trimmedNickname = nickname.trim()
    if (!trimmedNickname) return

    set({
      nickname: trimmedNickname,
      players: [createPlayer(trimmedNickname)],
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
  removePlayer: (playerId) => {
    set((state) => ({
      players: state.players.filter((player) => player.id !== playerId),
    }))
  },
}))
