import type { MainDeckCardCount } from '@/shared/constants/setup'

interface HelpCopyContext {
  cardDealSize: number
  mainDeckCardCount: MainDeckCardCount
}

type HelpCopy = string | ((context: HelpCopyContext) => string)

interface HelpStepSectionDefinition {
  label?: string
  items?: readonly HelpCopy[]
  text?: HelpCopy
}

interface HelpStepDefinition {
  id: string
  title: string
  introduction: HelpCopy
  sections: readonly HelpStepSectionDefinition[]
}

export interface HelpStepSection {
  label?: string
  items?: readonly string[]
  text?: string
}

export interface HelpStep {
  id: string
  title: string
  introduction: string
  sections: readonly HelpStepSection[]
}

export const HELP_STEP_DEFINITIONS = [
  {
    id: 'objective',
    title: 'Objetivo',
    introduction: 'Adivinar la mayor cantidad de tarjetas lo más rápido posible.',
    sections: [
      {
        text: 'Los equipos compiten para sumar puntos. Cada tarjeta acertada vale un punto.',
      },
    ],
  },
  {
    id: 'category',
    title: 'Elegir categoría',
    introduction: 'Antes de empezar, acuerden una categoría entre todos fuera de la app.',
    sections: [
      {
        text: 'La app no elige ni controla la categoría: el acuerdo es parte del juego.',
      },
      { label: 'Ejemplo', text: '“Juguemos con la categoría de Títulos.”' },
    ],
  },
  {
    id: 'teams',
    title: 'Equipos',
    introduction: 'Agregá a todos los jugadores y elegí una cantidad de equipos disponible.',
    sections: [
      {
        label: 'Distribución',
        items: [
          'La app arma una distribución inicial equilibrada.',
          'Desde la lista de jugadores, podés volver a sortear los equipos al azar.',
        ],
      },
      {
        label: 'Ajustes manuales',
        text: 'Quitá a una persona de su equipo y asignala a otro con lugar. Para elegir cartas, la distribución debe quedar completa y equilibrada.',
      },
    ],
  },
  {
    id: 'decks',
    title: 'Mazos',
    introduction: ({ cardDealSize }) =>
      `Cada persona recibe ${cardDealSize} tarjetas y hace su selección en privado.`,
    sections: [
      {
        label: 'Mazo Principal',
        text: ({ cardDealSize, mainDeckCardCount }) =>
          `Elegí ${mainDeckCardCount} de las ${cardDealSize} tarjetas recibidas.`,
      },
      {
        label: 'Mazo Relámpago',
        text: 'Elegí 1 tarjeta distinta entre las que quedan.',
      },
      {
        label: 'Privacidad',
        text: 'Pasen el dispositivo de a una persona por vez. La app oculta las tarjetas antes de cada entrega.',
      },
    ],
  },
  {
    id: 'round-one',
    title: 'Ronda 1',
    introduction: 'Todo vale',
    sections: [
      { label: 'Intentos', text: 'Ilimitados.' },
      {
        label: 'Podés',
        text: 'Hablar, actuar, hacer sonidos, señalar, cantar, tararear y más.',
      },
      {
        label: 'No podés',
        text: 'Decir las palabras que hay que adivinar ni la palabra clave.',
      },
    ],
  },
  {
    id: 'round-two',
    title: 'Ronda 2',
    introduction: 'Una palabra y actuación',
    sections: [
      {
        label: 'Intentos',
        text: 'Uno por tarjeta y jugador. Es una regla de mesa: la app no cuenta los intentos de cada persona.',
      },
      { label: 'Podés', text: 'Decir exactamente una palabra y actuar.' },
      {
        label: 'No podés',
        items: [
          'Decir las palabras que hay que adivinar ni la palabra clave.',
          'Decir más de una palabra.',
          'Tararear, cantar o hacer sonidos.',
        ],
      },
    ],
  },
  {
    id: 'lightning',
    title: 'Relámpago',
    introduction: 'Tres categorías',
    sections: [
      { label: 'Intentos', text: 'Uno por tarjeta y jugador.' },
      {
        label: 'Juegan todos',
        text: 'Después de cada acierto, quien controla el dispositivo elige quién respondió. El punto va al equipo de esa persona.',
      },
      { label: 'Podés', text: 'Leer únicamente las tres categorías.' },
      { label: 'No podés', text: 'Decir la palabra clave.' },
      {
        label: 'Mazo y turno',
        text: 'Se juega con el mazo Relámpago separado. Cada turno dura siempre 10 segundos, sin importar la configuración.',
      },
    ],
  },
  {
    id: 'round-three',
    title: 'Ronda 3',
    introduction: 'Mímica sin sonido',
    sections: [
      { label: 'Intentos', text: 'Uno por tarjeta y jugador.' },
      { label: 'Podés', text: 'Hacer mímica o actuar en silencio.' },
      {
        label: 'No podés',
        text: 'Decir las palabras que hay que adivinar ni la palabra clave, ni hacer ningún sonido.',
      },
    ],
  },
  {
    id: 'summary',
    title: 'Resumen',
    introduction: 'Adivinen la mayor cantidad de tarjetas lo más rápido posible para sumar puntos.',
    sections: [
      {
        items: [
          'Armen los equipos.',
          'Acuerden una categoría fuera de la app.',
          'Armen los mazos Principal y Relámpago.',
          'Jueguen Ronda 1 → Ronda 2 → Relámpago → Ronda 3.',
        ],
      },
    ],
  },
] as const satisfies readonly HelpStepDefinition[]

function resolveCopy(copy: HelpCopy, context: HelpCopyContext) {
  return typeof copy === 'function' ? copy(context) : copy
}

export function createHelpSteps(
  mainDeckCardCount: MainDeckCardCount,
  cardDealSize: number,
): readonly HelpStep[] {
  const context = { cardDealSize, mainDeckCardCount }

  return HELP_STEP_DEFINITIONS.map((step) => ({
    id: step.id,
    title: step.title,
    introduction: resolveCopy(step.introduction, context),
    sections: step.sections.map((section) => ({
      label: 'label' in section ? section.label : undefined,
      text: 'text' in section ? resolveCopy(section.text, context) : undefined,
      items:
        'items' in section
          ? section.items.map((item) => resolveCopy(item, context))
          : undefined,
    })),
  }))
}
