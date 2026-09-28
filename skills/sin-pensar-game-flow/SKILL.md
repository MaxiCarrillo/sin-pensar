---
name: "sin-pensar-game-flow"
description: "Trigger: game flow, turn, round, timer, deck, pass-and-play, roster, team, recovery. Preserve local gameplay transition invariants."
license: "Apache-2.0"
metadata:
  author: "maxdev"
  version: "1.0.0"
  scope: "root"
  auto_invoke: "Game flow, turn rotation, round, deck, timer, roster, team, persistence, or recovery"
---

## Activation Contract

Load for frontend-only pass-and-play state, transitions, roster/team changes, timers, decks, persistence, recovery, or private handoff screens.

## Hard Rules

- Model phases and actions explicitly; reject actions invalid for the current phase.
- Rotate strictly through the current eligible order and change future turns deterministically after live roster/team edits.
- Keep completed history stable when rebalancing unless a documented rule requires migration.
- Make round, deck, score, timer, pause/resume, and completion invariants explicit. Prevent duplicate timeout or completion transitions.
- Hide prior private content during device handoff and require deliberate reveal by the next player.
- Persist only versioned, validated local snapshots after committed transitions. Recover, migrate, or safely reset corrupt/incompatible state.
- Keep transition logic pure; React and storage perform rendering and side effects around it.

## Decision Gates

| Situation | Action |
| --- | --- |
| Transition can fail | Validate before committing state |
| Timer fires twice | Make expiry idempotent |
| Roster/team changes | Recompute future eligibility without rewriting history |
| Snapshot is invalid | Reject or migrate; never fabricate identifiers |

## Execution Steps

1. State preconditions, resulting phase, invariants, and failure behavior.
2. Implement one deterministic transition path.
3. Check zero-player/card, exhaustion, ties, pause/reload, duplicate action, and handoff privacy edges.
4. Verify persistence boundaries and recovery separately from rendering.

## Output Contract

Report transitions, preserved invariants, privacy behavior, persistence/recovery effects, and verification gaps.

## References

- `../../docs/architecture/game-state-semantics.md` — target state invariants.
- `../../docs/architecture/system-overview.md` — local-only boundaries.
