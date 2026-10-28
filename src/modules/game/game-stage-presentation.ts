import type { GameplayStageIndex } from '@/shared/types/gameplay'

export interface GameplayStagePresentation {
  attempts: string
  allowed: string
  forbidden: string
}

export const GAMEPLAY_STAGE_PRESENTATIONS = {
  0: {
    attempts: 'Ilimitados',
    allowed: 'Hablar, actuar, hacer sonidos, señalar, cantar, tararear y más.',
    forbidden: 'Mencionar palabras que haya que adivinar o la palabra clave.',
  },
  1: {
    attempts: 'Un intento por carta y jugador',
    allowed: 'Decir exactamente una palabra y actuar.',
    forbidden:
      'Mencionar palabras que haya que adivinar o la palabra clave; decir más de una palabra; tararear, cantar o hacer sonidos.',
  },
  2: {
    attempts: 'Un intento por carta y jugador',
    allowed: 'Leer únicamente las tres categorías.',
    forbidden: 'Mencionar la palabra clave.',
  },
  3: {
    attempts: 'Un intento por carta y jugador',
    allowed: 'Hacer mímica o actuar sin emitir sonidos.',
    forbidden:
      'Mencionar palabras que haya que adivinar o la palabra clave; hacer cualquier sonido.',
  },
} as const satisfies Record<GameplayStageIndex, GameplayStagePresentation>
