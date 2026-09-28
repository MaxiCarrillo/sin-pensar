---
name: "typescript"
description: "Trigger: TypeScript types, interfaces, unions, type guards, or unsafe values. Apply strict frontend domain modeling without overengineering local UI types."
license: "Apache-2.0"
metadata:
  author: "maxdev"
  version: "1.0.0"
  scope: "root"
  auto_invoke: "TypeScript types, interfaces, unions, type guards, or unsafe values"
---

## Activation Contract

Load when creating or revising TypeScript domain models, component contracts, state shapes, guards, or unknown-value boundaries.

## Hard Rules

- Never introduce `any`; keep untrusted values `unknown` until narrowed or parsed.
- Use `import type` for type-only imports, consistent with `verbatimModuleSyntax`.
- Keep domain shapes flat: extract meaningful nested objects into named types instead of anonymous inline structures.
- Model mutually exclusive or coupled states with discriminated unions so invalid combinations do not compile.
- Use `as const` maps when values are also required at runtime for iteration, lookup, labels, or validation.
- Allow direct literal unions for small compile-time-only UI domains such as `AppScreen`; do not create runtime maps without a runtime need.

## Decision Gates

| Situation | Action |
| --- | --- |
| Value crosses an untrusted boundary | Narrow `unknown` or use the boundary-validation skill |
| Variants have different required fields | Use a discriminated union |
| Literal values are consumed at runtime | Define a const map and derive its type |

## Execution Steps

1. Identify ownership, valid states, and boundary trust before defining types.
2. Choose the smallest named types that exclude invalid states.
3. Separate type-only imports and remove unsafe assertions.
4. Verify exhaustive branches and compiler-visible invariants.

## Output Contract

Report the modeled invariants, boundary narrowing, and any runtime maps introduced.

## References

- `../../docs/architecture/system-overview.md` — frontend and domain boundaries.
