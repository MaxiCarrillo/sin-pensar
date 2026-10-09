# Testing and safe verification

## Current evidence

`package.json` defines `dev`, `build`, `lint`, `preview`, and focused `verify:card-draft` and `verify:gameplay` Node harnesses. It has no general test script, test dependency, or test configuration. `npm run lint` invokes `eslint .` without a fix flag. `npm run build` invokes `tsc -b && vite build` and writes build output to ignored `dist/`.

## Safe check matrix

| Command | Classification |
| --- | --- |
| `npm run lint` | Intended non-fixing static check; inspect the working tree afterward |
| `npx tsc -b --noEmit` | Do not assume valid: build-mode/no-emit compatibility depends on tracked TypeScript config |
| `npm run build` | Type and bundle verification; mutates ignored `dist/` |
| `npm run verify:card-draft` | Deterministic Node harness for catalog/deal integrity, explicit main confirmation, 3/4/5-card lightning exclusion, per-player phase/privacy transitions, setup invalidation, scoped Button/Input pill tokens, ordinary setup/card-flow control radii, explicit circle icon controls, and focused card contracts: unchanged 16px faces, borderless base/selected shells, shadow-only selection without selected pseudo-elements, section positioning contexts, true centered values without subtype flow rows, absolute lower-right wrapping subtypes, and muted-label/primary-value keyword colors; not a browser or general test runner |
| `npm run verify:gameplay` | Deterministic Node >=22.18 TypeScript-import harness for synchronous Zustand decision commits, inert outgoing-overlay structure and shared face contents, inclusive deadline races, behavioral route conceal/resume continuity, fresh next turns, 30/45/60-second timing, draft quota compatibility, keyboard-repeat guards, behavioral profile identity reset ordering, exact source decks, rotation, stage resets, completion/winners, privacy/source structure, gesture mapping, pill gameplay actions, unchanged 16px card faces, section positioning contexts, true centered values without subtype flow rows, absolute lower-right wrapping subtypes, muted-label/primary-value keyword colors, shared borderless card tokens, timer color wiring, and persistence boundaries; not a browser runner |
| `npm test` | Unavailable; do not invent or report tests |

For skills and routing, use the sync dry-run and convergence checks documented in `docs/skills.md`. Validate links and metadata structurally.

## Target verification

The gameplay harness behaviorally exercises pure transition invariants and focused source contracts. It does not prove real-browser Pointer Event behavior, timer throttling, focus order, screen-reader output, or viewport rendering. Those still require manual or future automated browser checks at 320px, 390px, and wider layouts.

Report exact commands and observed scope. A passing lint or build does not prove gameplay correctness, accessibility, or responsive behavior.
