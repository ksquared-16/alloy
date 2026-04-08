# Alloy architecture doctrine (canonical)

**Full doc map:** [`../README.md`](../README.md) (implementation plans, audits, archive).

This folder holds **current product and platform doctrine** for record rendering, relationships, overview layout, workspace vs record semantics, and org/department/work-unit scope. Treat these documents as the **canonical reference** when planning foundation work.

**UI V1 and Admin V2 demo shells are not the source of truth** for the future record/workspace system; they may lag or contradict doctrine here.

## Documents

| Document | Scope |
|----------|--------|
| [Glossary](./glossary.md) | **Canonical terminology** — org, work unit, resolver, scope, etc. |
| [Deferred decisions](./deferred-decisions.md) | Intentionally **not** built now; triggers to revisit |
| [Record Rendering System (RRS)](./record-rendering-system-spec.md) | Resolver-shaped payloads, field sources, relationship groups, financial context, actions, edit ownership |
| [Relationship & identity](./relationship-and-identity-doctrine.md) | Persons-first identity, layered relationships, sunset path for contacts |
| [Overview layout](./overview-layout-doctrine.md) | Structured summary surfaces, config + layout metadata, no page builder |
| [Workspace, work unit, scope](./workspace-work-unit-scope-doctrine.md) | Record vs execution vs coordination; queues; drawer vs full record; org/location/department |
| [Implementation gap audit](./implementation-gap-audit.md) | Doctrine vs current Supabase/config/code (living document) |
| [Source pack index](./source-pack-index.md) | **Files to load** into GPT/project context |

**Future AI:** Constrained, config-level assistance (layout suggestions, queue ordering, signals) is described under [Workspace doctrine — Future AI](./workspace-work-unit-scope-doctrine.md#future-ai-compatibility-not-implementation-now).

## Related material elsewhere in the repo

| Location | Relationship to doctrine |
|----------|-------------------------|
| [HIERARCHY_SCHEMA_V1.md](../implementation/HIERARCHY_SCHEMA_V1.md) | **Still useful** — concrete `departments` / `work_units` / `jobs.work_unit_id` schema notes. **Verify** migration filename against `supabase/migrations/` (some early migration names may have been squashed into `remote_schema`). |
| [SYSTEM_STRUCTURE_V1.md](../implementation/SYSTEM_STRUCTURE_V1.md), [SYSTEM_IMPLEMENTATION_PLAN_V1.md](../implementation/SYSTEM_IMPLEMENTATION_PLAN_V1.md) | **Partially superseded** for UX specifics; structural thinking (org → dept → work unit → record) remains aligned. Prefer `workspace-work-unit-scope-doctrine.md` for current semantics. |
| [IDENTITY_MODEL_REFACTOR_AUDIT.md](../audits/IDENTITY_MODEL_REFACTOR_AUDIT.md) | **Historical audit** (code + schema inventory). Use for migration impact lists; **persons-first direction** is stated in `relationship-and-identity-doctrine.md`. |
| [UI_V2_Workspace_System_Spec.md](../implementation/UI_V2_Workspace_System_Spec.md) | **Companion** — block/level ideas overlap doctrine; where they conflict (e.g. AI changing pixels vs configuring meaning), prefer this folder + [overview-layout-doctrine.md](./overview-layout-doctrine.md). |
| [WORKSPACE_SYSTEM_V1.md](../implementation/WORKSPACE_SYSTEM_V1.md) | **UI V1 column contract** — implementation detail for a specific shell; not canonical for future RRS/workspace. |
| [ARCHITECTURE.md](../implementation/ARCHITECTURE.md) | **System map** (Next.js, Supabase, flows). Top of file should stay consistent with persons-first and resolver direction. |

## Supersedes / deprecates (conceptually)

- Any doc that implies **contacts** as the long-term human identity anchor (see relationship doctrine).
- Any doc that treats **overview** as an unbounded list of fields without summary structure.
- Any doc that equates **queue row preview** with **authoritative record payload**.
- Any doc that merges **functional department** with **accounting cost center** or **location**.
