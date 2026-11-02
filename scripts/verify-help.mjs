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
assert.equal(new Set(steps.map((step) => step.icon)).size, steps.length)
assert.deepEqual(
  steps.map((step) => step.accent),
  ['primary', 'primary', 'primary', 'primary', 'primary', 'tertiary', 'primary', 'secondary', 'primary'],
)

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
const css = helpDrawerStyles.replace(/\/\*[\s\S]*?\*\//g, '')
const playersPageSource = await readFile(
  new URL('../src/modules/players/players.page.tsx', import.meta.url),
  'utf8',
)
const appDrawerSource = await readFile(
  new URL('../src/modules/common/components/app-drawer/app-drawer.tsx', import.meta.url),
  'utf8',
)

assert.match(helpDrawerSource, /import\s*\{[^}]*\bCarousel\b[^}]*\}\s*from 'antd'/s)
const carouselOpeningTag = helpDrawerSource.match(/<Carousel\b[\s\S]*?>/)?.[0]
assert.ok(carouselOpeningTag, 'Help must render the Ant Design Carousel')
assert.match(carouselOpeningTag, /\barrows(?:\s|=)/)
assert.match(carouselOpeningTag, /\binfinite=\{false\}/)
assert.match(carouselOpeningTag, /\bclassName=\{styles\.carousel\}/)
assert.match(carouselOpeningTag, /\brootClassName=\{styles\.carouselRoot\}/)
assert.doesNotMatch(carouselOpeningTag, /\bdots=/)
assert.match(helpDrawerSource, /const \{ token \} = theme\.useToken\(\)/)
assert.match(
  helpDrawerSource,
  /components:\s*\{\s*Carousel:\s*\{\s*colorBgContainer:\s*token\.colorPrimary\s*\}\s*\}/,
)
assert.match(helpDrawerSource, /<ConfigProvider theme=\{carouselTheme\}>[\s\S]*<Carousel/)

for (const contract of [
  /speed=\{prefersReducedMotion \? 0 : 300\}/,
  /afterChange=\{setCurrentStep\}/,
  /createHelpSteps\(mainDeckCardCount, CARD_DEAL_SIZE\)/,
  /const handleClose = \(\) => \{[\s\S]*goTo\(0, true\)[\s\S]*setCurrentStep\(0\)[\s\S]*onClose\(\)/,
  /role="group"/,
  /aria-roledescription="diapositiva"/,
  /aria-label=\{`Paso \$\{index \+ 1\} de \$\{total\}: \$\{step\.title\}`\}/,
  /tabIndex=\{isCurrent \? 0 : -1\}/,
  /isCurrent=\{index === currentStep\}/,
  /data-accent=\{step\.accent\}/,
  /const StepIcon = HELP_ICONS\[step\.icon\]/,
  /<div className=\{styles\.slideContent\}>\s*<hgroup className=\{styles\.slideHeader\}>[\s\S]*?<\/hgroup>\s*<div className=\{styles\.visual\} aria-hidden="true">[\s\S]*?<\/div>\s*<div className=\{styles\.sections\}>/,
  /steps\.map\(\(step, index\) => \([\s\S]*<HelpSlide/,
  /title="Ayuda"/,
  /visuallyHiddenTitle/,
  /contentClassName=\{styles\.drawerContent\}/,
  /size="min\(42rem, 90dvh\)"/,
]) {
  assert.match(helpDrawerSource, contract)
}
for (const removedContract of [
  /\bdots=/,
  /<Button/,
  /carouselRef\.current\?\.(?:prev|next)\(\)/,
  />\s*(?:Anterior|Siguiente|Entendido)\s*</,
  /aria-live=/,
  /aria-current=/,
  /stepIndicator/,
  /Paso \{currentStep \+ 1\} de/,
  /Aprendé a preparar la partida y qué cambia en cada ronda\./,
]) {
  assert.doesNotMatch(helpDrawerSource, removedContract)
}
assert.match(playersPageSource, /<HelpDrawer[\s\S]*mainDeckCardCount=\{mainDeckCardCount\}/)
assert.doesNotMatch(playersPageSource, /instrucciones detalladas se agregarán/)
assert.match(appDrawerSource, /size\?: DrawerProps\['size'\]/)
assert.match(appDrawerSource, /size=\{size\}/)
assert.match(appDrawerSource, /visuallyHiddenTitle\?: boolean/)
assert.match(appDrawerSource, /aria-labelledby=\{titleId\}/)
assert.match(
  appDrawerSource,
  /visuallyHiddenTitle \? \([\s\S]*<h2 className="visually-hidden" id=\{titleId\}>[\s\S]*\{title\}[\s\S]*<\/h2>/,
)
assert.doesNotMatch(appDrawerSource, /DrawerProps\['height'\]|height=\{height\}/)

for (const contract of [
  /\.drawerContent\s*\{[\s\S]*height:\s*100%;[\s\S]*grid-template-rows:\s*minmax\(0, 1fr\);/,
  /\.helpLayout\s*\{[\s\S]*padding-bottom:\s*max\(var\(--space-xs\), env\(safe-area-inset-bottom\)\);/,
  /\.carouselRoot,\s*\.carousel\s*\{\s*height:\s*100%;\s*min-height:\s*0;\s*\}/,
  /\.carousel :global\(\.slick-track\),\s*\.carousel :global\(\.slick-slide\),\s*\.carousel :global\(\.slick-slide > div\)\s*\{\s*height:\s*100%;\s*min-height:\s*0;\s*\}/,
  /\.carousel :global\(\.slick-list\)\s*\{\s*height:\s*calc\(100% - var\(--space-lg\)\);\s*min-height:\s*0;\s*\}/,
  /\.slide\s*\{[^}]*display:\s*block\s*!important;[^}]*height:\s*100%;[^}]*min-height:\s*0;[^}]*overflow-x:\s*hidden;[^}]*overflow-y:\s*auto;[^}]*overscroll-behavior-y:\s*contain;/,
  /\.slideContent\s*\{[^}]*justify-items:\s*center;[^}]*align-content:\s*start;[^}]*padding:\s*var\(--space-xs\) var\(--space-lg\);/,
  /\.slide:focus-visible\s*\{[\s\S]*outline:\s*3px solid var\(--color-focus\);/,
  /\.slideHeader\s*\{[\s\S]*max-width:\s*19rem;[\s\S]*margin:\s*0 auto var\(--space-md\);[\s\S]*text-align:\s*center;/,
  /\.slideHeader h3\s*\{[\s\S]*font-size:\s*var\(--font-size-lg\);[\s\S]*font-weight:\s*var\(--font-weight-bold\);/,
  /\.slideHeader p\s*\{[^}]*color:\s*var\(--color-primary-dark\);[^}]*font-size:\s*14px;[^}]*font-weight:\s*var\(--font-weight-regular\);[^}]*line-height:\s*1\.5;[^}]*text-align:\s*center;/,
  /\.visual\s*\{[\s\S]*color:\s*var\(--help-accent-strong\);/,
  /\.sections\s*\{[^}]*text-align:\s*left;[^}]*border:\s*1px solid var\(--color-border\);/,
  /@media \(max-width: 350px\)/,
  /@media \(max-height: 650px\)/,
  /@media \(prefers-reduced-motion: reduce\)/,
]) {
  assert.match(css, contract)
}
assert.doesNotMatch(helpDrawerStyles, /\.slideHeader h3\s*\{[^}]*line-height:/)
assert.doesNotMatch(helpDrawerStyles, /\.slideHeader\s*\{[^}]*\bgap\s*:/)
assert.doesNotMatch(helpDrawerStyles, /\.(?:sections|slideContent)\s*\{[^}]*\boutline\s*:/)
assert.doesNotMatch(helpDrawerStyles, /\.slideContent\s*\{[^}]*overflow-[xy]\s*:/)
assert.doesNotMatch(helpDrawerStyles, /outline:\s*1px solid red/i)
assert.equal(
  (helpDrawerStyles.match(/overflow-y:\s*auto;/g) ?? []).length,
  1,
  'Only the keyboard-focusable slide may own vertical scrolling',
)
const carouselControlColorRule = helpDrawerStyles.match(
  /\.carousel :global\(\.slick-prev\),\s*\.carousel :global\(\.slick-next\)\s*\{\s*color:\s*var\(--color-primary\);\s*\}/,
)?.[0]
assert.ok(carouselControlColorRule, 'Only the native arrow color may be overridden in CSS')
assert.doesNotMatch(
  helpDrawerStyles.replace(carouselControlColorRule, ''),
  /:global\(\.slick-(?:arrow|disabled|dots|next|prev)/,
)
for (const removedStyle of [/\.progress\s*\{/, /\.stepIndicator/, /\.actions\s*\{/]) {
  assert.doesNotMatch(helpDrawerStyles, removedStyle)
}

console.log(
  'Help verification passed: content and source contracts include centered slide headings, bounded Slick sizing, reserved dot clearance, top-aligned content, left-aligned section text, native controls, focus, and reduced motion. Browser rendering and assistive-technology behavior remain manual checks.',
)
