# Testing and safe verification

## Current evidence

`package.json` defines `dev`, `build`, `lint`, `preview`, and focused `verify:card-draft` and `verify:gameplay` Node harnesses. It has no general test script, test dependency, or test configuration. `npm run lint` invokes `eslint .` without a fix flag. `npm run build` invokes `tsc -b && vite build` and writes build output to ignored `dist/`.

## Safe check matrix

| Command | Classification |
| --- | --- |
| `npm run lint` | Intended non-fixing static check; inspect the working tree afterward |
| `npx tsc -b --noEmit` | Do not assume valid: build-mode/no-emit compatibility depends on tracked TypeScript config |
| `npm run build` | Type and bundle verification; mutates ignored `dist/` |
| `npm run verify:card-draft` | Deterministic Node harness for catalog/deal integrity, explicit main confirmation, 3/4/5-card lightning exclusion, per-player phase/privacy transitions, setup invalidation, native Players settings radio-card structure, icon-free deck/team typography, legend-to-grid spacing, absence of hover transforms/color shifts, and scoped selected/focus/right-edge-indicator/responsive styles, scoped Button/Input pill tokens, ordinary setup/card-flow control radii, explicit circle icon controls, and focused card contracts: unchanged 16px faces, borderless base/selected shells, shadow-only selection without selected pseudo-elements, section positioning contexts, true centered values without subtype flow rows, absolute lower-right wrapping subtypes, and muted-label/primary-value keyword colors; not a browser or general test runner |
| `npm run verify:gameplay` | Deterministic Node >=22.18 TypeScript-import harness with behavioral checks for synchronous Zustand commits, finite and ordered event timestamps, inclusive deadline races, Lightning attribution and pause arithmetic, pure timer-clock rebasing, route conceal/resume continuity, configured normal timing and the 10-second Lightning override, exact source decks, rotation, stage resets, completion/winners, and setup/persistence boundaries. Source assertions cover privacy gates, Drawer configuration, timer scheduling guards, reduced-motion branching, gestures, live regions, action styles, and card layout; they do not execute browser behavior. |
| `npm test` | Unavailable; do not invent or report tests |

For skills and routing, use the sync dry-run and convergence checks documented in `docs/skills.md`. Validate links and metadata structurally.

## Target verification

The gameplay harness behaviorally exercises pure transition and timer-rebase invariants, then inspects focused UI source contracts. It does not prove browser-rendered Drawer mask/Escape/focus behavior, the timer's first painted frame or runtime scheduling, real Pointer Event and animation timing, screen-reader output, or viewport rendering. Those still require manual or future automated browser checks at 320px, 390px, and wider layouts.

Report exact commands and observed scope. A passing lint or build does not prove gameplay correctness, accessibility, or responsive behavior.
