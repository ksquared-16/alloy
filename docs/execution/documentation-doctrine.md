# Documentation doctrine

## Purpose

Rules that keep `docs/` aligned with code so Cursor/GPT context stays trustworthy.

## Current state

Active docs are **19** `.md` files total (`README.md` plus 18 topic files — see `docs/README.md`). **Keep the active documentation set at 19 `.md` files unless intentionally approved.** That count **includes** `docs/README.md` and **excludes** `docs/sprints/**` and `docs/archive/**`. Historical material lives under **`docs/archive/2026-05-02-docs-reset/`**. **`docs/sprints/`** is exempt from archive passes.

## How it works

1. Engineers treat active docs as **contracts** that describe today’s behavior.
2. When behavior changes, update docs **in the same PR/commit** as the code (preferred).
3. If reality diverged before docs caught up, either **fix code** or **update docs first** in the same commit — do not leave them contradictory across merges.

## Mandatory update rule

**Any code change** that alters:

- entity behavior (schema or lifecycle),
- workflow / action behavior,
- config steering (`queue_definition`, layouts, status definitions, etc.),
- API contracts consumed by admin/public clients,
- workspace / department / queue behavior,
- permissions / RLS assumptions surfaced to app code,
- AI behavior or agent tool surface,
- billing / payments logic,
- communications send/enqueue behavior,
- documents / forms handling,
- scheduling lifecycle,
- deployment / tenancy / env contracts,

must update the **matching topic file** in `docs/core`, `docs/system`, `docs/product`, or `docs/execution` in the **same PR/commit**.

## Anti-patterns

- Creating a new markdown file for every feature (**forbidden** unless the topic cannot fit any existing file — then update `docs/README.md` load order and seek intentional approval to go beyond **19** active `.md` files).
- Writing aspirational architecture that is not reflected in `web/` or `supabase/`.
- Duplicating long specifications that belong in archived materials — link to archive path if historical context helps.

## Contradiction handling

If implementation must change doctrine, **update docs with the code** and record the reason briefly under **Known gaps / risks** until follow-up completes.

## AI / GPT usage

Load the files listed in **`docs/README.md`**. Prefer **`core/system-overview.md`** and **`system/actions-and-workflows.md`** before guessing.

## Source of truth / key files

- Index: `docs/README.md`
- Known verification debt: `execution/known-gaps.md`
- This doctrine: `execution/documentation-doctrine.md`

## Guardrails

This doctrine file is **normative** for Alloy contributors using this repo.

## Known gaps / risks

- None specific to process; execution depends on human review discipline.

## When this doc must be updated

Process changes (e.g. new required section in every doc), or intentional expansion of the active doc set beyond **19** `.md` files.
