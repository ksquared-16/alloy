# Drawer Operating Model v1

**Path:** `docs/system/drawer-operating-model-v1.md`  
**Status:** Active — **locked at v1 closeout (June 2026)**  
**Canonical index:** **`drawer-doctrine.md`** — read first for ownership and navigation semantics; this doc retains shell/layout detail.  
**Audience:** Platform convergence, AdminV2 drawer runtime, `/admin/settings/layouts`  
**Closeout:** [`../sprints/06_2026/completed/drawer_operating_model_v1_closeout.md`](../sprints/06_2026/completed/drawer_operating_model_v1_closeout.md)  
**Supersedes:** Nothing — extends and operationalizes existing contracts below.

**Governing contracts (must not regress):**

- [`adminv2-runtime-performance-doctrine.md`](./adminv2-runtime-performance-doctrine.md) — composed reveal, no partial above-fold pop-in
- [`drawer-view-model-runtime-contract.md`](./drawer-view-model-runtime-contract.md) — VM compose → preload → apply → pin
- [`../platform_convergence/layout_contract_v1.md`](../platform_convergence/layout_contract_v1.md) — LayoutDoc ownership boundaries
- [`../platform_convergence/layout_runtime_cutover_plan.md`](../platform_convergence/layout_runtime_cutover_plan.md) — entity cutover order and flags

---

## Purpose

Turn entity drawers into **configurable operational workspaces** aligned with queue rows and `/settings/layouts`. This is a **platform contract + implementation foundation**, not a visual redesign sprint.

Drawers share one operating shell. Layout configuration owns **content inside** the shell. Runtime performance and navigation semantics remain platform-owned.

### Locked ownership (v1 closeout — do not regress)

| Concern | Owner | Rule |
|---------|--------|------|
| **LayoutDoc** (`/settings/layouts`) | Content | Sections, fields, widgets, related-list columns, tab body items, item metadata |
| **Composition** | Premium placement | Maps **canonical** section keys to dashboard slots; hints (card list, row caps, compact summary) — **not** field content |
| **Unknown / custom sections** | Overflow fallback | Render in composition overflow slot — never dropped |
| **Header** | Platform | Structure, identity block, BOS, Actions, Status, Close, relationship back link |
| **Lifecycle rail** | Platform container + VM | **Sole stage source** — process entities (Lead) by default; hidden for Person/Child |
| **Status dropdown** | Platform | **Sole status source** in header controls |
| **Queue row** | Preview | Compressed operational surface; links isolate; not authoritative truth |
| **Drawer** | Workspace | Authoritative detail via VM + layout runtime body |
| **Entity patterns** | Reusable | Lead reference model; Person relationship workspace; Child enrollment/care workspace share shell, tokens, composition doctrine |

**Performance boundary:** Future performance work optimizes **around** this model (fetch, cache, prefetch, render cost) — it does **not** redesign shell ownership, weaken reveal gates, or move overview content back into hardcoded platform sections.

---

## Audit snapshot (current architecture — June 2026)

### Drawer entry and shell components

| Entity | Router | Runtime component | Physical shell |
|--------|--------|-------------------|----------------|
| Opportunity | `AdminEntityDrawer` → `"opportunity"` | `OpportunityDrawerVmRuntime` | `Drawer` (`variant="adminV2"`, `presentation="modal"`) |
| Person (parent/generic) | `AdminEntityDrawer` → `"person"` | `PersonsDrawerVmRuntime` | Same |
| Child (customer member) | `AdminEntityDrawer` → `"child"` route coerced to `PersonsDrawerVmRuntime` | `PersonsDrawerVmRuntime` (`isChildSurface`) | Same |
| All other entities | `AdminEntityDrawer` → `"legacy"` | `AdminEntityDrawerLegacy` (~19k LOC) | `Drawer` (mixed variants) |

**Shared shell primitives already exist:**

- **Frame / scroll / close / z-index:** `web/components/admin/Drawer.tsx`
- **Proof-layout header (title, tabs, lifecycle rail container):** `web/components/layout/proofShell/ProofRecordModalHeaderShell.tsx`
- **Entity-specific header composers:** `OpportunityDrawerProofLayoutHeader`, `PersonDrawerProofLayoutHeader`
- **VM runtime router + atomic swap:** `AdminEntityDrawer`, `vmDrawerTransitionCoordinator`, `vmDrawerAtomicSwap`

**Orphan / do not extend:** `ChildDrawerVmRuntime.tsx` — not mounted by router; child uses `PersonsDrawerVmRuntime`.

### Where regions render today

| Region | Opportunity (layout cutover ON) | Person/Child (layout cutover ON) | Legacy drawer |
|--------|--------------------------------|----------------------------------|---------------|
| Header title / location chip | `ProofRecordModalHeaderShell` via `OpportunityDrawerProofLayoutHeader` | `PersonDrawerProofLayoutHeader` | Multi-slot `Drawer` header props |
| Work with BOS + Actions | `OpportunityDrawerHeaderControls` in proof header controls row | `PersonDrawerHeaderControls` (actions stub; menu empty) | Entity-specific header actions |
| Status dropdown | `VmProgressiveStatusDropdown` in proof header | `VmPersonStatusControl` (read-only pill) | Mixed |
| Attention (header row 2) | **Not in proof header** (`attention={null}`) — widgets move to layout body | Same | `DrawerHeaderAttentionBlock` / `headerSignals` |
| Tabs | Proof header row 3 | Proof header row 3 | `headerExtra` tab strip |
| Lifecycle rail | Proof header row 4 — `ProofDoctrineLifecycleRail` from VM model | Hidden unless `LAYOUT_RUNTIME_LEGACY_EMERGENCY_FALLBACK` — legacy `PersonDrawer*LifecycleRail` | Entity-specific `postTabStrip` |
| Summary / operational widgets | **Layout-owned** — `DrawerLayoutRuntimeOverviewBody` → `LayoutRuntimeDrawerBodyView` | Same | Hardcoded VM sections (`OpportunityDrawerInquiryWorkflowOverview`, `PersonDrawerOperatingSections`) |
| Overview cards / fields | `/api/admin/layout-runtime/*-drawer-body` | Same | Hardcoded section components |
| Tab panes (non-overview) | `OpportunityDrawerVmTabPanes` + background prefetch | `PersonDrawerVmTabPanes` | Legacy tab bodies |
| Save bar | `OpportunityDrawerBodySaveBar` footer chrome | Same | Entity-specific |
| Relationship back link | Queue navigator only | Person proof header back link (`goBack` / `goBackToLead`) | Stack navigation in legacy |

### Hardcoded vs layout-driven

| Concern | Owner today | Target owner (v1) |
|---------|-------------|-------------------|
| Drawer frame, portaling, close | Platform (`Drawer.tsx`) | Platform |
| Header structure, BOS/Actions/Status placement | Platform (proof header shell) | Platform |
| Tab strip container + tab keys | Platform shell; tab **labels/order** may come from VM/layout | Platform container; layout may configure tab visibility/content |
| Lifecycle rail container | Platform shell | Platform container |
| Lifecycle rail **content** | VM (`buildOpportunityVmLifecycleRailModel`) or legacy person rails | VM + lifecycle config; hidden by entity rule (§6) |
| Summary strip widgets | Layout runtime body (when cutover ON) | Layout (`/settings/layouts`) |
| Overview cards, field placement, related tables | Layout runtime (cutover path) | Layout |
| Registry actions / status mutation | Platform header controls + VM `actions` / `header.status` | Platform |
| Performance reveal gates | Platform (`committedVisible`, layout body `bodyReady`, runtime phase) | Platform |

### VM / runtime data paths

```
Queue row / link click
  → AdminDrawerContext.openDrawer / openDrawerModelSwap
  → prepareDrawerViewModel (cache peek → load*DrawerViaViewModel)
  → drawerRuntimePhase: swap_preparing → showing
  → AdminEntityDrawer.resolveVmDrawerDisplayRoute (atomic swap — source VM held)
  → use*DrawerVmPayload hook (displayVm, holdPriorPayload)
  → Entity *ProofLayoutHeader + *OverviewBody
  → useDrawerLayoutRuntimeBody → GET /api/admin/layout-runtime/{entity}-drawer-body
```

**VM API routes:**

| Entity | Primary VM route |
|--------|------------------|
| Opportunity | `GET /api/admin/v2/view-models/drawer/opportunity/[id]` |
| Person | `GET /api/admin/v2/view-models/drawer/person/[id]` |
| Child | `GET /api/admin/v2/view-models/drawer/child/[id]` |

**Load helpers:** `loadOpportunityDrawerViaViewModel`, `loadPersonDrawerViaViewModel`, `loadChildDrawerViaViewModel`  
**Session cache:** `drawerViewModelSessionCache.ts`, `drawerTargetCache.ts`  
**Swap navigation:** `drawerModelSwapNavigation.ts`, `drawerShellPinnedModelSwap.ts`

### Linked drawer navigation and preload

- **Single dispatch path:** `dispatchLinkedDrawerOpen` ← queue rows (`openQueueRecordLinkedDrawer`) and drawer layout links (`LayoutRuntimeLinkSurface`, adornment handlers)
- **Click isolation:** `isolateLayoutRuntimeLinkClick` — relationship links must not bubble to row/drawer open
- **Atomic transition:** `drawerRuntimePhase.phase === "swap_preparing"` holds source `drawerVmRender` until target VM preload ready; `holdPriorPayload` prevents title-only swaps
- **Preload:** `prepareDrawerViewModel` on row intent/hover (work-unit page, `QueueBlock`); `peekDrawerViewModelCacheEntry` on swap; opportunity tab/communications background prefetch after commit

### Queue row compatibility (must preserve)

**Doctrine:** **`docs/system/queue-record-doctrine.md`** — compressed operational surface; `/settings/layouts` is content source of truth.

- Row click opens primary record via `onOpen` — guarded by `shouldIgnoreQueueRowOpenClick` / `data-queue-row-interactive`
- Linked fields: `QueueRecordFieldRenderer` → `QueueRecordLinkedField` → `dispatchLinkedDrawerOpen` with event isolation (one path for person, child, opportunity, related)
- Adornment icon buttons: `data-layout-runtime-adornment-link="true"`
- Layout runtime queue path: `OperationalQueueRecordRow` + `queueRecordLayoutV3` config
- Card hover must not activate on linked-field hover (CSS `:not(:has(...))` on operational row card)
- Opportunity queue navigator in drawer: `opportunityQueueNavigator` + `navigateOpportunityInQueue` — separate from relationship links

---

## 1. Shared drawer shell (platform-owned)

The platform owns the **operating shell** — one composition per AdminV2 entity drawer, not three visual designs.

### Shell regions (top → bottom)

1. **Drawer frame** — portaled panel, backdrop, accent, max-width, escape/outside-click close (`Drawer.tsx`)
2. **Header** — entity identity, context line, chips, relationship back navigation when applicable
3. **Lifecycle rail container** — renders rail when entity rule says show (§6); empty container omitted when hidden
4. **Summary strip container** — slot immediately below tabs (or first scroll region) reserved for operational widgets; **content** from layout (§7)
5. **Tabs container** — tab strip + active tab body host
6. **Work with BOS** — header controls row, entity-scoped (`BosDrawerAssistCta`)
7. **Actions** — registry actions menu (`OpportunityDrawerHeaderActionsMenu` / future person actions)
8. **Status dropdown** — when status applies (`VmProgressiveStatusDropdown` / entity status control)
9. **Close** — platform close button in header
10. **Relationship navigation** — stack back / back-to-lead; atomic VM swap (§8)
11. **Performance reveal contract** — no shell visible until coordinated gate satisfied (§9)

### Code anchors (current)

| Slot | Component / module |
|------|-------------------|
| Frame | `web/components/admin/Drawer.tsx` |
| Header + tabs + lifecycle container | `web/components/layout/proofShell/ProofRecordModalHeaderShell.tsx` |
| Opportunity composer | `web/components/admin/vmDrawer/OpportunityDrawerProofLayoutHeader.tsx` |
| Person/child composer | `web/components/admin/vmDrawer/PersonDrawerProofLayoutHeader.tsx` |
| Typed shell contract (v1) | `web/lib/admin/drawer/entityDrawerOperatingModel.ts` |
| Future unified wrapper | `web/components/admin/drawer/EntityDrawerOperatingShell.tsx` (patch 2+) |

### Layouts must NOT own

- Shell frame or portaling
- Header row structure (title / controls / close positions)
- Lifecycle **container** placement
- Summary strip **container** placement
- Tabs **container** placement
- BOS / Actions / Status **placement**
- Performance model, reveal gates, or swap semantics

---

## 2. Layout-owned content (`/settings/layouts`)

`/settings/layouts` (LayoutDoc + field catalog) owns everything **inside** the scroll body and configurable presentation:

- Overview cards and blocks
- Widgets (attention, tasks, tour, children, household, communications, etc.)
- Field placement, labels, ordering, visibility
- Related-record tables and link surfaces
- Tab **contents** (which blocks appear on which tab)

Resolution path: effective layout doc → `useDrawerLayoutRuntimeBody` → `LayoutRuntimeDrawerBodyView` / `LayoutRuntimePlanView`.

**Fallback:** When layout runtime is off or doc empty, VM-shaped emergency fallback (`*LegacyOperatingOverview`) may render temporarily — not a target state. Hard cutover surfaces `LayoutRuntimeErrorPanel` instead of silent legacy drift.

---

## 3. Entity drawer defaults

Defaults describe out-of-box **layout presets** and VM first-viewport expectations — not hardcoded React trees in platform shell code.

### Opportunity / Lead drawer

- **Focus:** household / enrollment process
- **Header context:** primary contact, campus/location chip
- **Lifecycle:** show enrollment pipeline rail (process entity)
- **Operational status:** workflow status dropdown
- **Centerpiece widgets:** children & enrollment, attention, tasks, tour/event, activity signals
- **Default tabs:** Overview, Communications, Notes, Documents, Activity (`OPPORTUNITY_INQUIRY_WORKFLOW_TAB_STRIP` — History may split from Activity in a future tab-key addition)

### Person / Parent drawer

- **Focus:** relationship / contact profile
- **Header context:** household relationships, role chips
- **Lifecycle:** **hidden by default** (§6)
- **Centerpiece widgets:** household, associated children, communications, notes
- **Default tabs:** Overview, Activity (`related`), Documents, Communications

### Child drawer

- **Focus:** child / enrollment record (`customer_members` surface)
- **Header context:** DOB/age, program/classroom/status
- **Lifecycle:** **hidden by default** (§6)
- **Centerpiece widgets:** program, classroom, attendance, next step, associated adults
- **Default tabs:** Overview, Activity, Documents, Communications (aligned with person chrome where shared)

---

## 4. Shared header contract

Every drawer header **must** expose the same control set when data exists:

| Element | Requirement |
|---------|-------------|
| Entity icon/avatar | Show when VM/catalog provides avatar or entity glyph |
| Primary title | Record display name — no placeholder swap after commit |
| Subtitle/context | Stage, location, role, or record number line |
| Key chips | Location, program, status chips as VM/header inputs |
| Work with BOS | When BOS eligible for entity + record context |
| Status dropdown | When entity has operational status (not hidden by rule) |
| Actions dropdown | Registry actions when configured for entity/workspace |
| Close | Always — platform-owned |

**Implementation reference:** `ProofRecordModalHeaderShell` row 1 layout — title left; BOS + Actions + Status + Close right.

**Gap (v1 sprint):** Person drawer actions menu is stubbed (`menuActions={[]}`); opportunity is gold standard.

---

## 5. Lifecycle rule

Show lifecycle rail **only for process entities by default:**

- Lead / Opportunity
- Enrollment (opportunity enrollment lifecycle)
- Contract
- Waitlist

**Hide by default:**

- Person / Parent
- Child
- Room
- Program

**Override:** explicit layout or entity configuration may enable lifecycle for non-process entities — platform renders container; config supplies rail model.

**Current state:** Opportunity shows VM lifecycle rail. Person/child hide rail in layout cutover; legacy emergency fallback may show deprecated `PersonDrawer*LifecycleRail`.

---

## 6. Summary strip contract

The summary strip is the **first operational widget row** below the tab strip (inside scroll body or dedicated shell slot — platform places container, layout fills content).

Uses configurable operational widgets from LayoutDoc blocks — same widget registry as queue/drawer convergence.

| Entity | Example widgets |
|--------|-----------------|
| Lead / Opportunity | Attention, Tasks, Tour/Event, Children |
| Parent | Household, Children, Communications, Notes |
| Child | Program, Classroom, Attendance, Next Step |

**Migration note:** Legacy opportunity `headerSignals` / inquiry summary columns (`OpportunityDrawerInquiryWorkflowOverview`) move fully into layout widgets under cutover — not duplicated in platform header.

**Patch 4 boundary (implemented):**

- Platform container: `EntityDrawerOperatingShell.summaryStrip` (`data-entity-drawer-summary-strip`)
- Layout partition: `splitDrawerLayoutDocShellZones()` + `DRAWER_SUMMARY_STRIP_SECTION_KEYS` (section keys only — not widget markup)
- Layout render host: `DrawerLayoutRuntimeShellZoneView` → `LayoutRuntimeDrawerBodyView`
- Opt-in flag: `NEXT_PUBLIC_DRAWER_SUMMARY_STRIP_BOUNDARY=1` (default **off** — full doc remains in scroll body until enabled)
- Opportunity default summary section key: `lead_summary`

**Patch 5 preset (implemented):**

- Default template: `lead_drawer_v2` (`buildLeadDrawerDefaultDoc()`)
- `lead_summary` section: operational widget row only — `attention`, `tasks`, `tour_summary`, `children_list`
- Body opens with `children_enrollment` (Children & Enrollment related-list table — enrollment context per child)
- Followed by `household_contact`, `lead_source`, `notes_communication`, `activity` (future module placeholder)
- Production widgets added in layout runtime: `tour_summary`, `children_list` (`LayoutRuntimeChildrenListWidget`)
- VM section alias: `inquiry_children` → `children_enrollment` (+ legacy `children_inquiry` for saved org docs)
- Boundary flag remains default **off** — preset works in full scroll body until `NEXT_PUBLIC_DRAWER_SUMMARY_STRIP_BOUNDARY=1`

**Patch 6 staging validation (implemented):**

- Boundary defaults **on** in `NODE_ENV=development`, `NEXT_PUBLIC_APP_ENV=staging`, and `VERCEL_ENV=preview`; **off** in production unless explicitly set
- Override: `NEXT_PUBLIC_DRAWER_SUMMARY_STRIP_BOUNDARY=0|1` (client), `DRAWER_SUMMARY_STRIP_BOUNDARY=0|1` (server)
- Platform strip spacing: sticky strip container (`data-entity-drawer-summary-strip`), scroll body host (`data-entity-drawer-scroll-body`), compact summary zone (`sectionPresentation="summary_strip"` — no duplicate section title chrome)
- Widget internals unchanged; Person/Child presets unchanged

**Lead overview composition (Patch 8–9 — layout-aware shell):**

Composition is **not** a hardcoded replacement for `/adminV2/settings/layouts`. Org-published `entity_layouts` LayoutDocs remain authoritative.

| Layer | Owns |
|-------|------|
| **LayoutDoc** (`/settings/layouts`) | Section keys, items, field refs, related-list columns, widget keys, item metadata (e.g. `compositionPrimaryColumnRefs`) |
| **Composition shell** (`leadOverviewComposition.ts`) | Known section key → dashboard slot mapping, shell grid spans (3/7/2), overflow fallback for unknown sections, presentation hints (compact summary, row cap) |
| **Renderer** | Reads layout items inside each slot; filters enrollment columns from layout item metadata when composition is active |

Rules:

- Default beauty first via `buildLeadDrawerDefaultDoc()` / `lead_drawer_v2` template.
- Custom sections not in the slot map render in `data-lead-overview-slot="overflow"` — never dropped.
- Field/column content is never hardcoded in the composition layer; constrained enrollment columns come from `metadata.compositionPrimaryColumnRefs` on the related-list item.
- Future safe customization: operators edit sections/fields/columns in Layout Builder; composition shell placement stays stable so the operating workspace structure is not breakable by field moves alone.

---

## 6.1 Operating Surface Doctrine (Patch 10 — reusable Alloy standard)

This doctrine codifies the Lead drawer visual direction as a **platform operating-surface standard**. It applies to Lead first; Person drawer, Child drawer, and queue rows inherit the same tokens and rules in later patches.

### Operating Surface Doctrine

| Principle | Rule |
|-----------|------|
| Canvas | White primary canvas; no blue-gray tinted workspace backgrounds |
| Structure | Subtle borders + soft slate dividers; avoid nested boxes |
| Accent | Bend Pine (`alloy-juniper`) left rail on **one** primary operational section only |
| Content ownership | LayoutDoc + metadata own fields, columns, widgets — never hardcode entity content in renderers |
| Composition | Shell placement maps section keys to slots; layout items render inside slots |

Shared tokens: `web/lib/layout/runtime/layoutRuntimeSurfaceStyles.ts`

### Header Doctrine

| Element | Rule |
|---------|------|
| Lead runtime | `LeadDrawerCommandHeader` — **not** `ProofRecordModalHeaderShell` when Lead composition is active |
| Proof / preview | `ProofRecordModalHeaderShell` remains for layout config preview and non-lead paths |
| Identity block | Gradient card with juniper avatar — strongest visual weight in header row |
| Title | Record name — largest weight (`~1.4–1.5rem`), semibold |
| Meta row | Identity/context only: **Primary contact · Household · Campus** — segmented, campus as juniper chip |
| Contact row | Email · phone — visible from `md+`; never duplicate lifecycle stage/status |
| Controls | BOS (juniper) → Actions → Status → Close — top-right, aligned with identity block |
| Lifecycle | Proof header row 4 — sole lifecycle/stage source (`ProofDoctrineLifecycleRail`) |
| Status | `VmProgressiveStatusDropdown` — sole status source in header controls |
| Markers | `data-lead-drawer-command-header-root`, `data-lead-drawer-header-meta-row`, `data-lead-drawer-header-campus-chip` |

### Activity & Right Rail Doctrine (Patch 16)

| Element | Rule |
|---------|------|
| Activity widget | `LeadActivityPreview` via layout widget key `activity` — **not** a Future Module placeholder |
| Data sources | Notes, communication, open tasks, `_activity_signal` / `last_activity_*`, `created_at` / `updated_at` on VM record |
| No fake data | `resolveLeadActivityPreview` — empty preview when no VM fields; no invented events |
| Right rail order | Layout section `metadata.priority` — lower number = higher on rail (default: activity 10, notes 20) |
| Empty collapse | `metadata.collapseWhenEmpty: true` (default) — hide section when content predicates fail |
| Show when empty | `metadata.showWhenEmpty: true` — opt-in placeholder only when explicitly configured |
| Rail slot | `metadata.railSlot: "right_rail"` — composition shell placement hint |
| Notes / comm widgets | `LayoutRuntimeNotesCommunicationWidget` — widget-level null when empty (no wasted boxes) |
| Lead source | Below grid; collapses when source/channel/campaign all empty |
| Markers | `data-lead-activity-preview`, `data-lead-overview-right-rail-section-count`, `data-layout-runtime-notes-widget` |

### Layout Section Metadata (Patch 16)

Optional keys on `LayoutSection.metadata` (backward-compatible — absent keys use defaults):

| Key | Default | Purpose |
|-----|---------|---------|
| `priority` | `50` | Rail / footer ordering (lower = higher priority) |
| `collapseWhenEmpty` | `true` | Hide section when content predicates fail |
| `showWhenEmpty` | `false` | Show empty placeholder when explicitly `true` |
| `railSlot` | `null` | `"right_rail"` \| `"body"` \| `"footer"` — composition placement hint |

Helpers: `readLayoutSectionPresentationMetadata`, `shouldRenderLayoutRuntimeSection`, `resolveLeadOverviewRightRailSections`.

Content predicates (VM-derived): `leadActivitySectionHasVisibleContent`, `leadNotesCommunicationSectionHasVisibleContent`, `leadLeadSourceSectionHasVisibleContent` in `leadOverviewSectionContent.ts`.

### Summary Strip Doctrine

| Element | Rule |
|---------|------|
| Layout | Single compact row on desktop (`data-layout-runtime-summary-row`) |
| Scroll | Non-sticky — scrolls with overview body (`data-entity-drawer-summary-strip-scrolls`) |
| Strip host | Transparent — no white strip backdrop |
| Cards | `LeadOperatingSummaryCard` — Attention, Tasks, Last Touch, Enrollment Health |
| Layout keys | `attention`, `tasks`, `tour_summary` → Last Touch (`last_touch`), `children_list` → Enrollment Health |
| Last Touch | `resolveLeadSummaryLastTouch` — note → communication → activity; **never** open tasks (Tasks card owns tasks) |
| Empty Last Touch | Subtle empty state: "No recent note or touch" + hint — no task duplication |
| Enrollment Health | `summarizeLeadDrawerEnrollmentHealth` — counts + latest start + View enrollment link |
| Date display | `formatLayoutRuntimeOperatorDate` — MM-DD-YYYY; with time MM-DD-YYYY h:mm A (summary cards, tasks, comm, enrollment) |
| Communication | Not a top card; right-rail `notes_communication` hidden when empty |
| Container | `data-entity-drawer-summary-strip` inside `data-entity-drawer-scroll-body` |

### Primary Workspace Card Doctrine

| Element | Rule |
|---------|------|
| Role | Dominant operational section (Lead: `children_enrollment`) |
| Accent | Bend Pine left border only on this card |
| Header | Eyebrow label + section title (composition mode) |
| Body | Full-width related record grid — not a plain HTML table |
| Markers | `data-layout-runtime-primary-workspace-section`, `data-lead-overview-composition-section` |

Eyebrow map (presentation labels only): `LEAD_COMPOSITION_SECTION_EYEBROWS` in `leadOverviewComposition.ts`.

### Related Record Grid Doctrine

| Element | Rule |
|---------|------|
| Lead renderer | `LeadEnrollmentCardList` when `leadEnrollmentCardList` — compact child cards, not table/grid |
| Default mode | Read card rows: name link + labeled meta line (`formatLeadEnrollmentCardMetaLine`) |
| Meta line | All configured columns except name link — value when present, else `{label} —`; joined with ` · ` |
| Edit | Row **Edit** reveals inline fields; **Done** collapses |
| Columns | From layout `related_list.columns`; card list shows **all** configured columns (no primary-only filter) |
| Max rows | 5 visible + clickable `View all children` footer (`data-lead-enrollment-view-all`) expands list + scrolls to section |
| Fallback | `LayoutRuntimeEnrollmentGrid` when card list hint off |
| Markers | `data-lead-enrollment-card-list`, `data-lead-enrollment-card-row` |

### Edit Behavior Doctrine

| Element | Rule |
|---------|------|
| Save coordinator | `LayoutRuntimeDrawerEditProvider` + drawer operating save bar |
| Default | Read-only roster cells — edit controls hidden until row **Edit** |
| Inline edit | Compact `LayoutRuntimeFieldInput` only in active edit row |
| Placeholders | Row **Edit** shown when adapters exist; row stays read-only until clicked |

**Later application:** Person drawer, Child drawer, and queue row surfaces reuse these tokens and grid patterns — not implemented in Patch 10.

---

## 7. Relationship navigation contract

Any visible relationship link must:

1. **Isolate clicks** — `isolateLayoutRuntimeLinkClick` / `data-layout-runtime-adornment-link` — no row/drawer accidental open
2. **Prefetch target VM** — `prepareDrawerViewModel` on intent where handlers provide prefetch hooks
3. **Atomic drawer transition:**
   - Do not teardown current drawer until next drawer VM is ready
   - No title-only swaps (`committedVisible` gate)
   - No blank shells (`OpportunityDrawerOpeningOverlay` during prepare)
   - Hold prior payload (`holdPriorPayload`, `data-drawer-vm-transition-hold`)
   - Subtle transition cue **after** content swap committed only
4. **Stack semantics** — `parent` on `openDrawer`, `goBack`, `goBackToLead` restore pinned opportunity snapshot

**Dispatch paths:** `dispatchLinkedDrawerOpen`, `handleLayoutRuntimeAdornmentOpenDrawer`, `handlePersonDrawerLayoutRuntimeAdornmentOpenDrawer`

---

## 8. Performance contract

Drawer first reveal requires **coordinated readiness** — aligned with [`adminv2-runtime-performance-doctrine.md`](./adminv2-runtime-performance-doctrine.md):

| Gate | Ready when |
|------|------------|
| Header | VM `structureSettled` + `committedVisible` |
| Lifecycle | Rail model ready or hidden-by-rule (hidden = ready) |
| Summary strip | Layout body `bodyReady` OR hidden on non-overview tab |
| Initial tab (Overview) | Layout doc + record resolved OR VM fallback contract satisfied |
| Actions | VM `actions` settled |
| Status | VM `header.status` + label resolved |

**Forbidden:** progressive pop-in of primary controls; section-owned above-fold skeletons; clearing valid data before replacement ready on warm navigation.

**Tabs:** prefetch or cache tab payloads (`OpportunityDrawerTabBackgroundLoader`, communications prefetch) so tab switch feels instant after first reveal.

**Related targets:** preload from visible relationship links via `prepareDrawerViewModel` / session cache peek.

**Protected files:** see doctrine § Runtime-sensitive files — any shell work touching reveal gates requires the drawer determinism test suite.

---

## 9. Implementation sequence (smallest safe path)

| Step | Work | Risk |
|------|------|------|
| **1** | Confirm shared shell — document + typed contract (`entityDrawerOperatingModel.ts`); add `EntityDrawerOperatingShell` wrapper | Low |
| **2** | Normalize header — single controls row order: BOS → Actions → Status → Close; wire opportunity gold standard | Medium |
| **3** | Normalize summary strip container — platform slot; migrate widgets out of legacy headerSignals | Medium |
| **4** | Opportunity drawer — adopt unified shell; remove duplicate legacy header slots when cutover ON | Medium |
| **5** | Person + Child — same shell; parity actions/BOS; lifecycle hidden by default | Medium |
| **6** | Delete dead paths — `ChildDrawerVmRuntime`, legacy header duplication | Low after parity |
| **7** | Layout-only content — ensure no new hardcoded overview sections; extend layout presets | Ongoing |

**Do not:** three separate drawer designs; styling-only PRs; moving layout ownership back into entity components; queue row behavior changes without explicit queue task.

---

## 10. Proposed files to modify (implementation waves)

### Wave 1 — Shell extraction + header normalization

- `web/components/admin/drawer/EntityDrawerOperatingShell.tsx` *(new)*
- `web/lib/admin/drawer/entityDrawerOperatingModel.ts` *(new — contract types)*
- `web/components/layout/proofShell/ProofRecordModalHeaderShell.tsx`
- `web/components/admin/vmDrawer/OpportunityDrawerProofLayoutHeader.tsx`
- `web/components/admin/vmDrawer/PersonDrawerProofLayoutHeader.tsx`
- `web/components/admin/opportunity/OpportunityDrawerHeaderControls.tsx`
- `web/components/admin/entity/PersonDrawerHeaderControls.tsx`

### Wave 2 — Runtime adoption (gold standard → person/child)

- `web/components/admin/vmDrawer/OpportunityDrawerVmRuntime.tsx`
- `web/components/admin/vmDrawer/PersonsDrawerVmRuntime.tsx`
- `web/components/admin/AdminEntityDrawer.tsx`

### Wave 3 — Summary strip + layout boundary

- `web/components/admin/vmDrawer/DrawerLayoutRuntimeOverviewBody.tsx`
- `web/components/layout/LayoutRuntimeDrawerBodyView.tsx`
- `web/lib/layout/runtime/useDrawerLayoutRuntimeBody.ts`
- Layout presets / default lead layouts under `web/lib/layout/`

### Wave 4 — Cleanup

- `web/components/admin/vmDrawer/ChildDrawerVmRuntime.tsx` *(remove or redirect)*
- `web/components/admin/AdminEntityDrawerLegacy.tsx` *(only if entity migrates — out of v1 scope for opp/person/child)*

### Tests (required when touching runtime-sensitive paths)

```bash
cd web && npm run test -- \
  tests/adminV2/viewModel/vmDrawerRuntime.test.ts \
  tests/adminV2/viewModel/vmDrawerAtomicSwap.test.ts \
  tests/adminV2/viewModel/vmDrawerTransitionCoordinator.test.ts \
  tests/adminV2/viewModel/drawerLinkedGraphNavigation.test.ts \
  tests/layout/dispatchLinkedDrawerOpen.test.ts \
  tests/admin/drawer/drawerDeterminism.test.ts \
  tests/admin/drawer/composedDrawerPayload.test.ts \
  tests/admin/drawer/drawerAboveFoldCoordinatedReveal.test.ts
```

---

## 11. Risks

| Risk | Mitigation |
|------|------------|
| Regress composed reveal / atomic swap | Do not weaken `committedVisible`, `holdPriorPayload`, or runtime phase gates; run VM swap tests |
| Queue row link regression | Preserve `dispatchLinkedDrawerOpen` + isolation attributes; run queue link tests |
| Split ownership (shell vs layout) | Code review against §1–2; no overview sections in platform shell PRs |
| Person actions gap | Stub until registry wired — document as known gap; do not fake actions in layout |
| Legacy emergency fallback drift | Remove person lifecycle rails from emergency path once layout widgets cover parity |
| Dual header paths (cutover ON/OFF) | Converge on `composedStickyHeader` only; delete legacy multi-slot header when flags stable |
| `ChildDrawerVmRuntime` confusion | Delete in cleanup wave — single `PersonsDrawerVmRuntime` |

---

## 12. Person/Child drawer adoption (v1 closeout — implemented)

Lead drawer operating surfaces are the **reference model**. Person and Child v2 composition, command headers, summary cards, activity/right-rail collapse, and read-first related lists are **implemented** in this sprint — not future work.

### Person — relationship workspace (`person_drawer_v2`)

| Piece | Path / role |
|-------|-------------|
| Composition gate | `shouldUsePersonOverviewComposition()` |
| Shell + grid | `PersonOverviewRuntimeComposition` — 3/7/2 household / connected children / right rail |
| Command header | `PersonDrawerCommandHeader` — teal accent, household chip, back-to-lead |
| Related adults | `PersonRelatedPeopleGroupsWidget` + `resolvePersonOverviewRelatedPeopleGroups` |
| Connected children | `PersonConnectedChildrenCardList` — read-first cards |
| VM hydration | `buildPersonLayoutRuntimeRecordFromVm`, `enrichPersonVmRecordWithOpportunityContext` |
| Reset script | `publishPersonDrawerV2ForOrg.ts` |

### Child — enrollment/care workspace (`child_drawer_v2`)

| Piece | Path / role |
|-------|-------------|
| Composition gate | `shouldUseChildOverviewComposition()` |
| Shell + grid | `ChildOverviewRuntimeComposition` — 3/7/2 family / program / right rail |
| Command header | `ChildDrawerCommandHeader` |
| Summary cards | Program, family, documents, last touch shells |
| Family list | Read-first related list with layout primary column refs |
| Runtime route | `PersonsDrawerVmRuntime` (`isChildSurface`) |
| Reset script | `publishChildDrawerV2ForOrg.ts` |

### Shared reuse (all three entities)

| Piece | Path / role |
|-------|-------------|
| Operating shell | `EntityDrawerOperatingShell` — scroll body, summary strip, save bar slot |
| Summary card chrome | `LeadOperatingSummaryCard` pattern (entity-specific shells) |
| Plan renderer | `LayoutRuntimePlanView` + `LayoutRuntimeCompositionProvider` hints |
| Section metadata | `layoutSectionPresentationMetadata.ts`, `shouldRenderLayoutRuntimeSection` |
| Activity preview | Entity resolvers — `resolve*ActivityPreview` from VM fields only |
| Notes/comm widgets | `LayoutRuntimeNotesCommunicationWidget` pattern |
| Date formatting | `formatLayoutRuntimeOperatorDate`, `formatLayoutRuntimeRepeaterColumnDisplay` |
| Related record rows | Card list pattern — `LeadEnrollmentCardList`, `PersonConnectedChildrenCardList` |
| Edit coordinator | `LayoutRuntimeDrawerEditProvider` + operating save bar |
| Link isolation + drawer open | `isolateLayoutRuntimeLinkClick`, `dispatchLinkedDrawerOpen` |
| Attention guidance | `resolveLayoutRuntimeAttentionGuidance` — drawer + queue parity |

### Queue reuse

Queue rows inherit **date formatting**, **empty-collapse**, **child merge**, and **attention guidance** patterns — not drawer section metadata directly. Queue layout remains `queueRecordLayout*` + `/settings/layouts`.

### Known gaps (post v1 closeout)

- Person actions menu stubbed until registry wired
- Full workflow-event Activity tab (overview preview covers notes/comm/tasks/metadata only)
- Org-configurable section priority via settings UI (metadata exists, editor UI does not)
- Org v2 activation requires reset scripts where published docs remain v1

**Out of scope for performance sprint:** changing resolver contracts, VM reveal gates, or layout ownership.

---

## 13. Lead reference freeze + child sourcing (Patch 18 — extended at v1 closeout)

**Lead drawer remains the reference implementation** for operating-surface tokens and composition doctrine. Person/Child adopt the same patterns with entity-specific slots and resolvers.

### Child / enrollment sourcing doctrine

| Rule | Detail |
|------|--------|
| Canonical population | Active household `customer_members` (or structured CRM compact lines derived from them on queue rows) |
| Enrollment overlay | Inquiry-linked children merge enrollment context (`inquiry_child.*`, program/start/schedule) onto matching household rows |
| Household-only | Children without inquiry linkage still render; enrollment fields stay empty (`—`) — not hidden |
| Inquiry-only | Manually-created inquiry children without household match append after household rows |
| Shared merge | `mergeCanonicalOpportunityLayoutRuntimeChildRows` — used by `resolveOpportunityLayoutRuntimeChildrenRows` (drawer) and `buildOpportunityQueueRowRecordFromPreview` (queue) |
| Match keys | `person_id` → `customer_member_id` → normalized display name |
| Server enrich | `enrichOpportunityVmRecordWithHouseholdChildren` attaches `_household_children` whenever missing (even when `_inquiry_children` exists) — layout-runtime only, not a VM gate change |
| Queue enrichment | `buildQueueRowLayoutRuntimeEnrichment` passthrough: `_inquiry_children`, `_household_children`, `_crm_compact_children` |

**Explicit non-goals:** changing resolver precedence, inquiry filter rules (`filterInquiryChildRowsForDrawer`), or layout doc ownership. Display caps (`maxItems` on queue repeaters) remain layout-configured.

### Activity preview doctrine

| Rule | Detail |
|------|--------|
| Widget | `activity` widget key → `LeadActivityPreview` via `resolveLeadActivityPreview` |
| Sources (real data only) | Notes, recent communication, open tasks, last activity signal, created/updated metadata, lifecycle summary (`_child_lifecycle_summary*`), current status + `updated_at` |
| Empty behavior | Section collapses when no entries (`collapseWhenEmpty` metadata + composition null render) — no placeholder, no invented events |
| Not in scope | Full Activity tab / workflow event stream — future tab work |

### Person/Child should reuse (from Lead freeze)

- `mergeCanonicalOpportunityLayoutRuntimeChildRows` pattern (entity-specific household + enrollment sources)
- `LeadActivityPreview` + resolver pattern with entity VM fields
- Section metadata: `priority`, `collapseWhenEmpty`, `showWhenEmpty`, `railSlot`
- `EntityDrawerOperatingShell`, command header, operating summary cards, link isolation
- Operator date formatting helpers

### Person/Child remains entity-specific

- Household/enrollment source tables and field shapes
- Summary card content (last touch, enrollment health analogs)
- BOS/actions header wiring
- `LeadOverviewRuntimeComposition` grid slots

---

## 14. Related

- VM runtime: [`drawer-view-model-runtime-contract.md`](./drawer-view-model-runtime-contract.md)
- Performance: [`adminv2-runtime-performance-doctrine.md`](./adminv2-runtime-performance-doctrine.md)
- Layout cutover: [`../platform_convergence/layout_runtime_cutover_plan.md`](../platform_convergence/layout_runtime_cutover_plan.md)
- Record truth vs previews: [`record-system.md`](./record-system.md)
- Settings layouts plane: [`configuration-system.md`](./configuration-system.md)
