# LLM-first skill style guide

Project skills are concise runtime contracts for an LLM, not tutorials.

## Required shape

Use this order: frontmatter, Activation Contract, Hard Rules, Decision Gates, Execution Steps, Output Contract, References.

Frontmatter must use quoted strings, Apache-2.0, author `maxdev`, version `1.0.0`, scope `root`, and a meaningful string `auto_invoke`. The name must match the folder. Do not use YAML arrays, `allowed-tools`, or a Keywords section.

Descriptions must be one physical line, trigger-first, YAML-safe, and no longer than 250 characters. Keep bodies near 180–450 tokens and below 1000. Write imperative, observable instructions. Put templates in `assets/`, deeper explanation in repository docs, and reference local files only.

After metadata changes, run the skill synchronization dry-run, apply it, and prove convergence. Generated routing rows are never maintained by hand.
