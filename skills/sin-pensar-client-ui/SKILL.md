---
name: "sin-pensar-client-ui"
description: "Trigger: React UI, CSS Modules, accessibility, responsive layout, visual state. Apply Sin Pensar frontend interaction and styling rules."
license: "Apache-2.0"
metadata:
  author: "maxdev"
  version: "1.0.0"
  scope: "root"
  auto_invoke: "React UI, CSS Modules, accessibility, tokens, viewport, or visible state"
---

## Activation Contract

Load for React components, client state, component styles, visual behavior, accessibility, or viewport work.

## Hard Rules

- Use colocated `*.module.css` files for component styles; keep only tokens and intentional global rules in `src/index.css`.
- Reuse centralized semantic tokens. The target palette is background `#FFF`, primary `#00AAB7`, secondary `#DE2C6E`, and tertiary `#11B087`.
- Preserve Spanish product UI copy while keeping technical artifacts in English.
- Use semantic controls, keyboard behavior, visible focus, accessible names, practical touch targets, and non-color-only feedback.
- Render every applicable idle, transition, empty, active, paused, completed, error, and confirmation state.
- Check 320px and 390px widths, long content, and wider layouts before claiming responsiveness.

## Decision Gates

| Concern | Action |
| --- | --- |
| Reusable visual value | Add or reuse a semantic global token |
| Component-only styling | Put it in the component CSS Module |
| Local interaction | Prefer component state |
| Gameplay transition | Follow `sin-pensar-game-flow` |

## Execution Steps

1. Trace state ownership and visible states before editing.
2. Reuse semantic HTML, tokens, and established component patterns.
3. Verify keyboard, focus, names, contrast-independent feedback, and viewport overflow.
4. Run only checks allowed by the verification skill.

## Output Contract

Report states handled, tokens/styles used, accessibility and viewport checks, and verification.

## References

- `../../docs/client/design-system.md` — current evidence and target UI rules.
- `../../docs/architecture/system-overview.md` — frontend boundaries.
