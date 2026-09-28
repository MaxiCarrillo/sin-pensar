---
name: "sin-pensar-verification"
description: "Trigger: verify, test, lint, build, coverage. Select safe checks from the actual Sin Pensar frontend configuration."
license: "Apache-2.0"
metadata:
  author: "maxdev"
  version: "1.0.0"
  scope: "root"
  auto_invoke: "Verification, tests, lint, build, accessibility check, or viewport check"
---

## Activation Contract

Load before choosing, adding, running, or reporting automated and manual verification.

## Hard Rules

- Inspect `package.json` and relevant config before executing a command.
- Do not invent a test command, test runner, coverage, or passing behavior; none is currently evidenced.
- Treat `npm run lint` as intended non-fixing verification, then inspect for unexpected writes.
- Treat `npm run build` as mutating because it writes ignored `dist/`; run only when needed or requested.
- Prefer the narrowest evidence-producing check and report exactly what it proves.
- For UI work, include keyboard, accessible-name, visible-state, long-content, and narrow-viewport inspection where applicable.

## Decision Gates

| Need | Action |
| --- | --- |
| Static source check | Use `npm run lint` after confirming scripts/config |
| Bundle/type proof | Use `npm run build` only with mutation understood |
| Gameplay proof | Add/run focused tests only after real test infrastructure exists |
| Skills/routing proof | Use SYNC validation, path checks, and convergence |

## Execution Steps

1. Map acceptance behavior to the narrowest available evidence.
2. Classify command mutation risk before execution.
3. Run only permitted checks and inspect their outputs and writes.
4. Separate passed checks from unverified behavior in the report.

## Output Contract

Return exact commands, exit outcomes, mutation classification, observed scope, and explicit limitations.

## References

- `../../docs/development/testing.md` — current scripts and safe check matrix.
