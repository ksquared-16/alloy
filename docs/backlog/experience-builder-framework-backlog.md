# Experience Builder — framework backlog

**Status:** Backlog (June 2026). Not scheduled for immediate implementation.

Items below extend the drawer Experience Builder framework. They do **not** apply to queue v3 row composer unless noted.

---

## EB-FW-03 — Exclude active record from household / related-list widgets ✅ (implemented)

**Goal:** When viewing a Person or Child drawer, household/family/guardian related lists exclude the active record by default.

**Implemented:**
- `layoutRuntimeRelatedListActiveRecord.ts` — active context, row filtering, empty-state copy
- `readLayoutRuntimeRepeaterRows` + `readLayoutRuntimeContactRepeaterRows` — apply filter
- Person/child VM record builders stamp `_layout_runtime_anchor_entity` + active ids
- `LayoutRuntimePlanView` — host-aware filtering + “No other …” empty messages

**Opportunity drawer:** unchanged unless `_layout_runtime_scoped_person_id` / `_layout_runtime_scoped_child_person_id` set (future selected-child scope).

---

## EB-FW-01 — Collapsible sections (drawer surfaces) ✅ (implemented)

**Goal:** Section-level collapse for Activity, Documents, Relationship Contacts, and large Person/Child sections.

**Implemented:**
- `layoutRuntimeSectionCollapse.ts` — collapse config, session persistence helpers, doc patchers
- `LayoutRuntimeCollapsibleSectionShell.tsx` — runtime collapse chrome for default drawer sections
- `DrawerOverviewPanelShell` — collapse on composition-surface sections
- `LayoutRuntimePlanView` — wires collapse from LayoutSection + host context
- `LayoutBuilderInspectorPanel` — collapsible, default expanded, persist, collapsed summary controls

**Config:** `collapsible`, `defaultExpanded`, metadata `persistCollapseState`, `collapsedSummary`.

---

## EB-FW-02 — Stacked section composition presets (drawer surfaces) ✅ (implemented)

**Goal:** Rich drawer body layouts beyond flat full/half peer rows.

**Implemented presets:** `full`, `half_half`, `third_two_thirds`, `two_thirds_third`, `stacked_right_2x2`, `stacked_left_2x2` (+ legacy alias keys).

**Model:** `layoutEditorSectionRowStackRole` metadata on grouped sections; `stacked_row` segment in `segmentSectionsForRowLayout` + `LayoutEditorSectionFlowView`.

---

## EB-Q-01 — Queue/Waitlist primitive bridge ✅ (implemented)

**Goal:** Align Queue/Waitlist v3 composer with shared EB display primitives without `LayoutDoc.sections[]`.

**Implemented:**
- `queueRecordLayoutAllowList.ts` — widget picker ↔ validator allow-list
- `queueRecordFieldDisplayBridge.ts` — catalog display inference + `formatLayoutRuntimeStatusLabel`
- `queueRecordWidgetConfig.ts` — compact `activity_timeline` config normalization
- `validateQueueRecordLayoutConfig.ts` — v3 field scope + widget validation
- `QueueRecordActivityTimelineWidget.tsx` — compact timeline in queue rows
- `surfaceLayoutRegistry` — `queue_record.allowedWidgetKeys`

**Remaining queue-specific (intentional):**
- Waitlist placement widgets (`waitlist_position`, etc.) remain **field keys** until dedicated row renderers ship
- Full workflow history (`_activity_timeline_events`) not hydrated on queue rows yet — preview resolver fallback only
- Queue row collapse / stacked layout — not applicable (row is atomic)

---

## Related

- [Experience Builder doctrine](../platform/operator/experience-builder-doctrine.md)
- [Surface cloning plan](../platform/operator/experience-builder-surface-cloning-plan.md)
- [Queue record doctrine](../system/queue-record-doctrine.md)
