# System overview

## Current evidence

Sin Pensar is a frontend-only React 19.2, TypeScript 6, and Vite 8 package. Its client uses React Router 8 for declarative browser routes, Ant Design 6 for behavior-rich controls, Zustand 5 for cross-route setup state, and Sonner 2 as the configured notification host. No server, authentication, room, or persistence layer is implemented.

## Source ownership

- `src/assets` owns shipped visual assets.
- `src/core` owns application-wide route and Ant Design theme configuration.
- `src/modules` owns route pages and product components, with `modules/common` reserved for components shared across product modules.
- `src/shared` owns reusable constants, types, and the focused setup store.

`App.tsx` only renders the route provider. `main.tsx` owns application providers. The setup store owns avatar, committed nickname, and roster across `/` and `/players`; field values, drawers, and status messages remain local to their components. Setup state is intentionally not persisted.

## Target boundaries

- Keep the product frontend-only and playable locally on one device.
- Keep application and gameplay rules separate from React rendering so transitions can be reasoned about and tested independently when test infrastructure is introduced.
- Keep browser persistence behind a narrow adapter. Persist only recoverable game/session data with a schema version; do not treat storage as an event bus or source of concurrent truth.
- Keep category/card content and assets client-side. Stable identifiers connect catalog records, selections, persisted snapshots, and assets.
- Keep transition screens private for pass-and-play: the next player must deliberately reveal private content.

The gameplay boundaries remain target rules beyond the currently implemented setup flow. See [game-state semantics](game-state-semantics.md) for transition invariants.
