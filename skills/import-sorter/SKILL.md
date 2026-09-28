---
name: "import-sorter"
description: "Trigger: add, reorder, or refactor JavaScript or TypeScript imports. Keep frontend imports grouped consistently without inventing path aliases."
license: "Apache-2.0"
metadata:
  author: "maxdev"
  version: "1.0.0"
  scope: "root"
  auto_invoke: "Add, reorder, or refactor JavaScript or TypeScript imports"
---

## Activation Contract

Load whenever imports are added, removed, or reorganized in JavaScript or TypeScript files.

## Hard Rules

- Order imports as: external packages, project or cross-feature modules, then same-feature relative modules.
- Separate groups with exactly one blank line when more than one group exists; do not add blank lines inside a group.
- Keep side-effect imports in dependency-safe order before other applicable imports when moving them could change behavior.
- Sort paths consistently within a group when doing so preserves side-effect order and readability.
- Use `import type` for type-only dependencies and preserve valid combined value/type imports.
- Respect the repository's current relative imports. Do not invent or prefer an alias until TypeScript and Vite explicitly configure one.
- Treat cross-feature relative paths by ownership, not syntax: `../../components/...` is project/cross-feature while `./PlayersPage.module.css` is same-feature.
- Apply this as a coding convention; do not claim ESLint auto-enforces it unless configuration evidence changes.

## Decision Gates

| Import source | Group |
| --- | --- |
| Package or platform module | External |
| Shared component or another feature | Project/cross-feature |
| Current feature or colocated file | Same-feature relative |

## Execution Steps

1. Classify imports by source ownership and side effects.
2. Reorder groups and normalize blank lines without changing paths.
3. Separate type-only dependencies where required.
4. Re-read the file for ordering and runtime side-effect safety.

## Output Contract

Report reordered groups, preserved side effects, and whether enforcement is conventional or configured.

## References

- `../../eslint.config.js` — current lint configuration evidence.
- `../../tsconfig.app.json` — current module and alias configuration evidence.
