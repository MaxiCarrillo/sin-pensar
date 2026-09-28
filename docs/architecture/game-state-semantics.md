# Game-state semantics

## Current evidence

No gameplay state machine, roster, teams, rounds, deck, timer, or persistence behavior is implemented in the tracked starter.

## Target invariants

- Model setup, private handoff, active turn, turn result, round result, and game completion as explicit phases. Reject actions that are invalid for the current phase.
- Rotate through the current eligible player order exactly once per cycle unless a documented rule changes eligibility. Roster/team edits must deterministically rebalance future turns without silently rewriting completed history.
- Derive round and game completion from explicit counters and deck state. Never infer them from a screen or timer callback alone.
- Represent timer deadlines or elapsed duration in state so pause/resume and reload recovery are deterministic. Prevent duplicate expiry transitions.
- Define deck exhaustion, reshuffle, skipped cards, ties, and zero-player/zero-card states before mutation.
- During device handoff, hide prior private content and require deliberate reveal by the next player.
- Persist a versioned, validated snapshot after committed transitions. On load, reject or migrate incompatible/corrupt snapshots and offer a safe reset; never fabricate missing identifiers.

Implement each action as one validated transition from the previous state to the next state. Keep rendering and persistence side effects outside the transition function.
