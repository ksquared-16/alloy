---
owner: runtime
status: frozen
last_reviewed: 2026-07-17
supersedes: [docs/system/organization-configuration-runtime-v1.md]
---

# Organization Configuration Runtime V2

**Status:** Frozen July 2026.  
**Route:** `/organization`
**Reference experience:** frozen Locations Configuration Runtime V1.

Organization is the **publisher** of reusable configuration. Locations are the primary **consumers**. Domain runtimes remain authoritative for their payloads and operational effects.

The Organization landing is the operating surface for this relationship. It is not a settings list, a dashboard, a second domain editor, or a generic configuration store.

## Frozen operator model

```text
Organization
  publishes reusable configuration
        ↓
Locations
  inherit values or choose availability
        ↓
Rooms / Delivery Resources
  deliver the configured service
        ↓
Runtime
  owns capacity, scheduling, and operational truth
```

Organization owns reusable identity, defaults, requirements, and publication. A Location may consume, be assigned, or author an explicitly allowed override. Apply is reserved for durable creation or update of Location-owned objects through an authoritative domain provider.

## Landing information architecture (V2.2 presentation)

V2.1 established the compact presentation; V2.2 completes its density pass. The runtime, ownership model, nine-domain registry, Programs model, accepted card information, and distribution contracts are unchanged.

The Organization landing has three compact regions, in order:

1. **Compact header** — page identity, Organization identity/status, domain count, consuming Location count, Publish Required count, and aggregate health posture.
2. **Configuration Domains** — the primary content and navigation, immediately after the header.
3. **Consumers + Distribution** — a final two-thirds/one-third row with compact Location consumers and the Organization → Locations → Resources & Runtime flow.

There is no separate hero card or full-width Configuration Health section. Detailed ownership and runtime explanation use progressive disclosure inside each domain. The landing optimizes for scanning and navigation.

## Configuration Domain Card

A Configuration Domain Card is a reusable landing navigation object. Every equal-height card communicates:

- domain identity;
- publication status;
- one concise description;
- at most three concise owned concerns;
- a compact Used By summary;
- one Open affordance.

Publisher, operator home, detailed consumers, inheritance, overrides, health detail, and runtime prose belong inside the domain runtime. Cards are equal height and preserve the Configuration Runtime visual rules: calm white object regions on the Stone canvas, one Bend Pine accent, quiet metadata, and honest unknowns. V2.2 reduces internal padding, gaps, bullet rhythm, footer height, and section spacing without shrinking typography or removing accepted information. Equal height supports scanning; it does not turn cards into dashboard metrics.

Publication and health are separate. The registry may declare **Live after confirmed save** or **Publish required** as the publication contract; an actual Draft or Published state may appear only from authoritative domain evidence. Operational health remains Not assessed until its owner reports it. The landing never derives healthy, compliant, inherited, or complete from the existence of a route or configuration row.

## Frozen top-level domains

| Domain | Organization publishes | Primary consumers |
|---|---|---|
| Locations | Location identity and organization membership | Location and Operational Runtimes |
| Programs | Reusable service catalog, categories, eligibility, licensing requirements, required resource types, commercial/funding/billing defaults | Locations, Enrollment, Commercial, Billing |
| Access | Roles, permissions, and assignment rules | Locations, Departments, all operator runtimes |
| Communications | Channels, templates, sender identity, and delivery rules | Locations, Business Processes, operators |
| Data Model | Entities, fields, statuses, option sets, relationships | Records, Business Processes, Surfaces |
| Business Processes | Stages, Work Views, operating plans, outcomes, requirements | Locations, Workspaces, operational records |
| Surfaces | Published presentation documents | Workspaces, Queues, Focus Panel |
| Automation | Workflows, triggers, registered actions | Business Processes, Records, Communications |
| Operational Intelligence | Calculations, metrics, targets, indicator definitions | Workspaces, Business Processes, Analytics |

The original seven-domain proposal omitted **Automation** and **Operational Intelligence**. Both already have distinct ownership in the frozen Configuration ownership matrix, so V2 registers them as first-class domains rather than hiding them under Business Processes or Data Model.

Forms, Documents, Branding, Billing, Scheduling, and AI configuration may become organization-owned domains only when their canonical owner and operator home are ratified. V2 does not create placeholder cards for unresolved ownership.

## Programs ownership

**Programs** is the operator language. The existing `/settings/commercial` route and Commercial Runtime names may remain compatibility details until a downstream migration is authorized.

A Program is a reusable service:

- childcare: Infant, Toddler, Preschool;
- fitness: Personal Training, Group Classes;
- healthcare: Physical Therapy;
- automotive: Oil Change.

Programs own catalog identity, categories, eligibility, licensing requirements, required resource types, default commercial behavior, funding defaults, billing defaults, and publication.

Programs do **not** own Rooms, delivery resources, capacity, or schedules. Locations choose which Programs they offer. Rooms or future Delivery Resources deliver them. Capacity and scheduling remain owned by resources and operational runtimes.

Existing `location_program_categories` rows are a compatibility representation of **Programs offered at a Location**, not the target system of record for Program identity. This sprint does not migrate that storage or implement the Programs module.

## Distribution contract

The V1 distribution safety contract remains frozen:

- inheritance resolves a shared value;
- assignment controls availability;
- Apply copies a published pattern into Location-owned truth;
- Apply stays hidden until a matching durable provider exists;
- retries use a deterministic delivery identity;
- success requires an audit id, the authoritative revision, and a result for every selected Location.

Apply is not inheritance, publication, or optimistic UI success.

## Runtime boundary

| Layer | Owns |
|---|---|
| Organization Runtime | Domain registry, card model, publisher/consumer declarations, publication and distribution posture, cross-location governance |
| Domain system of record | Payload, validation, versioning, mutation, health evidence, runtime consumption |
| Locations Runtime | Location identity, Programs offered, Rooms/Delivery Resources, local schedules, and other Location-owned truth |
| Configuration workspace | Operator presentation through frozen Configuration Runtime primitives |

There is no generic configuration-payload table. Configuration steers; code and domain services own invariants.

## Freeze

V2 freezes the Organization Runtime model, nine-domain registry, Programs terminology, and publisher/consumer relationship. V2.2 freezes the compact landing presentation, final density, and progressive-disclosure boundary. Future domains inherit this model. Downstream module implementation, schema migration, and authoritative health/apply providers are separate work.

Locations remains the experiential reference implementation and is not redesigned by V2.

## Implementation

- Registry and distribution contracts: `web/lib/configRuntime/organizationRuntime.ts`
- Reusable card: `web/components/adminV2/settings/configurationRuntime/workspace/ConfigDomainCard.tsx`
- Landing: `web/components/adminV2/settings/organization/OrganizationConfigurationPage.tsx`
- Settings IA: `web/lib/adminV2/configurationModeNav.ts`

## Related

- `configuration-runtime-v1.md`
- `configuration-ownership-doctrine.md`
- `../platform/core/configuration-ownership-and-inheritance.md`
- `../platform/modules/configuration-platform.md`
- `../platform/operator/configuration-workspace-platform-doctrine.md`
