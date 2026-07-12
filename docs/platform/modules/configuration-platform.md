---
owner: modules
status: canonical
last_reviewed: 2026-07-12
supersedes: []
---

# Configuration platform

**Status:** Canonical platform module doc.

Settings control plane — config steers presentation within platform guardrails.

---

## Four-plane model (V1 shipped)

| Plane | Settings route | Owns |
|-------|----------------|------|
| Fields | `/settings/fields` | Field registry, types, visibility |
| Field grouping | `/settings/field-sections` | Section labels |
| Surfaces | `/settings/surfaces` | Surface composition (drawer, queue row, headers) |
| Actions | `/settings/actions` | Org action placements |

Plus: statuses, business processes, placement priority, org settings.

---

## Rules (frozen)

- Config **steers** — code owns invariants
- Do not implement business truth only in JSON
- Field policy effective resolution merges layout placements + definitions
- CRM scope (dept/site) is visibility — separate from permission keys

## Layout storage (Visual Layout Configuration Builder)

| Store | Role | Status |
|-------|------|--------|
| **`entity_layouts.doc`** | Canonical **visual surface layout** for drawer/queue composition (sections, fields, zones, `layoutEditorHidden`) | **Primary** — Layout Gallery + visual editor; opportunity drawer runtime adoption (Phase 4+) |
| **`record_drawer_layouts.config_json`** | Legacy opportunity workflow v1 section order, show/hide, `field_placements_v1` | **Legacy** — still written by workflow v1 settings editors until per-org migration |

Operators configuring opportunity drawer **composition** should use **Settings → Surfaces**. Legacy workflow v1 layout editors remain for field placement and section order until migrated; dual-write can produce conflicting visibility until cutover completes.

Kill switch for Phase 4 visual config at runtime: `LAYOUT_RUNTIME_OPPORTUNITY_DRAWER_ENTITY_LAYOUTS_VISUAL_CONFIG=0` (server) / `NEXT_PUBLIC_LAYOUT_RUNTIME_OPPORTUNITY_DRAWER_ENTITY_LAYOUTS_VISUAL_CONFIG=0` (client).

**Phase 5:** When visual config adoption is active, legacy workflow v1 **section/order** editors are read-only and PATCH routes return 409. Field placement (`field_placements_v1`) remains on `record_drawer_layouts` until a follow-up migration. Use Layout Gallery to edit composition; publishing updates the live opportunity drawer when runtime gates are on.

---

## Business process builder

Part of configuration plane — `/settings/processes` (UI: Business Processes).

### Requirement timing metadata

Business Process requirement rows use the existing lifecycle field-rule metadata. Per-rule timing is stored as `rule_meta_v1` beside `rule_levels_v1`; no new table or parallel requirement engine is introduced.

Configuration controls:

- **Required when:** creating the record, during this stage, leaving this stage, completing the process
- **Transition applicability:** stage-exit rules may include or exclude specific configured transition/status keys
- **Enforcement:** informational, needs attention, blocking
- **Scope:** record, primary contact, any child, each child, relationship

Legacy rows without timing preserve prior behavior: they appear in stage progress/readiness, while transition blocking remains limited to the pre-existing completion/status guard behavior until explicit `stage_exit` metadata is configured.

---

---

## Configuration Runtime

The Configuration Runtime is the platform-owned layer that sits beneath all configuration domains. It provides proven primitives that every configuration experience reuses.

**Runtime owns:**

| Primitive | Implementation | Used by |
|-----------|---------------|---------|
| Scope (org vs location) | `lib/configRuntime/scope.ts` | Commercial, Layouts, Fields |
| Ownership indicators | `components/configRuntime/OwnershipBadge.tsx` | Commercial |
| Inheritance resolution | `resolveInherited()` in scope.ts | Commercial tuition rates |
| Config workspace layout | `lib/adminV2/settingsPageLayout.ts` | All settings surfaces |
| Configuration workspace domains | `lib/adminV2/configurationWorkspaceDomains.ts` | Settings index, nav |

**Extraction rule:** Only proven primitives move here. A primitive is proven when it appears in two or more independent configuration domains. Do not move Commercial-specific patterns here prematurely.

### Reference implementation: Commercial Configuration

Commercial Configuration (`docs/platform/modules/commercial-configuration.md`) is the first domain to consume the Configuration Runtime explicitly. It establishes:

- Scope model (org default vs location override)
- Inheritance pattern (location override → org default)
- `OwnershipBadge` on grid cells and section headers

Future domains (Fields V2, Layouts V2, Scheduling, Billing) consume these same primitives.

### Primitives NOT yet extracted (deferred)

These belong to the Configuration Runtime eventually but are only Commercial-specific today:

- Effective dating / scheduled changes
- Bulk rate operations
- Compare locations
- Impact analysis
- Change preview / publish flow

---

## Platform Configuration UX — Settings Home

The Settings index (`/settings`) is a **compact configuration table of contents** — divider-separated sections with a left identity column and right list of ~52px clickable rows, not dashboard tiles.

**Information architecture:**

| Chapter | Primary entries |
|---------|-----------------|
| Organization | Locations, Access, Communications |
| Data Model | Entities, Fields, Statuses, Operational Calculations |
| Operations | Processes, Surfaces, Automation |
| Business | Commercial |

**Presentation primitives:** `ConfigurationSection`, `ConfigurationSectionItem`, `config-platform-*` CSS in `configurationRuntime.css`. IA source: `lib/adminV2/configurationModeNav.ts`.

**Hidden from primary nav:** Financials (route may still exist).

**Entities:** `/settings/entities` (entity label configuration).

---

## Related

- `../../system/configuration-system.md` (transitional expanded reference)
- `../core/business-process-system.md`
- `../../system/configuration-ownership-doctrine.md`
- `commercial-configuration.md` — first runtime consumer
