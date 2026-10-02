# Game-state semantics

## Current evidence

The setup flow has a transient local roster and an explicit transient owner-player identifier that keeps a successful owner rename coherent with the profile nickname. Turn duration, main-deck card count, a roster-derived team count, and the committed team assignment are also transient setup values. Pure helpers derive all valid counts, balanced target sizes, and exact `team-1` through `team-N` identifiers; they validate ID-based membership and create deterministic or injected-random balanced assignments that preserve every player exactly once. The Teams screen edits a separate local draft that may temporarily contain unassigned or unbalanced membership, while the store accepts only a complete assignment with at least two players per team and a maximum size difference of one.

The private card draft is an explicit per-player `handoff` → `selecting-main` → `selecting-lightning` → `ready` cycle, followed by `complete` only after every player finishes both choices. A single injected-random shuffle deals 10 unique catalog IDs to each player without cross-player repeats. Main quotas remain 3, 4, or 5; reaching the quota stays in `selecting-main` until an explicit confirmation validates exactly that many unique dealt IDs. Lightning selection then receives only the remaining dealt IDs, and a saved player must have exactly one distinct lightning card. Returning to main selection clears lightning; saving is valid only from `ready` and advances immediately to the next roster-ordered handoff. Invalid-phase and incomplete actions are rejected by pure transitions, while route-level private content is locked again on every mount. Roster names or membership, main-card count, team count, and committed team membership changes invalidate the draft. Direct navigation requires a valid owner, 4–20 valid players, a complete balanced team assignment, catalog capacity, and a compatible draft snapshot.

The nickname and avatar profile is the only persisted state; it uses a versioned, Zod-validated local-storage boundary and safely falls back to defaults for invalid or incompatible data. Roster, teams, deals, and selections are intentionally omitted from `partialize`, so reload recovery returns to safe setup rather than exposing stale private cards. Gameplay consumption of the committed teams and selected decks, timer/deck consumption, live rounds, and the gameplay state machine remain unimplemented.

## Target invariants

- Model setup, private handoff, active turn, turn result, round result, and game completion as explicit phases. Reject actions that are invalid for the current phase.
- Rotate through the current eligible player order exactly once per cycle unless a documented rule changes eligibility. Roster/team edits must deterministically rebalance future turns without silently rewriting completed history.
- Derive round and game completion from explicit counters and deck state. Never infer them from a screen or timer callback alone.
- Represent timer deadlines or elapsed duration in state so pause/resume and reload recovery are deterministic. Prevent duplicate expiry transitions.
- Define deck exhaustion, reshuffle, skipped cards, ties, and zero-player/zero-card states before mutation.
- During device handoff, hide prior private content and require deliberate reveal by the next player.
- If later gameplay becomes recoverable across reloads, persist a versioned, validated snapshot after committed transitions. Until then, keep private draft state transient and fail closed; never fabricate missing identifiers.

Implement each action as one validated transition from the previous state to the next state. Keep rendering and persistence side effects outside the transition function.
