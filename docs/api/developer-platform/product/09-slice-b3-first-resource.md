---
owner: platform
status: canonical
last_reviewed: 2026-09-10
supersedes: []
---

# 09 — Slice B.3: the first canonical resource

**Implemented.** `GET /api/v1/locations` is the first real Alloy domain resource
on the public API.

| Concern | Path |
|---|---|
| Boundary-enforced read | `supabase/migrations/20260910210000_external_locations_read.sql` |
| Scope → capability catalog | `web/lib/platform/external/scopeCatalog.ts` |
| Collection primitives | `web/lib/platform/external/collection.ts` |
| Public representation | `web/lib/platform/external/resources/locationResource.ts` |
| Route | `web/app/api/v1/locations/route.ts` |
| Certification | `web/tests/platform/external/locationsResourceCertification.test.ts` |

## Part 1 — canonical Location authority

Authoritative table: `public.locations`. Hierarchy authority:
`public.location_site_id()` — the repository's declared *"single site-resolution
authority for nested room topology"*, a cycle-safe 8-hop ancestor walk. Topology
from `20260909210000_location_topology_v1.sql`.

| Canonical concept | Source | Public? | Why |
|---|---|---|---|
| Site | `location_type = 'site'` | **Yes** | An organizational place |
| Unit | `location_type = 'unit'` | **Yes** | Rooms and groups; the operational grain |
| Unit role | `unit_role` | **Yes** | The topology discriminator; null stays null |
| **Address** | `location_type = 'address'` | **NEVER** | Customer/vendor premises — a family's home |
| Display name | `label` | Yes, as `name` | |
| Parent | `parent_location_id` | Yes, as `parent_id` | Structure |
| Site ancestor | `location_site_id()` | Yes, as `site_id` | Saves every client walking the tree |
| Active | `is_active` | Yes | |
| Timezone | `timezone` | Yes | Needed to interpret any future time-bearing resource |
| Watermark | `COALESCE(updated_at, created_at)` | Yes, as `updated_at` | The resync primitive (Thread 4 §04 L) |
| `org_id` | | **No** | One installation reads one organization and `/context` names it |
| Street, city, postal, country | | **NEVER** | Private address data |
| `lat` / `lng` | | **NEVER** | Precise location of a private home |
| `access_code` | | **NEVER** | *"Door/gate code when customer selects code-based access"* |
| `access_notes`, `has_pets` | | **NEVER** | Premises detail about a household |
| `metadata`, `status_key`, `external_source`, `external_id`, `customer_id`, `vendor_id`, `is_primary`, `location_type_id`, `access_method_id` | | No | Internal, compatibility, or another domain's concern |

**The exclusion is structural, not cosmetic.** The SQL never selects those
columns, and the adapter builds the public object field by field. A serializer
that starts from the row and removes fields leaks the next column somebody adds;
one that starts from nothing does not.

## Part 2 — public scope → capability mapping

`scopeCatalog.ts` owns it. A route names its **operation**; the catalog decides
the scope. There are no scope strings compared inside handlers.

| Public scope | Operation | Alloy authority invoked |
|---|---|---|
| — | `issueAccessToken` | credential resolution |
| — | `getContext` | the installation describing itself |
| `locations.read` | `listLocations` | `public.list_external_locations`, boundary-enforced in SQL |

`getContext` requires no scope deliberately: a caller that cannot discover what it
holds cannot debug why anything else was refused, and it exposes no domain data.

**Exact match only** — proven against `locations`, `locations.readwrite`,
`locations.read.all` and `LOCATIONS.READ`, all refused. Read and write are
separate entries by construction, so a future `locations.write` can never be
satisfied by a read grant. External scopes remain **their own vocabulary**, not
operator RBAC: Alloy's internal permission keys are still being reshaped, and
publishing them would make every internal rename a partner-visible break.

## Hierarchy — the decision, and its cost

**A boundary naming a site admits the units under it**, resolved by
`location_site_id()` rather than a hand-rolled walk.

Rejected: exact-set membership. It would mean adding a boundary entry every time a
classroom is created, which in practice produces either chronic under-provisioning
or a shrug and an org-wide grant.

**Stated residual risk:** authorization then depends on `parent_location_id`, so
re-parenting a room changes who can see it. Bounded by the migration's own
hierarchy guard and cycle rejection, and by the walk being depth-capped. It is a
real trade and it is recorded rather than discovered later.

## Part 8 — single-resource endpoint: **deferred**

`GET /api/v1/locations/{id}` is not implemented. `?location_id=` already provides
single-resource lookup **through the same boundary-enforced path**, so a separate
endpoint would add a distinct 404-versus-403 existence-disclosure decision without
strengthening the generic pattern. Part 8 permits this deferral explicitly.

The safer semantics are already in force: an out-of-boundary `location_id`
returns an **empty page**, never an error that would confirm the row exists.

## Pagination cannot leak

The boundary is applied **inside the statement that selects rows**, so an
unauthorized location never enters a result set. Pagination cannot leak what the
query never returned, and a cursor forged from a wider context cannot reach past a
filter it never sees — both proven by test.

A cursor encodes only `(sort_key, id)`. It carries no tenant, no boundary and no
grant.

## Reusable primitives extracted

Only what Locations proved — no framework built ahead of need.

| Primitive | Reusable for |
|---|---|
| `scopeCatalog` | Every future operation's scope decision |
| `collection.ts` | Cursor encode/decode, limit clamping, page building |
| `list_external_locations` **shape** | The pattern of enforcing tenancy + boundary in SQL |
| `resources/` adapter convention | Field-by-field public representation |
| `requireExternalPrincipal` → `requireOperationScope` → RPC → adapter | The route skeleton |

The next resource writes a SQL function, an adapter and a thin route. Nothing is
copy-pasted from this one except that shape.

## Generic platform gaps

| # | Gap |
|---|---|
| G-11 | **`location_site_id()` is called per row.** Fine at these sizes; a resource with thousands of rows per page wants a lateral join or a materialized site column. |
| G-12 | **No `updated_since` filter yet.** `updated_at` is exposed and the ordering supports it, but the parameter is not implemented — resync works by cursor only. |
| G-13 | **Boundary is location-only.** Any future resource not scoped by location has no boundary dimension to use. |

## Remaining blockers before Children

1. **Person/household authority is unresolved.** Thread 3 labelled it
   `UNSAFE_OR_AMBIGUOUS` — seven `persons` insert sites, no single authority.
2. **Relationship scope has no external model.** Which guardians relate to a child
   is authority, not data, and the boundary has no dimension for it.
3. **Field-level sensitivity.** A location has no sensitive fields once addresses
   are excluded. A child record is almost entirely sensitive fields.

Locations succeeding is **not** evidence that identity-heavy resources are ready.

## Remaining blockers before the first mutation

**SEC-0c** · **SEC-0** (gated on D-3) · the unbuilt **idempotency layer** ·
write-scope entries in the catalog. All unchanged by this slice, which is
read-only.

## Recommended B.4

1. **`updated_since` on the collection contract** (G-12) — completes the resync
   story before more resources inherit an incomplete one.
2. **A second read resource that reuses the primitives** without extending them —
   the honest test of whether §"Reusable primitives" is real. Rooms/units are
   already served by this endpoint, so the candidate is a non-location resource
   with clean ownership; if none exists that is not identity-heavy, say so rather
   than reaching for children.
3. **Operator visibility** into installations and activity, so a tenant can see
   what a partner is reading — currently only readable in the database.

Not in B.4: mutations, attendance, children, Classroom Coach. **D-1 remains
unanswered.**
