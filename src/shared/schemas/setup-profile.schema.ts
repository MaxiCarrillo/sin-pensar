import { z } from 'zod'

import { avatarIds } from '@/assets/avatars'
import { MAX_NAME_LENGTH } from '@/shared/constants/setup'

export const setupProfileSchema = z.strictObject({
  nickname: z.string().max(MAX_NAME_LENGTH),
  avatar: z.enum(avatarIds),
})

export type SetupProfile = z.infer<typeof setupProfileSchema>

export const SETUP_PROFILE_DEFAULTS = {
  nickname: '',
  avatar: 'avatar-1',
} satisfies SetupProfile
