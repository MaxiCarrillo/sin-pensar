---
name: "sin-pensar-game-catalog"
description: "Trigger: category, card, catalog, asset, identifier drift. Preserve client-only game content and identifier integrity."
license: "Apache-2.0"
metadata:
  author: "maxdev"
  version: "1.0.0"
  scope: "root"
  auto_invoke: "Category, card, client catalog, content asset, or identifier integrity"
---

## Activation Contract

Load when adding, renaming, removing, importing, selecting, or rendering client-side categories, cards, catalog records, or assets.

## Hard Rules

- Keep all catalog behavior client-only; do not introduce remote or server-backed assumptions.
- Treat category and card identifiers as stable contracts across records, selections, persisted snapshots, imports, and assets.
- Use IDs for identity and localized/display text for presentation; never join records by labels or file names.
- Preserve stable IDs unless explicit migration behavior updates persisted snapshots.
- Reject duplicate IDs, missing category references, missing imports/assets, and empty required selections.
- Keep product content in Spanish when implemented; keep schemas, identifiers, comments, and documentation in English unless existing evidence requires otherwise.

## Decision Gates

| Change | Verify |
| --- | --- |
| Identifier | Types/schema, records, selectors, persistence, and asset mapping |
| Record | Unique ID, valid category, required fields |
| Rename/removal | Snapshot compatibility or explicit migration/reset |
| Presentation only | Confirm no identifier contract changed |

## Execution Steps

1. Inventory current catalog, type, import, selection, persistence, and asset surfaces.
2. Apply the smallest synchronized client-side change.
3. Compare identifier sets and detect duplicates, dangling references, empty groups, and absent assets.
4. Run safe structural or automated checks without inventing test coverage.

## Output Contract

Report changed identifiers, synchronized surfaces, integrity checks, compatibility impact, and verification.

## References

- `../../docs/architecture/system-overview.md` — client-only catalog boundary.
- `../../docs/development/testing.md` — evidence and target verification.
