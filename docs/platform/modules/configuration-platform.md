# Configuration platform

**Status:** Canonical platform module doc.

Settings control plane — config steers presentation within platform guardrails.

---

## Four-plane model (V1 shipped)

| Plane | Settings route | Owns |
|-------|----------------|------|
| Fields | `/admin/settings/fields` | Field registry, types, visibility |
| Field grouping | `/admin/settings/field-grouping` | Section labels |
| Layouts | `/admin/settings/layouts` | Placements, drawer composition |
| Actions | `/admin/settings/actions` | Org action placements |

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

Operators configuring opportunity drawer **composition** should use **Settings → Layout Gallery**. Legacy workflow v1 layout editors remain for field placement and section order until migrated; dual-write can produce conflicting visibility until cutover completes.

Kill switch for Phase 4 visual config at runtime: `LAYOUT_RUNTIME_OPPORTUNITY_DRAWER_ENTITY_LAYOUTS_VISUAL_CONFIG=0` (server) / `NEXT_PUBLIC_LAYOUT_RUNTIME_OPPORTUNITY_DRAWER_ENTITY_LAYOUTS_VISUAL_CONFIG=0` (client).

**Phase 5:** When visual config adoption is active, legacy workflow v1 **section/order** editors are read-only and PATCH routes return 409. Field placement (`field_placements_v1`) remains on `record_drawer_layouts` until a follow-up migration. Use Layout Gallery to edit composition; publishing updates the live opportunity drawer when runtime gates are on.

---

## Business process builder

Part of configuration plane — `/admin/settings/lifecycle` (UI: Business Processes).

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

## Related

- `../../system/configuration-system.md` (transitional expanded reference)
- `../core/business-process-system.md`
- `../../system/configuration-ownership-doctrine.md`
- `commercial-configuration.md` — first runtime consumer
