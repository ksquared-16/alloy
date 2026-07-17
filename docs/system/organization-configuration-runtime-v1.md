---
owner: runtime
status: superseded
last_reviewed: 2026-07-17
supersedes: []
superseded_by: [docs/system/organization-configuration-runtime-v2.md]
---

# Organization Configuration Runtime V1

**Status:** Superseded by `organization-configuration-runtime-v2.md`. Retained as the V1 contract history.
**Route:** `/settings/organization`  
**Reference experience:** frozen Locations Configuration Runtime V1.

The Organization Configuration Runtime is the organization-owned layer above Locations. It defines how configuration areas declare ownership, publish changes, reach Locations, and expose cross-location posture without moving Location-owned truth into the Organization workspace.

## Runtime boundary

| Layer | Owns |
|---|---|
| Organization Runtime | Configuration-area registry, ownership declaration, inheritance/assignment/apply behavior, publication mode, cross-location governance posture |
| Domain system of record | Configuration payload, validation, versioning, authoritative mutation, runtime consumption |
| Locations Runtime | Location identity and Location-owned child objects after any confirmed apply |
| Configuration workspace | Operator presentation using the frozen object workspace grammar |

There is no generic configuration-payload table. Domains retain authoritative storage and register their behavior with the Organization Runtime. Configuration steers; code and domain services continue to own invariants.

## Shared configuration declaration

Every registered configuration area declares:

1. one configuration owner and one operator home;
2. the runtime that consumes it;
3. inheritance kind: value, availability, or none;
4. authority path: platform → organization → location, or the applicable subset;
5. publication mode: confirmed save or explicit publish;
6. distribution mode: inherit, assignment, apply, or none;
7. an apply-provider key only after a durable provider exists.

The initial registry lives in `web/lib/configRuntime/organizationRuntime.ts`. It describes existing configuration ownership; it does not implement the individual domains.

## Resolution

`resolveConfigLayers()` resolves the nearest explicitly present layer. Presence is separate from truthiness, so `false`, `null`, zero, and an empty string remain valid authored values.

Value inheritance and availability remain distinct:

- **Value inheritance:** a location uses the nearest value unless it authors an allowed override.
- **Availability / assignment:** the organization chooses where a configured object is available.
- **Apply:** a published reusable pattern is durably copied into Location-owned objects.

Apply is not inheritance. A copied object becomes Location-owned truth and is read from the Location domain after confirmation.

## Publication and Apply to Locations

Apply remains hidden unless all of these are true:

1. the domain declares `distributionMode: "apply"`;
2. the domain registers a matching apply provider;
3. the configuration revision is published;
4. at least one target Location is selected.

The runtime builds a deterministic plan from organization, domain, configuration id, published revision, and sorted unique target ids. This plan supplies the retry identity.

Success requires the provider to return:

- a non-empty audit id;
- the same authoritative revision;
- one `applied` or `unchanged` result for every selected Location;
- no unselected Location results.

HTTP success, a closed dialog, or an optimistic local update is not confirmation.

## Cross-location governance

Location posture is one of:

- Inherited
- Overridden
- Assigned
- Not applicable
- Not assessed

Missing domain evidence is **Not assessed**, never inherited, compliant, empty, or zero. The Organization landing currently shows Location identity and an honest unassessed posture until each domain provides its resolved governance read model.

## Experience contract

The Organization landing inherits the Locations workspace grammar:

- organization object header;
- calm summary regions;
- ownership-first shared configuration list;
- cross-location governance list;
- no page-local duplicate action system;
- no Apply dialog without an authoritative provider.

The Settings index remains the compact configuration table of contents. **Organization settings** is the first entry in its Organization chapter; Locations remains a separate owned surface.

## Locations freeze

Organization Runtime is additive. It does not redesign or host Location mutations. The frozen Locations implementation changes only for bug, security, or generalized contract corrections.

Future Organization-owned Program, Schedule, or Tour Pattern work registers a domain provider here, then applies through the provider into authoritative Location-owned objects. It must not add optimistic copy behavior to Locations.

## Implementation

- Registry, inheritance, publication, distribution, governance: `web/lib/configRuntime/organizationRuntime.ts`, `web/lib/configRuntime/scope.ts`
- Landing: `web/app/adminV2/settings/organization/page.tsx`
- Workspace: `web/components/adminV2/settings/organization/OrganizationConfigurationPage.tsx`
- Settings IA: `web/lib/adminV2/configurationModeNav.ts`

## Related

- `configuration-runtime-v1.md`
- `configuration-ownership-doctrine.md`
- `../platform/core/configuration-ownership-and-inheritance.md`
- `../platform/modules/configuration-platform.md`
- `../platform/operator/configuration-workspace-platform-doctrine.md`
