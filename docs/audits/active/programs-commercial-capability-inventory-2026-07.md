---
owner: product-platform
status: active
last_reviewed: 2026-07-17
concept: programs-commercial-capability-inventory
supersedes: []
---

# Programs Commercial Capability Inventory

**Audit date:** 2026-07-17
**Purpose:** preservation contract and realized translation matrix
**Canonical destination:** `/organization/programs`
**Functional reference:** legacy `/settings/commercial` Programs and tuition experience

No Programs experience changes began before this inventory was completed.

## Product boundary

The legacy Commercial workspace combines several ownership domains. Translation
must preserve capability without preserving that accidental bundling:

- **Programs owns** reusable Program definition, requirements, offering shapes,
  variants, publication, and Organization assignment intent.
- **Locations owns** whether the Program is offered locally, local evidence,
  rooms/resources, capacity, and schedules.
- **Commercial/Financial configuration owns** tuition rates, products, revenue
  categories, GL relationships, and commercial policy evaluation.
- **Processing owns** payer/funding responsibility.

The canonical Programs object must show these relationships as one understandable
domain without moving authoritative mutations to the wrong owner.

## Capability inventory and translation contract

| Legacy capability | Authority | Configuration Runtime destination | Status |
|---|---|---|---|
| Program identity: key, name, description, category | Program draft/revision | Definition | Preserve |
| Audience age range and eligibility payload | Program draft/revision | Requirements | Preserve; expose currently hidden eligibility posture |
| Required resource type | Program draft/revision | Resources | Preserve |
| Qualification requirements | Program draft/revision | Requirements | Preserve |
| Default policy references | Program draft/revision | Related policies | Preserve; currently hidden in canonical UI |
| Default commercial posture | Program draft/revision | Pricing relationship | Preserve; currently hidden in canonical UI |
| Create, save, validate draft | Program service | Definition / Publication | Preserve |
| Immutable publish | Program publication service | Publication | Preserve |
| Active revision and unpublished-change posture | Configuration Runtime | Overview / Publication | Preserve |
| Location assignment and durable consumed revision | Configuration Publication Runtime | Assignments | Preserve |
| Impact preview, partial failure, retry | Configuration Publication Runtime | Assignments / Distribution | Preserve |
| Publication, assignment, failure, retry history | Configuration Runtime | History | Preserve |
| Attendance-type offerings | `program_offerings` | Offerings | Preserve and translate |
| Offering status, effective dates, order, metadata | `program_offerings` | Offerings | Preserve and translate |
| Quantity variants | `program_offering_variants` | Offerings | Preserve and translate |
| Bulk variant creation | Offering variant API | Offerings | Preserve |
| Archive/delete protections when rates exist | Offering APIs | Offerings | Preserve |
| Organization tuition defaults by variant/cadence | `commercial_tuition_rates` | Pricing | Preserve as related authored capability |
| Location tuition overrides and inherited-value display | `commercial_tuition_rates` | Pricing with Location scope | Preserve without changing ownership |
| Explicit not-offered pricing and effective dates | `commercial_tuition_rates` | Pricing | Preserve |
| Copy Organization rates to a Location | Tuition API | Pricing | Preserve existing behavior; label as explicit copy, never Program Assignment |
| Local offered/not-offered state | `location_program_categories` | Availability | Preserve as Location-owned evidence |
| Local label editing for legacy unlinked rows | Compatibility row | Locations only | Do not move into Organization Programs |
| Local sort order | `location_program_categories` | Availability relationship / Locations deep link | Preserve in Locations |
| Local description override and authorization evidence | `location_program_categories` | Availability / Attention | Preserve as Location-owned evidence |
| Participating rooms | Location resource relationships | Resources | Preserve as read-only relationship; manage in Locations |
| Derived capacity | Location/room runtime | Resources | Preserve as derived evidence |
| Location-hours schedule | Location schedule runtime | Availability / Resources relationship | Preserve as derived evidence |
| Program-scoped commercial policies | `commercial_policies` | Policies | Preserve as linked authored capability |
| Offering/variant-scoped policies | `commercial_policies` | Policies | Preserve |
| Organization/location policies | `commercial_policies` | Related policy context | Preserve without claiming Program ownership |
| Fees, add-ons, deposits scoped to Program | `commercial_products` | Related pricing | Preserve relationship |
| Commercial categories | `commercial_categories` | Related pricing | Preserve relationship; not Program category identity |
| Revenue category / GL mapping | Commercial + Financials | Related accounting reference | Preserve relationship; manage with Financials authority |
| Commercial pricing simulator | Commercial execution pipeline | Preview relationship/action | Preserve as read-only preview, not Program truth |
| Funding/payer responsibility | Processing | Related configuration | Preserve handoff; no Programs authoring |
| Enrollment, rooms, waitlists consumption | Downstream systems | Overview relationships | Preserve explanatory relationship |

## Existing canonical capability

Already present on `/organization/programs`:

- read-first Overview;
- working draft and explicit editing;
- active revision and publication posture;
- immutable publication;
- assignment impact preview;
- durable Location consumptions;
- distribution failures and retry;
- Configuration Attention and readiness;
- cross-revision History;
- Collection search, filtering, Add, posture, and responsive selection;
- operator-safe unavailable-state messaging.

## Realized canonical translation

The canonical page now exposes:

- a dedicated Program Definition concern with the working-draft editor and active
  revision held apart;
- Requirements with audience, qualifications, and the existing eligibility
  payload;
- Resources with the Organization requirement, local-evidence posture, ownership
  explanation, and a Location deep link;
- Location availability visibly distinct from Organization assignment;
- Programs-owned offerings and quantity variants, including creation and
  lifecycle actions through their existing APIs;
- linked Organization and Location tuition configuration by offering variant;
- linked Program, offering, and variant policies;
- default policy references and default commercial posture;
- Publication as one concern, with Distribution evidence nested beneath it;
- a route-addressable healthy or actionable Attention concern.

Related products, accounting classification, and Commercial simulation remain
available through their authoritative Commercial experience and are not copied
into Program payloads. This is deliberate authority preservation, not capability
removal.

## Intentionally removed legacy behavior

These controls will not be translated because they conflict with accepted
ownership or are already functionally stale:

1. **Create a Program by POSTing a local category row at every Location.**
   Program creation is Organization-owned and the legacy endpoint now rejects
   this path.
2. **Treat Location availability rows as Program identity.**
   `location_program_categories` remains Location-owned compatibility and
   consumption infrastructure.
3. **Edit published Program identity from a Location.**
   Published identity remains immutable; Locations may edit only owned local
   differences.
4. **Use Commercial as Program product ownership or canonical navigation.**
   Commercial may own linked pricing behavior, not Program identity.
5. **Use Apply language for Program distribution.**
   Programs uses Assignment only.

No active authoritative capability is removed by these decisions.

## Deferred capability

Existing incomplete or explicitly deferred behavior remains deferred:

- Program retirement action;
- unassignment/revocation;
- rollback, restore, branch, approval, and scheduled publication;
- field-level draft-versus-revision diff and actor display;
- subsidy and corporate payer pricing;
- funding authoring, which belongs to Processing;
- accounting posting;
- per-Location schedule offerings beyond Location-hours derivation;
- arbitrary eligibility/policy builders beyond existing authoritative payloads;
- simulator side effects—the simulator remains preview-only.

## Terminology translation

Operator language:

- Program, Program Definition, Offering, Variant, Pricing, Policy;
- Organization-owned definition;
- published revision;
- assigned to Locations;
- Location availability;
- active consumed revision.

Never expose:

- Commercial Programs as product ownership;
- `location_program_categories`;
- `program_key`, provider keys, publication/run IDs, or schema names;
- distribution target, consumer write, compatibility row, or payload checksum;
- Apply for Program assignment.

## Implementation rule

Translation must use the existing Configuration Collection, Detail, Overview,
Attention, Publication, Assignment, Distribution, and History runtimes. Domain
concerns are supplied as Programs adapter sections. Existing Program, Location,
Commercial, Financials, and Processing authorities remain in place.
