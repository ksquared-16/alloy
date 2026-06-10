# Program Category Normalization — Audit

**Path:** `docs/sprints/06_2026/program_category_normalization_audit.md`  
**Date:** 2026-06-09  
**Status:** Implemented (2026-06-09)  
**Goal:** Single source of truth for program categories tied to locations (`location_program_categories`), reused across leads, children, rooms, queues, forms, and layouts.

**Related:**

- [`program_interest_configurable_model_audit.md`](./program_interest_configurable_model_audit.md)
- [`location_scoped_programs_configuration_design.md`](./location_scoped_programs_configuration_design.md)

---

## Doctrine (target)

**Program category** is **location-owned configuration**. Each site (`locations.location_type = 'site'`) owns an ordered list of categories (`location_program_categories`). Stable `key` values (e.g. `infant`, `toddler`) align with existing OCM `desired_program_type` storage. Display labels come from the location row, not hardcoded frontend lists.

- Do **not** introduce a parallel “program type” concept when it means the same thing.
- `desired_program_type` (text key) remains for backward compatibility.
- `desired_program_category_id` (FK) is the preferred durable reference when available.
- Org option set `childcare_program_type` remains as legacy label fallback only — not the picker source of truth.

---

## 1. Hardcoded label inventory

### Platform-hardcoded five categories (Infant, Toddler, Preschool, Pre-K, School Age)

| Location | Mechanism | Notes |
|----------|-----------|-------|
| `web/lib/orchestration/placement/orgProgramCategory.ts` | `ORG_PROGRAM_CATEGORY_LABELS`, `ORG_PROGRAM_CATEGORY_SORT_ORDER` | Waitlist section grouping + label classification |
| `web/lib/orchestration/placement/orgProgramCategoryRegistry.ts` | `listOrgProgramCategoriesForSettings()` | **Settings → Locations** read-only banner |
| `web/components/adminV2/settings/LocationsHierarchySettingsClient.tsx` | Calls `listOrgProgramCategoriesForSettings()` | “Org program categories” banner — **primary UX bug** |
| `web/lib/forms/systemFieldRegistry.ts` | `select_options_lines: "infant\|Infant\n..."` | Form authoring placeholder for enrollment program field |
| `supabase/migrations/20260430211000_childcare_mvp_control_plane_seed.sql` | Seeds `childcare_program_type` option set | Org-wide option set (5 keys) — **acceptable seed default** |
| `web/lib/orchestration/placement/waitlistDemoScenarios.ts` | Key map | Demo/test scaffolding |

### Org option set `childcare_program_type` (same keys, org-editable)

| Location | Role |
|----------|------|
| Settings → Locations room **Category** column | `fetchOptionSetItemsBySetKey("childcare_program_type")` |
| Opportunity inquiry-children grid program picker | `loadWorkspaceChildcareInquiryOptionSets` → option set items |
| Layout runtime placement provider | Same option set fetch |
| `useInquiryChildPlacementCascade` | Same |
| `web/lib/admin/location/locationMetadataFieldKeys.ts` | `category: "childcare_program_type"` |
| `inquiryChildOcmPlacementDisplay.ts` | Label lookup via `childcare_program_type` option set |
| `field_definitions` migration `20260610120000` | `option_set_key: childcare_program_type` on `desired_program_type` |

### `desired_program_type` storage and writes

| Location | Role |
|----------|------|
| `opportunity_customer_members.desired_program_type` | Canonical text key column (OCM) |
| `web/lib/admin/actions/createLeadChildOcmPersistence.ts` | Create Lead → OCM insert |
| `web/lib/forms/intake/resolveIntakeChildOcmFields.ts` | Public form intake |
| `web/app/api/admin/opportunity-customer-members/[id]/route.ts` | Drawer PATCH |
| `web/lib/lifecycle/lifecycleFieldRuleBindings.ts` | `child:program_interest` binding |
| `web/lib/completion/*` | Requirement evaluation |
| `web/lib/workUnits/buildChildGrainQueueRowContext.ts` | Queue row context |
| `web/lib/layout/runtime/normalizeLayoutRuntimeChildRow.ts` | Layout runtime child rows |
| `web/lib/orchestration/placement/syncPlacementCandidateFromOcm.ts` | Placement candidate sync |

### `program_category` / `programCategory` (computed display, not storage)

| Location | Role |
|----------|------|
| `web/lib/layout/runtime/buildOpportunityLayoutRuntimeRecordFromVm.ts` | `enrollment.program_category` compute |
| `web/tests/layout/relationshipReferenceRuntimePlan.test.ts` | FC-3 binding tests |
| `docs/platform_convergence/entity_relationship_reference_model.md` | Reference model doc |

### Waitlist / placement grouping (org-level classification, not picker)

| Location | Role |
|----------|------|
| `web/lib/orchestration/placement/waitlistQueueSectionPresentation.ts` | Section titles (“Infant waitlist”) |
| `web/lib/orchestration/placement/orgProgramCategory.ts` | `resolveOrgProgramCategoryForWaitlist` |
| `web/lib/ui-v2/queuePlacementPriorityPresentation.ts` | Presentation helpers |

**Note:** Waitlist section grouping may continue using org-level classification helpers until a follow-up wires section sort order from location config. Out of scope for this controlled migration.

---

## 2. Current data flow (before)

```
childcare_program_type (org option set)
        ↓
Settings room metadata.category (unit rows)
        ↓ derive
resolveProgramsOfferedForSite() → inquiry drawer / layout / create lead pickers
        ↓ store key
opportunity_customer_members.desired_program_type
        ↓ resolve label
inquiryChildOcmPlacementDisplay → option set lookup
```

**Gaps:**

1. Settings banner shows **platform-hardcoded** five labels, not live config.
2. Program picker derives offerings from **room inventory**, not explicit site configuration.
3. No per-location enable/disable/reorder without editing org option set or adding rooms.
4. Labels in pickers come from org option set, not location-owned labels.

---

## 3. Target data flow (after)

```
location_program_categories (per site)
        ↓ active rows, sort_order
Settings → Locations (banner + room category dropdown)
Inquiry drawer / layout / create lead program pickers
        ↓ store
desired_program_category_id + desired_program_type (key, compat)
        ↓ resolve label
location_program_categories.label (preferred)
  → childcare_program_type option set (legacy fallback)
  → raw key
```

---

## 4. Files requiring change (implementation scope)

### Schema

- New: `location_program_categories` table + RLS
- Alter: `opportunity_customer_members.desired_program_category_id`

### Settings

- `web/components/adminV2/settings/LocationsHierarchySettingsClient.tsx`
- Remove dependency on `listOrgProgramCategoriesForSettings()`

### Pickers / cascade

- `web/lib/admin/location/inquiryChildPlacementOptions.ts`
- `web/lib/admin/hooks/useInquiryChildPlacementCascade.ts`
- `web/components/layout/LayoutRuntimePlacementDataProvider.tsx`
- `web/components/admin/entity/OpportunityInquiryChildrenSection.tsx`
- `web/lib/workspace/workspaceChildcareInquiryOptionSets.ts`

### Display / persistence

- `web/lib/admin/drawer/inquiryChildOcmPlacementDisplay.ts`
- `web/lib/admin/actions/createLeadChildOcmPersistence.ts`
- `web/lib/fields/inquiryChildFieldRegistry.ts`
- `web/app/api/admin/opportunity-customer-members/[id]/route.ts`

### Intentionally unchanged (this pass)

- Demo scripts, dev mockups, test fixture labels
- `childcare_program_type` option set (legacy fallback only)

---

## 5. Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Existing leads with only `desired_program_type` | Label resolver falls back to key + option set; no data migration required |
| Room `metadata.category` out of sync with new table | Room dropdown uses site categories; keys remain aligned |
| Picker shows empty when site has no categories | Seed migration inserts defaults for all active sites |
| Inactive categories on old records | Display still resolves; inactive excluded from new pickers only |
| AdminV2 reveal/performance | No reveal-gate changes; additive API fetch with existing dedupe TTL pattern |

---

## 6. Test coverage plan

- Settings client no longer imports hardcoded registry
- `resolveProgramsOfferedForSite` prefers location categories over room-derived set
- Create lead persists `desired_program_category_id` when key matches site category
- Legacy `desired_program_type`-only rows still resolve labels
- Inactive categories excluded from selection lists

---

## 7. Final doctrine

### Program categories are owned by location config

Each **site** (`locations.location_type = 'site'`) owns rows in `location_program_categories`:

| Column | Role |
|--------|------|
| `key` | Stable identifier (`infant`, `toddler`, …) — stored on OCM `desired_program_type` and room `metadata.category` |
| `label` | Operator-facing display name (editable per site) |
| `sort_order` | Picker and settings display order |
| `is_active` | Excluded from new selection lists when false; still resolves for existing records |

**Seed defaults** (Infant, Toddler, Preschool, Pre-K, School Age) exist only in migration `20260610140000_location_program_categories.sql`.

### Org-level program category helpers are legacy/fallback only

| Module | Status |
|--------|--------|
| `location_program_categories` + `/api/admin/location-program-categories` | **Source of truth** for pickers, settings, writes |
| `childcare_program_type` option set | **Legacy label fallback** for records predating location config |
| `orgProgramCategory.ts` / `orgProgramCategoryRegistry.ts` | **Waitlist section classification + cross-location analytics only** — not operator vocabulary |

Do not add new UI surfaces that read from `ORG_PROGRAM_CATEGORY_LABELS` or hardcoded five-category arrays.

### Leads, children, rooms, forms, layouts resolve through location-owned categories

| Surface | Program source | Label resolution |
|---------|----------------|------------------|
| Settings → Locations | `location_program_categories` per site | Direct from table |
| Room `metadata.category` | Stable `key` only | Parent site's active categories for dropdown |
| Inquiry drawer / layout cascade | Active categories for selected site | `resolveProgramsOfferedForSite` |
| Create Lead execute | Writes `desired_program_type` + `desired_program_category_id` | `enrichOcmProgramCategoryFields` |
| OCM PATCH | Same dual write | API route enrichment |
| Drawer / queue / inquiry child display | OCM fields + site context | location category → legacy option set → raw key |

### Write contract (transition)

- **`desired_program_type`** — legacy stable key; always populated when program selected.
- **`desired_program_category_id`** — normalized FK; auto-resolved from `location_id` + key on write.
- Existing records with key-only OCM rows continue to display via fallback chain; migration backfills FK where site + key match.

### Waitlist grouping (implemented)

| Surface | Behavior |
|---------|----------|
| `waitlistProgramCategoryResolution.ts` | Resolves section key/label from `location_program_categories` when site + OCM category fields exist |
| Server sort (`sortPlacementCandidateQueueRows`, `candidateGrainWaitlistQueue`, `QueueService`) | Loads org categories once; uses location `sort_order` when workspace site filter is active |
| Client (`page.tsx`, `QueueBlock`) | Fetches categories; passes `waitlistProgramCategoryContext` with `activeSiteId` |
| `orgProgramCategory.ts` | Fallback classification + cross-site analytics only |

### Out of scope (follow-up)

- Retiring `childcare_program_type` option set entirely once all tenants have location categories configured.
