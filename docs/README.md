# Alloy documentation

## Start here

| If you need… | Open |
|--------------|------|
| **Current platform doctrine** (records, relationships, overview, workspace/scope) | [`architecture/README.md`](./architecture/README.md) |
| **Terminology** | [`architecture/glossary.md`](./architecture/glossary.md) |
| **What we are not building yet** | [`architecture/deferred-decisions.md`](./architecture/deferred-decisions.md) |
| **Track A foundation plan** | [`implementation/foundation-implementation-plan.md`](./implementation/foundation-implementation-plan.md) |
| **GPT / project source pack file list** | [`architecture/source-pack-index.md`](./architecture/source-pack-index.md) |
| **Where schema truth lives** | [`audits/schema-reference-guide.md`](./audits/schema-reference-guide.md) |
| **How the app is wired today** (Next.js, Supabase, major flows) | [`implementation/ARCHITECTURE.md`](./implementation/ARCHITECTURE.md) |
| **Admin IA & hierarchy planning (V1 + V2 shells)** | [`implementation/SYSTEM_STRUCTURE_V1.md`](./implementation/SYSTEM_STRUCTURE_V1.md) |
| **Ship / ops** | [`implementation/DEPLOYMENT.md`](./implementation/DEPLOYMENT.md), [`implementation/OPERATIONS.md`](./implementation/OPERATIONS.md) |
| **Schema / migration audits** | [`audits/`](./audits/) (snapshots, inventories, integration audits) |

## Folder layout

| Folder | Purpose |
|--------|--------|
| **`architecture/`** | **Canonical doctrine** — glossary, deferred decisions, resolver-first records, identity, overview layout, workspace semantics, [implementation gap audit](./architecture/implementation-gap-audit.md), [source pack index](./architecture/source-pack-index.md). |
| **`implementation/`** | **Active engineering reference** — [foundation implementation plan](./implementation/foundation-implementation-plan.md), remediation batches, Cursor plans, system structure, UI specs, workflow/events, data authority, hierarchy schema notes, UI V2 workspace companion spec. |
| **`audits/`** | **Diagnostic & domain reference** — [schema reference guide](./audits/schema-reference-guide.md), audits, comparisons, entity/domain model, payment lookups, identity refactor inventory. |
| **`archive/`** | **Historical** — phase deliverables, campaign notes, older vision/interface/AI docs, `ai_sources/` code snapshots. See each file’s archive banner; prefer `architecture/` for direction. |

## Canonical vs everything else

- **Canonical:** Everything under **`docs/architecture/`** — start with [glossary](./architecture/glossary.md) and the README index; [deferred-decisions](./architecture/deferred-decisions.md) bounds scope.
- **Not canonical:** V1/V2 UI layout contracts, old vision docs (now in `archive/`), and audits — they may describe what was built or discovered at a point in time.

## `archive/ai_sources/`

Frozen copies of workflow-related web files used as context for past work. **Do not treat as live code**; compare with `web/` if you need current behavior.
