# Project skills and portable discovery

`./skills` is the canonical source. `AGENTS.md` routes tasks to skills; assistant-specific paths are replaceable adapters created by `skills/setup.ts`.

## Available skills

| Skill | Purpose |
| --- | --- |
| `import-sorter` | Group frontend imports without inventing path aliases |
| `skill-creator` | Author maxdev-format project skills |
| `skill-sync` | Validate metadata and generate root routing |
| `sin-pensar-client-ui` | React UI, CSS Modules, tokens, accessibility, and visible states |
| `sin-pensar-game-flow` | Local pass-and-play state transitions, privacy, persistence, and recovery |
| `sin-pensar-game-catalog` | Client-only categories, cards, assets, and identifier integrity |
| `sin-pensar-verification` | Safe checks based on tracked scripts and configuration |
| `typescript` | Apply strict, proportionate frontend type modeling |
| `zod-4` | Validate user input and versioned browser-storage boundaries |
| `zustand-5` | Own focused shared state, selectors, and deliberate persistence |

## Change workflow

Run:

1. `npx --yes tsx skills/skill-sync/assets/sync.ts --dry-run`
2. `npx --yes tsx skills/skill-sync/assets/sync.ts`
3. Repeat either command and confirm `AGENTS.md` is unchanged.

SYNC owns only the delimited block in the root `AGENTS.md`.

## Assistant adapters

Preview with `npx --yes tsx skills/setup.ts --dry-run --all`. Apply with `--all` or explicit assistant flags. OpenCode, Claude, Gemini, Codex, and Copilot receive a skills-directory adapter; Claude, Gemini, and Copilot also receive an instruction-file adapter. Codex uses root `AGENTS.md` directly.

Adapters remain inside the repository. Existing ordinary targets are backed up. Windows directory links use junctions; file links fall back to managed copies when symlink permission is unavailable.
