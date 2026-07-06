# Queue Row Surface Builder + Variants V1 (July 2026)

**Status:** Implemented (V1)  
**Branch:** `feat/queue-row-surface-builder-variants-v1`

## Goal

One configurable Queue Row surface per Business Process (e.g. **Enrollment Queue Row**), with presentation variants (Default, Tour, Waitlist, Enrolling) configured in the full-bleed Surface Builder — matching Workspace Header / Work Unit Header pattern.

## Navigation

`/settings/surfaces → Queue Rows` lists real lifecycle catalog processes only. Pipeline / Waitlist are no longer separate nav entries — they are variants inside the process surface.

## Persistence

`entity_layouts` — `surface: queue`, `layout_key: queue_row_{processKey}`

```json
{
  "metadata": {
    "queueRowSurface": {
      "name": "Enrollment Queue Row",
      "catalogId": "{departmentId}:{processId}",
      "processKey": "enrollment",
      "layout": { "variant": "operational-row", "version": 3, "columns": [], "variants": [] }
    },
    "queue_record_layout": { "...same layout..." }
  }
}
```

Publish upserts the single published row per layout key (publish twice succeeds).

## Runtime matching

1. Resolve process from department lifecycle → `queue-row-{catalogId}` surface fetch
2. Per row: `queueRowVariantMatchInputFromContext` → `resolveQueueRowVariant` (priority ASC, first match)
3. Render matched variant columns via existing `CondensedQueueRow` + `mapQueueRowSurfaceToCompactConfig`
4. No match → Default (`columns` top-level)

Presentation only — no lifecycle / ownership / queue membership changes.

## Browser validation

See sprint checklist in PR description.
