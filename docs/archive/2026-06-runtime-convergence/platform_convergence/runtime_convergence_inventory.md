# Runtime Convergence Inventory

**Path:** `docs/platform_convergence/runtime_convergence_inventory.md`  
**Date:** 2026-06-06  
**Status:** Audit — documents production reality only  
**Scope:** Every active presentation system that must eventually be removed or absorbed into the layout runtime  
**Out of scope:** New architecture proposals, implementation plans, refactors

**Related docs:**

- `docs/LAYOUT_CONFIG_V2_FOUNDATION_AUDIT.md` — Layer 0 registry vs Layout V2 foundation
- `docs/system/work-unit-surface-context-contract.md` — queue row / work-unit surface contracts
- `docs/sprints/06_2026/status_ownership_and_lifecycle_grain_expansion.md` — lifecycle subject + layout configuration contracts
- `web/lib/layout/layoutV2.ts` — explicit non-goals: not wired to live runtime today

---

## 1. Executive summary

Alloy currently runs **seven overlapping presentation layers** in production. None of them is the final layout runtime. Operators see assembled UI from a stack that mixes code registries, org DB config, hardcoded React, and AdminV2 VM/pipeline contracts.

| Layer | Primary storage | Live in production? | Surfaces affected |
|-------|-----------------|---------------------|-------------------|
| **Layer 0 — entity presentation registry** | `web/lib/entityPresentation.ts` (code) | Yes — universal fallback | Drawer tabs/sections, list table columns |
| **Record layout V1** | `record_drawer_layouts` → `record_layouts` (DB) | Yes — opportunity, person, job order, schedule blocks | Drawer overview order, workflow v1, person runtime_v1 |
| **Hardcoded drawer JSX** | React components | Yes — complex entities + injected slots | Opportunity inquiry workflow, person operating modules, locations, jobs |
| **AdminV2 VM + drawer pipeline** | View-model APIs + pipeline adapters | Yes — opportunity, person (cutover); job (partial) | Above-fold reveal, shell contracts, tab pre-mount |
| **AdminV2 runtime section contracts** | `web/lib/adminV2/runtime/contract/registry/*` | Yes — reveal gates only | Opportunity, parent, child coordinated reveal |
| **Queue definition + UI-v2 presentation** | `work_units.queue_definition` (DB) + `web/lib/ui-v2/*` (code) | Yes — work-unit lanes, row bands | AdminV2 work-unit queue, dept previews |
| **Layout V2 docs** | `entity_layouts` (DB) + `LayoutDoc` types | **No** — settings preview / proof only | Settings → Layouts, layout-proof routes |

**Convergence north star (from existing docs, not new design):** configurable layout runtime backed by `entity_layouts` / `LayoutDoc`, with `record_drawer_layouts` behavior absorbed; queue surfaces consuming `WorkUnitSurfaceContext` / `QueueRowContext`; Layer 0 registry and hardcoded JSX retired entity-by-entity after adoption.

**Work units:** no drawer presentation of their own. Queue membership opens opportunity / person / child drawers. Work-unit presentation is queue lanes + workspace blocks only.

---

## 2. Inventory field legend

| Column | Meaning |
|--------|---------|
| **File location** | Canonical source file(s) |
| **Current owner** | Team/domain that owns runtime behavior today |
| **Runtime purpose** | What operators or systems see at runtime |
| **Replacement target** | Documented destination already named in code or active docs |
| **Convergence recommendation** | What must happen for this item to leave the parallel stack (factual, not architectural) |

**Owner key:**

| Owner | Scope |
|-------|-------|
| **Platform / Layer 0** | Shared entity presentation registry and list columns |
| **Record chrome** | `record_drawer_layouts`, effective preview, schedule blocks |
| **AdminV2 runtime** | VM drawers, pipeline, shell contracts, reveal doctrine |
| **AdminV2 workspace** | Work-unit queue lanes, dept workspace blocks |
| **Legacy admin drawer** | `AdminEntityDrawerLegacy` monolith and shared drawer components |
| **Platform config** | Canonical queue definition constants and schema |
| **Layout V2 foundation** | Types, resolver, proof renderer — not production runtime |

---

## 3. Hardcoded drawer sections

Sections whose body is defined in React (not fully driven by layout config or field catalog).

### 3.1 Layer 0 registry sections (code-defined, config-rendered)

These are **hardcoded in TypeScript** but rendered through `EntityDrawerOverview` when no entity-specific JSX overrides them.

| File location | Current owner | Runtime purpose | Replacement target | Convergence recommendation |
|---------------|---------------|-----------------|--------------------|-----------------------------|
| `web/lib/entityPresentation.ts` — `customers.drawer.overviewSections` | Platform / Layer 0 | Account Info, Person Snapshot, Contact Snapshot, Payment Profile, Record Info, Debug | `entity_layouts` drawer doc via `migrateFromRegistry.ts` | Retire registry entry after org can publish equivalent LayoutDoc; until then keep as fallback |
| `web/lib/entityPresentation.ts` — `locations.drawer.overviewSections` | Platform / Layer 0 | Overview field grid (address, access, pets, home type) | `record_drawer_layouts` (documented in `locationDrawerLayoutTarget.ts`) | Join record layout control plane; remove custom property JSX overlap |
| `web/lib/entityPresentation.ts` — `opportunities.drawer.overviewSections` | Platform / Layer 0 | Classic opportunity overview (non–workflow-v1 path) | `record_drawer_layouts` + workflow v1 virtual sections | Suppress under `inquiry_drawer_mode: workflow_v1`; remove when inquiry workflow is sole path |
| `web/lib/entityPresentation.ts` — `jobs.drawer.overviewSections` | Platform / Layer 0 | Job details, relationships, pricing subsections | `entity_layouts` + job drawer pipeline | Partially duplicated by `JobRecordModalV2`; consolidate on layout runtime |
| `web/lib/entityPresentation.ts` — `schedules.drawer.overviewSections` | Platform / Layer 0 | Schedule overview fields | `record_layouts.config_json.layout_blocks` (schedule v2) | Already partially on record layout blocks; finish migration |
| `web/lib/entityPresentation.ts` — `persons.drawer.overviewSections` | Platform / Layer 0 | Generic person field sections | `record_drawer_layouts` person `runtime_v1` variants | Filtered by `personDrawerPresentationProfile`; absorb into layout runtime |
| `web/lib/entityPresentation.ts` — remaining entities (`subscriptions`, `payments`, `vendors`, `contacts`, `customer_members`, `documents`, `service_offerings`, `service_plan_templates`, `discount_redemptions`, `addons`) | Platform / Layer 0 | Per-entity overview sections | `entity_layouts` drawer doc | Lowest priority; migrate when entity joins Settings → Layouts |
| `web/lib/entityPresentation.ts` — `workflows.drawer` (`overviewSections: []`) | Platform / Layer 0 | No config overview — activity tab only | TBD in layout runtime | Requires widget/activity item kind in LayoutDoc or dedicated workflow surface |

### 3.2 Legacy monolith — `overviewCustomContent` / inline JSX

| File location | Current owner | Runtime purpose | Replacement target | Convergence recommendation |
|---------------|---------------|-----------------|--------------------|-----------------------------|
| `web/components/admin/AdminEntityDrawerLegacy.tsx` — contacts `overviewCustomContent` | Legacy admin drawer | Association links, employee placement | LayoutDoc `widget_placeholder` or related_list items | Remove JSX slot when widget contract exists |
| `web/components/admin/AdminEntityDrawerLegacy.tsx` — customers | Legacy admin drawer | Primary person/contact/location links, counts | Field refs + link items in layout doc | Same |
| `web/components/admin/AdminEntityDrawerLegacy.tsx` — customer_members | Legacy admin drawer | Full inline member edit form | Field catalog + layout sections | High complexity; late migration |
| `web/components/admin/AdminEntityDrawerLegacy.tsx` — persons (`employee_placement`, `relationships`, `enrollment_activity`) | Legacy admin drawer | Person modules not in registry | Person operating sections + layout runtime | VM path (`PersonsDrawerVmRuntime`) already partially replaces |
| `web/components/admin/AdminEntityDrawerLegacy.tsx` — locations | Legacy admin drawer | Customer link, linked persons, custom property grid | `locationDrawerLayoutTarget.ts` → record layouts | Card 1 convergence blocker per sprint audit |
| `web/components/admin/AdminEntityDrawerLegacy.tsx` — vendors | Legacy admin drawer | Compliance quick links (insurance/DL) | Injected system section in layout doc | Register as `injected_system` kind |
| `web/components/admin/AdminEntityDrawerLegacy.tsx` — subscriptions, payments | Legacy admin drawer | Customer/subscription link rows | Link field items | Low priority |
| `web/components/admin/AdminEntityDrawerLegacy.tsx` — jobs | Legacy admin drawer | `CommunicationsDrawerSection` on overview | Tab or widget placement in layout doc | Communications already tab-level elsewhere |
| `web/components/admin/AdminEntityDrawerLegacy.tsx` — opportunities `inquiry_children` | Legacy admin drawer | Inquiry children table injection | `injected_system` section (`opportunity_inquiry_children`) | Already in AdminV2 section registry; unify VM + legacy |
| `web/components/admin/AdminEntityDrawerLegacy.tsx` — opportunity inquiry workflow block (~L16277+) | Legacy admin drawer | Full inquiry above-fold: lead summary, family contacts, tour, right column | `OpportunityDrawerInquiryWorkflowOverview` (VM) + pipeline render model | Retire legacy block when VM cutover complete for all paths |
| `web/components/admin/AdminEntityDrawerLegacy.tsx` — activity tab dumps | Legacy admin drawer | Hardcoded timeline / raw JSON for workflows, jobs, offerings, etc. | Activity widget contract | Keep until activity surface has layout item kind |
| `web/components/admin/AdminEntityDrawerLegacy.tsx` — `JobDrawerRelationshipsSection` (inline) | Legacy admin drawer | Job assignment relationship rows | Job pipeline sections or layout doc related_list | Duplicated by job V2 modal path |

### 3.3 Person drawer — hardcoded operating modules

| File location | Current owner | Runtime purpose | Replacement target | Convergence recommendation |
|---------------|---------------|-----------------|--------------------|-----------------------------|
| `web/components/admin/entity/PersonDrawerOperatingSections.tsx` | AdminV2 runtime + legacy | Orchestrates summary, household, address, employee status above overview | `person_drawer_mode: runtime_v1` layout variants → layout runtime | Operating keys already in `personDrawerLayoutRuntime.ts`; wire to LayoutDoc sections |
| `web/components/admin/entity/PersonDrawerChildSummary.tsx` | AdminV2 runtime | Child summary panel | Layout runtime static/injected section | Absorb as layout block |
| `web/components/admin/entity/PersonDrawerParentSummary.tsx` | AdminV2 runtime | Parent/guardian summary | Same | Same |
| `web/components/admin/entity/PersonDrawerChildSummaryBosPanel.tsx` | AdminV2 runtime | Child BOS panel slot | Layout runtime widget | Keep widget ownership in BOS module |
| `web/components/admin/entity/PersonDrawerParentSummaryBosPanel.tsx` | AdminV2 runtime | Parent BOS panel slot | Same | Same |
| `web/components/admin/entity/PersonDrawerHouseholdSection.tsx` | AdminV2 runtime | Child household links | Layout runtime section | Same |
| `web/components/admin/entity/PersonDrawerParentHouseholdSection.tsx` | AdminV2 runtime | Parent household | Same | Same |
| `web/components/admin/entity/PersonDrawerHouseholdAddress.tsx` | AdminV2 runtime | Address block | Same | Same |
| `web/components/admin/entity/PersonDrawerEmployeeStatusSection.tsx` | AdminV2 runtime | Employee status | Same | Same |
| `web/components/admin/entity/PersonDrawerChildLifecycleRail.tsx` | AdminV2 runtime | Child lifecycle module navigation | `personDrawerChildLifecycleSlots.ts` section placements | Slots documented; not yet layout-driven |
| `web/components/admin/entity/PersonDrawerParentLifecycleRail.tsx` | AdminV2 runtime | Parent lifecycle module navigation | Same | Same |
| `web/components/admin/entity/PersonDrawerChildHeaderExecutive.tsx` | AdminV2 runtime | Child header executive strip | Header region in layout doc | `header_region` kind exists in preview taxonomy |
| `web/components/admin/entity/PersonDrawerChildLifecycleSummary.tsx` | AdminV2 runtime | Lifecycle summary module | Layout runtime widget | Same |
| `web/components/admin/entity/PersonDrawerChildLifecycleRoadmap.tsx` | AdminV2 runtime | Roadmap module | Same | Same |
| `web/components/admin/entity/PersonDrawerVisibilitySections.tsx` | Legacy admin drawer | Relationships overview | `personDrawerRelationshipSection.ts` model | Future `section_placements_v1` |
| `web/components/admin/entity/PersonDrawerEnrollmentActivity.tsx` | Legacy admin drawer | Enrollment mirror + opportunities | Record `_enrollment_*` fields or widget | Same |
| `web/components/admin/entity/PersonDrawerOperatingActivityTab.tsx` | AdminV2 runtime | Parent/child activity tab body | Tab content in layout runtime | Same |
| `web/components/admin/entity/PersonDrawerContextPanel.tsx` | Legacy admin drawer | Quick links sidebar | Right rail / context panel contract | Workspace + drawer context convergence |
| `web/components/admin/entity/PersonDrawerCompactOverview.tsx` | Legacy admin drawer | Compact overview variant | Layout density variant | Low priority |

### 3.4 Opportunity drawer — hardcoded inquiry workflow modules

| File location | Current owner | Runtime purpose | Replacement target | Convergence recommendation |
|---------------|---------------|-----------------|--------------------|-----------------------------|
| `web/components/admin/vmDrawer/OpportunityDrawerInquiryWorkflowOverview.tsx` | AdminV2 runtime | VM inquiry workflow above-fold body | Drawer pipeline above-fold render model + layout runtime blocks | Production path for opportunity; legacy duplicate must retire |
| `web/components/admin/opportunity/OpportunityInquiryChildrenSection.tsx` | AdminV2 runtime | Inquiry children table/cards | `injected_system` section | Already in section registry |
| `web/components/admin/opportunity/OpportunityInquiryChildrenShellChrome.tsx` | AdminV2 runtime | Children section geometry reserve | Shell contract slots | Keep until layout runtime owns min-height |
| `web/components/admin/opportunity/FamilyContactsPanel.tsx` | AdminV2 runtime | Family contacts panel | Layout runtime widget | Same |
| `web/components/admin/opportunity/OpportunityInquirySummaryRightColumn.tsx` | AdminV2 runtime | BOS/tasks/guidance right column | Layout runtime widget / right rail | Same |
| `web/components/admin/opportunity/OpportunityInquirySummaryActivity.tsx` | AdminV2 runtime | Activity snippet in summary | Layout runtime widget | Same |
| `web/components/admin/opportunity/tours/OpportunityInquiryTourDateBlock.tsx` | AdminV2 runtime | Tour date/slot display | Section registry key `opportunity_tour_slot` | Same |
| `web/components/admin/opportunity/tours/OpportunityTourDrawerSection.tsx` | Legacy admin drawer | Tour scheduling (legacy path) | VM tour block | Retire with legacy inquiry block |
| `web/components/admin/opportunity/OpportunityDrawerRequiredInformationPanel.tsx` | AdminV2 runtime | Required info panel | Readiness projection widget | BOS/readiness owns data |
| `web/components/admin/opportunity/OpportunityOperationalTasksSection.tsx` | AdminV2 runtime | Operational tasks list | Operational work widget | Same |
| `web/components/admin/opportunity/OpportunityIntakeSourceSection.tsx` | Legacy admin drawer | Intake source display | Field section or widget | Low priority |
| `web/components/admin/opportunity/OpportunityLifecyclePanel.tsx` | Legacy admin drawer | Lifecycle panel | Lifecycle widget / rail | Same |
| `web/components/admin/opportunity/OpportunityQuoteIntakeSection.tsx` | Legacy admin drawer | Quote intake | Field section | Same |
| `web/components/admin/opportunity/OpportunityHouseholdPeoplePanel.tsx` | Legacy admin drawer | Household people | Related list or widget | Same |
| `web/components/admin/vmDrawer/VmInquiryRightColumn.tsx` | AdminV2 runtime | VM right-column slot adapter | Pipeline render model | Same |

### 3.5 Job / schedule modal drawers

| File location | Current owner | Runtime purpose | Replacement target | Convergence recommendation |
|---------------|---------------|-----------------|--------------------|-----------------------------|
| `web/components/admin/drawer/JobDrawerV2.tsx` | AdminV2 runtime | Job tab bar, signals strip, timeline card | Job drawer pipeline + layout doc | Active for cleaning-flagship jobs |
| `web/components/admin/drawer/JobRecordModalV2.tsx` | AdminV2 runtime | AdminV2 job record modal; `customSectionContent` slots | `entity_layouts` + job pipeline sections | Settings → Layouts includes job (preview only today) |
| `web/components/admin/drawer/ScheduleRecordModalV2.tsx` | AdminV2 runtime | Schedule modal; schedule layout blocks | `record_layouts` schedule `layout_blocks` v2 | Closest entity to layout-driven runtime |
| `web/components/admin/drawer/DrawerAboveFoldRenderer.tsx` | AdminV2 runtime | Generic above-fold slot renderer (job header signals) | Layout runtime above-fold contract | Same pattern as opportunity pipeline |
| `web/lib/adminV2/drawerPipeline/adapters/job/sections.ts` | AdminV2 runtime | `JOB_DRAWER_V2_OVERVIEW_SECTIONS` from presentation | Layout doc | Code registry → LayoutDoc migration |

### 3.6 Location drawer helpers

| File location | Current owner | Runtime purpose | Replacement target | Convergence recommendation |
|---------------|---------------|-----------------|--------------------|-----------------------------|
| `web/lib/admin/location/locationDrawerPresentation.ts` | Record chrome | Filters/transforms Layer 0 sections by site vs room kind | `record_drawer_layouts` for locations | Runtime does not read DB layouts today |
| `web/components/admin/entity/LocationDrawerContextPanel.tsx` | Legacy admin drawer | Location context/quick panel | Context panel contract | Same |
| `web/lib/recordChrome/locationDrawerLayoutTarget.ts` | Record chrome | **Documentation only** — intended location layout shape | `record_drawer_layouts` | Blockers in `record_person_location_convergence_audit.md` |

### 3.7 Shared drawer chrome (cross-entity)

| File location | Current owner | Runtime purpose | Replacement target | Convergence recommendation |
|---------------|---------------|-----------------|--------------------|-----------------------------|
| `web/components/admin/entity/EntityDrawerOverview.tsx` | Legacy admin drawer | Config-driven section renderer + `customSectionContent` injection | Layout runtime renderer | Central adapter to replace |
| `web/components/admin/entity/EntityDrawerSection.tsx` | Legacy admin drawer | Collapsible section shell | Layout runtime section chrome | Same |
| `web/components/admin/entity/EntityDrawerField.tsx` | Legacy admin drawer | Field inline edit by `renderHint` | Layout item renderer (`LAYOUT_RENDER_HINTS`) | Hints already aligned in `layoutV2.ts` |
| `web/components/admin/communications/CommunicationsDrawerSection.tsx` | Legacy admin drawer | Communications tab/section | Tab item in layout doc | Tab-level, not section registry |
| `web/components/admin/drawer/record/RecordDrawerContextPanel.tsx` | AdminV2 runtime | Shared context panel shell | Layout runtime context region | Same |
| `web/components/admin/drawer/RecordLifecycleRail.tsx` | AdminV2 workspace | Work-unit lifecycle rail from queue definition | Queue definition + layout runtime queue surface | Reads `resolveWorkUnitQueueDefinitionForDrawer.ts` |
| `web/components/admin/drawer/DrawerComposedPreparingState.tsx` | AdminV2 runtime | Composed drawer "Preparing…" gate | Layout runtime readiness contract | Tied to reveal doctrine |

### 3.8 VM runtime orchestrators (not sections, but section assembly owners)

| File location | Current owner | Runtime purpose | Replacement target | Convergence recommendation |
|---------------|---------------|-----------------|--------------------|-----------------------------|
| `web/components/admin/AdminEntityDrawer.tsx` | AdminV2 runtime | Routes opportunity → VM, person/child → VM, else legacy | Single layout-runtime drawer router | Cutover gate |
| `web/components/admin/vmDrawer/OpportunityDrawerVmRuntime.tsx` | AdminV2 runtime | Opportunity VM shell, tabs, header | Layout runtime + pipeline | Production opportunity path |
| `web/components/admin/vmDrawer/PersonsDrawerVmRuntime.tsx` | AdminV2 runtime | Person + child VM shell | Layout runtime | Production person path |
| `web/components/admin/vmDrawer/PersonsDrawerVmBody.tsx` | AdminV2 runtime | Operating sections + `EntityDrawerOverview` | Layout runtime body composer | Same |
| `web/components/admin/vmDrawer/ChildDrawerVmRuntime.tsx` | AdminV2 runtime | **Orphaned** — not wired to router | N/A | Delete or wire; today dead code |
| `web/components/admin/vmDrawer/PersonDrawerVmRuntime.tsx` | AdminV2 runtime | **Orphaned** — superseded by PersonsDrawerVmRuntime | N/A | Delete or wire; today dead code |
| `web/components/admin/AdminEntityDrawerLegacy.tsx` | Legacy admin drawer | All non-VM entities + fallback paths | Retired when layout runtime covers all entities | Largest convergence surface |

---

## 4. Hardcoded tabs

Tab strips defined in code rather than layout config.

### 4.1 Layer 0 drawer tab registry

| File location | Current owner | Runtime purpose | Replacement target | Convergence recommendation |
|---------------|---------------|-----------------|--------------------|-----------------------------|
| `web/lib/entityPresentation.ts` — `DrawerTabKey` type | Platform / Layer 0 | Closed tab vocabulary | Layout doc `metadata.tabs` (see `migrateFromRegistry.ts`) | Migrate per entity with drawer doc |
| `web/lib/entityPresentation.ts` — per-entity `drawer.tabs[]` | Platform / Layer 0 | Default tab order for 18 entity types | Layout doc metadata | See entity table in §10 |

**Per-entity tab lists (all in `entityPresentation.ts`):**

| Entity | Hardcoded tabs |
|--------|----------------|
| customers | overview, related, activity, payments, documents |
| locations | overview, related, activity, documents |
| opportunities | overview, related, activity, documents |
| jobs | overview, rrs_overview, related, activity, documents, financials |
| schedules | overview, related, financials, documents, activity |
| payments | overview, related, activity, ledger |
| vendors | overview, related, financials, activity, documents |
| contacts, customer_members, documents, service_offerings, service_plan_templates, discount_redemptions | overview, related, activity (+ documents where noted) |
| persons | overview, related, documents |
| subscriptions | overview, related, activity |
| workflows, addons | overview, activity |

### 4.2 Opportunity inquiry workflow tab override

| File location | Current owner | Runtime purpose | Replacement target | Convergence recommendation |
|---------------|---------------|-----------------|--------------------|-----------------------------|
| `web/lib/adminV2/shellContracts/opportunityInquiryWorkflowTabs.ts` | AdminV2 runtime | `overview, communications, notes, documents, activity` when `inquiry_drawer_mode === workflow_v1` | Layout doc tab metadata + record layout config | Overrides Layer 0 for inquiry records |
| `web/lib/admin/drawer/opportunityDrawerTabSession.ts` | AdminV2 runtime | Tab pre-mount, visit tracking, panel min-height | Layout runtime tab contract | Shared by legacy + VM |
| `web/lib/adminV2/runtime/contract/drawerTabsContract.ts` | AdminV2 runtime | Reveal/pre-mount policy for workflow tabs | Layout runtime reveal | AdminV2 doctrine |
| `web/lib/adminV2/shellContracts/compileOpportunityRecordDrawerShell.ts` | AdminV2 runtime | First-paint shell tabs | Layout runtime bootstrap | Same |
| `web/components/admin/vmDrawer/OpportunityDrawerVmRuntime.tsx` | AdminV2 runtime | VM tab strip + labels | Same | Production path |
| `web/components/admin/vmDrawer/OpportunityDrawerVmTabPanes.tsx` | AdminV2 runtime | Tab pane routing incl. communications | Same | Same |

### 4.3 Person VM operating tabs

| File location | Current owner | Runtime purpose | Replacement target | Convergence recommendation |
|---------------|---------------|-----------------|--------------------|-----------------------------|
| `web/components/admin/vmDrawer/PersonsDrawerVmBody.tsx` — `OPERATING_TAB_LIST` | AdminV2 runtime | `overview, related, documents, communications` | Layout doc tabs | **Overrides** Layer 0 persons tabs (`overview, related, documents`) |
| `web/components/admin/vmDrawer/PersonsDrawerVmRuntime.tsx` | AdminV2 runtime | Tab state + body routing | Same | Same |

### 4.4 Job drawer V2 tabs

| File location | Current owner | Runtime purpose | Replacement target | Convergence recommendation |
|---------------|---------------|-----------------|--------------------|-----------------------------|
| `web/components/admin/drawer/JobDrawerV2.tsx` — `JobDrawerV2TabBar` | AdminV2 runtime | Reusable tab chrome | Job pipeline tab array in layout doc | Tabs supplied from pipeline state |
| `web/lib/adminV2/drawerPipeline/adapters/job/buildPipelineState.ts` | AdminV2 runtime | Hardcoded job tab arrays | Layout doc metadata | Same |

### 4.5 AdminV2 Settings tabs

| File location | Current owner | Runtime purpose | Replacement target | Convergence recommendation |
|---------------|---------------|-----------------|--------------------|-----------------------------|
| `web/components/adminV2/settings/SettingsEntityTabBar.tsx` | AdminV2 runtime | Generic settings tab bar component | N/A — settings chrome | Not entity drawer convergence |
| `web/app/adminV2/settings/fields/SettingsFieldsHubClient.tsx` | AdminV2 runtime | Entity order: person, customer, job, opportunity, inquiry_child, vendor, schedule, location | Field catalog surfaces | Embeds legacy `/admin/system/*` clients |
| `web/app/adminV2/settings/layouts/LayoutsSettingsHubClient.tsx` | Layout V2 foundation | Entity order: opportunity, job, schedule, person | Expands as entities join layout runtime | Only 4 entities in layout settings today |
| `web/app/adminV2/settings/relationships/RelationshipsSettingsClient.tsx` | AdminV2 runtime | `family-roles`, `person-relationships` | N/A | Settings only |
| `web/app/adminV2/settings/users-roles/UsersRolesSettingsClient.tsx` | AdminV2 runtime | `users`, `roles` | N/A | Settings only |
| `web/components/adminV2/settings/LifecycleStagesRequirementsHub.tsx` | AdminV2 runtime | Stage tabs from `LIFECYCLE_STAGE_ORDER` | Lifecycle builder config | Settings only |
| `web/lib/completion/lifecycleProgressionRequirementsCatalog.ts` | Platform config | Stage tab order: lead → enrolled | Lifecycle config DB | Settings + BOS |
| `web/components/adminV2/settings/lifecycle/LifecycleWorkbenchHeader.tsx` | AdminV2 runtime | Dynamic stage tabs from builder | Lifecycle builder | Settings only |
| `web/app/adminV2/settings/page.tsx` | AdminV2 runtime | Hardcoded settings link groups | N/A | Navigation only |

### 4.6 Legacy Admin page-local tabs

| File location | Current owner | Runtime purpose | Replacement target | Convergence recommendation |
|---------------|---------------|-----------------|--------------------|-----------------------------|
| `web/app/admin/financials/ledger/LedgerClient.tsx` | Legacy admin | overview, related, activity, journal | Financial entity layout runtime | Legacy admin only |
| `web/app/admin/financials/accounts/AccountsClient.tsx` | Legacy admin | overview, related, activity | Same | Same |

### 4.7 Proof / demo tabs

| File location | Current owner | Runtime purpose | Replacement target | Convergence recommendation |
|---------------|---------------|-----------------|--------------------|-----------------------------|
| `web/components/layout/proofShell/ProofRecordModal.tsx` | Layout V2 foundation | Mirrors inquiry workflow tab strip | Layout runtime proof | Dev/proof only — not production |
| `web/app/adminV2/components/MyTasksPanel.tsx` | AdminV2 runtime | Task filter tabs | N/A | Not entity drawer |

---

## 5. Hardcoded queue presentation plans

Queue row layout, lane pills, and section grouping defined in code and/or stored JSON with code interpreters.

### 5.1 Canonical enrollment pipeline definitions (code constants)

| File location | Current owner | Runtime purpose | Replacement target | Convergence recommendation |
|---------------|---------------|-----------------|--------------------|-----------------------------|
| `web/lib/config/enrollmentPipelineQueueDefinitionV1.ts` | Platform config | Full v1 doc: `pipeline_with_attention`, buckets, CRM compact row preview | Org `work_units.queue_definition` (already stored) | Code constant becomes seed-only; runtime reads DB |
| `web/lib/config/enrollmentPipelineQueueDefinitionV2.ts` | Platform config | Full v2 doc: `domain_with_attention`, grain/domain metadata | Same + `queueDefinitionV2Runtime.ts` normalize | Canonical reference for enrollment pipeline WU |
| `web/lib/lifecycle/enrollmentProcessStageQueueKeys.ts` | Platform config | Maps lifecycle stages → v2 queue keys | Lifecycle builder + stored queue_definition | Settings mapping layer |

### 5.2 Lifecycle stage queue presentation builders

| File location | Current owner | Runtime purpose | Replacement target | Convergence recommendation |
|---------------|---------------|-----------------|--------------------|-----------------------------|
| `web/lib/lifecycle/lifecycleStageQueuePresentation.ts` | AdminV2 workspace | Generates queue docs for sibling lifecycle stage work units | Stored `queue_definition` on work unit | Builder runs at activation; converge on Settings editor |
| `web/lib/lifecycle/lifecycleWorkUnitShellPills.ts` | AdminV2 workspace | Pill chip keys, lifecycle nav prefix | Work-unit layout runtime pills | Hardcoded pill resolution |

### 5.3 Department workspace queue entries (navigation, not row layout)

| File location | Current owner | Runtime purpose | Replacement target | Convergence recommendation |
|---------------|---------------|-----------------|--------------------|-----------------------------|
| `web/lib/workspace/registry.ts` — OPERATIONS | AdminV2 workspace | unassigned_jobs_triage, scheduled-today, needs-attention routes | Department workspace layout config | Hardcoded dept block registry |
| `web/lib/workspace/registry.ts` — GROWTH | AdminV2 workspace | new_leads, unbooked_quotes work unit keys | Same | Same |
| `web/lib/workspace/registry.ts` — ENROLLMENT | AdminV2 workspace | pipeline_overview, early_inquiries, quoting, priced_followup | Same | Same |
| `web/lib/workspace/registry.ts` — GENERIC, SYSTEM | AdminV2 workspace | Fallback blocks | Same | Same |

### 5.4 Queue UI config resolution

| File location | Current owner | Runtime purpose | Replacement target | Convergence recommendation |
|---------------|---------------|-----------------|--------------------|-----------------------------|
| `web/lib/ui-v2/queueUiConfig.ts` | AdminV2 workspace | Normalizes `queue_definition.ui` → sections, row preview | Layout runtime queue surface doc | Maps v2 `domain_with_attention` → internal `pipeline_with_attention` |
| `web/lib/ui-v2/readQueueUiPresentationFlags.ts` | AdminV2 workspace | suppress_other_pill, suppress_lifecycle_panel flags | Queue layout doc metadata | Same |
| `web/lib/ui-v2/enrollmentQueueRowPreviewPolicy.ts` | AdminV2 workspace | Strips call/email/message tokens; open-only actions | Configurable row actions in queue doc | Same |

### 5.5 Queue row / lane presentation plans (code-driven rendering)

| File location | Current owner | Runtime purpose | Replacement target | Convergence recommendation |
|---------------|---------------|-----------------|--------------------|-----------------------------|
| `web/lib/ui-v2/workUnitQueueRowPresentation.ts` | AdminV2 workspace | Band keys: header, attention, lifecycle, people, facts, actions | Layout runtime queue row blocks consuming `QueueRowContext` | **AdminV2 QueueBlock only** |
| `web/lib/ui-v2/workUnitQueueRowHeaderPresentation.ts` | AdminV2 workspace | Inline attention/waitlist header copy | Same | Same |
| `web/lib/ui-v2/crmQueueRowPreviewPresentation.ts` | AdminV2 workspace | CRM compact row field grouping | Queue doc row_preview + layout runtime | Same |
| `web/lib/ui-v2/queueGrainPresentation.ts` | AdminV2 workspace | Grain → count unit nouns | `WorkUnitSurfaceContext.count_unit` (not implemented) | Per work-unit-surface-context contract |
| `web/lib/ui-v2/childDesiredStartQueuePresentation.ts` | AdminV2 workspace | Child desired-start display formatting | Queue row context field | Same |
| `web/lib/ui-v2/queuePlacementPriorityPresentation.ts` | AdminV2 workspace | Waitlist placement v1 strip | Layout runtime queue widget | Same |
| `web/lib/ui-v2/queuePlacementPriorityV2Presentation.ts` | AdminV2 workspace | Placement v2 badges | Same | Same |
| `web/lib/ui-v2/queuePlacementWaitlistCandidatePresentation.ts` | AdminV2 workspace | Candidate-grain meta chips | Same | Same |
| `web/lib/orchestration/placement/waitlistQueueBlockSectionPlan.ts` | AdminV2 workspace | Org program category section grouping | Queue layout sections | Same |
| `web/lib/orchestration/placement/waitlistQueueSectionPresentation.ts` | AdminV2 workspace | Category labels (Infant waitlist, etc.) | Configurable section labels | Same |

### 5.6 QueueService and grain interpreters

| File location | Current owner | Runtime purpose | Replacement target | Convergence recommendation |
|---------------|---------------|-----------------|--------------------|-----------------------------|
| `web/lib/queues/QueueService.ts` | Platform config | Loads v1/v2 bundle, filters, enriches rows, summaries | Layout runtime data plane + `QueueRowContext` attach | Central interpreter — extend, do not fork |
| `web/lib/queues/candidateGrainWaitlistQueue.ts` | Platform config | Candidate-grain waitlist items | Grain contract in lifecycle sprint doc | Prior convergence path |
| `web/lib/queues/childGrainEnrollmentQueue.ts` | Platform config | Child-grain enrollment offers lane | Same | Same |
| `web/lib/queues/needsAttentionQueuePrioritySort.ts` | Platform config | Attention bucket sort | Metadata-driven bucket priority | Already config-driven from metadata |
| `web/lib/queues/queueRowGrainContext.ts` | AdminV2 workspace | Grain-aware drawer open payloads | `DrawerSubjectContext` in work-unit contract | Partial today |
| `web/lib/workUnits/buildPartialQueueRowContext.ts` | AdminV2 workspace | Partial case-grain `QueueRowContext` adapter | Full `QueueRowContext` per contract v1.0 | Sprint 06 in progress |
| `web/lib/workUnits/lifecycleSubjectContracts.ts` | AdminV2 workspace | Frozen context types | Layout runtime consumer contract | Contract only |

### 5.7 Work-unit queue lane orchestration (AdminV2)

| File location | Current owner | Runtime purpose | Replacement target | Convergence recommendation |
|---------------|---------------|-----------------|--------------------|-----------------------------|
| `web/app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx` | AdminV2 workspace | Pill selection, lane fetch, reveal, record filters | Work-unit layout runtime page | Largest AdminV2 presentation orchestrator |
| `web/lib/adminV2/workUnitQueueSelection.ts` | AdminV2 workspace | Pill key → API queue key, URL params | Layout runtime nav | Same |
| `web/lib/workspace/workUnitQueueDerived.ts` | AdminV2 workspace | KPI strip suppression for pipeline layout | Queue layout doc flags | Same |
| `web/lib/workspace/workUnitQueueLaneRevealState.ts` | AdminV2 runtime | Lane settled / refreshing semantics | Layout runtime reveal contract | Protected by adminv2-runtime-performance doctrine |
| `web/lib/workspace/workUnitQueueLaneDisplay.ts` | AdminV2 workspace | Client lane cache keys | Same | Same |
| `web/lib/workspace/extractPipelineExecutionLanes.ts` | AdminV2 workspace | Lane descriptors from `ui.sections` | Queue doc sections | v1 pipeline section vs v2 flatten |
| `web/lib/workspace/resolveDeptPipelineExecSurface.ts` | AdminV2 workspace | First WU with `pipeline_with_attention` | Dept layout config | Same |
| `web/lib/workspace/resolveDeptPipelineExecSurfaceServer.ts` | AdminV2 workspace | Server-side variant | Same | Same |
| `web/lib/workspace/pickDeptPipelineWorkUnit.ts` | AdminV2 workspace | Enrollment pipeline WU picker | Same | Same |
| `web/lib/adminV2/navigation/buildWorkspaceNavDeptChildren.ts` | AdminV2 workspace | Sidebar pipeline lane expansion | Dept nav layout config | Same |

### 5.8 Legacy queue scope (non–work-unit)

| File location | Current owner | Runtime purpose | Replacement target | Convergence recommendation |
|---------------|---------------|-----------------|--------------------|-----------------------------|
| `web/lib/rrs/queue/growthOpportunityQueueScope.ts` | Legacy admin | v1 opportunity filters without work_unit scope | QueueService work-unit-scoped paths | Superseded for work units |
| `web/lib/rrs/queue/queueDefinitionV1.ts` | Legacy admin | Job + opportunity v1 intent parsers | `queueDefinitionSchema.ts` | Legacy job/growth paths |

### 5.9 Queue config editing and seeds

| File location | Current owner | Runtime purpose | Replacement target | Convergence recommendation |
|---------------|---------------|-----------------|--------------------|-----------------------------|
| `web/app/admin/system/work-units/WorkUnitsClient.tsx` | Legacy admin | UI builder synthesizing v1 pipeline_with_attention | AdminV2 Settings lifecycle / enrollment hub | Same JSONB target |
| `web/lib/admin/drawer/resolveWorkUnitQueueDefinitionForDrawer.ts` | AdminV2 runtime | Normalizes queue JSON for lifecycle rail | Layout runtime queue context | Drawer reads queue definition |
| `web/scripts/seedEnrollmentOpportunityQueuesV1.ts` | Platform config | Dev seed | N/A | Seed only |
| `web/scripts/ensureEnrollmentPipelineWorkUnitV1.ts` | Platform config | Applies canonical v1 definition | N/A | Seed only |

### 5.10 Schema and v2 runtime normalization

| File location | Current owner | Runtime purpose | Replacement target | Convergence recommendation |
|---------------|---------------|-----------------|--------------------|-----------------------------|
| `web/lib/config/queueDefinitionSchema.ts` | Platform config | Zod validation for v1 queue_definition | Same schema in layout runtime | Write-path validation |
| `web/lib/config/queueDefinitionV2Runtime.ts` | Platform config | v2 normalize, alias resolution, v1 coercion | Single read path for layout runtime | Live bridge layer |

---

## 6. Presentation registries

Central registries that multiple surfaces read.

### 6.1 Entity presentation registry (Layer 0)

| File location | Current owner | Runtime purpose | Replacement target | Convergence recommendation |
|---------------|---------------|-----------------|--------------------|-----------------------------|
| `web/lib/entityPresentation.ts` — `ENTITY_PRESENTATION_REGISTRY` | Platform / Layer 0 | Tables, drawer tabs, overview sections, related modules, quick actions for 18 entity types | `entity_layouts` via `layoutResolver.ts` | **Universal fallback today** — last to delete |
| `web/lib/entityPresentation.ts` — `getEntityPresentation()` | Platform / Layer 0 | Lookup + empty fallback | Layout resolver | Every consumer must migrate |
| `web/components/admin/entity/buildEntityTableColumns.tsx` | Legacy admin | List page columns from registry | Layout doc table surface | List tables not in Layout V2 sprint 1 scope |

### 6.2 Record layout registries (V1 DB + preview)

| File location | Current owner | Runtime purpose | Replacement target | Convergence recommendation |
|---------------|---------------|-----------------|--------------------|-----------------------------|
| `web/lib/admin/effectiveRecordDrawerLayout.ts` | Record chrome | Org `record_drawer_layouts` → global `record_layouts` | Absorbed into layout runtime resolver | Live for opportunity, person, job, schedule |
| `web/lib/recordChrome/types.ts` — `RecordLayoutConfigJson` | Record chrome | V1 config schema: inquiry_drawer_mode, person_drawer_mode, overview_section_order, inquiry_workflow_sections, layout_blocks | LayoutDoc metadata + sections | Bridge schema |
| `web/lib/recordChrome/effectiveDrawerLayoutPreview.ts` | Record chrome | Settings preview mirroring runtime assembly | Layout runtime preview | Section kind taxonomy source of truth |
| `web/lib/recordChrome/scheduleLayoutConfig.ts` | Record chrome | Schedule v2 `layout_blocks` | LayoutDoc sections | **Only production layout_blocks consumer** |
| `web/lib/fields/fieldPlacementV1.ts` | Record chrome | Opportunity field placements | Layout item placements | Workflow v1 field behavior |

### 6.3 AdminV2 runtime section contract registries

| File location | Current owner | Runtime purpose | Replacement target | Convergence recommendation |
|---------------|---------------|-----------------|--------------------|-----------------------------|
| `web/lib/adminV2/runtime/contract/registry/opportunityDrawerSections.ts` | AdminV2 runtime | Reveal gates: lead_summary, bos_right_column, tour_slot, inquiry_children | Layout runtime section readiness | Reveal-only — not section content |
| `web/lib/adminV2/runtime/contract/registry/parentDrawerSections.ts` | AdminV2 runtime | Parent above-fold: summary, household, address, employee_status, bos_panel | Same | Same |
| `web/lib/adminV2/runtime/contract/registry/childDrawerSections.ts` | AdminV2 runtime | Child above-fold: summary, header_chips, household, medical, bos_panel | Same | Same |
| `web/lib/adminV2/runtime/contract/registry/index.ts` | AdminV2 runtime | `drawerSectionRegistryForSurface()` | Layout runtime reveal registry | Same |
| `web/lib/adminV2/runtime/contract/drawerSectionContract.ts` | AdminV2 runtime | `evaluateDrawerSectionPlan()` | Same | Same |
| `web/lib/adminV2/runtime/contract/drawerComposerPolicy.ts` | AdminV2 runtime | `composeAdminV2DrawerRuntime()` | Same | Same |

### 6.4 Person presentation registries

| File location | Current owner | Runtime purpose | Replacement target | Convergence recommendation |
|---------------|---------------|-----------------|--------------------|-----------------------------|
| `web/lib/admin/person/personDrawerPresentationProfile.ts` | Record chrome | Filters sections by child/parent/emergency/generic profile | Layout runtime profile variants | Code profile → layout variant |
| `web/lib/admin/person/personDrawerLayoutRuntime.ts` | Record chrome | `person_drawer_mode: runtime_v1` operating section keys | LayoutDoc person variants | DB variants exist |
| `web/lib/admin/person/personDrawerParentOperatingSections.ts` | Record chrome | Parent suppressed section keys | Layout section visibility | Same |
| `web/lib/admin/person/personDrawerChildOperatingSections.ts` | Record chrome | Child suppressed/dedicated field keys | Same | Same |
| `web/lib/admin/person/personDrawerOperatingOverviewSections.ts` | Record chrome | Final parent/child overview lists | Layout runtime composer | Same |
| `web/lib/admin/person/resolvePersonDrawerVmOverviewSections.ts` | AdminV2 runtime | VM overview section assembly | Layout runtime | Same |
| `web/lib/admin/person/personDrawerChildLifecycleSlots.ts` | Record chrome | Lifecycle module → section key map | Layout section placements | Future `section_placements_v1` |
| `web/lib/admin/person/personDrawerRelationshipSection.ts` | Record chrome | Relationship section model | Field section ref | Same |

### 6.5 Opportunity layout registries

| File location | Current owner | Runtime purpose | Replacement target | Convergence recommendation |
|---------------|---------------|-----------------|--------------------|-----------------------------|
| `web/lib/admin/opportunityDrawerLayoutPolicy.ts` | Record chrome | Legacy section key suppression under workflow v1 | Layout runtime visibility rules | Same |
| `web/lib/admin/opportunityWorkflowV1SectionConfig.ts` | Record chrome | Section show/hide toggles | Layout section config | Same |
| `web/lib/admin/opportunityWorkflowV1DrawerOrder.ts` | Record chrome | Workflow section ordering | Layout section order | Only opportunity supports section order in settings today |
| `web/lib/recordChrome/opportunityDrawerOverviewFilters.ts` | Record chrome | Tour follow-up, pricing suppression, workflow duplicates | Layout runtime filters | Same |
| `web/lib/adminV2/shellContracts/compileOpportunityRecordDrawerShell.ts` | AdminV2 runtime | Shell contract: tabs, section slots, geometry | Layout runtime bootstrap | Same |
| `web/lib/adminV2/drawerPipeline/adapters/opportunity/*` | AdminV2 runtime | Pipeline state, above-fold model, deferred sections | Layout runtime pipeline | Opportunity production path |

### 6.6 Unified status injection

| File location | Current owner | Runtime purpose | Replacement target | Convergence recommendation |
|---------------|---------------|-----------------|--------------------|-----------------------------|
| `web/lib/admin/unifiedDrawerStatus.ts` | Record chrome | Injects `__unified_status` section; strips duplicate status fields | Layout `injected_system` section | Applied in preview + runtime |

### 6.7 Layout V2 foundation registries (not production runtime)

| File location | Current owner | Runtime purpose | Replacement target | Convergence recommendation |
|---------------|---------------|-----------------|--------------------|-----------------------------|
| `web/lib/layout/layoutV2.ts` | Layout V2 foundation | `LayoutDoc` types; surfaces `drawer \| queue` | **Is** the layout runtime type system | Not wired to production per file header |
| `web/lib/layout/layoutV2Schema.ts` | Layout V2 foundation | `parseLayoutDoc()` validation | Same | Same |
| `web/lib/layout/layoutResolver.ts` | Layout V2 foundation | Org → default → registry migration resolution | Production layout resolver | Wire when adoption sprint lands |
| `web/lib/layout/migrateFromRegistry.ts` | Layout V2 foundation | `drawerLayoutFromRegistry()`, `layoutDocFromRegistry()` | Migration utility | Keep until Layer 0 retired |
| `web/lib/layout/seedFromCurrentPresentation.ts` | Layout V2 foundation | Seeds LayoutDoc from current presentation | Settings bootstrap | Same |
| `web/lib/layout/defaultLeadLayouts.ts` | Layout V2 foundation | Default opportunity drawer + queue card layouts | Published layout templates | Settings defaults |
| `web/lib/layout/entityLayoutsRepo.ts` | Layout V2 foundation | `entity_layouts` DB access | Production storage | Same |
| `web/app/api/admin/entity-layouts/route.ts` | Layout V2 foundation | Layout CRUD API | Production API | Same |
| `web/lib/adminV2/layouts/sectionTypePresentation.ts` | Layout V2 foundation | `DrawerSectionKind` operator labels | Settings UI vocabulary | Same |
| `web/lib/adminV2/layouts/layoutSectionOperatorUi.ts` | Layout V2 foundation | Operator profiles per section kind | Settings section editor | Same |
| `web/lib/adminV2/layoutsSettingsEntities.ts` | Layout V2 foundation | Supported settings entities: opportunity, job, schedule, person | Expand as entities converge | 4 entities only |
| `web/lib/adminV2/layouts/layoutCompositionCapabilities.ts` | Layout V2 foundation | What operators can edit per entity | Capability matrix | Same |

### 6.8 Workspace block registry

| File location | Current owner | Runtime purpose | Replacement target | Convergence recommendation |
|---------------|---------------|-----------------|--------------------|-----------------------------|
| `web/lib/workspace/registry.ts` — `getDepartmentWorkspaceLayout()` | AdminV2 workspace | OPERATIONS, GROWTH, ENROLLMENT, SYSTEM, GENERIC block layouts | Department workspace layout config | Hardcoded — not queue_definition |
| `web/lib/workspace/types.ts` | AdminV2 workspace | Block type union | Workspace layout schema | Same |
| `web/lib/workspace/partitionBlocks.ts` | AdminV2 workspace | Zone rendering split | Same | Same |

### 6.9 Workspace block renderers (dual QueueBlock)

| File location | Current owner | Runtime purpose | Replacement target | Convergence recommendation |
|---------------|---------------|-----------------|--------------------|-----------------------------|
| `web/components/admin/workspace/blocks/QueueBlock.tsx` | Legacy admin + AdminV2 dept | Dept workspace inline opportunity previews | AdminV2 QueueBlock feature parity | **Shared** — both `/admin/workspace` and `/adminV2/workspace` dept pages |
| `web/app/adminV2/components/workspace/blocks/QueueBlock.tsx` | AdminV2 workspace | Full CRM compact rows, placement, operational bands | Layout runtime queue blocks | **AdminV2-only** — work-unit shell |
| `web/components/admin/workspace/WorkspaceRenderer.tsx` | AdminV2 workspace | Dept workspace orchestrator; `presentation: flat \| department_bridge` | Workspace layout runtime | Both admin routes |
| `web/app/adminV2/components/workspace/shells/WorkUnitWorkspace.tsx` | AdminV2 workspace | SignalBlock, KPIBlock, QueueBlock, WorkBlock composition | Work-unit layout runtime | AdminV2 only |
| `web/app/adminV2/components/workspace/shells/DepartmentWorkspace.tsx` | AdminV2 workspace | AdminV2 department presentation shell | Same | AdminV2 only |

### 6.10 Composed drawer payload (reveal registry consumer)

| File location | Current owner | Runtime purpose | Replacement target | Convergence recommendation |
|---------------|---------------|-----------------|--------------------|-----------------------------|
| `web/lib/admin/drawer/composedDrawerPayload/evaluateComposedDrawerPayload.ts` | AdminV2 runtime | Person/opportunity payload readiness evaluation | Layout runtime readiness | Protected infrastructure |
| `web/lib/admin/drawer/composedDrawerPayload/sectionRequirements.ts` | AdminV2 runtime | Required section keys per drawer kind | Same | Same |
| `web/lib/admin/drawer/composedDrawerPayload/loadComposedPersonDrawerPayload.ts` | AdminV2 runtime | Warm-cache composed person payload | Same | Same |
| `web/lib/admin/drawer/composedDrawerPayload/types.ts` | AdminV2 runtime | Context types | Same | Same |

### 6.11 Action placement presentation (settings labels, not runtime layout)

| File location | Current owner | Runtime purpose | Replacement target | Convergence recommendation |
|---------------|---------------|-----------------|--------------------|-----------------------------|
| `web/lib/admin/actions/actionPlacementPresentation.ts` | Platform config | Settings → Action buttons surface/slot labels | Action placement resolves against layout section keys | `workspace` surface deferred per file comment |
| `web/lib/admin/actions/actionPlacementMutation.ts` | Platform config | Storage surfaces/slots | Layout runtime action slots | Runtime resolution separate from labels |

### 6.12 Demo / industry registries (non-production)

| File location | Current owner | Runtime purpose | Replacement target | Convergence recommendation |
|---------------|---------------|-----------------|--------------------|-----------------------------|
| `web/lib/ui-v2/demo/industry-workspace-registry.ts` | AdminV2 workspace | Demo vertical workspace configs | N/A | Demo only |
| `web/lib/ui-v2/demo/context-demo-config.ts` | AdminV2 workspace | Demo relationship groups | N/A | Demo only |

### 6.13 Layout V2 preview renderers (proof/settings)

| File location | Current owner | Runtime purpose | Replacement target | Convergence recommendation |
|---------------|---------------|-----------------|--------------------|-----------------------------|
| `web/components/layout/LayoutRecordView.tsx` | Layout V2 foundation | Renders LayoutDoc in proof/settings | Production layout renderer | Not production today |
| `web/components/layout/LayoutPreviewRenderer.tsx` | Layout V2 foundation | Layout preview | Same | Same |
| `web/app/(proof)/adminV2/layout-proof/*` | Layout V2 foundation | Layout V2 proof routes | Same | Dev/proof only |
| `web/components/adminV2/settings/RecordDrawerCompositionWorkspace.tsx` | Layout V2 foundation | Settings layout hub for 4 entities | Production settings | Preview ≠ runtime |
| `web/components/adminV2/settings/EffectiveDrawerLayoutPreviewPanel.tsx` | Record chrome | Read-only effective preview | Layout runtime preview panel | Same |
| `web/components/adminV2/settings/PersonRuntimeV1LayoutPreviewPanel.tsx` | Record chrome | Person runtime v1 preview | Same | Same |
| `web/components/adminV2/settings/OpportunityWorkflowV1SectionsEditor.tsx` | Record chrome | Workflow v1 section editor | Layout section editor | Opportunity-only editing |
| `web/components/adminV2/settings/OpportunityWorkflowV1DrawerOrderEditor.tsx` | Record chrome | Section order editor | Same | Same |
| `web/components/adminV2/settings/LayoutSectionFieldsPanel.tsx` | Record chrome | Field placement editor | Layout item editor | Opportunity-only |

---

## 7. Injected sections

Mechanisms that mount React content into config-driven section slots.

| Pattern | File location(s) | Current owner | Runtime purpose | Replacement target | Convergence recommendation |
|---------|------------------|---------------|-----------------|--------------------|-----------------------------|
| **`customSectionContent` map** | `EntityDrawerOverview.tsx`; `AdminEntityDrawerLegacy.tsx` overviewCustomContent; `PersonsDrawerVmBody.tsx`; `JobRecordModalV2.tsx`; `ScheduleRecordModalV2.tsx` | Legacy admin drawer + AdminV2 runtime | Section key → ReactNode when section has no fields or needs custom UI | LayoutDoc `widget_placeholder` items | Primary injection pattern — must become layout item kinds |
| **Operating sections above overview** | `PersonDrawerOperatingSections.tsx` | AdminV2 runtime | Hardcoded modules before EntityDrawerOverview | Person layout variant sections | Keys in `personDrawerLayoutRuntime.ts` |
| **Unified status injection** | `web/lib/admin/unifiedDrawerStatus.ts` | Record chrome | Synthetic `__unified_status` section | `injected_system` in layout doc | Already classified in preview taxonomy |
| **Workflow virtual sections** | `RecordLayoutConfigJson.inquiry_workflow_sections`; built from field_definitions | Record chrome | Dynamic keys (e.g. inq_identity) from field catalog | Layout runtime workflow_virtual sections | Opportunity workflow v1 only |
| **Injected system sections (preview taxonomy)** | `effectiveDrawerLayoutPreview.ts` | Record chrome | Marks inquiry_children, inquiry_tuition, __unified_status | Layout runtime injected_system kind | Preview mirrors runtime intent |
| **Opportunity inquiry above-fold composition** | `OpportunityDrawerInquiryWorkflowOverview.tsx`; legacy inquiry block in AdminEntityDrawerLegacy | AdminV2 runtime | Entire above-fold is composed JSX | Pipeline render model + layout blocks | Not EntityDrawerOverview-based |
| **Composed drawer payload gates** | `web/lib/admin/drawer/composedDrawerPayload/*` | AdminV2 runtime | Reveal when registry sections ready | Layout runtime readiness contract | Do not weaken per adminv2 doctrine |
| **Drawer pipeline slots** | `web/lib/adminV2/drawerPipeline/*` | AdminV2 runtime | `DrawerSectionSlot`, above-fold render model | Layout runtime slots | Job + opportunity |
| **Shell contract reserved geometry** | `compileOpportunityRecordDrawerShell.ts`; job `compileShell.ts` | AdminV2 runtime | `shell_min_height_class` per section | Layout runtime geometry | Coordinated reveal |
| **Communications tab injection** | `CommunicationsDrawerSection.tsx`; VM tab panes | Legacy admin drawer | Tab-level comms module | Layout tab widget | Not section-key based |
| **Schedule row extraction** | `web/lib/admin/scheduleOverviewRows.ts` | Record chrome | Moves fields into custom rows | Layout row overrides | Schedule-specific |
| **Related tab modules** | `web/components/admin/RelatedRecordsTabs.tsx` | Legacy admin drawer | Related entity tabs from `relatedModules` in registry | Layout related_list items | Config-driven from Layer 0 |

**Known injected section keys (non-exhaustive, from code):**

| Section key | Entity/surface | Injection owner |
|-------------|----------------|-----------------|
| `__unified_status` | Multiple entities | `unifiedDrawerStatus.ts` |
| `inquiry_children` | Opportunity | `OpportunityInquiryChildrenSection.tsx` |
| `relationships` | Person | `PersonDrawerVisibilitySections.tsx` |
| `enrollment_activity` | Person | `PersonDrawerEnrollmentActivity.tsx` |
| `employee_placement` | Person | Legacy drawer JSX |
| `compliance_quick_links` | Vendor | Legacy drawer JSX |
| `child_summary`, `parent_summary`, `household`, `address`, `employee_status`, `bos_panel` | Person parent/child | Person operating sections |
| `opportunity_lead_summary`, `opportunity_bos_right_column`, `opportunity_tour_slot` | Opportunity workflow | Inquiry workflow overview / VM |

---

## 8. V1 layout dependencies

Systems that depend on **Record Layout V1** (`record_drawer_layouts`, `record_layouts`, `RecordLayoutConfigJson`).

| File location | Current owner | Runtime purpose | Replacement target | Convergence recommendation |
|---------------|---------------|-----------------|--------------------|-----------------------------|
| `web/lib/admin/effectiveRecordDrawerLayout.ts` | Record chrome | DB resolution chain | Layout runtime resolver | Core V1 read path |
| `web/lib/recordChrome/types.ts` | Record chrome | Config JSON schema | LayoutDoc metadata absorption | Bridge until merged |
| `web/lib/admin/recordDrawerLayoutPersist.ts` | Record chrome | Write path for org layouts | Layout runtime publish | Same |
| `web/app/api/admin/record-layouts/route.ts` | Record chrome | Global template CRUD | Same | Same |
| `web/app/api/admin/record-layouts/effective-preview/route.ts` | Record chrome | Effective preview API | Same | Settings consumer |
| `web/app/api/admin/record-drawer-layouts/opportunity-workflow-v1-sections/route.ts` | Record chrome | Workflow section visibility API | Layout section API | Opportunity-only |
| `web/app/api/admin/record-drawer-layouts/opportunity-workflow-v1-order/route.ts` | Record chrome | Section order API | Same | Same |
| `web/app/api/admin/record-drawer-layouts/opportunity-workflow-v1-field-placements/route.ts` | Record chrome | Field placement API | Layout item placement API | Same |
| `web/lib/admin/person/personDrawerLayoutRuntime.ts` | Record chrome | Reads `person_layout_variants` from config JSON | LayoutDoc person variants | Live for parent/child |
| `web/lib/recordChrome/scheduleLayoutConfig.ts` | Record chrome | Schedule `layout_blocks` v2 within record layouts | LayoutDoc sections | **Only entity using layout_blocks in production drawer** |
| `web/lib/admin/opportunityEntityRecord.ts` | Record chrome | Attaches layout config to opportunity GET | Same | Hydration boundary |
| `web/lib/adminV2/viewModel/drawer/opportunity/composeOpportunityDrawerViewModel.ts` | AdminV2 runtime | VM composer reads effective layout | Layout runtime bootstrap | Opportunity VM |
| `web/lib/admin/loadOpportunityDrawerOperationalBootstrap.ts` | AdminV2 runtime | Bootstrap includes layout mode | Same | Same |
| `web/lib/fields/fieldPlacementV1.ts` | Record chrome | Field placement rules for opportunity | Layout item rules | Same |
| `web/lib/admin/opportunityWorkflowV1SectionConfig.ts` | Record chrome | Section visibility in config JSON | Layout section visibility | Same |
| `web/lib/admin/opportunityWorkflowV1DrawerOrder.ts` | Record chrome | Section order in config JSON | Layout section order | Same |
| `web/lib/admin/person/personDrawerPresentationEmphasis.ts` | Record chrome | Emphasis from layout config | Layout styling metadata | Same |
| `web/lib/admin/config/layout-integrity/route.ts` (via API) | Record chrome | Layout integrity validation | Layout runtime validator | Same |

**V1 layout modes in production:**

| Mode | Entity | Config key | Effect |
|------|--------|------------|--------|
| `inquiry_drawer_mode: workflow_v1` | Opportunity | `RecordLayoutConfigJson` | Workflow tabs, virtual sections, inquiry overview path |
| `person_drawer_mode: runtime_v1` | Person (parent/child) | `RecordLayoutConfigJson.person_layout_variants` | Operating section keys and order |
| `overview_section_order` | Job, Schedule | `RecordLayoutConfigJson` | Reorders Layer 0 sections |
| `layout_blocks` (version 2) | Schedule | `record_layouts.config_json` | Schedule-specific block layout in modal |

---

## 9. V2 layout dependencies

Systems that depend on **Layout V2** (`entity_layouts`, `LayoutDoc`, layout resolver). **None of these are wired to production drawer/queue runtime today** per `layoutV2.ts` header.

| File location | Current owner | Runtime purpose | Replacement target | Convergence recommendation |
|---------------|---------------|-----------------|--------------------|-----------------------------|
| `web/lib/layout/layoutV2.ts` | Layout V2 foundation | Type system for LayoutDoc | Production layout runtime | Foundation — not live |
| `web/lib/layout/layoutV2Schema.ts` | Layout V2 foundation | Validation | Same | Same |
| `web/lib/layout/layoutResolver.ts` | Layout V2 foundation | Resolution: org → default → registry migration | Production resolver | Wire on adoption |
| `web/lib/layout/migrateFromRegistry.ts` | Layout V2 foundation | Lossless registry → LayoutDoc | Migration only | Keep for parity tests |
| `web/lib/layout/seedFromCurrentPresentation.ts` | Layout V2 foundation | Seed from effective preview + record layouts | Settings bootstrap | Same |
| `web/lib/layout/defaultLeadLayouts.ts` | Layout V2 foundation | Curated opportunity drawer + queue defaults | Published templates | Same |
| `web/lib/layout/entityLayoutsRepo.ts` | Layout V2 foundation | DB repo | Production storage | Same |
| `web/lib/layout/entityKeys.ts`, `entityLabels.ts`, `fieldCatalog.ts` | Layout V2 foundation | Builder support | Settings + runtime catalog | Same |
| `web/lib/layout/builderOps.ts` | Layout V2 foundation | Layout mutation ops | Settings editor | Same |
| `web/app/api/admin/entity-layouts/route.ts` | Layout V2 foundation | CRUD API | Production API | Same |
| `web/components/layout/LayoutRecordView.tsx` | Layout V2 foundation | Preview renderer | **Becomes** production renderer | Adoption gate |
| `web/components/layout/LayoutPreviewRenderer.tsx` | Layout V2 foundation | Preview | Same | Same |
| `web/app/(proof)/adminV2/layout-proof/*` | Layout V2 foundation | Proof shell | Dev validation | Not production |
| `web/app/adminV2/settings/layouts/page.tsx` | Layout V2 foundation | Settings entry | Production settings | Preview only today |
| `web/lib/config/layoutIntegrityValidator.ts` | Layout V2 foundation | Integrity checks | Runtime validator | Same |
| `web/lib/agent/configLayoutAssist/configLayoutAssistPropose.ts` | Layout V2 foundation | AI layout assist proposals | Settings assist | Same |

**Layout V2 surfaces declared:** `drawer`, `queue` (`LAYOUT_SURFACES` in `layoutV2.ts`). Workspace/dashboard explicitly out of scope in that module.

---

## 10. Legacy Admin dependencies

Presentation systems consumed from **`/admin`** routes (legacy chrome, list pages, system config).

| File location | Current owner | Runtime purpose | Replacement target | Convergence recommendation |
|---------------|---------------|-----------------|--------------------|-----------------------------|
| `web/components/admin/AdminEntityDrawerLegacy.tsx` | Legacy admin drawer | Primary drawer for non-VM entities; fallback for all | Layout runtime drawer | Largest legacy surface |
| `web/components/admin/AdminLayout.tsx` | Legacy admin | Legacy admin chrome and nav | AdminV2 chrome | Navigation only — drawers shared |
| `web/components/admin/Drawer.tsx` | Legacy admin drawer | Right slide-out shell | Layout runtime shell | Shared by legacy + VM |
| `web/components/admin/workspace/WorkspaceRenderer.tsx` | AdminV2 workspace | Dept workspace at `/admin/workspace/dept/:id` | AdminV2 workspace routes | Shared renderer — both base paths |
| `web/components/admin/workspace/blocks/QueueBlock.tsx` | Legacy admin + AdminV2 dept | Dept queue previews | AdminV2 QueueBlock | Lighter preview variant |
| `web/app/admin/workspace/dept/[departmentId]/page.tsx` | Legacy admin | Dept workspace page | `/adminV2/workspace/dept/:id` | Parallel route |
| `web/app/admin/workspace/dept/[departmentId]/unassigned/page.tsx` | Legacy admin | Operations sub-route | Work-unit query-param lanes | Registry hardcoded route |
| `web/app/admin/workspace/dept/[departmentId]/scheduled-today/page.tsx` | Legacy admin | Operations sub-route | Same | Same |
| `web/app/admin/workspace/dept/[departmentId]/needs-attention/page.tsx` | Legacy admin | Operations sub-route | Same | Same |
| `web/app/admin/*/` list clients (Customers, Jobs, Opportunities, People, Locations, Vendors, etc.) | Legacy admin | List tables from `buildEntityTableColumns` + open drawer | AdminV2 list surfaces or unified lists | Table columns from Layer 0 |
| `web/app/admin/system/work-units/WorkUnitsClient.tsx` | Legacy admin | Queue definition builder UI | AdminV2 Settings enrollment hub | Same JSONB |
| `web/app/admin/financials/ledger/LedgerClient.tsx` | Legacy admin | Page-local drawer tabs | Layout runtime | Legacy only |
| `web/app/admin/financials/accounts/AccountsClient.tsx` | Legacy admin | Page-local drawer tabs | Same | Same |
| `web/lib/rrs/queue/growthOpportunityQueueScope.ts` | Legacy admin | Growth dept queue without work_unit scope | QueueService scoped paths | Superseded for WU |
| `web/lib/rrs/queue/queueDefinitionV1.ts` | Legacy admin | Legacy job/growth queue parsers | `queueDefinitionSchema.ts` | Same |

**Legacy admin still owns:** list page entry points for most entities, system work-unit config UI, financials sub-routes with local tabs, operations dept sub-routes.

**Legacy admin shares with AdminV2:** `AdminEntityDrawer` router, VM drawers, `entityPresentation.ts`, `WorkspaceRenderer`, drawer shell components.

---

## 11. AdminV2 dependencies

Presentation systems that exist only or primarily on **`/adminV2`** routes.

| File location | Current owner | Runtime purpose | Replacement target | Convergence recommendation |
|---------------|---------------|-----------------|--------------------|-----------------------------|
| `web/app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx` | AdminV2 workspace | Work-unit queue lane orchestration | Work-unit layout runtime | No legacy equivalent |
| `web/app/adminV2/components/workspace/blocks/QueueBlock.tsx` | AdminV2 workspace | Full queue row presentation | Layout runtime queue blocks | AdminV2-only |
| `web/app/adminV2/components/workspace/shells/WorkUnitWorkspace.tsx` | AdminV2 workspace | Work-unit shell composition | Same | Same |
| `web/app/adminV2/components/workspace/shells/DepartmentWorkspace.tsx` | AdminV2 workspace | AdminV2 dept shell | Dept layout runtime | Same |
| `web/lib/adminV2/navigation/buildWorkspaceNavDeptChildren.ts` | AdminV2 workspace | Sidebar pipeline lane expansion | Nav layout config | Same |
| `web/components/admin/vmDrawer/*` | AdminV2 runtime | Opportunity + person VM drawers | Layout runtime VM layer | Production cutover paths |
| `web/lib/adminV2/drawerPipeline/*` | AdminV2 runtime | Drawer pipeline adapters (job, opportunity) | Layout runtime pipeline | Same |
| `web/lib/adminV2/runtime/contract/*` | AdminV2 runtime | Reveal contracts, section registries, tab contracts | Layout runtime reveal | Protected doctrine |
| `web/lib/adminV2/shellContracts/*` | AdminV2 runtime | Bootstrap shell compilation | Layout runtime bootstrap | Same |
| `web/lib/adminV2/viewModel/drawer/*` | AdminV2 runtime | View-model composers for drawers | Layout runtime data layer | Same |
| `web/lib/ui-v2/*Presentation*.ts` | AdminV2 workspace | Queue row/lane/header presentation plans | Layout runtime queue surface | Code plans atop queue JSON |
| `web/lib/adminV2/workUnitQueueSelection.ts` | AdminV2 workspace | Queue pill selection | Layout runtime nav | Same |
| `web/lib/workspace/workUnitQueueLaneRevealState.ts` | AdminV2 runtime | Lane reveal state machine | Layout runtime reveal | Protected |
| `web/app/adminV2/settings/*` | AdminV2 runtime | Settings hubs (fields, layouts, lifecycle, actions) | Platform settings | Layouts hub is V2 preview only |
| `web/lib/admin/drawer/composedDrawerPayload/*` | AdminV2 runtime | Composed reveal gates | Layout runtime readiness | Shared API, AdminV2 doctrine |
| `web/lib/admin/prefetchPersonDrawerSnapshot.ts` | AdminV2 runtime | Drawer warm prefetch from queue | Layout runtime prefetch | AdminV2 QueueBlock consumer |

**AdminV2-only surfaces:** work-unit workspace with lane pills, full CRM compact queue rows, placement priority panels, sidebar pipeline expansion, VM drawer cutover paths, settings layout hub (preview).

**AdminV2 shares with legacy:** `AdminEntityDrawerLegacy` fallback, `entityPresentation.ts`, dept `WorkspaceRenderer` + legacy QueueBlock, opportunity/person drawers opened from both route trees.

---

## 12. Entity runtime matrix

Which presentation stack each entity uses in production today.

| Entity | Drawer runtime | Section source | Tab source | Layout system | Admin route |
|--------|----------------|----------------|------------|---------------|-------------|
| **Opportunity** | `OpportunityDrawerVmRuntime` (+ legacy fallback) | Hardcoded inquiry JSX + pipeline + record layout workflow_v1 | Workflow strip override | V1 workflow_v1 + AdminV2 pipeline | Both |
| **Person (generic)** | `PersonsDrawerVmRuntime` | Layer 0 + presentation profile | VM operating strip | Layer 0 | Both |
| **Person (parent)** | `PersonsDrawerVmRuntime` | Operating sections + filtered overview | VM operating strip | V1 person runtime_v1 when configured | Both |
| **Person (child)** | `PersonsDrawerVmRuntime` | Same with child chrome | VM operating strip | V1 person runtime_v1 when configured | Both |
| **Job** | `AdminEntityDrawerLegacy` + `JobRecordModalV2` | Layer 0 + job pipeline sections | Layer 0 + pipeline | Layer 0 + pipeline; V1 section order | Both |
| **Schedule** | `AdminEntityDrawerLegacy` + `ScheduleRecordModalV2` | Layer 0 + layout_blocks | Layer 0 | V1 layout_blocks v2 | Both |
| **Location** | Legacy | Layer 0 + custom property JSX | Layer 0 | Layer 0 only (target doc exists) | Both |
| **Customer, contact, vendor, subscription, payment, customer_member, document, service_*, addon, discount_redemption** | Legacy | Layer 0 + overviewCustomContent where needed | Layer 0 | Layer 0 | Primarily `/admin` lists |
| **Workflow** | Legacy | Hardcoded activity only | Layer 0 | No config overview | `/admin` |
| **Work unit** | No drawer | N/A | N/A | Queue definition + ui-v2 plans | AdminV2 only |

---

## 13. Convergence dependency graph (as-built)

```
Production today
├── Layer 0: entityPresentation.ts ──────────────────────► list columns + drawer fallback (all entities)
├── Record layout V1: record_drawer_layouts / record_layouts ► opportunity workflow, person runtime, job/schedule order
├── Hardcoded JSX: AdminEntityDrawerLegacy + opportunity/person components ► injected slots, inquiry workflow, operating modules
├── AdminV2 VM + pipeline: vmDrawer/* + drawerPipeline/* ► opportunity + person cutover, job partial
├── AdminV2 reveal contracts: runtime/contract/registry/* + composedDrawerPayload ► coordinated reveal gates
├── Queue stack: work_units.queue_definition + QueueService + ui-v2/*Presentation* ► work-unit lanes (AdminV2)
├── Workspace registry: workspace/registry.ts ► dept block layout (both admin base paths)
└── Layout V2 foundation: entity_layouts + LayoutDoc + proof renderer ► NOT production runtime

Documented replacement spine (existing docs — not new design)
├── Layout runtime: LayoutDoc + entity_layouts (drawer + queue surfaces)
├── Record layout V1 behavior absorbed into layout runtime resolver
├── WorkUnitSurfaceContext / QueueRowContext consumed by queue layout blocks
└── Layer 0 registry + hardcoded JSX retired entity-by-entity after published layout adoption
```

---

## 14. Items with no layout-runtime path yet

Documented gaps visible in code and active docs:

| Gap | Evidence | Current owner |
|-----|----------|---------------|
| Location drawer not on record layouts | `locationDrawerLayoutTarget.ts` — runtime reads Layer 0 only | Record chrome |
| 14 of 18 entity types absent from Settings → Layouts | `layoutsSettingsEntities.ts` — only opportunity, job, schedule, person | Layout V2 foundation |
| Layout V2 not wired to live drawers/queues | `layoutV2.ts` header non-goals | Layout V2 foundation |
| Person VM tabs override Layer 0 tabs | `PersonsDrawerVmBody.tsx` OPERATING_TAB_LIST | AdminV2 runtime |
| Two QueueBlock implementations | legacy vs AdminV2 components | AdminV2 workspace |
| Orphaned VM runtimes | `ChildDrawerVmRuntime.tsx`, `PersonDrawerVmRuntime.tsx` not routed | AdminV2 runtime |
| `workspace` action surface not wired | `actionPlacementPresentation.ts` comment | Platform config |
| Child/candidate grain QueueRowContext incomplete | `work-unit-surface-context-contract.md` partial adapter | AdminV2 workspace |
| Dept workspace block registry hardcoded | `workspace/registry.ts` | AdminV2 workspace |
| Workflow entity has no overview sections | `entityPresentation.ts` workflows.drawer | Platform / Layer 0 |

---

## 15. File index (alphabetical by path)

Quick lookup of all inventory paths:

<details>
<summary>web/app</summary>

- `web/app/(proof)/adminV2/layout-proof/*`
- `web/app/admin/customers/CustomersClient.tsx`
- `web/app/admin/discount-redemptions/DiscountRedemptionsClient.tsx`
- `web/app/admin/customer-members/CustomerMembersClient.tsx`
- `web/app/admin/financials/accounts/AccountsClient.tsx`
- `web/app/admin/financials/add-ons/AddOnsClient.tsx`
- `web/app/admin/financials/ledger/LedgerClient.tsx`
- `web/app/admin/financials/payments/PaymentsClient.tsx`
- `web/app/admin/financials/plan-templates/PlanTemplatesClient.tsx`
- `web/app/admin/financials/service-offerings/ServiceOfferingsClient.tsx`
- `web/app/admin/jobs/JobsClient.tsx`
- `web/app/admin/locations/LocationsClient.tsx`
- `web/app/admin/opportunities/OpportunitiesClient.tsx`
- `web/app/admin/people/PeopleClient.tsx`
- `web/app/admin/system/work-units/WorkUnitsClient.tsx`
- `web/app/admin/vendors/VendorsClient.tsx`
- `web/app/admin/workspace/dept/[departmentId]/page.tsx`
- `web/app/admin/workspace/dept/[departmentId]/needs-attention/page.tsx`
- `web/app/admin/workspace/dept/[departmentId]/scheduled-today/page.tsx`
- `web/app/admin/workspace/dept/[departmentId]/unassigned/page.tsx`
- `web/app/adminV2/components/MyTasksPanel.tsx`
- `web/app/adminV2/components/workspace/blocks/QueueBlock.tsx`
- `web/app/adminV2/components/workspace/shells/DepartmentWorkspace.tsx`
- `web/app/adminV2/components/workspace/shells/WorkUnitWorkspace.tsx`
- `web/app/adminV2/settings/fields/SettingsFieldsHubClient.tsx`
- `web/app/adminV2/settings/layouts/LayoutsSettingsHubClient.tsx`
- `web/app/adminV2/settings/layouts/page.tsx`
- `web/app/adminV2/settings/page.tsx`
- `web/app/adminV2/settings/relationships/RelationshipsSettingsClient.tsx`
- `web/app/adminV2/settings/users-roles/UsersRolesSettingsClient.tsx`
- `web/app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx`
- `web/app/api/admin/entity-layouts/route.ts`
- `web/app/api/admin/record-drawer-layouts/opportunity-workflow-v1-field-placements/route.ts`
- `web/app/api/admin/record-drawer-layouts/opportunity-workflow-v1-order/route.ts`
- `web/app/api/admin/record-drawer-layouts/opportunity-workflow-v1-sections/route.ts`
- `web/app/api/admin/record-layouts/effective-preview/route.ts`
- `web/app/api/admin/record-layouts/route.ts`

</details>

<details>
<summary>web/components</summary>

- `web/components/admin/AdminEntityDrawer.tsx`
- `web/components/admin/AdminEntityDrawerLegacy.tsx`
- `web/components/admin/AdminLayout.tsx`
- `web/components/admin/Drawer.tsx`
- `web/components/admin/RelatedRecordsTabs.tsx`
- `web/components/admin/communications/CommunicationsDrawerSection.tsx`
- `web/components/admin/drawer/DrawerAboveFoldRenderer.tsx`
- `web/components/admin/drawer/DrawerComposedPreparingState.tsx`
- `web/components/admin/drawer/JobDrawerV2.tsx`
- `web/components/admin/drawer/JobRecordModalV2.tsx`
- `web/components/admin/drawer/RecordLifecycleRail.tsx`
- `web/components/admin/drawer/ScheduleRecordModalV2.tsx`
- `web/components/admin/drawer/record/RecordDrawerContextPanel.tsx`
- `web/components/admin/drawer/record/RecordDrawerSectionCard.tsx`
- `web/components/admin/entity/*` (EntityDrawerOverview, PersonDrawer*, LocationDrawer*, buildEntityTableColumns)
- `web/components/admin/opportunity/*` (inquiry workflow sections)
- `web/components/admin/vmDrawer/*`
- `web/components/admin/workspace/WorkspaceRenderer.tsx`
- `web/components/admin/workspace/blocks/QueueBlock.tsx`
- `web/components/adminV2/settings/*` (layout settings, lifecycle, action placement)
- `web/components/layout/LayoutPreviewRenderer.tsx`
- `web/components/layout/LayoutRecordView.tsx`
- `web/components/layout/proofShell/ProofRecordModal.tsx`

</details>

<details>
<summary>web/lib</summary>

- `web/lib/admin/*` (drawer, person, opportunity, location, unifiedDrawerStatus, effectiveRecordDrawerLayout, composedDrawerPayload, actions)
- `web/lib/adminV2/*` (drawerPipeline, runtime/contract, shellContracts, viewModel, navigation, layouts, workUnitQueueSelection)
- `web/lib/completion/lifecycleProgressionRequirementsCatalog.ts`
- `web/lib/config/enrollmentPipelineQueueDefinitionV1.ts`
- `web/lib/config/enrollmentPipelineQueueDefinitionV2.ts`
- `web/lib/config/queueDefinitionSchema.ts`
- `web/lib/config/queueDefinitionV2Runtime.ts`
- `web/lib/entityPresentation.ts`
- `web/lib/fields/fieldPlacementV1.ts`
- `web/lib/layout/*`
- `web/lib/lifecycle/*`
- `web/lib/orchestration/placement/waitlistQueueBlockSectionPlan.ts`
- `web/lib/orchestration/placement/waitlistQueueSectionPresentation.ts`
- `web/lib/queues/*`
- `web/lib/recordChrome/*`
- `web/lib/rrs/queue/*`
- `web/lib/ui-v2/*`
- `web/lib/workUnits/*`
- `web/lib/workspace/*`

</details>

---

*This inventory reflects the repository state as of 2026-06-06. Re-audit when Layout V2 adoption wires production renderers or when additional entities join Settings → Layouts.*
