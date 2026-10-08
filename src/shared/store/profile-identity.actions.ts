import {
  createProfileIdentityState,
  type ProfileIdentityDefaults,
  type ProfileIdentityState,
} from '../domain/profile-identity.ts'
import type { Player } from '../types/setup.ts'

export interface ProfileIdentityReplacementInput {
  nickname: string
  ownerPlayer: Player
  defaults: ProfileIdentityDefaults
}

export interface ProfileIdentityReplacementActions {
  resetGameplay: () => void
  replaceSetup: (state: ProfileIdentityState) => void
}

export function replaceProfileIdentity(
  input: ProfileIdentityReplacementInput,
  actions: ProfileIdentityReplacementActions,
) {
  const state = createProfileIdentityState(
    input.nickname,
    input.ownerPlayer,
    input.defaults,
  )
  if (!state) return null

  actions.resetGameplay()
  actions.replaceSetup(state)
  return state
}
