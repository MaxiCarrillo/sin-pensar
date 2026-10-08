# System overview

## Current evidence

Sin Pensar is a frontend-only React 19.2, TypeScript 6, and Vite 8 package. Its client uses React Router 8 for declarative browser routes, Ant Design 6 for behavior-rich controls, Zustand 5 for cross-route setup state, and Sonner 2 as the configured notification host. No server, authentication, or room layer is implemented.

## Source ownership

- `src/assets` owns shipped visual assets.
- `src/core` owns application-wide route and Ant Design theme configuration.
- `src/modules` owns route pages and product components, with `modules/common` reserved for components shared across product modules.
- `src/shared` owns the reusable local card catalog, pure setup/draft/gameplay domain rules, constants, types, and focused setup and gameplay stores.

`App.tsx` only renders the route provider. `main.tsx` owns application providers. The setup store owns avatar, nickname, owner-player identity, roster, turn duration, main-deck card count, selected team count, the committed ID-based team assignment, and the transient private card draft across `/`, `/players`, `/teams`, and `/cards`. Configuration and assignment drafts, player selection, drawers, route-level privacy unlocks, and status messages remain local to their components. Valid team counts are derived dynamically from the finalized roster as every integer from 2 through `floor(playerCount / 2)`. The Teams route edits a local draft that may be incomplete, commits only complete balanced membership, and starts card selection only from complete balanced membership. The shared local catalog contains 200 stable card records; pure domain transitions deal 10 globally unique IDs per player, require explicit confirmation of each 3/4/5-card main selection, then accept one distinct lightning selection from only the remaining cards before advancing to the next private handoff.

The focused, non-persisted gameplay store owns one validated game session for `/game` and delegates every state change to `src/shared/domain/gameplay.ts`. The pure state machine covers `handoff`, `active-turn`, `concealed-active`, `time-expired`, `stage-complete`, `game-complete`, and `results`; it owns exact selected-card source decks, pending cards, cumulative scores, strict team/player cursors, absolute deadlines, turn/stage history, and setup compatibility. Setup mutations reset gameplay. Route remounts conceal an active turn without replacing its deadline and before any catalog record is rendered; explicit resume reconciles that deadline. Missing or incompatible transient state redirects to safe setup/card routes.

Only the validated, versioned `nickname` and `avatar` profile is persisted in local storage. Roster, teams, deals, selections, and gameplay remain transient, so reloads fail closed instead of recovering or exposing private cards.

## Target boundaries

- Keep the product frontend-only and playable locally on one device.
- Keep application and gameplay rules separate from React rendering so transitions remain independently verifiable.
- Keep browser persistence behind a narrow adapter. Persist only recoverable game/session data with a schema version; do not treat storage as an event bus or source of concurrent truth.
- Keep category/card content and assets client-side. Stable identifiers connect catalog records, selections, persisted snapshots, and assets.
- Keep transition screens private for pass-and-play: the next player must deliberately reveal private content.

See [game-state semantics](game-state-semantics.md) for implemented transition invariants and recovery behavior.
