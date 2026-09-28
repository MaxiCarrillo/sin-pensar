import { z } from 'zod'

import { AVATAR_OPTIONS, MAX_NAME_LENGTH } from '@/shared/constants/setup'

export const setupProfileSchema = z.strictObject({
  nickname: z.string().max(MAX_NAME_LENGTH),
  avatar: z.enum(AVATAR_OPTIONS.map((option) => option.id)),
})

export type SetupProfile = z.infer<typeof setupProfileSchema>

export const SETUP_PROFILE_DEFAULTS = {
  nickname: '',
  avatar: 'spark',
} satisfies SetupProfile
