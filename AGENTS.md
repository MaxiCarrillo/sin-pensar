# Sin Pensar Agent Guide

This is a frontend-only React/Vite repository. This root file governs the entire project; do not create nested `AGENTS.md` files. Direct user instructions take precedence.

## Start here

1. Read [the system overview](docs/architecture/system-overview.md).
2. Match the task to the generated table and load every matching `skills/<name>/SKILL.md` before work.
3. Treat source code as current evidence and docs marked as target rules as intended direction, not implemented behavior.
4. Use the safe checks in [testing.md](docs/development/testing.md).

## Project rules

- Keep the product frontend-only. Do not introduce or describe server, room-service, auth, database, or network-authoritative behavior.
- Keep source ownership explicit: `src/assets` for shipped assets, `src/core` for app configuration, `src/modules` for product features, and `src/shared` for genuinely reusable code.
- Use CSS Modules for component styles. Keep reusable semantic tokens centralized in `src/index.css`.
- Keep viewport backgrounds full-width. Center and cap only interactive route content through `#root` at the `390px` shell owned by `--mobile-breakpoint`; shell actions must anchor to that boundary on wide viewports.
- Use Ant Design bottom drawers with viewport-level masks and panels but centered child content capped to the mobile shell, a compact centered accessible `hgroup`, no default header or visual close control, Escape/mask close, and focus management.
- Keep gameplay state and persistence local to the browser. Define ownership, recovery, and privacy between pass-and-play transitions explicitly.
- Use semantic controls, keyboard access, visible focus, accessible names, and non-color-only feedback.
- Check narrow viewports, long content, and every relevant loading, empty, error, transition, and success state.
- Preserve Spanish product UI copy when implementing the product; write technical artifacts in English.

## Canonical skills

`./skills` is the only canonical project skill source. Tool-specific locations are adapters. Never hand-edit rows inside the managed block; run the synchronization asset after skill metadata changes. See [docs/skills.md](docs/skills.md).

<!-- skill-sync:start -->
## Auto-invoked project skills

Generated from canonical `skills/*/SKILL.md` metadata. Do not edit this block manually.

| Trigger | Load |
| --- | --- |
| Add, reorder, or refactor JavaScript or TypeScript imports | `skills/import-sorter/SKILL.md` |
| Category, card, client catalog, content asset, or identifier integrity | `skills/sin-pensar-game-catalog/SKILL.md` |
| Create or revise a project skill | `skills/skill-creator/SKILL.md` |
| Create, edit, or remove project skill metadata or AGENTS skill routing | `skills/skill-sync/SKILL.md` |
| Game flow, turn rotation, round, deck, timer, roster, team, persistence, or recovery | `skills/sin-pensar-game-flow/SKILL.md` |
| React UI, CSS Modules, accessibility, tokens, viewport, or visible state | `skills/sin-pensar-client-ui/SKILL.md` |
| TypeScript types, interfaces, unions, type guards, or unsafe values | `skills/typescript/SKILL.md` |
| Verification, tests, lint, build, accessibility check, or viewport check | `skills/sin-pensar-verification/SKILL.md` |
| Zod schema, user input validation, browser storage snapshot, or migration boundary | `skills/zod-4/SKILL.md` |
| Zustand store, selector, shared cross-screen state, persistence, hydration, or migration | `skills/zustand-5/SKILL.md` |
<!-- skill-sync:end -->

Load all matching skills. Do not rely on remembered summaries when the canonical file is available.

## Repository safety

- Never read secrets or edit dependencies, generated output, or unrelated application files.
- Preserve unrelated work and do not commit unless explicitly requested.
- Do not claim tests, accessibility, responsiveness, persistence, or architecture without direct evidence.
- Keep changes narrow and update local documentation when rules or architecture change.
