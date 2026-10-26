# Testing and safe verification

## Current evidence

`package.json` defines `dev`, `build`, `lint`, `preview`, and focused `verify:card-draft` and `verify:gameplay` Node harnesses. It has no general test script, test dependency, or test configuration. `npm run lint` invokes `eslint .` without a fix flag. `npm run build` invokes `tsc -b && vite build` and writes build output to ignored `dist/`.

## Safe check matrix

| Command | Classification |
| --- | --- |
| `npm run lint` | Intended non-fixing static check; inspect the working tree afterward |
| `npx tsc -b --noEmit` | Do not assume valid: build-mode/no-emit compatibility depends on tracked TypeScript config |
| `npm run build` | Type and bundle verification; mutates ignored `dist/` |
| `npm run verify:card-draft` | Deterministic Node harness for catalog/deal integrity, explicit main confirmation, 3/4/5-card lightning exclusion, per-player phase/privacy transitions, setup invalidation, native Players settings radio-card structure, icon-free deck/team typography, legend-to-grid spacing, absence of hover transforms/color shifts, and scoped selected/focus/right-edge-indicator/responsive styles, scoped Button/Input pill tokens, ordinary setup/card-flow control radii, explicit circle icon controls, selection-header source geometry and completion shadow-gutter ownership, and focused card contracts: unchanged 16px faces, borderless base/selected shells, shadow-only selection without selected pseudo-elements, section positioning contexts, true centered values without subtype flow rows, absolute lower-right wrapping subtypes, and muted-label/primary-value keyword colors; not a browser or general test runner |
| `npm run verify:gameplay` | Deterministic Node >=22.18 TypeScript-import harness with behavioral checks for synchronous Zustand commits, finite and ordered event timestamps, inclusive deadline races, Lightning attribution and pause arithmetic, pure timer-clock rebasing, route conceal/resume continuity, configured normal timing and the 10-second Lightning override, exact source decks, rotation, stage resets, completion/winners, and setup/persistence boundaries. Source assertions cover privacy gates, Drawer configuration, timer scheduling guards, reduced-motion branching, separate 180/320ms interaction locks and 180/1800ms visual lifecycles, monotonic outgoing snapshot appends with independent cleanup, chooser handoff timing, gestures, live regions, the three-row active shell with a flexible card region and ordinary-flow bottom actions, the named block-size container and `214px` compact-card geometry, in-flow compact subtypes, bounded below-minimum overflow with the explicit `pan-y` touch policy, card-ID scroll reset before focus, pointer-cancel cleanup, action styles, card layout, and gameplay/Drawer shadow gutters; they do not execute browser behavior. |
| `npm test` | Unavailable; do not invent or report tests |

The gameplay source contract parses the stack-owned `12px` padding and the single active/outgoing `9 / 16` declaration, then applies the inline/block limiting equation to the named size container's inner content box. It evaluates representative 320px-shell, 390px-shell, short-stack, and native-pan-boundary boxes and independently checks border-plus-shadow containment. Container queries and `cqh` units use that content box, so the `469px` compact and `215px` native-pan boundaries correspond to `493px` and `239px` outer stack heights. These are deterministic source calculations, not rendered viewport proof.

For skills and routing, use the sync dry-run and convergence checks documented in `docs/skills.md`. Validate links and metadata structurally.

## Target verification

The gameplay harness behaviorally exercises pure transition and timer-rebase invariants, then inspects focused UI source contracts. It does not prove browser-rendered Drawer mask/Escape/focus behavior, the timer's first painted frame or runtime scheduling, real Pointer Event and overlapping-animation timing, native `pan-y` cancellation/scrolling, the painted scroll-reset frame, screen-reader output, shadow rendering, short-height compact rendering, or viewport layout. Those still require manual or future automated browser checks at 320px, 390px, wider layouts, and outer card-stack heights around and below the `493px`/`240px` compact boundaries.

Report exact commands and observed scope. A passing lint or build does not prove gameplay correctness, accessibility, or responsive behavior.
