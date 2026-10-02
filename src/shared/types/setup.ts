export type { AvatarId } from '@/assets/avatars'
export type { MainDeckCardCount, TurnDuration } from '@/shared/constants/setup'

export type TeamCount = number
export type TeamId = `team-${number}`

export interface Player {
  id: string
  name: string
}

export interface TeamMembership {
  teamId: TeamId
  playerIds: string[]
}

export interface TeamAssignment {
  teams: TeamMembership[]
}

export type AddPlayerResult =
  | { kind: 'added'; player: Player }
  | { kind: 'limit-reached' }

export type RenamePlayerResult =
  | { kind: 'updated'; player: Player }
  | { kind: 'empty' }
  | { kind: 'duplicate'; name: string }
  | { kind: 'missing' }
