---
name: "skill-sync"
description: "Trigger: skill metadata, scope, auto_invoke, AGENTS routing. Validate skills and synchronize the generated root routing block."
license: "Apache-2.0"
metadata:
  author: "maxdev"
  version: "1.0.0"
  scope: "root"
  auto_invoke: "Create, edit, or remove project skill metadata or AGENTS skill routing"
---

## Activation Contract

Load after changing direct `skills/*/SKILL.md` metadata or when root skill routing may be stale.

## Hard Rules

- Treat direct `skills/*/SKILL.md` files as canonical and generate only the delimited root block.
- Preserve all `AGENTS.md` content outside the managed markers.
- Reject unquoted or unexpected metadata, arrays, `allowed-tools`, non-root scope, duplicate names, invalid actions, and missing local skill paths.
- Never create or synchronize nested routing files.
- Run dry-run before live synchronization and prove convergence afterward.

## Decision Gates

| Situation | Action |
| --- | --- |
| Review routing | Run the asset with `--dry-run` |
| Apply valid changes | Run without `--dry-run` |
| Validation fails | Fix canonical metadata; do not edit generated rows |

## Execution Steps

1. Validate every direct project skill and inspect the dry-run plan.
2. Synchronize the root managed block.
3. Run again and confirm `AGENTS.md` is unchanged.
4. Validate every generated skill path exists.

## Output Contract

Report skill count, changed or unchanged routing, validation failures, path checks, and convergence.

## References

- `../../docs/skills.md` — canonical discovery, synchronization, and adapter workflow.
