---
name: "skill-creator"
description: "Trigger: create skill, update skill, project skill. Create concise Sin Pensar skills with maxdev metadata and local references."
license: "Apache-2.0"
metadata:
  author: "maxdev"
  version: "1.0.0"
  scope: "root"
  auto_invoke: "Create or revise a project skill"
---

## Activation Contract

Load before creating or revising any direct skill under `skills/`.

## Hard Rules

- Start from `assets/SKILL-TEMPLATE.md` and follow `docs/skill-style-guide.md`.
- Keep all frontmatter values quoted strings; use author `maxdev`, version `1.0.0`, and scope `root`.
- Do not use YAML arrays, `allowed-tools`, a Keywords section, external references, or nested routing scopes.
- Keep the body under 1000 tokens; prefer 180–450 and move explanations to local docs.
- Treat `skills/` as canonical and assistant locations as generated adapters.

## Decision Gates

| Need | Action |
| --- | --- |
| Runtime instruction | Keep it in `SKILL.md` |
| Template or executable helper | Put it in `assets/` |
| Architecture or rationale | Link a repository doc |

## Execution Steps

1. Confirm the pattern is reusable and no existing skill owns it.
2. Create the smallest contract with accurate triggers and references.
3. Validate metadata, section order, body size, and every local path.
4. Run skill SYNC in dry-run and live modes, then prove convergence.
5. Refresh the project skill registry; never hand-maintain generated routing rows.

## Output Contract

Report skill files, metadata validation, routing result, references, and verification.

## References

- `assets/SKILL-TEMPLATE.md` — canonical project template.
- `../../docs/skill-style-guide.md` — authoring rules.
- `../skill-sync/SKILL.md` — routing synchronization.
