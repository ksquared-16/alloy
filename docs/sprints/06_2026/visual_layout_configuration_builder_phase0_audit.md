# Visual Layout Configuration Builder — Phase 0 Audit

**Sprint:** Visual Layout Configuration Builder  
**Phase:** 0 — Audit (no behavior changes)  
**Date:** 2026-06-15  
**Status:** Complete — input to Phases 1–5

---

## Executive summary

Alloy already has **three overlapping layout configuration layers** plus a **partial Layout V2 stack** that is further along than the sprint brief assumes. The `/admin/settings/layouts` page today mounts **`LayoutConfigClient`** (Layout V2 `entity_layouts` editor), not the older **`RecordDrawerCompositionWorkspace`** hub. Runtime adoption for Lead/Person/Child drawers and Lead queue rows is **already gated and partially live** via `web/lib/layout/featureFlag.ts` and layout-runtime render paths.

The sprint goal — *admins edit the exact product shape, not JSON* — is a **UX evolution** on top of existing validated storage (`entity_layouts.doc`) and closed vocabularies (`layoutV2.ts`, `layoutV2Schema.ts`). It should **not** introduce a fourth parallel config store. Prefer extending the surface/zone registry and replacing the settings experience with a **Layout Gallery + visual shell editor**, while **migrating** legacy `record_drawer_layouts.config_json` semantics into LayoutDoc over time.

---

## 1. Settings route and UI (current)

| Asset | Path | Role today |
|-------|------|------------|
| Settings page | `web/app/adminV2/settings/layouts/page.tsx` | Hero header + **`LayoutConfigClient`** + collapsible effective-layout inspector |
| Layout V2 builder | `web/components/layout/LayoutConfigClient.tsx` | List grouped layouts; section/row/column/item editor; `LayoutPreviewRenderer`; draft save/publish via `entity-layouts` APIs; queue v3 panel via `metadata.queue_record_layout` |
| Legacy composition hub | `web/app/adminV2/settings/layouts/LayoutsSettingsHubClient.tsx` | Entity tabs + **`RecordDrawerCompositionWorkspace`** — **not mounted** on the primary layouts page (see `configurationWorkspaceV3.test.ts`) |
| Workflow v1 editor | `web/components/adminV2/settings/RecordDrawerCompositionWorkspace.tsx` | Opportunity section order/hide/rename + field placements via **`record-drawer-layouts`** APIs; person **preview-only** |
| Effective inspector | `web/components/adminV2/settings/EffectiveLayoutInspectorClient.tsx` | Read-only resolution debug (`entity_layouts` resolve mode) |
| Proof redirect | `web/app/(proof)/adminV2/layouts/page.tsx` | Redirects to settings layouts |

**Gap vs sprint UX:** admins still work in a **structured form builder** (sections/rows/columns), not inside the **drawer shell** (header / summary strip / tabs / right rail / footer actions). Preview is a separate panel, not WYSIWYG configuration mode.

---

## 2. Database schema (current)

### 2.1 `record_layouts` (global templates, legacy)

- **Migration:** `supabase/migrations/20260409140000_record_layouts_and_record_actions.sql`
- **Shape:** `(entity_type, key, config_json, is_active)`
- **Scope:** Global only (no `org_id`)
- **Seeded entities:** `job`, `schedule` (+ later opportunity/person via other migrations)
- **Typical `config_json`:** `{ version, overview_section_order[] }`, schedule `overview_rows` / `layout_blocks`

### 2.2 `record_drawer_layouts` (org-scoped legacy overrides)

- **Migration:** `supabase/migrations/20260430140000_record_drawer_layouts_org_scoped.sql`
- **Shape:** `(org_id, entity_type, surface, key, config_json, is_active)` — unique per org/entity/surface/key
- **Resolution:** org active row → fallback `record_layouts` (see `fetchEffectiveRecordDrawerLayout`)
- **Opportunity childcare seeds:** workflow v1 layout in migrations under `supabase/migrations/202604*_opportunity*`

### 2.3 `entity_layouts` (Layout V2 — target store)

- **Migration:** `supabase/migrations/20260603120000_entity_layouts_v2.sql`
- **Shape:** `(org_id nullable, entity_type, surface, layout_key, version, status, doc, metadata, created_by, published_at, …)`
- **Surfaces (CHECK):** `drawer` \| `queue` only
- **Status (CHECK):** `draft` \| `published` (no `archived` yet)
- **Doc:** validated `LayoutDoc` — `sections[] → rows[] → columns[] → items[]`
- **Versioning:** monotonic `version` per `(org_id, entity_type, surface, layout_key)`; publish flips status; **no rollback API** (republish prior doc as new version only)

### 2.4 Related config (not layout docs)

| Store | Purpose |
|-------|---------|
| `field_definitions` / `field_section_definitions` | Field catalog — labels, types, drawer visibility, section_key |
| `record_actions` | Legacy action buttons (`event_key`, placement) |
| Action placements (Settings → Actions) | Org placement rows — surfaces include `record section`, `queue_row`, `right_rail` |
| `work_units.queue_definition` | Reserved queue cohort DSL — not layout presentation |

---

## 3. `config_json` contracts (legacy)

Authoritative TypeScript: `web/lib/recordChrome/types.ts` → `RecordLayoutConfigJson`.

| Key | Entity / use | Semantics |
|-----|--------------|-----------|
| `overview_section_order` | job, schedule, opportunity, person | Reorder drawer overview sections by `section_key` |
| `overview_hidden_sections` | opportunity workflow v1 | Hide sections |
| `inquiry_drawer_mode: "workflow_v1"` | opportunity | Enables workflow drawer transform |
| `inquiry_workflow_sections` | opportunity | Synthetic sections from field_keys |
| `field_placements_v1` | opportunity | Per-field Required/Editability on this layout |
| `suppress_body_status` | opportunity | Hide injected status section |
| `person_drawer_mode` / `person_layout_variants` | person | Runtime v1 profile variants |
| `overview_rows` / `layout_blocks` | schedule | Row/block layout (v1/v2) |

**Validation:** patch routes validate section keys and field keys against catalog/workflow allowlists (`opportunityWorkflowV1SectionConfig.ts`, `fieldPlacementV1.ts`). **Not** the same validator as Layout V2 `parseLayoutDoc`.

---

## 4. Layout V2 doc contract (current)

Authoritative types: `web/lib/layout/layoutV2.ts`  
Validator: `web/lib/layout/layoutV2Schema.ts`  
Frozen architecture reference: `docs/platform_convergence/layout_contract_v1.md`

```
LayoutDoc {
  formatVersion, entityType, surface: drawer|queue
  sections[]: { id, key, title, rows[], metadata?, visibleWhen? }
    rows[]: { columns[]: { width, items[] } }
    items[]: kind ∈ field | field_group | related_list | widget_placeholder
}
metadata.queue_record_layout  // queue v3 composer (columns, widgets, zones)
metadata.queue_context        // queue variant discriminator
```

**Closed vocabularies:** surfaces, item kinds, render hints, queue zones (`LAYOUT_QUEUE_ZONES`), adornments, conditions.

**Not in doc today (sprint proposal adds conceptually):**

- Explicit drawer **zones** (`header`, `main`, `right_rail`, `footer_actions`) — today split by **platform section-key registry** (`splitDrawerLayoutDocShellZones.ts`: `lead_summary`, `person_summary`, `child_summary` → summary strip; rest → body)
- **`surface_key`** naming (`opportunity_drawer` vs `entity_type=opportunities` + `surface=drawer`)
- **`component_type`** on sections — expressed via `LayoutItem.kind` and section metadata
- **`actions[]`** on sections — actions live in Action placements + widgets (`lifecycle_actions`, etc.)

---

## 5. API inventory

### Layout V2 (validated, auditable)

| Method | Route | Notes |
|--------|-------|-------|
| GET | `/api/admin/entity-layouts` | List all; or resolve `?entity_type=&surface=` |
| POST | `/api/admin/entity-layouts` | Create draft (seed: lead_default, runtime mirror, registry) |
| GET/PATCH/DELETE | `/api/admin/entity-layouts/[id]` | Draft-only mutation |
| POST | `/api/admin/entity-layouts/[id]/publish` | Validates doc then publishes |
| GET | `/api/admin/entity-layouts/field-catalog` | Manifest-filtered refKeys for picker |

Gated by `isLayoutV2ConfigEnabledServer()` (on when layout runtime hard cutover active or preview flag).

### Legacy workflow / record chrome

| Method | Route | Notes |
|--------|-------|-------|
| GET | `/api/admin/record-layouts` | Effective legacy layout row |
| GET | `/api/admin/record-layouts/effective-preview` | Settings preview bundle + editor_sections |
| PATCH | `/api/admin/record-drawer-layouts/opportunity-workflow-v1-sections` | Hide/rename workflow sections |
| PATCH | `/api/admin/record-drawer-layouts/opportunity-workflow-v1-order` | Section order |
| PATCH | `/api/admin/record-drawer-layouts/opportunity-workflow-v1-field-placements` | field_placements_v1 |

### Integrity / runtime

| Route | Purpose |
|-------|---------|
| `GET /api/admin/config/layout-integrity` | Cross-surface integrity report |
| `GET /api/admin/layout-runtime/*` | Drawer/queue body payloads for runtime |
| `GET /api/admin/layout-proof/*` | Shadow parity / proof fixtures |

---

## 6. Runtime resolution (current)

**Layout V2 resolver:** `web/lib/layout/layoutResolver.ts` + `resolveLayoutForOrg`

Order:

1. Org **published** `entity_layouts` (highest version)
2. Default **published** `entity_layouts` (`org_id` NULL)
3. Builtin queue variants / curated defaults (`defaultLeadLayouts`, `defaultRecordDrawers`, …)
4. **`entityPresentation.ts` registry** (Layer 0)

**Legacy parallel path** (still used for workflow v1 section assembly in VM/shell compiler):

- `record_drawer_layouts` → `record_layouts` via `fetchEffectiveRecordDrawerLayout`

**Feature flags:** `web/lib/layout/featureFlag.ts` — master runtime default **ON**; per-entity drawer/queue body flags; emergency `LAYOUT_RUNTIME_LEGACY_EMERGENCY_FALLBACK`; production summary-strip boundary off by default.

**Adoption status (code):**

- Opportunity / person / child drawer bodies + opportunity queue rows have layout-runtime render paths
- Legacy `RecordDrawerCompositionWorkspace` still drives **record_drawer_layouts** for opportunity operator edits
- **Dual write risk:** operators can publish `entity_layouts` and separately patch workflow v1 `config_json` until convergence

---

## 7. Hardcoded presentation → register as zones/sections

### Platform-owned shell (must NOT move into layout doc)

From `entityDrawerOperatingModel.ts`:

- `frame`, `header`, `lifecycle_rail_container`, `summary_strip_container`, `tabs_container`, `bos`, `actions`, `status`, `close`, `relationship_navigation`, `performance_reveal`

### Layout-owned today (should appear in visual editor)

| Surface | Registered keys / modules | Where defined |
|---------|---------------------------|---------------|
| Opportunity drawer summary | `lead_summary` | `defaultLeadLayouts.ts`, `DRAWER_SUMMARY_STRIP_SECTION_KEYS` |
| Person drawer summary | `person_summary` | `defaultPersonLayouts.ts` |
| Child drawer summary | `child_summary` | `defaultRecordDrawers.ts` |
| Drawer body sections | `lead_*`, widgets (tasks, tour, comms, …) | `defaultLeadLayouts.ts` |
| Right rail sections | enrollment grid, attention, BOS slots | `resolveLeadOverviewRightRailSections.ts`, section metadata `LAYOUT_SECTION_RAIL_SLOT_METADATA_KEY` |
| Queue card zones | `header.*`, `context.*`, `body.*`, `actions.stack` | `LAYOUT_QUEUE_ZONES`, `queueRecordLayoutV3.ts` |
| Waitlist card | `placement_candidate` / `waitlist_candidate_card` | `defaultWaitlistLayouts.ts` |

### Still hardcoded outside LayoutDoc

- Tab strips (`OPPORTUNITY_DRAWER_DEFAULT_TABS`, person/child tabs) — platform container; layout may influence visibility later
- Opportunity workflow section **assembly** from `field_definitions.section_key` when workflow v1 active (`effectiveDrawerLayoutPreview.ts`)
- AdminEntityDrawer / VM legacy JSX for job, schedule, documents, workflows
- **Communications Command Center** — no layout config module (future `surface_key`)
- **POS / Processing workspace** — no layout config module (future `surface_key`)

---

## 8. Gap analysis vs sprint proposal

| Sprint concept | Current state | Recommendation |
|----------------|---------------|----------------|
| `SurfaceLayoutTemplate` table | `entity_layouts` already matches 80% | **Evolve `entity_layouts`**, do not add parallel table; add columns `based_on_layout_id`, `updated_by`, optional `description`; consider `archived` status |
| `surface_key` | `entity_type` + `surface` + `layout_key` | Add **code registry** `SurfaceLayoutDefinition` mapping `opportunity_drawer` → `{ entityType: "opportunities", surface: "drawer", layoutKey: "default" }` |
| Zones in config | Drawer: implicit via section keys; Queue: `metadata.zone` | Phase 1: **drawer zone registry** aligning platform shell + doc sections; optional doc normalization layer for editor |
| Layout Gallery | Flat list in `LayoutConfigClient` | Phase 2: card grid; enabled + coming-soon surfaces share one model |
| Visual editor V1 | Form builder + preview panel | Phase 3: render `EntityDrawerOperatingShell` / layout runtime body in **config mode** with sample VM |
| Rollback | Prior published versions retained; no rollback endpoint | Phase 1 API: `POST …/rollback` = publish clone of chosen version as new highest version |
| No arbitrary config_json | Layout V2 enforced; legacy keys open | Migrate opportunity workflow v1 patches to LayoutDoc operations; deprecate patch routes after parity |
| Tests | Extensive under `web/tests/layout/` | Extend with zone/field/action rejection + rollback + gallery flows |

---

## 9. Proposed schema changes (Phase 1+)

**Minimal migration on `entity_layouts`:**

```sql
ALTER TABLE entity_layouts
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS based_on_layout_id uuid REFERENCES entity_layouts(id),
  ADD COLUMN IF NOT EXISTS updated_by uuid;

-- Optional: extend status check to include 'archived'
-- ALTER … status IN ('draft','published','archived')
```

**No new JSON store.** Queue v3 remains `doc.metadata.queue_record_layout` until a contract bump.

**Future surfaces** (comms, POS): extend `surface` CHECK or add `surface_key` column with registry validation — prefer **registry-first** design before widening CHECK.

---

## 10. Proposed API changes (Phase 1+)

| Endpoint | Purpose |
|----------|---------|
| `GET /api/admin/surface-layouts/registry` | Supported surfaces, zones, allowed section kinds, field sources, action placements |
| `POST /api/admin/entity-layouts/[id]/duplicate` | Clone published/default → new draft (implements “duplicate default layout”) |
| `POST /api/admin/entity-layouts/[id]/rollback` | New draft from historical version → publish pipeline |
| `POST /api/admin/entity-layouts/from-blank` | Curated empty doc for surface (validates minimum shell) |
| Extend `parseLayoutDoc` | Reject unknown section keys / zones / widget keys per surface registry |

**Deprecate (after parity):** opportunity-workflow-v1-* patch routes → unified entity-layouts PATCH with validated doc diff.

---

## 11. Phase mapping (recommended)

| Phase | Work |
|-------|------|
| **0** | This audit ✅ |
| **1** | `surfaceLayoutRegistry.ts` — `opportunity_drawer` zones, validation extensions, rollback/duplicate APIs |
| **2** | Replace list UX with Layout Gallery; wire gallery → existing entity-layouts list |
| **3** | Config-mode drawer shell editor for opportunity; sample data via `layoutDrawerPreviewRecord.ts` |
| **4** | Converge legacy `record_drawer_layouts` workflow v1 reads into effective LayoutDoc; single runtime source |
| **5** | Registry rejection tests, rollback, fallback, no stray keys |

---

## 12. Doctrine (Layout Builder)

1. **Configuration only** — layouts reference registered fields, sections, widgets, actions, zones; never invent handlers or SQL.
2. **Server-validated writes** — all mutations through `/api/admin/*` with `parseLayoutDoc` + surface registry.
3. **Versioned & auditable** — draft → publish; immutable published rows; rollback = new publish from prior doc.
4. **Platform shell vs layout content** — drawer frame/header/tabs/reveal gates stay platform-owned (`drawer-operating-model-v1.md`).
5. **Runtime fail-safe** — invalid/missing doc → curated default (`defaultLeadLayouts`, registry fallback); never blank drawer.
6. **One effective doc per identity** — converge dual legacy + V2 paths for opportunity before expanding surfaces.

---

## 13. Key files reference

| Area | Files |
|------|-------|
| Settings UI | `page.tsx`, `LayoutConfigClient.tsx`, `LayoutPreviewRenderer.tsx` |
| Legacy settings | `LayoutsSettingsHubClient.tsx`, `RecordDrawerCompositionWorkspace.tsx` |
| Types / validation | `layoutV2.ts`, `layoutV2Schema.ts`, `recordChrome/types.ts` |
| Persistence | `entityLayoutsRepo.ts`, migrations above |
| Resolution | `layoutResolver.ts`, `resolveLayoutRuntime.ts`, `effectiveRecordDrawerLayout.ts` |
| Defaults | `defaultLeadLayouts.ts`, `defaultPersonLayouts.ts`, `defaultRecordDrawers.ts`, `entityPresentation.ts` |
| Shell zones | `splitDrawerLayoutDocShellZones.ts`, `entityDrawerOperatingModel.ts` |
| Runtime body | `evaluateOpportunityLayoutRuntimeBody.ts`, `drawerLayoutRuntimePresentation.ts` |
| Flags | `featureFlag.ts` |
| Doctrine | `docs/system/drawer-operating-model-v1.md`, `docs/platform_convergence/layout_contract_v1.md` |

---

*Phase 0 complete. No product behavior changed in this phase.*
