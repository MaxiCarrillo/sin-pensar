# Testing and safe verification

## Current evidence

`package.json` defines `dev`, `build`, `lint`, and `preview`. It has no `test` script, no test dependency, and no test configuration. `npm run lint` invokes `eslint .` without a fix flag. `npm run build` invokes `tsc -b && vite build` and writes build output to ignored `dist/`.

## Safe check matrix

| Command | Classification |
| --- | --- |
| `npm run lint` | Intended non-fixing static check; inspect the working tree afterward |
| `npx tsc -b --noEmit` | Do not assume valid: build-mode/no-emit compatibility depends on tracked TypeScript config |
| `npm run build` | Type and bundle verification; mutates ignored `dist/` |
| `npm test` | Unavailable; do not invent or report tests |

For skills and routing, use the sync dry-run and convergence checks documented in `docs/skills.md`. Validate links and metadata structurally.

## Target verification

When gameplay is implemented, prioritize pure transition invariants, invalid actions, strict rotation, timer idempotence, deck exhaustion, roster/team rebalance, persistence migration/recovery, and handoff privacy. For UI work, verify keyboard flow, accessible names, focus visibility, non-color feedback, all visible states, and narrow-view overflow.

Report exact commands and observed scope. A passing lint or build does not prove gameplay correctness, accessibility, or responsive behavior.
