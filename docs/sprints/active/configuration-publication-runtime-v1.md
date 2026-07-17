---
owner: sprint
status: sprint
last_reviewed: 2026-07-17
concept: configuration-publication-runtime-v1
supersedes: []
---

# Configuration Publication Runtime V1

Reference consumer: Programs. This document records implementation evidence and
authorization; canonical behavior belongs in
`docs/platform/modules/configuration-platform.md` as it becomes real.

## Phase 0 current-state map

### Frozen architecture

- Organization is the publisher, Locations are consumers, and domain runtimes
  remain authoritative for payloads and operational effects
  (`docs/system/organization-configuration-runtime-v2.md`).
- Apply is distinct from inheritance and assignment. It must use a durable
  provider, a published revision, deterministic retry identity, an audit id, and
  one authoritative result per selected Location.
- Programs own reusable service identity and requirements. Locations own whether
  a Program is offered, local delivery resources, and local schedules. Resource
  and operational runtimes own capacity and runtime truth.
- There is no generic configuration-payload store. Shared infrastructure may own
  publication and delivery control records; each domain owns its draft and
  immutable revision payload.
- Organization and Locations landing templates are frozen. Programs adopts the
  Configuration Collection pattern without redesigning either landing.

### Existing implementation

- `web/lib/configRuntime/organizationRuntime.ts` defines domain registry,
  publication, plan, provider, deterministic-key, and result contracts, but has
  no registered Programs provider or persistence.
- `web/lib/configRuntime/scope.ts` resolves platform → organization → location
  values with explicit presence. It is a reusable value-resolution primitive,
  not a publication engine.
- `web/lib/programs/canonicalProgramProvider.ts` exposes organization identity
  from option-set vocabulary and Location availability from
  `location_program_categories`. Its storage-independence seam is reusable.
- `location_program_categories` combines compatibility identity fields with
  Location availability. Downstream records reference its stable row id, so V1
  must preserve those rows and relationships.
- `/api/admin/location-program-categories` performs authorized server-side
  mutations, but currently permits local label/metadata changes and has no
  published-revision source.
- `CommercialConfigWorkspace` derives the Program catalog by grouping local
  rows. Creating a Program immediately creates one row at every Location.
  Toggling a Location writes availability directly. This is incompatible with
  Organization draft → publish → distribute semantics.
- `LocationProgramDetailPanel` currently edits identity, availability, age
  constraints, and resource hints on the local compatibility row. Published
  identity and local operational truth are not separated.
- `workflow_events` and `emitEvent` are the existing event/audit envelope.
  Append-only trigger and idempotent insert patterns exist in operational
  expectations and processing migrations, but no Configuration publication
  tables or registered delivery runtime exist.
- The generated schema describes org-scoped RLS for
  `location_program_categories`; no revision, publication, distribution, or
  consumption tables exist.

### Reuse and missing capability

Reuse:

- Configuration scope/value-resolution primitives.
- Organization domain/provider registry boundary.
- canonical Program provider seam and stable Program keys.
- `location_program_categories` as the compatibility Location offering row,
  preserving its ids and downstream relationships.
- `getAdminAccessContextCached`, `settings.read`, and `settings.manage`.
- server-only admin client, workflow event envelope, Configuration workspace
  components, and existing Location Program master/detail integration point.

Missing:

- editable Organization Program drafts;
- immutable Program revisions;
- authoritative publication records;
- consumer targeting and impact preview;
- deterministic distribution runs and target rows;
- append-only delivery attempts;
- persisted Location consumption pointers;
- retry and partial-failure projections;
- field-level override policy and server-side effective resolution;
- Programs publication UI and Location source disclosure.

The reusable publication model does not require a new foundational runtime.
The audit did identify one semantic constraint: Programs offered at a Location
is availability/assignment, not Apply. V1 is therefore authorized only as a
subsystem of Configuration Runtime whose Programs adapter assigns a published
revision without copying or changing Location-owned operational truth.

## Phase 1 implementation contract

### Canonical ownership

| Concern | Owner |
|---|---|
| Program stable identity and editable draft | Organization / Programs domain |
| Immutable Program revision payload | Programs domain |
| Publication act and publication history | Organization through the generic Configuration Publication Runtime |
| Location Program offering and offer state | Location |
| Permitted local override values | Location, constrained by Program policy |
| Delivery-resource assignment | Location / Delivery Resource domain |
| Capacity, occupancy, staffing, schedules, placements, attendance, billing facts | Their operational domain owners |

### Lifecycle

An Organization Program has one editable draft. Validation changes the draft
from `draft` to `validated`; editing a validated draft returns it to `draft`.
Publish snapshots the validated draft into a new immutable Program revision and
records an immutable publication. Publishing a later revision makes the older
revision `superseded` in the read projection; it does not mutate the old payload.
Retirement is an auditable lifecycle act and never deletes a revision.

The currently published revision is never edited. A subsequent change creates or
updates a draft based on that revision, validates it, and publishes a new
revision.

### Consumption states

V1 exposes only:

- `inherited` — a Location consumes the published value without an override;
- `locally_unavailable` — the Location retains the revision but does not offer it;
- `locally_enabled` — the Location offers the consumed Program;
- `overridden` — at least one permitted local value is present;
- `pending_update` — a newer selected publication has not delivered successfully;
- `delivery_failed` — the latest target attempt failed with a recoverable reason;
- `current` — the persisted consumption points at the selected publication.

### Override policy

Every effective field declares one policy:

- `organization_locked`;
- `location_may_override`;
- `location_must_supply`;
- `runtime_derived`.

Programs V1 policy:

| Property | Policy |
|---|---|
| key, name, category | organization locked |
| description | location may override |
| eligibility and audience constraints | organization locked |
| required resource type and qualification/licensing requirements | organization locked |
| default policy/commercial/funding/billing references | organization locked |
| offered/paused posture and local authorization evidence | location must supply |
| assigned resources, capacity, schedule availability, occupancy | runtime derived |

Program identity is never locally overridden. Unknown override keys fail
validation.

### Publication and delivery

Publication means:

1. the current Program draft passed domain validation;
2. an immutable Program revision was persisted;
3. an immutable generic publication row identifies the domain subject, revision,
   checksum, actor, and time;
4. a publication audit event was emitted.

Assign to Locations means:

1. select one published Program revision and explicit Location ids;
2. resolve active, in-scope, site Locations server-side;
3. preview each target against its current consumption, local offer state,
   permitted overrides, required local inputs, and protected local truth;
4. create or reuse one deterministic delivery run;
5. execute each target independently through the Programs assignment adapter;
6. persist a delivered, unchanged, or failed result and append-only attempt for
   every target;
7. update a successful Location consumption pointer and compatibility offering
   link without replacing Location-owned availability, evidence, resource
   relationships, schedules, or operational facts.

The idempotency identity is the organization, publication, provider version, and
sorted unique target set. Reusing the same identity returns the same run. Retry
uses that run identity and executes failed targets only; successful targets are
not duplicated.

Partial failure is a first-class run result. A run is successful only when every
selected target has an authoritative persisted `delivered` or `unchanged`
result.
Each failure stores an operator-safe, recoverable reason. A later revision
supersedes rather than rolls back an earlier publication; a rollback engine is
out of scope.

### Read semantics

Authoritative reads resolve on the server:

```text
permitted Location override
  → consumed published Program revision value
    → platform default where the field policy allows it
```

The resolver returns the effective value and source for every field. Clients
render that result and do not perform the authoritative merge.

### Mutation authority

- Reads require authenticated organization access and `settings.read` (or the
  existing owner/admin compatibility grant).
- Draft, validate, publish, assign, retry, offering, and override mutations
  require `settings.manage`.
- Every query and write is scoped by `org_id`; Location targeting also respects
  allowed site scope.
- All authoritative changes use server paths and server-only privileged clients.
- Published revision payloads, publication rows, and delivery attempts are
  immutable in the database.
- Publication and target delivery outcomes emit typed workflow audit events.
- No client performs direct database writes.

## Implementation slices

1. Generic publication control records and Programs draft/revision storage.
2. Generic policy, effective-resolution, preview, plan, idempotency, delivery,
   retry, and history primitives.
3. Programs domain adapter and authorized server APIs.
4. Programs Configuration Collection runtime.
5. Location consumption and effective-source presentation.
6. Focused validation, schema replay, authenticated browser proof, and canonical
   documentation update.

## Explicit deferrals

Scheduled or future-dated publication, approvals, branching, rollback,
cross-domain publication, AI publication, downstream scheduling/attendance/
staffing/capacity/billing behavior, public APIs, compatibility-storage deletion,
and broad Configuration-page migration remain out of scope.
