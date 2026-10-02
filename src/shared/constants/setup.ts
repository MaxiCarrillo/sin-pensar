import { avatarIds } from '@/assets/avatars'

export const AVATAR_OPTIONS = avatarIds.map((id, index) => ({
  id,
  label: `Avatar ${index + 1}`,
}))

export const MAX_NAME_LENGTH = 16
export const MIN_PLAYERS = 4
export const MIN_PLAYERS_PER_TEAM = 2

export const TURN_DURATION_OPTIONS = [
  { value: 30, label: '30 s' },
  { value: 45, label: '45 s' },
  { value: 60, label: '60 s' },
] as const

export const MAIN_DECK_CARD_OPTIONS = [
  { value: 3, label: '3 de 10' },
  { value: 4, label: '4 de 10' },
  { value: 5, label: '5 de 10' },
] as const

export type TurnDuration = (typeof TURN_DURATION_OPTIONS)[number]['value']
export type MainDeckCardCount = (typeof MAIN_DECK_CARD_OPTIONS)[number]['value']

export const DEFAULT_TURN_DURATION: TurnDuration = 45
export const DEFAULT_MAIN_DECK_CARD_COUNT: MainDeckCardCount = 4
export const DEFAULT_TEAM_COUNT = 2

export function isTurnDuration(value: unknown): value is TurnDuration {
  return TURN_DURATION_OPTIONS.some((option) => option.value === value)
}

export function isMainDeckCardCount(value: unknown): value is MainDeckCardCount {
  return MAIN_DECK_CARD_OPTIONS.some((option) => option.value === value)
}
