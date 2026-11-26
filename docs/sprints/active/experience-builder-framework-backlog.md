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
- Waitlist placement **widgets** (`waitlist_position`, etc.) remain V2 card context keys — v3 queue rows use **field refKeys** with dedicated chip renderers
- Queue row collapse / stacked layout — not applicable (row is atomic)

---

## EB-Q-02 — Queue activity hydration + waitlist v3 renderers ✅ (implemented)

**Goal:** Finish queue product gaps after EB-Q-01 primitive bridge.

**Implemented:**
- `fetchQueueActivityTimelineEvents.ts` + `QueueService.enrichOpportunityRows` — batch `_activity_timeline_events` hydrate
- `queueRowLayoutRuntimeEnrichment` + `buildOpportunityQueueRowRecordFromPreview` — passthrough live events + preview fallback fields
- `queueWaitlistPlacementField.ts` + `QueueRecordFieldRenderer` — placement chips for position/tier/priority/override/pin
- `validateQueueRecordLayoutConfig` — waitlist-only field guard, compact timeline config validation
- `scopeAllowsFieldKey` — `waitlist.*` / `overrides.*` on lifecycle_context scope

---

## EB-FW-04 — Child-scoped relationship contacts ✅ (implemented)

**Goal:** Relationship/contact widgets resolve child-scoped roles first; household fallback only when configured.

**Implemented:**
- `layoutRuntimeScopedRelationshipContacts.ts` — scoped resolver, widget defaults, opportunity/person grouping
- `fetchChildScopedContactLinks.ts` + `attachPersonDrawerVisibility` — hydrates `_child_scoped_contact_links`
- `LayoutRuntimeRelationshipContactsWidget.tsx` — runtime renderer for relationship widget keys
- Widget keys: `guardians_for_child`, `emergency_contacts_for_child`, `authorized_pickup_for_child`, `billing_contacts_for_child`, `household_members`, `related_children_for_person`
- `layoutEditorRelationshipWidgetConfig.ts` — builder metadata (`scope`, `roleTypes`, `includeHouseholdFallback`, etc.)
- Child `family_adults` repeater uses child-scoped guardians via `buildChildLayoutRuntimeRecordFromVm`

**Default behavior:**
- Child drawer: child-scoped first, household fallback when configured
- Person drawer: `related_children_for_person` groups by linked child
- Opportunity drawer: per-child groups (no flat merge when multiple children)

---

## EB-FW-05 — Primary contact designation action (`make_primary_contact`) ✅ (implemented)

**Goal:** Operators change household primary contact through a configurable relationship action — not inline scalar edit.

**Doctrine:** Primary contact designation is a relationship action. One primary per household/opportunity scope. Old primary remains linked as additional contact.

**Implemented:**
- `makePrimaryContactAction.ts` — action key + event type constants
- `layoutRuntimeMakePrimaryContactAction.ts` — context resolution + visibility (`show_when_not_primary` compatible)
- `LayoutRuntimeMakePrimaryContactActionButton.tsx` — EB runtime button + confirmation modal
- `LayoutRuntimePlanView` — wires `_action_button` with `make_primary_contact` on contact blocks and related-list columns
- `LeadHouseholdPrimaryContactConfirmModal` — current primary, new primary, affected scope
- `emitHouseholdPrimaryContactChangedEvent.ts` + PATCH `/api/admin/customers/[id]/household-primary-contact` — audit/workflow event
- Reuses `setHouseholdPrimaryContactForCustomer` → `opportunities.primary_person_id`, `customer_persons.is_primary`, role demotion on `_opportunity_persons`
- `person.is_primary_contact` read-only badge field in catalog; `person.is_primary` blocked from inline edit
- Builder: `make_primary_contact` in `LAYOUT_EDITOR_DRAWER_ACTION_KEYS` and row template actions

**Initial scope:** Opportunity / household primary contact only (not child-scoped guardian promotion).

**Builder usage:**
- Contact block: add action button item, action key `make_primary_contact`, visibility `show_when_not_primary`
- Contact related list: add `_action_button` column with same action key
- Optional display: `person.is_primary_contact` as read-only badge/chip
- **Not** available in drawer header, work-unit rail, or queue row — registry strips generic placements; requires contact row target

**Later:** Child-scoped guardian primary when scope is child-specific; person drawer EB layouts.

---

## Unified relationship action framework ✅ (implemented)

**Goal:** Single canonical registry + shared wizard/executor for relationship mutations.

**Implemented:**
- `canonicalActionRegistry.ts` + `relationshipActionRegistry.ts`
- `RelationshipActionGuidedModal` + unified executor (idempotent writes, confirmation)
- DB seeds: `20260622210000_relationship_action_definitions.sql`
- Work-unit rail modal host: `useWorkUnitRegistryModals.tsx`
- Layout catalog: `layoutEditorActionCatalog.ts` (Add Action picker, not raw keys)
- Registry client router: `applyRegistryResolvedActionClient.ts`

---

## BP / stage layout assignment ✅ (implemented)

**Goal:** Assign published layouts per business process stage and surface without changing LayoutDoc.

**Implemented:**
- Table: `business_process_layout_assignments` (`20260622180000_business_process_layout_assignments.sql`)
- Settings UX: Business Processes → stage wizard → Layout assignments
- Resolver: `resolveBusinessProcessLayoutAssignment.ts` hooked into `resolveLayoutForOrg`
- Doc: `docs/platform/operator/business-process-layout-assignments.md`

---

## OCM-first Change Enrollment Status ✅ (implemented)

**Goal:** Replace generic Update Status on enrollment surfaces with OCM-scoped transition modal + BP rules.

**Implemented:**
- Action: `update_enrollment_status` (`20260622220000_update_enrollment_status_action.sql`)
- BP-aware destination resolver + preflight
- Work-unit + drawer modal hosts
- Case fallback when no OCM

---

## Follow-up / post-MVP

| Item | Notes |
|------|-------|
| BOS rail UI wiring | Adapters ready; full proposal UI deferred |
| Legacy drawer retirement | VM drawer default; kill switches remain |
| `add_sibling` / `add_family_member` convergence | Multiple entry paths today |
| Remove deprecated emergency route/wrappers | Cleanup pass |
| Normalize legacy `open` → `new_inquiry` | Optional data migration; alias handles visibility |
| POS verification | Out of scope for EB sprint |
| Communications verification | Separate initiative |
| make_primary_contact target picker on header | Only if product requires header placement without row context |

---

## Related

- [Experience Builder doctrine](../../platform/operator/experience-builder-doctrine.md)
- [Surface cloning plan](../../platform/operator/experience-builder-surface-cloning-plan.md)
- [Queue record doctrine](../../system/queue-record-doctrine.md)
