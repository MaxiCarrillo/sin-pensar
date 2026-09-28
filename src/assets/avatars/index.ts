import avatar1 from './avatar-1.webp'
import avatar2 from './avatar-2.webp'
import avatar3 from './avatar-3.webp'
import avatar4 from './avatar-4.webp'
import avatar5 from './avatar-5.webp'
import avatar6 from './avatar-6.webp'
import avatar7 from './avatar-7.webp'
import avatar8 from './avatar-8.webp'
import avatar9 from './avatar-9.webp'

export { avatar1, avatar2, avatar3, avatar4, avatar5, avatar6, avatar7, avatar8, avatar9 }

export const avatarMap = {
  'avatar-1': avatar1,
  'avatar-2': avatar2,
  'avatar-3': avatar3,
  'avatar-4': avatar4,
  'avatar-5': avatar5,
  'avatar-6': avatar6,
  'avatar-7': avatar7,
  'avatar-8': avatar8,
  'avatar-9': avatar9,
} as const

export type AvatarId = keyof typeof avatarMap

export const avatarIds = Object.keys(avatarMap) as [AvatarId, ...AvatarId[]]
