---
name: "zod-4"
description: "Trigger: Zod schema, user input validation, localStorage, sessionStorage, snapshot parsing, or migration. Validate untrusted frontend boundaries with Zod 4."
license: "Apache-2.0"
metadata:
  author: "maxdev"
  version: "1.0.0"
  scope: "root"
  auto_invoke: "Zod schema, user input validation, browser storage snapshot, or migration boundary"
---

## Activation Contract

Load when validating user-entered data or parsing versioned `localStorage` or `sessionStorage` snapshots.

## Hard Rules

- Parse only at untrusted boundaries; keep game transitions typed and pure instead of replacing internal TypeScript checks with schemas.
- Treat decoded browser storage as `unknown` and use `safeParse` before hydration, migration, or state replacement.
- Infer validated data with `z.infer`; do not maintain duplicate handwritten boundary types.
- Use Zod 4 APIs such as `z.email()`, `z.uuid()`, `z.url()`, `z.string().min(1)`, and the `error` parameter when those formats or messages are required.
- Give persisted snapshots an explicit schema version. Validate the source version, migrate deliberately, validate the result, and safely reset incompatible or corrupt data.
- Convert `error.issues` into accessible Spanish UI feedback at the presentation boundary; do not expose raw diagnostics to players.

## Decision Gates

| Situation | Action |
| --- | --- |
| Trusted in-memory transition | Use TypeScript and pure domain checks |
| User or storage data enters the app | Parse with a focused schema |
| Snapshot version differs | Validate, migrate, revalidate, or reset |

## Execution Steps

1. Identify the trust boundary and expected version.
2. Define the smallest schema and derive its type.
3. Handle both `safeParse` branches without assertions.
4. Verify invalid, stale, partial, and corrupt inputs.

## Output Contract

Report schemas, trust boundaries, migration/reset behavior, and surfaced validation states.

## References

- `../../docs/architecture/game-state-semantics.md` — snapshot and transition invariants.
- `../../docs/architecture/system-overview.md` — browser persistence boundary.
