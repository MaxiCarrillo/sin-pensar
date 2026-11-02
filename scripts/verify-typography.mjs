import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const [html, css, theme] = await Promise.all(
  ['../index.html', '../src/index.css', '../src/core/theme/theme.ts'].map((path) =>
    readFile(new URL(path, import.meta.url), 'utf8'),
  ),
)

assert.match(html, /rel="preconnect" href="https:\/\/fonts\.googleapis\.com"/)
assert.match(html, /rel="preconnect" href="https:\/\/fonts\.gstatic\.com" crossorigin/)
assert.match(html, /family=Nunito:wght@400;500;700;800&amp;display=swap/)
assert.doesNotMatch(html, /Be\+Vietnam\+Pro|Manrope/)
assert.match(css, /--font-family:\s*'Nunito',\s*system-ui,\s*sans-serif/)
assert.match(css, /@supports\s*\(-webkit-touch-callout:\s*none\)\s*and\s*\(font-family:\s*ui-rounded\)[\s\S]*?@media\s*\(pointer:\s*coarse\)[\s\S]*?--font-family:\s*ui-rounded,\s*'Nunito',\s*system-ui,\s*sans-serif/)
assert.match(css, /button,\s*input,\s*select,\s*textarea\s*\{\s*font:\s*inherit/)
assert.match(theme, /fontFamily:\s*'var\(--font-family\)'/)

console.log('Typography source contracts passed')
