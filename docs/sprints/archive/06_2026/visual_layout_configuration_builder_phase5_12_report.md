# Visual Layout Configuration Builder — Phase 5.12 Report

## Summary

Phase 5.12 closes three production blockers for the Opportunity Drawer visual layout builder: publish→runtime parity, repeated save/publish cycles, multi-column overflow safety, and `+ Widget` placement.

## Root cause — publish did not affect live drawer

**Primary:** After the first publish, `record.status === "published"` disabled Save/Publish while the editor kept mutating `workingDoc`. Preview showed local edits; live drawer continued serving the last published `entity_layouts` row.

**Secondary:** `DrawerHouseholdProfileSection` could substitute over layout-owned section rows when household sections contained composed items, ignoring published row/column structure.

**Tertiary:** Layout runtime body session cache was not invalidated on layout publish, so open drawers could keep stale layout payloads until hard refresh.

## Workstream 0 — Publish must affect runtime

- Runtime now skips household profile substitution when a section has layout-owned composition (`sectionHasLayoutOwnedComposition`).
- Live drawer composition always sets `honorLayoutDocBlocks: true` in `LeadOverviewRuntimeComposition`.
- Publish dispatches `adminv2:entity-layout-published` and busts opportunity drawer body session cache.
- Section composition diagnostics show layout ID, version, row/column counts, and composition source in the editor and staging live drawer diagnostic strip.

## Workstream A — Save/publish reliability

- Save on a published layout forks a new draft via `/duplicate`, then PATCHes changes.
- Publish forks from published if needed, publishes draft, dispatches runtime invalidation, then auto-forks a fresh draft for the next edit cycle.
- `resolveVisualEditorActionState` enables Save when published+d dirty with a clear status message.

## Workstream B — Multi-column overflow

- `ValueCell` values use `min-w-0 truncate`.
- `RowView` uses responsive `grid-cols-1` stacking below `sm`, 12-column grid at `sm+`.
- `ColumnView` already had `min-w-0`.

## Workstream C — Widget add

- `+ Widget` in section row columns with registry-backed picker.
- `addSectionWidgetItem` validates allowed keys, drawer relevance, and singleton widgets per section.
- Widget items are runtime-effective in section composition list.

## Manual verification checklist

1. Create Primary Contact block.
2. Row 1: Full Name.
3. Row 2: Email | Phone.
4. Save draft.
5. Publish.
6. Change Email label.
7. Save draft again (should fork new draft automatically if editing published row).
8. Publish again.
9. Confirm no validation failure.
10. Confirm Email/Phone do not overlap at drawer width.
11. Add Notes widget to an Activity section row.
12. Save/publish.
13. Open live opportunity drawer — layout matches preview (close/reopen drawer after publish).

## Remaining gaps before Person/Child

- Widget placement in nested block rows (section-level only in 5.12).
- Action button live drawer wiring still preview-oriented.
- Person/Child drawer surfaces not in scope.

## Tests

```bash
cd web && npm run test -- \
  tests/layout/opportunityDrawerLayoutPhase512.test.ts \
  tests/layout/opportunityDrawerLayoutVisualEditor.test.ts \
  tests/layout/opportunityDrawerLayoutPhase511.test.ts
```
