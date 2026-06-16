# Visual Layout Configuration Builder — Phase 1 Report

**Date:** 2026-06-15  
**Status:** Complete

## Summary

Phase 1 adds a **code-level surface layout registry**, **surface-scoped validation** for `opportunity_drawer`, a **registry read API**, and **duplicate / rollback** write APIs on the existing `entity_layouts` table. No runtime drawer changes, no gallery UI, no legacy route removal.

## Delivered

| Area | Location |
|------|----------|
| Surface registry | `web/lib/layout/surfaceLayoutRegistry.ts` |
| Surface validation | `web/lib/layout/validateLayoutDocForSurface.ts` |
| Structural parse + optional surface gate | `web/lib/layout/layoutV2Schema.ts` (`parseLayoutDoc(input, { inferSurfaceKey })`) |
| Registry API | `GET /api/admin/surface-layouts/registry` |
| Duplicate API | `POST /api/admin/entity-layouts/[id]/duplicate` |
| Rollback API | `POST /api/admin/entity-layouts/[id]/rollback` |
| Repo helpers | `duplicateLayoutAsDraft`, `rollbackLayoutFromVersion` in `entityLayoutsRepo.ts` |
| Tests | `web/tests/layout/surfaceLayoutRegistry.test.ts` |

## Registry (opportunity_drawer)

- **Enabled:** `opportunity_drawer` → `entity_type=opportunities`, `surface=drawer`, `layout_key=default`
- **Coming soon:** `person_drawer`, `child_drawer`, `queue_record`, `communications_command_center`, `pos_workspace`
- **Layout zones:** `summary_strip`, `main`, `right_rail`, `footer_actions`
- **Platform shell (explicit, not layout-configurable):** frame, header, lifecycle_rail_container, summary_strip_container, tabs_container, bos, actions/actions_bar, status, close, relationship_navigation, performance_reveal, reveal_gates
- **Closed section keys:** `lead_summary`, `children_enrollment`, `household_contact`, `lead_source`, `notes_communication`, `activity`

## Validation behavior

- **Default off** for surface validation — existing `parseLayoutDoc(doc)` calls unchanged (registry migration tests, non-opportunity entities).
- **Admin writes** use `parseLayoutDoc(doc, { inferSurfaceKey: true })` on POST/PATCH/publish/duplicate/rollback.
- Rejects: unknown zones, section keys, field refKeys, widget keys, action placement surfaces, platform shell metadata/sections, queue-only metadata on drawer, unknown metadata keys (no arbitrary escape hatch).

## Rollback semantics

`POST …/rollback` clones a **published** historical row's `doc` into a **new draft**, publishes it as the next version, and records lineage in `metadata` (`rollback_from_layout_id`, `based_on_layout_id`). Prior rows are never mutated.

## Test results

```
npm run test -- tests/layout/surfaceLayoutRegistry.test.ts tests/layout/leadDrawerDefaultPreset.test.ts tests/layout/layoutV2.test.ts
→ 28 passed
```

## Next (Phase 2)

Layout Gallery in Settings replacing list-first `LayoutConfigClient` UX, wired to registry + `entity_layouts` list.
