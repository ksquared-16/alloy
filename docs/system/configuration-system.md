# Configuration system

## Purpose

Define what **configuration** is allowed to control vs what must remain **platform-owned** logic — preventing “JSON became the codebase” failures.

## Current state

Config surfaces include (non-exhaustive):

- **Status definitions** — per-entity allowed keys and display labels (`fetchEffectiveStatusDefinitions`, `web/lib/admin/statusDefinitionsResolve.ts`, admin APIs).
- **Queue definitions** — `work_units.queue_definition` validated as v1 (`web/lib/config/queueDefinitionSchema.ts`).
- **Record / drawer layouts** — org overrides in **`record_drawer_layouts`**, templates in **`record_layouts`** (`web/app/api/admin/record-layouts/route.ts`).
- **Person / role type** metadata for dropdowns (`web/lib/admin/personTypeSettings.ts`).
- **Queue UI** presentation hints (`web/lib/ui-v2/queueUiConfig.ts`).

## How it works

1. **Validated JSON** — queue definitions and similar pass schema validation before persistence (see `QueueService` load path, seed scripts).
2. **Effective resolution** — admin UI fetches “effective” config per org with fallbacks (e.g. status definitions, layouts).
3. **Presentation vs behavior** — config can steer labels, ordering, which keys appear, and which workflow is wired in DB — but **authorization**, monetary calculations, and cross-entity invariants must remain in server code/workflows as appropriate.

## Source of truth / key files

| Concern | Location |
|---------|-----------|
| Queue schema | `web/lib/config/queueDefinitionSchema.ts` |
| Record layouts API | `web/app/api/admin/record-layouts/route.ts` |
| Status resolve | `web/lib/admin/statusDefinitionsResolve.ts` |
| Admin entity types for statuses | `web/lib/admin/statusDefinitionsAdminEntityTypes.ts` |

## Guardrails

- **Do not** encode one-off business rules only in config if other orgs would break — platform must validate.
- **Do not** hardcode strings/keys in UI that should be driven by status definitions or layout config when those systems already apply.
- **Do** extend schema/version when changing queue or layout shape with migration + validation.

## Known gaps / risks

- **Needs verification:** Single index of all JSON columns used as “config” in production (beyond those listed).
- Archived audits referenced hardcoded workflow debt — confirm with `docs/archive/2026-05-02-docs-reset/` if needed, but treat codebase grep as truth.

## When this doc must be updated

New config tables, new schema versions, or when elevating a concern from code → config or vice versa.
