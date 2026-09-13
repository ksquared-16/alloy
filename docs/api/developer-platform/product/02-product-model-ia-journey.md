---
owner: platform
status: canonical
last_reviewed: 2026-09-10
supersedes: []
---

# 02 — Product model, information architecture, journey, boundary

Covers Slice A Parts 2, 3, 8 and 10.

## The doctrine constraint, and the reconciliation it forces

Slice A sketches a target shell:

```text
Settings / Developer Platform
  → Overview → Applications → Installations → Credentials
  → API Documentation → API Activity → Webhooks
```

> **Corrected 2026-09-11 (B.6), on operator instruction.** The entry point is
> **Organization**, not "Settings". `/adminV2/settings/*` is the route path and
> the shell; the word an operator actually reads is **Organization** — it is the
> sidebar title and `aria-label` (`web/app/adminV2/components/Sidebar.tsx:269`)
> and the breadcrumb root (`SettingsHierarchyBreadcrumb.tsx:26`). Doctrine agrees:
> *"Organization is the sole canonical Catalog Runtime."* Naming the product
> surface after its URL was my error, repeated across Slice A and B.4, and it is
> corrected throughout below.

**Alloy's frozen Configuration doctrine does not permit that shape.**
`docs/platform/operator/configuration-workspace-platform-doctrine.md` fixes the
hierarchy —

```text
Configuration → Configuration Collection → Configuration Object → Configuration Detail Runtime
```

— allows exactly **two** landing templates (A: Catalog, of which Organization is
the sole canonical instance; B: Collection), and states plainly that domains
"may not invent a third landing pattern." Its first law is:

> *Operators do not edit records. Operators operate configuration objects.
> Configuration is not CRUD.*

A seven-section tabbed module shell is a third landing pattern and it is CRUD
wearing tabs. Slice A anticipated this — it requires IA to be "reconciled against
current Alloy Settings doctrine" and forbids "a parallel shell or bespoke visual
system." So the sketch is reconciled, not adopted.

## Ratified information architecture

**Developer Platform is a Configuration domain whose Configuration Object is the
Installation.**

```text
Organization  (Catalog Runtime — existing)
  └── Developer Platform / Integrations
        └── Installation Collection            ← Template B, Collection Runtime
              └── One Installation             ← Configuration Object
                    └── Installation Runtime   ← Detail Runtime
                          ├── Authority   (scopes, location boundary)
                          ├── Credentials (issue, rotate, revoke)
                          ├── Activity    (recent calls, failures)
                          └── Application (identity, publisher, environment)
```

### Why Installation is the object, not Application

A Configuration Object is defined by doctrine as "one owned, addressable thing
with identity, status, setup, and Attention." The Installation has all four:
identity (application × organization), status (active/suspended/revoked), setup
(scopes, boundary, credentials), and real Attention signals (credential expiring,
authentication failing, boundary empty).

An **Application does not belong to the tenant** — it exists independently of any
organization, and a partner-managed application is not something a childcare
operator owns or configures. Making Application the collection object would put a
non-tenant entity in a tenant configuration surface, and would force every
operator to meet a concept they do not need.

**Applications therefore have no operator collection in V1.** For a
`tenant_private` application the Application is created implicitly as part of
installing; for `partner_managed` it is Alloy-managed. Application identity is
surfaced as a *facet* of the Installation Runtime, and full application
administration is an Alloy-internal surface, not a tenant one.

### Why Credentials are not a collection

A credential is never independently addressable — it is always *of* an
installation, and it has no meaning without one. It is an **owned concern inside
the Installation Runtime**, which is exactly what doctrine means by a detail
runtime owning its concerns.

### Where Overview went

Doctrine's Collection Runtime already carries collection-level health and
Attention. A separate "Overview" page would be a second landing for the same
domain. Collection-level state — how many installations are live, which are
degraded, which credential expires next — belongs **on the collection**, which is
where the operator already is.

### Where Documentation went

Developer documentation is **not a configuration object** and must not be forced
into the hierarchy. It is reference material with no identity, status, or
Attention. It is a separate destination (§04), linked from the collection and
from every installation, and it is readable without entering configuration at
all.

## Part 8 — the product boundary

**Ratified: Developer Platform and Integrations are two perspectives over one
installation system, not two systems and not two data models.**

| | **Integrations** | **Developer Platform** |
|---|---|---|
| Audience | Childcare operators | Developers, integration admins |
| Question answered | "Is Classroom Coach working?" | "Why did my request 403?" |
| Object | The same Installation | The same Installation |
| Surfaces | Provider name, connection state, what syncs, health, reconnect | Application identity, scopes, boundary, credentials, raw activity, contract |
| Hides | Scopes, principals, credential internals, OpenAPI | Nothing |

One row. Two lenses. A tenant sees "Classroom Coach — connected, healthy"; a
developer opening the same installation sees `client_id`, granted scopes,
boundary, and the last twenty API calls.

Building them as two systems would produce two installation tables and two
authority paths — precisely the "second identity system" the frozen architecture
forbids. Building them as one *undifferentiated* surface would confront an
operator with Application Principals to connect a curriculum tool, which Part 10
forbids.

**Whether they are one catalog entry or two is a presentation decision**, and
V1 ratifies: **one configuration domain named "Integrations", reached from the
Organization catalog**, with the developer lens reached from an installation for
users holding `integrations.manage`. Operators meet the word they understand;
developers reach the depth they need one click in, and never through a different
product.

## Part 3 — the developer journey

```text
1  Operator opens Organization → Integrations
2  Collection Runtime: existing installations + their health.  Empty state explains the model.
3  "Connect an integration" → choose a published application, or create a tenant-private one
4  Installation is created:  application × this organization
5  Authority: choose allowed locations (boundary) and grant scopes  — both default to NOTHING
6  Credential: issue.  Secret is revealed ONCE and never again
7  Documentation: linked in place, pre-filled with this installation's client_id
8  First request against /api/v1/context
9  Activity shows the call, its result, and its request_id
```

Two properties this journey must preserve:

- **Nothing requires a database edit.** Exit criterion 6. Every step above is a
  product action.
- **Step 5 defaults to nothing.** An empty boundary denies everything
  (`NonHumanProducerAuthority`: *"Empty denies everything"*). Provisioning that
  is incomplete must fail closed, not open — an empty grant that means "all" is
  the most dangerous default an authorization surface can have.

Step 8 is deliberately `GET /v1/context` and not the attendance write. It proves
credential, installation, tenancy and scope resolution while being incapable of
changing anything.

## Part 10 — UX requirements

The Developer Platform inherits Alloy's Configuration Workspace primitives —
Collection Runtime, Configuration Object, Detail Runtime, Attention — and adds
no visual system. Concretely:

- **Meaning first.** "Classroom Coach can record attendance at Downtown Campus"
  before `attendance.write` + `locations=[A]`.
- **Progressive complexity.** Developer concepts are reachable, never
  compulsory.
- **Operational, not inventory.** The collection leads with what needs
  attention, not with a count of applications.
- **Calm.** A healthy installation is one quiet line.

The reference implementation to follow is
`web/components/adminV2/settings/locations/`, which doctrine names as the frozen
Collection Runtime reference.
