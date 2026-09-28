---
name: "skill-name"
description: "Trigger: exact trigger words. State the runtime outcome concisely."
license: "Apache-2.0"
metadata:
  author: "maxdev"
  version: "1.0.0"
  scope: "root"
  auto_invoke: "Describe the concrete task that must load this skill"
---

## Activation Contract

State exactly when to load this skill.

## Hard Rules

- Write observable, imperative constraints.

## Decision Gates

| Situation | Action |
| --- | --- |
| Meaningful fork | Required action |

## Execution Steps

1. Inspect repository evidence.
2. Perform the bounded workflow.
3. Verify the result.

## Output Contract

State the required result and verification report.

## References

- `../../../docs/skills.md` — project skill discovery and portability policy.
