import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  createHelpSteps,
  HELP_STEP_DEFINITIONS,
} from '../src/modules/players/components/help-drawer/help-drawer-content.ts'
import { CARD_DEAL_SIZE } from '../src/shared/constants/card-draft.ts'

function getStepText(step) {
  return [
    step.title,
    step.introduction,
    ...step.sections.flatMap((section) => [section.label, section.text, ...(section.items ?? [])]),
  ]
    .filter(Boolean)
    .join(' ')
}

const steps = createHelpSteps(4, CARD_DEAL_SIZE)
assert.equal(steps.length, 9)
assert.equal(HELP_STEP_DEFINITIONS.length, steps.length)
assert.deepEqual(
  steps.map((step) => step.title),
  [
    'Objetivo',
    'Elegir categoría',
    'Equipos',
    'Mazos',
    'Ronda 1',
    'Ronda 2',
    'Relámpago',
    'Ronda 3',
    'Resumen',
  ],
)
assert.equal(new Set(steps.map((step) => step.id)).size, steps.length)

const criticalContracts = [
  [0, /mayor cantidad de tarjetas.*rápido.*equipos.*puntos/i],
  [1, /fuera de la app.*no elige ni controla.*Títulos/i],
  [2, /jugadores.*equipos.*equilibrada.*azar.*Quitá.*asignala.*completa y equilibrada/i],
  [3, /10 tarjetas.*privado.*Principal.*4 de las 10.*Relámpago.*1 tarjeta distinta.*Privacidad/i],
  [4, /Todo vale.*Ilimitados.*hablar.*actuar.*sonidos.*palabra clave/i],
  [5, /Una palabra y actuación.*Uno por tarjeta y jugador.*regla de mesa.*no cuenta los intentos.*exactamente una palabra.*más de una palabra.*sonidos/i],
  [6, /Tres categorías.*Uno por tarjeta y jugador.*Juegan todos.*controla el dispositivo.*elige quién respondió.*punto.*equipo.*únicamente las tres categorías.*palabra clave.*mazo Relámpago.*siempre 10 segundos.*configuración/i],
  [7, /Mímica sin sonido.*Uno por tarjeta y jugador.*mímica.*ningún sonido/i],
  [8, /equipos.*categoría.*Principal y Relámpago.*Ronda 1.*Ronda 2.*Relámpago.*Ronda 3/i],
]
for (const [index, contract] of criticalContracts) assert.match(getStepText(steps[index]), contract)

assert.match(getStepText(createHelpSteps(3, CARD_DEAL_SIZE)[3]), /3 de las 10/)
assert.match(getStepText(createHelpSteps(5, CARD_DEAL_SIZE)[3]), /5 de las 10/)

const helpDrawerSource = await readFile(
  new URL('../src/modules/players/components/help-drawer/help-drawer.tsx', import.meta.url),
  'utf8',
)
const helpDrawerStyles = await readFile(
  new URL('../src/modules/players/components/help-drawer/help-drawer.module.css', import.meta.url),
  'utf8',
)
const playersPageSource = await readFile(
  new URL('../src/modules/players/players.page.tsx', import.meta.url),
  'utf8',
)
const appDrawerSource = await readFile(
  new URL('../src/modules/common/components/app-drawer/app-drawer.tsx', import.meta.url),
  'utf8',
)

for (const contract of [
  /<Carousel/,
  /dots=\{false\}/,
  /infinite=\{false\}/,
  /speed=\{prefersReducedMotion \? 0 : 300\}/,
  /afterChange=\{setCurrentStep\}/,
  /createHelpSteps\(mainDeckCardCount, CARD_DEAL_SIZE\)/,
  /carouselRef\.current\?\.prev\(\)/,
  /carouselRef\.current\?\.next\(\)/,
  /const handleClose = \(\) => \{[\s\S]*goTo\(0, true\)[\s\S]*setCurrentStep\(0\)[\s\S]*onClose\(\)/,
  /role="group"/,
  /aria-roledescription="diapositiva"/,
  /aria-label=\{`Paso \$\{index \+ 1\} de \$\{total\}: \$\{step\.title\}`\}/,
  /tabIndex=\{isCurrent \? 0 : -1\}/,
  /isCurrent=\{index === currentStep\}/,
  /aria-live="polite"/,
  /aria-current=\{index === currentStep \? 'step' : undefined\}/,
  /steps\.map\(\(step, index\) => \([\s\S]*<HelpSlide/,
  />\s*Anterior\s*</,
  /isLastStep \? 'Entendido' : 'Siguiente'/,
  /title="Ayuda"/,
  /contentClassName=\{styles\.drawerContent\}/,
  /size="min\(42rem, 90dvh\)"/,
]) {
  assert.match(helpDrawerSource, contract)
}
assert.match(playersPageSource, /<HelpDrawer[\s\S]*mainDeckCardCount=\{mainDeckCardCount\}/)
assert.doesNotMatch(playersPageSource, /instrucciones detalladas se agregarán/)
assert.match(appDrawerSource, /size\?: DrawerProps\['size'\]/)
assert.match(appDrawerSource, /size=\{size\}/)
assert.doesNotMatch(appDrawerSource, /DrawerProps\['height'\]|height=\{height\}/)

for (const contract of [
  /\.drawerContent\s*\{[\s\S]*height:\s*100%;[\s\S]*grid-template-rows:\s*auto minmax\(0, 1fr\);/,
  /grid-template-rows:\s*auto minmax\(0, 1fr\) auto;/,
  /grid-template-columns:\s*repeat\(9, minmax\(0, 1fr\)\);/,
  /\.slide\s*\{[\s\S]*overflow-x:\s*hidden;[\s\S]*overflow-y:\s*auto;/,
  /\.slide:focus-visible\s*\{[\s\S]*outline:\s*3px solid var\(--color-focus\);/,
  /\.actions button\s*\{[\s\S]*min-height:\s*48px;/,
  /@media \(max-width: 350px\)/,
  /@media \(prefers-reduced-motion: reduce\)/,
]) {
  assert.match(helpDrawerStyles, contract)
}

console.log(
  'Help verification passed: 9-step content, runtime deck quota, Lightning attribution and honor rules, Carousel navigation/reset, current-slide keyboard focus, semantic progress, fixed actions, reduced motion, and narrow-layout source contracts are valid. Browser rendering and assistive-technology behavior remain manual checks.',
)
