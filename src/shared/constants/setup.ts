import { avatarIds } from '@/assets/avatars'

export const AVATAR_OPTIONS = avatarIds.map((id, index) => ({
  id,
  label: `Avatar ${index + 1}`,
}))

export const MAX_NAME_LENGTH = 16
export const MIN_PLAYERS = 4
