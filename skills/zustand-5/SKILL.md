---
name: "zustand-5"
description: "Trigger: Zustand store, selector, shared game state, persistence, hydration, or migration. Keep Zustand 5 state ownership focused and recoverable."
license: "Apache-2.0"
metadata:
  author: "maxdev"
  version: "1.0.0"
  scope: "root"
  auto_invoke: "Zustand store, selector, shared cross-screen state, persistence, hydration, or migration"
---

## Activation Contract

Load for Zustand 5 stores that own shared cross-screen or game state, selectors, hydration, persistence, or recovery.

## Hard Rules

- Keep ephemeral drawer, field, form, and component-only feedback state local to React.
- Put shared state and actions together, but keep game transition functions pure and call them from store actions.
- Select the smallest stable value. Use focused selectors and `useShallow` from `zustand/react/shallow` when selecting multiple fields; do not subscribe components to the whole store by default.
- Persist deliberately with a stable key, `version`, `partialize`, and a bounded migration path.
- Validate persisted unknown data before accepting migrated or hydrated state; safely reset corrupt or incompatible snapshots.
- Do not persist transient errors, open UI, pending effects, or timer ticks blindly. Persist only the recoverable timer facts needed to reconstruct behavior.

## Decision Gates

| Situation | Action |
| --- | --- |
| State belongs to one component | Keep React state local |
| Multiple screens share durable state | Consider a focused store |
| Several selected fields form one view model | Wrap the selector with `useShallow` |
| State must survive reload | Define validation, partialization, versioning, and recovery first |

## Execution Steps

1. Establish state ownership and persistence requirements.
2. Define focused state, actions, and selectors around pure transitions.
3. Add persistence only for an explicit recovery need.
4. Verify hydration, stale versions, corrupt data, and selector rerenders.

## Output Contract

Report ownership, selectors, persisted fields, version/migration behavior, and recovery handling.

## References

- `../../docs/architecture/game-state-semantics.md` — game transition and recovery invariants.
- `../../docs/architecture/system-overview.md` — local state boundaries.
