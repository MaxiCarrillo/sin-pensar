import type { AVATAR_OPTIONS } from '@/shared/constants/setup'

export type AvatarId = (typeof AVATAR_OPTIONS)[number]['id']

export interface Player {
  id: string
  name: string
}

export type AddPlayerResult =
  | { kind: 'added'; player: Player }
  | { kind: 'empty' }
  | { kind: 'duplicate'; name: string }

export type RenamePlayerResult =
  | { kind: 'updated'; player: Player }
  | { kind: 'empty' }
  | { kind: 'duplicate'; name: string }
  | { kind: 'missing' }
