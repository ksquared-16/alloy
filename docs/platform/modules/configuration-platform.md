---
owner: modules
status: canonical
last_reviewed: 2026-07-17
supersedes: []
---

# Configuration platform

**Status:** Canonical platform module doc.

Configuration control plane — configuration steers presentation within platform guardrails.

---

## Four-plane model (V1 shipped)

| Plane | Configuration route | Owns |
|-------|----------------|------|
| Fields | `/settings/fields` | Field registry, types, visibility |
| Field grouping | `/settings/field-sections` | Section labels |
| Surfaces | `/settings/surfaces` | Surface composition (drawer, queue row, headers) |
| Actions | `/settings/actions` | Org action placements |

Plus: statuses, business processes, placement priority, and organization configuration.

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

Operators configuring opportunity drawer **composition** should use **Configuration → Surfaces**. Legacy workflow v1 layout editors remain for field placement and section order until migrated; dual-write can produce conflicting visibility until cutover completes.

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

### Operational authoring

Each stage Operating Plan owns its `outgoing_transitions` and Outcome Definitions. A transition has a stable `transition_ref`, source and destination stage, operator label, availability, and an optional resulting status chosen from the configured status catalog. A configured closed status derives close semantics; operators do not author a separate Close Record behavior.

Outcome behavior is composed from independent controls: Stay in stage or Move through transition, zero or more follow-up Work Template entries, and optional attention. Follow-up schedules use canonical anchors for immediate/after outcome, before/after a scheduled event, and after stage entry. Work Templates only select Available Outcomes from the stage-owned definitions; legacy outcome `work_template_key` remains compatible.

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
| Config workspace layout | `lib/adminV2/settingsPageLayout.ts` | All configuration surfaces |
| Configuration workspace domains | `lib/adminV2/configurationWorkspaceDomains.ts` | Configuration landing and nav |
| Configuration Domain Card | `components/adminV2/settings/configurationRuntime/workspace/ConfigDomainCard.tsx` | Organization and future publisher surfaces |

**Extraction rule:** Only proven primitives move here. A primitive is proven when it appears in two or more independent configuration domains. Do not move Commercial-specific patterns here prematurely.

### Reference implementations

**Locations is the reference implementation for the Configuration Runtime V1 experience**: object selection, workspace canvas, hero, operational summary, explained readiness, attention, child-object master/detail, view/edit separation, shell/BOS/inline action ownership, and authoritative mutation behavior.

**Commercial Configuration is the reference consumer for the configuration control-plane primitives** (`docs/platform/modules/commercial-configuration.md`). It establishes:

- Scope model (org default vs location override)
- Inheritance pattern (location override → org default)
- `OwnershipBadge` on grid cells and section headers

Future domains inherit the Locations experience grammar and consume the relevant control-plane primitives proven by Commercial. These are complementary references, not competing implementations.

### Organization Configuration Runtime V2

The Organization Configuration Runtime is the organization-owned publishing layer above Locations. Its landing is `/organization`; its frozen implementation contract is `../../system/organization-configuration-runtime-v2.md`.

It owns the reusable control contract, not domain payloads:

- one system-of-record home and configuration owner per area;
- Organization publishes reusable configuration and Locations consume it;
- reusable Configuration Domain Cards summarize identity, publication, concise ownership, and consumers; domain runtimes disclose inheritance, overrides, and health detail;
- platform → organization → location value resolution with explicit value presence;
- availability/assignment kept distinct from value inheritance;
- confirmed-save vs explicit-publish behavior;
- distribution modes: inherit, assignment, apply, or none;
- provider-gated, published-revision Apply plans with deterministic retry identity;
- cross-location posture that preserves **Not assessed** when a domain has not supplied evidence.

Domains keep their authoritative tables, validation, mutation paths, and runtime consumers. No generic JSON configuration store sits between Organization Runtime and those systems.

**Apply is not inheritance.** Inherited values continue to resolve from their owner. Apply durably creates or updates Location-owned objects through a registered domain provider. The action remains hidden until that provider can return an audit id, the authoritative published revision, and a result for every selected Location.

The frozen registry contains Locations, Programs, Access, Communications, Data Model, Business Processes, Surfaces, Automation, and Operational Intelligence. Automation and Operational Intelligence remain first-class because the ownership matrix already gives each a distinct owner.

**Programs** is operator language for the reusable service catalog. The `/settings/commercial` route and Commercial Runtime names may remain internal compatibility details. Locations choose Programs offered and own Rooms/Delivery Resources and local schedules; resource/runtime systems own capacity. Organization Runtime V2 does not implement or migrate those downstream domains.

Locations remains frozen. Organization Runtime reuses its object-workspace grammar and references Location identity; it does not move Location-owned mutations into the organization landing.

### Configuration Publication Runtime V1

The Configuration Publication Runtime is the reusable control plane for domains
that require explicit Organization publication and durable Location delivery.
Programs is the first and only reference consumer in V1.

The runtime owns:

- immutable publication identity over a domain-owned revision;
- deterministic, target-set-aware distribution plans;
- one persisted result per selected Location;
- append-only delivery attempts under the same retry identity;
- honest completed, partial-failure, and failed run projections;
- Location consumption pointers to published revisions;
- field-policy evaluation (`organization_locked`,
  `location_may_override`, `location_must_supply`, `runtime_derived`);
- server-authoritative effective-value resolution with explicit value presence;
- generic publication and delivery history records.

Domains own:

- editable draft payloads and validation;
- immutable revision payloads;
- the provider that previews and performs each authoritative consumer write;
- domain-specific eligibility, conflicts, required inputs, and operator language;
- local override storage and validation;
- downstream runtime consumption.

There is no generic configuration-payload table. The generic runtime references
the immutable domain revision by identity and checksum. A retry reuses the
original distribution run and executes failed targets only; successful targets
remain authoritative and are not duplicated.

Programs proves the boundary through:

- `programs`, `program_drafts`, and immutable `program_revisions`;
- generic `configuration_publications`, distribution runs/targets, append-only
  attempts, and consumption pointers;
- the `programs.v1` provider;
- server-side impact preview and effective-value resolution;
- Location Program offerings linked to a consumed revision while preserving
  Location-owned availability, evidence, metadata, resource relationships, and
  stable compatibility ids.

Only Programs supports this runtime in V1. Other Configuration domains do not
gain publication behavior by inference; adoption requires a domain-owned
revision model and a registered durable provider.

### Primitives NOT yet extracted (deferred)

These belong to the Configuration Runtime eventually but are only Commercial-specific today:

- Effective dating / scheduled changes
- Bulk rate operations
- Compare locations
- Cross-domain impact analysis
- Scheduled or future-dated publication
- Approval, branching, and rollback orchestration

---

## Platform Configuration navigation

**Configuration** is the operator-facing product language. `/organization` is the Configuration landing. Existing `/settings/*` URLs remain compatibility routes for domain surfaces; internal filenames and identifiers may retain `settings` where changing them would create migration risk.

**Information architecture:**

| Chapter | Primary entries |
|---------|-----------------|
| Organization | Organization landing, Locations, Access, Communications |
| Data Model | Entities, Fields, Statuses, Operational Calculations |
| Operations | Processes, Surfaces, Automation |
| Business | Programs (`/settings/commercial` compatibility route) |

**Presentation primitives:** `ConfigurationSection`, `ConfigurationSectionItem`, `config-platform-*` CSS in `configurationRuntime.css`. IA source: `lib/adminV2/configurationModeNav.ts`.

**Hidden from primary nav:** Financials (route may still exist).

**Entities:** `/settings/entities` (entity label configuration).

---

## Related

- `../../system/configuration-system.md` (transitional expanded reference)
- `../core/business-process-system.md`
- `../../system/configuration-ownership-doctrine.md`
- `commercial-configuration.md` — first runtime consumer
