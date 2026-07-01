# Drawer Operating Model V1 — Sprint Closeout

**Path:** `docs/sprints/06_2026/completed/drawer_operating_model_v1_closeout.md`  
**Date:** 2026-06-08  
**Status:** **Closed**  
**Branch:** `staging`  
**Doctrine:** [`docs/system/drawer-operating-model-v1.md`](../../system/drawer-operating-model-v1.md)

---

## 1. Purpose

Establish a **shared AdminV2 drawer operating model** across Lead, Person, and Child surfaces — aligned with queue row previews and `/settings/layouts` — without redesigning runtime performance or resolver precedence.

Goals:

- One platform shell (header, tabs, BOS/actions, lifecycle container, summary strip, scroll body)
- LayoutDoc owns configurable content; composition owns premium placement for canonical sections
- Lead drawer as reference implementation; Person and Child inherit the same doctrine
- Queue rows remain compressed previews; drawers remain authoritative workspaces
- Child/enrollment sourcing consistent between queue and drawer

**Explicit non-goal:** This sprint is **not** a performance sprint. Future performance work must optimize **around** this model — not replace shell ownership, composition gates, or layout authority.

---

## 2. Lead drawer reference model

**Template:** `lead_drawer_v2` (`buildLeadDrawerDefaultDoc()`)

| Layer | Implementation |
|-------|------------------|
| Composition gate | `shouldUseLeadOverviewComposition()` — org published doc wins |
| Shell | `EntityDrawerOperatingShell` + `LeadOverviewRuntimeComposition` |
| Header | `LeadDrawerCommandHeader` — juniper accent, meta row, campus chip, BOS/actions/status |
| Summary strip | `LeadOperatingSummaryCard` — attention, tasks, last touch, enrollment health |
| Primary workspace | `children_enrollment` — Bend Pine accent, `LeadEnrollmentCardList` read-first cards |
| Activity / right rail | `LeadActivityPreview`, section metadata (`priority`, `collapseWhenEmpty`, `railSlot`) |
| Attention | `LeadOperatingAttentionSummaryCard` + shared `resolveLayoutRuntimeAttentionGuidance` |

**Patches delivered:** 8–18 (composition shell, operating surface tokens, header, summary cards, enrollment card list, activity/right rail, child sourcing freeze, queue attention parity).

---

## 3. Person drawer relationship workspace

**Template:** `person_drawer_v2` (`buildPersonDrawerDefaultDoc()`)

| Layer | Implementation |
|-------|------------------|
| Composition gate | `shouldUsePersonOverviewComposition()` |
| Shell grid | 3/7/2 — household (3) + connected children (7) + right rail (2) |
| Header | `PersonDrawerCommandHeader` — teal accent (`#0d9488`), household chip, back-to-lead breadcrumb |
| Related adults | `related_people` widget → `PersonRelatedPeopleGroupsWidget` grouped by role |
| Connected children | `PersonConnectedChildrenCardList` — read-first cards (name link, DOB/age/program/status meta) |
| VM hydration | `_household_adult_links`, `_household_child_links`, `_household_context`, `_enrollment_mirror` |
| Lead context fallback | `enrichPersonVmRecordWithOpportunityContext` when opened from Lead with `opportunityId` |

**Role groups (source: `resolvePersonOverviewRelatedPeopleGroups` → `resolvePersonDrawerHouseholdModel`):**

- Parents / Guardians
- Emergency Contacts
- Authorized Pickup
- Other Household Members

---

## 4. Child drawer enrollment/care workspace

**Template:** `child_drawer_v2` (`buildChildDrawerDefaultDoc()`)

| Layer | Implementation |
|-------|------------------|
| Composition gate | `shouldUseChildOverviewComposition()` |
| Shell grid | 3/7/2 — family (3) + program/enrollment (7) + right rail (2) |
| Header | `ChildDrawerCommandHeader` — DOB/age, household, program context |
| Summary cards | Program enrollment, family, documents/requirements, last touch |
| Family relationships | Read-first related list with primary column refs from layout metadata |
| Runtime | `PersonsDrawerVmRuntime` (`isChildSurface`) → `/api/admin/layout-runtime/child-drawer-body` |

---

## 5. Queue row preview doctrine

**Doctrine:** [`docs/system/queue-record-doctrine.md`](../../system/queue-record-doctrine.md)

- Queue row = **compressed operational preview** — not authoritative record truth
- Row click opens primary drawer; linked fields use `dispatchLinkedDrawerOpen` + click isolation
- Layout runtime path: `OperationalQueueRecordRow` + `queueRecordLayoutV3`
- Child lines on queue rows use same merge as drawer: `mergeCanonicalOpportunityLayoutRuntimeChildRows` / `buildOpportunityQueueRowRecordFromPreview`
- Attention widget mirrors drawer: `QueueRecordAttentionWidget` + shared guidance resolvers; enrichment passthrough includes `_operational_recommendation_preview`

---

## 6. `/settings/layouts` ownership doctrine

**LayoutDoc owns:**

- Section keys, titles, rows, columns, items
- Field refs, widget keys, related-list columns
- Item metadata (e.g. `compositionPrimaryColumnRefs`)
- Tab body content placement

**LayoutDoc does not own:**

- Drawer frame, portaling, close semantics
- Header structure and control placement (BOS, Actions, Status, Close)
- Lifecycle rail container placement
- Performance reveal gates, VM swap semantics, cache keys

Org-published `entity_layouts` **always win** over builtin presets. Reset scripts publish new org versions without changing resolver precedence.

---

## 7. Composition ownership doctrine

Composition (`*OverviewComposition.ts`) owns **premium placement** for known canonical section keys only:

| Entity | Composition module | Slot map |
|--------|-------------------|----------|
| Lead | `leadOverviewComposition.ts` | summary, children_enrollment, right rail, overflow |
| Person | `personOverviewComposition.ts` | household, connected_children, right rail, overflow |
| Child | `childOverviewComposition.ts` | family, program, right rail, overflow |

Rules:

- Composition maps section keys → dashboard slots and presentation hints (card list, row caps, compact summary)
- Renderer reads **layout items inside each slot** — never hardcodes field content
- Unknown/custom sections → `overflow` fallback — never dropped
- Gates: `shouldUse*OverviewComposition(doc)` — false for v1 org docs until republished

---

## 8. Header / lifecycle / status ownership doctrine

| Element | Owner |
|---------|--------|
| Header structure | Platform — `*DrawerCommandHeader` when composition active; `ProofRecordModalHeaderShell` for preview/legacy |
| Entity identity (title, avatar, meta chips) | Platform header composers + VM record fields |
| Work with BOS | Platform header controls row |
| Actions menu | Platform registry (`OpportunityDrawerHeaderControls`; person actions still stubbed) |
| **Status dropdown** | Platform — `VmProgressiveStatusDropdown` / entity status control — **sole status source** |
| **Lifecycle rail** | Platform container; VM lifecycle model — **sole stage source** — shown for process entities (Lead) only by default |
| Relationship back navigation | Platform — stack / back-to-lead |

Person and Child: lifecycle rail **hidden by default**. Status shown when entity has operational status.

---

## 9. Summary card doctrine

- Platform places summary strip container (`data-entity-drawer-summary-strip`)
- Layout widgets render inside via `LeadOperatingSummaryCard` / entity-specific summary shells
- Compact row on desktop; scrolls with body (non-sticky in composition mode)
- Last touch, enrollment health, attention, tasks — entity-specific resolvers from **real VM fields only**
- Empty cards: subtle empty states or minimized chrome — no invented data

---

## 10. Activity / right rail collapse doctrine

Section metadata on `LayoutSection.metadata`:

| Key | Default | Purpose |
|-----|---------|---------|
| `priority` | `50` | Rail ordering (lower = higher) |
| `collapseWhenEmpty` | `true` | Hide when content predicates fail |
| `showWhenEmpty` | `false` | Opt-in placeholder only |
| `railSlot` | `null` | `"right_rail"` placement hint |

Helpers: `shouldRenderLayoutRuntimeSection`, `resolve*OverviewRightRailSections`, entity `*OverviewSectionContent.ts` predicates.

Activity preview widgets use entity resolvers (`resolveLeadActivityPreview`, `resolvePersonActivityPreview`, `resolveChildActivityPreview`) — no fake events.

---

## 11. Attention guidance parity (drawer ↔ queue)

Shared module: `resolveLayoutRuntimeAttentionGuidance.ts`

- Summary line priority matches drawer header (`resolveDrawerReviewAssistViewModel`, readiness, queue preview)
- **More guidance** panel: `resolveLayoutRuntimeAttentionGuidanceLines` + `layoutRuntimeAttentionHasMoreGuidance`
- Drawer: `LeadOperatingAttentionSummaryCard`, `DrawerHeaderAttentionBlock`
- Queue: `QueueRecordAttentionWidget` — enrichment passthrough via `buildOpportunityQueueRowRecordFromPreview` → `_operational_recommendation_preview`

---

## 12. Queue / drawer child sourcing consistency

Shared merge: `mergeCanonicalOpportunityLayoutRuntimeChildRows`

| Source | Rule |
|--------|------|
| Household members | Canonical population from active `customer_members` |
| Inquiry overlay | Enrollment context merged onto matching household rows |
| Inquiry-only | Appended when no household match |
| Server enrich | `enrichOpportunityVmRecordWithHouseholdChildren` on layout-runtime path |
| Queue | `buildQueueRowLayoutRuntimeEnrichment` passthrough: `_household_children`, `_inquiry_children`, `_crm_compact_children` |

Match keys: `person_id` → `customer_member_id` → normalized display name.

---

## 13. Org layout v2 reset scripts

Dev/staging helpers publish new org `entity_layouts` versions from builtin v2 presets:

| Entity | Script | Verify | Execute confirm env |
|--------|--------|--------|---------------------|
| Lead | `publishLeadDrawerV2ForOrg.ts` | `npm run dev:layout:verify-lead-drawer-v2` | `LEAD_DRAWER_V2_RESET_CONFIRM=LEAD_DRAWER_V2_RESET` |
| Person | `publishPersonDrawerV2ForOrg.ts` | `npm run dev:layout:verify-person-drawer-v2` | `PERSON_DRAWER_V2_RESET_CONFIRM=PERSON_DRAWER_V2_RESET` |
| Child | `publishChildDrawerV2ForOrg.ts` | `npm run dev:layout:verify-child-drawer-v2` | `CHILD_DRAWER_V2_RESET_CONFIRM=CHILD_DRAWER_V2_RESET` |

Default org: `93667019-bd28-49b5-a688-acc9bb1e0a19`

Execute: `npm run dev:layout:publish-{entity}-drawer-v2:execute` with `ORG_ID=...`

Tests: `web/tests/scripts/*DrawerV2OrgReset.test.ts`

---

## 14. Key files (reference)

| Concern | Path |
|---------|------|
| Doctrine | `docs/system/drawer-operating-model-v1.md` |
| Lead composition | `web/lib/layout/runtime/leadOverviewComposition.ts` |
| Person composition | `web/lib/layout/runtime/personOverviewComposition.ts` |
| Child composition | `web/lib/layout/runtime/childOverviewComposition.ts` |
| Plan renderer | `web/components/layout/LayoutRuntimePlanView.tsx` |
| Shell zones | `web/lib/layout/runtime/splitDrawerLayoutDocShellZones.ts` |
| Default presets | `web/lib/layout/defaultLeadLayouts.ts`, `defaultPersonLayouts.ts`, `defaultChildLayouts.ts` |
| Queue row builder | `web/lib/layout/runtime/buildOpportunityQueueRowRecordFromPreview.ts` |
| Child merge | `web/lib/layout/runtime/mergeCanonicalOpportunityLayoutRuntimeChildRows.ts` |

---

## 15. Known remaining polish

| Gap | Notes |
|-----|-------|
| Person actions menu | Stubbed (`menuActions={[]}`) — registry wiring follow-on |
| Full Activity tab | Overview preview only; workflow event stream is future tab work |
| Section priority UI | Metadata exists; Layout Builder editor for `priority` / `collapseWhenEmpty` not built |
| Org activation | Dev org may still be on v1 published docs until reset scripts executed |
| Legacy emergency fallback | `LAYOUT_RUNTIME_LEGACY_EMERGENCY_FALLBACK` paths remain for cutover safety |
| BOS exploration assets | Visual explorations under `docs/sprints/06_2026/assets/` — not productized |

---

## 16. Performance sprint boundary

**Locked statement:** The AdminV2 runtime performance sprint must **optimize around Drawer Operating Model V1** — composed reveal gates, atomic VM swap, layout body readiness, queue empty semantics, and `/settings/layouts` ownership are **not** redesign targets.

Allowed: faster fetch, better cache hit rate, prefetch tuning, render cost reduction within existing shell/composition boundaries.

Forbidden: partial above-fold reveal, weakening `committedVisible` / `holdPriorPayload`, moving overview content back into platform hardcoded sections, or bypassing layout runtime for entity drawers.

Reference: [`docs/system/adminv2-runtime-performance-doctrine.md`](../../system/adminv2-runtime-performance-doctrine.md)

---

## 17. Tests (closeout run)

```bash
cd web && npm run test -- \
  tests/layout/leadDrawerCommandHeader.test.tsx \
  tests/layout/leadDrawerDefaultPreset.test.ts \
  tests/layout/leadDrawerPatch16.test.tsx \
  tests/layout/leadDrawerPatch17.test.tsx \
  tests/layout/leadDrawerPatch18.test.tsx \
  tests/layout/leadDrawerUsabilityPatch13.test.ts \
  tests/layout/resolveLeadDrawerCommandHeaderMeta.test.ts \
  tests/layout/personDrawerPatch19.test.ts \
  tests/layout/personDrawerPatch21.test.ts \
  tests/layout/buildPersonLayoutRuntimeRecordFromVm.test.ts \
  tests/layout/childDrawerPatch20.test.ts \
  tests/layout/recordDrawers.test.ts \
  tests/adminV2/workUnitQueueRowAttention.test.ts \
  tests/layout/buildOpportunityQueueRowRecordFromPreview.test.ts \
  tests/scripts/leadDrawerV2OrgReset.test.ts \
  tests/scripts/personDrawerV2OrgReset.test.ts \
  tests/scripts/childDrawerV2OrgReset.test.ts
```

See commit message for final pass/fail count at merge time.
