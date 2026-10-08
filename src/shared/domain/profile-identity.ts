import type {
  MainDeckCardCount,
  Player,
  TeamAssignment,
  TeamCount,
  TurnDuration,
} from '../types/setup.ts'

export interface ProfileIdentityState {
  nickname: string
  players: Player[]
  ownerPlayerId: string
  turnDuration: TurnDuration
  mainDeckCardCount: MainDeckCardCount
  teamCount: TeamCount
  teamAssignment: TeamAssignment
  cardDraft: null
}

export interface ProfileIdentityDefaults {
  turnDuration: TurnDuration
  mainDeckCardCount: MainDeckCardCount
  teamCount: TeamCount
}

export function createProfileIdentityState(
  nickname: string,
  ownerPlayer: Player,
  defaults: ProfileIdentityDefaults,
): ProfileIdentityState | null {
  const trimmedNickname = nickname.trim()
  if (!trimmedNickname || !ownerPlayer.id.trim()) return null

  return {
    nickname: trimmedNickname,
    players: [{ ...ownerPlayer, name: trimmedNickname }],
    ownerPlayerId: ownerPlayer.id,
    turnDuration: defaults.turnDuration,
    mainDeckCardCount: defaults.mainDeckCardCount,
    teamCount: defaults.teamCount,
    teamAssignment: { teams: [] },
    cardDraft: null,
  }
}
