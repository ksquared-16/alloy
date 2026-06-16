# Visual Layout Configuration Builder — Phase 2 Report

**Date:** 2026-06-15  
**Status:** Complete

## Summary

Replaced the primary `/admin/settings/layouts` experience with a **Layout Gallery** backed by `GET /api/admin/surface-layouts/registry` and existing `entity_layouts` APIs. The section/row builder (`LayoutConfigClient`) remains available as a collapsible internal fallback and opens from the gallery via `?editor=1&layout=<id>`.

## UX

- **Hero header** + registry trust note (unchanged)
- **Configurable surfaces** — 2-column grid with pine-accent **Opportunity Drawer** card (enabled)
- **Coming soon** — Person Drawer, Child Drawer, Queue Record, Communications Command Center, POS Workspace (muted cards)
- **Opportunity card** shows published version, draft badge, zone chips, actions: Open/Edit, Duplicate default, View versions (rollback)
- **Editor mode** — Back link + focused builder (catalog hidden)

## Files

| File | Role |
|------|------|
| `LayoutGalleryClient.tsx` | Gallery UI |
| `LayoutsSettingsPageClient.tsx` | Gallery ↔ editor routing |
| `layoutGalleryModel.ts` | Pure summarize / rollback helpers |
| `layouts/page.tsx` | Mounts gallery client |
| `LayoutConfigClient.tsx` | `initialSelectedId`, `hideLayoutCatalog` |

## Tests

```
npm run test -- tests/layout/layoutGallery.test.ts tests/layout/surfaceLayoutRegistry.test.ts
→ 15 passed
```

## Next (Phase 3)

WYSIWYG config-mode drawer shell editor for opportunity drawer.
