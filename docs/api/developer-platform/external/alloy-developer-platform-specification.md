---
owner: platform
status: canonical
classification: PARTNER_READY
audience: external developers, integration partners, technical evaluators
last_reviewed: 2026-09-15
document_version: 1.0
supersedes: []
---

# Alloy Developer Platform — Technical Specification

**Every endpoint, field, status code and limit in this document was read from the
implementation and exercised over HTTP against a running server.**
Nothing here is aspirational. Where Alloy has ratified a design but not built it,
this document says so in the same sentence rather than in a footnote.

## Classification: PARTNER_READY, not PUBLIC_READY

This specification is accurate, implementation-backed, and intended for a named
integration partner under agreement.

It is not yet classified for unrestricted public release. That is a statement
about Alloy's overall deployment posture, not about the contract below: the
public API described here is independently verified, and the outstanding items
are internal hardening work on surfaces that have nothing to do with `/api/v1`.
An application principal holds no session and cannot reach them. Alloy tracks
those items internally and will reclassify this document when they close; the
contract itself is not expected to change when that happens.

If you are evaluating Alloy for an integration, the practical meaning is: build
against this document with confidence, and expect the classification line — not
the endpoints — to be what changes.

---

## 1. The model

```text
Developer Application     the registered external software
        ↓
Installation              where that software has been authorized — ONE organization
        ↓
Credential                long-lived client authentication for that Installation
        ↓
Application Principal     the non-human identity Alloy derives per request
        ↓
Scopes + Resource Boundary
        ↓
Public API (/api/v1)
        ↓
Alloy domain authority
        ↓
Canonical truth
```

**Developer Application** — the registered identity of a piece of software. It
exists independently of any customer, is owned by a publisher, and is not a
tenant object. Registration is platform-operated; there is deliberately no
self-service create route.

**Installation** — one Application's presence inside exactly one organization,
carrying what it may do and where. **The Installation, not a caller-supplied
organization identifier, establishes tenant authority.** An organization may
install a given Application once; a second attempt collides with a uniqueness
constraint rather than creating a second authority for the same software.

**Credential** — a `client_id` and `client_secret` belonging to one Installation.
The secret is shown exactly once, at issue, and is not recoverable afterwards.

**Application Principal** — the identity Alloy derives for an authenticated
external request. It is **not an Alloy user**: it holds no session, no role and
no person record, and it cannot reach any operator surface. It is resolved fresh
on every request rather than carried in the token.

**Scope** — what an Installation may *do*. **Resource Boundary** — what it may
*reach*. These are independent: an Installation may hold `locations.read` and
still see nothing, because its boundary is empty; another may be boundary-wide
and still be refused, because it lacks the scope. The two failures are
deliberately different answers — `403 forbidden_scope` versus an empty result —
so that a partner can tell "I am not allowed to ask" from "there is nothing here".

**External Resource Reference** — the correlation between a partner's identifier
and Alloy's canonical identifier, held per Installation. Your IDs remain yours,
Alloy's remain Alloy's, and correlating them creates no second copy of identity
truth. There is currently **no public API for managing correlations**.

---

## 2. The public surface, complete

Twenty-two operations across eighteen paths. This is the entire public API.

| Method | Path | Operation | Scope required |
| --- | --- | --- | --- |
| POST | `/api/v1/oauth/token` | `issueAccessToken` | none (the only unauthenticated endpoint) |
| GET | `/api/v1/context` | `getContext` | none beyond a valid token |
| GET | `/api/v1/locations` | `listLocations` | `locations.read` |
| GET | `/api/v1/children` | `listChildren` | `children.read` |
| GET | `/api/v1/households` | `listHouseholds` | `households.read` |
| GET | `/api/v1/relationships` | `listRelationships` | `relationships.read` |
| GET | `/api/v1/enrollments` | `listEnrollments` | `enrollment.read` |
| POST | `/api/v1/enrollments` | `startEnrollment` | `enrollment.write` |
| POST | `/api/v1/enrollments/end` | `endEnrollment` | `enrollment.write` |
| POST | `/api/v1/enrollments/void` | `voidEnrollment` | `enrollment.write` |
| GET | `/api/v1/placements` | `listPlacements` | `enrollment.read` |
| POST | `/api/v1/placements` | `assignPlacement` | `enrollment.write` |
| POST | `/api/v1/placements/move` | `movePlacement` | `enrollment.write` |
| POST | `/api/v1/placements/cancel` | `cancelPlacement` | `enrollment.write` |
| GET | `/api/v1/schedule-assignments` | `listScheduleAssignments` | `schedule.read` |
| POST | `/api/v1/schedule-assignments` | `setScheduleAssignment` | `schedule.write` |
| POST | `/api/v1/schedule-assignments/change` | `changeScheduleAssignment` | `schedule.write` |
| POST | `/api/v1/schedule-assignments/cancel` | `cancelScheduleAssignment` | `schedule.write` |
| GET | `/api/v1/schedule-days` | `listScheduleDays` | `schedule.read` |
| GET | `/api/v1/staff` | `listStaff` | `staff.read` |
| GET | `/api/v1/attendance-events` | `listAttendanceEvents` | `attendance.read` |
| POST | `/api/v1/attendance-events` | `submitAttendanceEvents` | `attendance.write` |

**One** is the unauthenticated token exchange. `GET /api/v1/context` needs a
valid token but no scope. The remaining twenty are **ten authenticated reads**
and **ten governed domain writes**.

The writes are **named operations**, not a CRUD surface: there is no `PUT`, no
`PATCH` and no `DELETE` anywhere in this contract. Each one says which of six
things happened — end, cancel, supersede, void, correct or reverse — because a
change and a mistake are different truths and a partner mirroring your data needs
to tell them apart. See §11a.

There is no public webhook resource, no self-service correlation API, and no
public Communications or Financials contract. Alloy's internal administrative
routes are not part of this contract and are not reachable with a bearer token.

The governed contract artifact is
[`alloy-public-api.v1.json`](../../openapi/alloy-public-api.v1.json) (OpenAPI
3.1.0, `info.version` 1.0.0). It contains exactly these paths with exactly these
operation ids, and a drift guard enforces coverage in both directions — a
documented path with no route, or a route with no documentation, fails the build.

---

## 3. Authentication

```text
Long-lived client credential
        ↓  POST /api/v1/oauth/token
Short-lived opaque bearer token   (15 minutes)
        ↓  Authorization: Bearer …
/api/v1 request
```

### Issuing a credential

An administrator issues a credential from **Organization → Integrations** on the
Installation. The response reveals the secret **once**. Store it in a secret
manager at that moment; Alloy stores only a hash and the last four characters, so
no one — including Alloy support — can recover it later. If it is lost, rotate.

### Token exchange

```bash
curl -X POST https://<alloy-host>/api/v1/oauth/token \
  -H 'content-type: application/json' \
  -d '{
        "grant_type": "client_credentials",
        "client_id": "alloy_ci_EXAMPLE1234567890",
        "client_secret": "alloy_cs_EXAMPLEdonotuse0000000000000000"
      }'
```

`application/x-www-form-urlencoded` is accepted with the same three fields.

```json
{
  "access_token": "alloy_at_EXAMPLEopaquevalue",
  "token_type": "Bearer",
  "expires_in": 900,
  "scope": "locations.read children.read"
}
```

The response carries `Cache-Control: no-store`.

- **The token is opaque.** It is a random value with an `alloy_at_` prefix — not
  a JWT, and there is nothing in it to decode. The prefix exists so that a leaked
  token is greppable in a log or a commit.
- **It carries no authority of its own.** Scopes and boundary are re-read from
  the Installation on every request, so a change an administrator makes takes
  effect immediately rather than at the next token refresh.
- **Lifetime is 900 seconds.** `expires_in` is authoritative; do not hard-code it.
- `scope` reports what the Installation currently grants. It is informational.

Only `grant_type=client_credentials` is supported; anything else is
`400 unsupported_grant_type`.

### Using the token

```bash
curl https://<alloy-host>/api/v1/context \
  -H 'authorization: Bearer alloy_at_EXAMPLEopaquevalue'
```

`Authorization: Bearer <token>` is the only accepted form. A missing header, a
different scheme, an unknown token and an expired token all answer
`401 invalid_credential`.

### Rotation and revocation

- **Rotation** issues a new secret and states an overlap deadline, so a partner
  can deploy the new value before the old one stops working.
- **Revocation** is immediate. A revoked credential can no longer exchange for a
  token; tokens already minted are validated against live credential and
  installation state, so revocation is not deferred to token expiry.
- **A suspended Installation** stops serving. `/api/v1/context` names that case
  explicitly — `installation_suspended` or `installation_revoked`, HTTP 401 —
  because the caller has already proven possession of a valid token and learns
  nothing it could not confirm. Other endpoints answer the coarse
  `invalid_credential`.

Alloy never distinguishes "unknown client" from "wrong secret" on the wire. Both
are `401 invalid_credential`; the specific reason is recorded in the tenant's own
security audit.

---

## 4. Tenant and resource authority

> **Your token establishes your Installation, and therefore your Alloy tenant
> authority. You cannot select another organization by passing an identifier.**

The organization is read from the Installation row on every request. Passing
`org_id` or `organization_id` as a query parameter changes nothing — verified
directly: the same values come back either way.

**Boundary modes**

| Mode | Meaning |
| --- | --- |
| `org_wide` | every location in the organization |
| `locations` | only the listed locations **and their descendants** |

An empty `locations` list therefore denies everything rather than permitting
everything — a half-provisioned Installation fails closed.

Boundary is applied **in SQL**, inside the same function that reads the data, not
by filtering afterwards in the route. A filter parameter can only narrow what the
boundary already allows: asking for an unauthorized `location_id` returns an
empty page, never a borrowed row.

---

## 5. Scopes

Scopes are matched **exactly**. There is no hierarchy, no prefix matching and no
wildcard: `children.read` does not imply `children.contact.read`, and no read
scope implies any write. An Installation that needs two things is granted two
scopes.

**`GET /api/v1/context` requires no scope** — only a valid token. An Installation
that cannot discover what it holds cannot diagnose why anything else was refused,
so this is a capability inherent to holding a credential rather than a permission
an operator grants. There is no `context.read` in the grant model.

The thirteen grantable scopes:

| Scope | What it permits | What it does not |
| --- | --- | --- |
| `locations.read` | Read authorized sites, rooms and operational units | Any write; any other resource |
| `children.read` | Identity and lifecycle of enrolled children inside the boundary | Contact details, guardians, health, anything about an adult |
| `households.read` | The household a visible child belongs to | Any member list; billing; siblings outside the boundary |
| `relationships.read` | Adult↔child relationships and effective pickup authority | Contact points; any safeguarding detail or reason |
| `relationships.contact.read` | Email and phone for those adults | Anything `relationships.read` does not already permit |
| `enrollment.read` | Enrollment agreements and room placements | Schedules; anything about an adult |
| `schedule.read` | Committed schedule assignments and the dated projection | Staff schedules; anything about an adult |
| `staff.read` | Staff identity, role and employment status inside the boundary | Pay, payroll, HR, contact points |
| `staff.contact.read` | Email and phone for visible staff | Anything `staff.read` does not already permit |
| `attendance.read` | Read attendance facts for children inside the boundary | Authoring a fact |
| `attendance.write` | Submit attendance facts for children inside the boundary | Reading anyone's attendance history |
| `enrollment.write` | Start, end and void enrollments, and assign, move or cancel placements, for authorized children | Reading anything; creating children or households; schedules |
| `schedule.write` | Set, change and cancel committed schedule assignments for authorized children | Reading anything; enrollment or placement; the derived schedule-day projection |

The last pair is worth stating plainly, because it is the clearest demonstration
of what exact matching means: an Installation granted only `attendance.write` can
record that a child arrived and **cannot read back a single attendance record** —
not even the one it just wrote.

The catalog is deliberately small. It can grow compatibly; it cannot shrink.

---

## 6. `GET /api/v1/context`

Use it to validate a token, to discover what an Installation may do, and as a
health check after an administrator changes access.

```json
{
  "application": { "id": "…", "slug": "your-application", "environment": "sandbox" },
  "installation": { "id": "…", "status": "active" },
  "organization": { "id": "…" },
  "scopes": ["locations.read", "children.read"],
  "resource_boundary": { "mode": "org_wide" }
}
```

With a restricted boundary, `resource_boundary` is
`{ "mode": "locations", "location_ids": ["…"] }`.

It returns nothing about any person, no internal permission keys, no roles, and
no credential or token material — verified by assertion, not by inspection.

---

## 7. `GET /api/v1/locations`

The first canonical resource. Sites and units only; address records and customer
or vendor premises are excluded in SQL, not by client-side filtering.

**Fields — the complete set:**

| Field | Type | Notes |
| --- | --- | --- |
| `id` | uuid | Alloy's canonical identifier |
| `type` | `site` \| `unit` | |
| `unit_role` | `physical_space` \| `operational_group` \| `shared_space` \| `null` | `null` means unknown, not a guessed value |
| `name` | string \| null | |
| `parent_id` | uuid \| null | immediate parent |
| `site_id` | uuid \| null | the site this row belongs to |
| `active` | boolean | |
| `updated_at` | timestamp | also the incremental-sync watermark |

**Timezone is not part of the public Location contract.** Internal location
records carry timezone information; it is deliberately not published here, and
this exclusion is deliberate and is asserted by a test.

**Parameters**

| Parameter | Behaviour |
| --- | --- |
| `limit` | default **50**, maximum **200**; a value above the maximum is clamped, not refused. Non-numeric or `< 1` → `400 invalid_limit` |
| `cursor` | opaque; pass back the `next_cursor` you received. Unparseable → `400 invalid_cursor` |
| `type` | `site` or `unit`. Anything else → `400 invalid_filter` |
| `parent_id` | uuid; malformed → `400 invalid_filter` |
| `location_id` | uuid; narrows to one location, and cannot exceed the boundary |
| `updated_since` | ISO-8601 **with offset or `Z`**. A bare local time is ambiguous and is refused (`400 invalid_updated_since`) rather than guessed. Matches rows **strictly after** the instant |

**Response**

```json
{
  "data": [ { "id": "…", "type": "site", "…": "…" } ],
  "next_cursor": "…",
  "sync_token": "…"
}
```

`next_cursor` is `null` on the last page. Ordering is deterministic and stable
across pages: paging with `limit=2` twice returns the same rows, in the same
order, as one `limit=200` call.

### The collection and synchronization law

**This grammar is identical on every persisted collection in this
specification** — Locations, Children, Households, Relationships, Enrollments,
Placements, Schedule assignments and Staff. Implement it once. The only exception
is `/api/v1/schedule-days`, which is derived and says so by shape (§9.4).

| Parameter | Purpose |
| --- | --- |
| `limit` | Page size. Default 50, maximum 200, clamped rather than refused. |
| `cursor` | Position **within** a pass. Pass back the `next_cursor` you received. |
| `since_token` | Position **between** passes. Pass back the `sync_token` from the last page you consumed. |
| `updated_since` | Everything changed strictly after an instant. ISO-8601 with offset or `Z`. |

**Bootstrap**

1. Call with `limit` and no position.
2. Follow `next_cursor` until it is `null`.
3. Keep the `sync_token` from the last page you fully consumed.

**Continue incrementally**

4. Call again with `since_token=<the token you kept>`.
5. Follow `next_cursor` through that pass as before, keeping the new
   `sync_token` at the end.

**Prefer `since_token` to `updated_since`.** Both resume, but a token identifies
a single row, so two records sharing a timestamp cannot be skipped or repeated.
`updated_since` is a wall-clock instant and cannot make that guarantee; use it
when you are reconciling against a time you chose rather than a position Alloy
gave you.

A cursor is a **position, never a permission**. Presenting a cursor obtained
under wider authority does not widen a narrower Installation — every page
re-applies the boundary.

**Neither mechanism detects deletion.** A record that ceases to exist does not
appear as a tombstone. In practice Alloy does not remove these records: lifecycle
is expressed as an observable change on the record itself — `status` becoming
`inactive`, an `end_date` being set, an employment becoming `ended` — which a
polling consumer converges on normally. Reconcile with a periodic full read if
your model requires certainty about removal.

---

## 8. People

Three resources, and the rules that govern them are the part most worth reading
carefully, because the intuitive design is not the one Alloy implements.

### 8.1 What makes a child visible

**Enrollment is what makes a child visible, and nothing else does.** A child appears on the public API only when an
enrollment agreement places them at a site inside your boundary. Belonging to the
organization is not enough — and this holds even for an organization-wide
Installation, because being organization-wide widens which *sites* you reach, not
what counts as participation in service.

The practical consequence for your planning: **expect fewer children than the
organization has records for.** If a child you expect is absent, check their
enrollment before reporting a defect.

**An enrollment that never represented service never makes a child visible.**
Two states mean that, for two different reasons, and both are excluded: a family
who withdrew before their child's first day, and a record that was created in
error and should never have existed. Every other state does make a child visible,
including one that has `ended` — service happened, and your attendance and billing
history must still be able to resolve who the child was. Concretely:

| Enrollment status | Child visible | Why |
| --- | --- | --- |
| `pending_start` | Yes | Committed. You need the roster before the first day. |
| `active` | Yes | In service. |
| `ending` | Yes | Still in service, with a known last day. |
| `ended` | Yes | Served and concluded — history stays resolvable. |
| `canceled` | **No** | Withdrawn before service began; never a participant. |
| `voided` | **No** | Recorded in error; never represented service at all. |

**Visibility can end, and you will see it end.** Either path — a `pending_start`
enrollment that is canceled, or an enrollment voided as never-valid — removes the
child from `GET /api/v1/children`, their household from `GET /api/v1/households`
and their relationships from `GET /api/v1/relationships`. This is never silent:
the enrollment itself stays readable, turns `canceled` or `voided`, and its
`updated_at` advances, so a normal `GET /api/v1/enrollments?updated_since=...`
pass delivers the change. **Treat a child's disappearance from `/children` as a
signal to read `/enrollments`, not as data loss.** A child with commitments at two
sites stays visible while any one of them still stands.

### 8.2 `GET /api/v1/children`

Requires `children.read`.

| Field | Notes |
| --- | --- |
| `id` | Alloy's identifier |
| `external_id` | Your identifier for this child, if mapped. Yours only. |
| `first_name`, `last_name`, `display_name` | |
| `date_of_birth` | |
| `household_id` | Read with `GET /api/v1/households` |
| `status` | `active` or `inactive` — poll this to learn a child left service |
| `status_key` | The operator-facing lifecycle label, when set |

Filters: `household_id`, `child_id`, `external_id`. Plus the standard collection
parameters.

**Never present**, on this or any other endpoint: health, allergy, medical,
dietary and safeguarding information. These are not fields Alloy withholds from
you — they are not part of this contract at all.

### 8.3 `GET /api/v1/households`

Requires `households.read`.

A household is an **anchor for grouping siblings, not a grant of access to
them.** It appears because one of its children is already visible to you, and it
widens nothing: a sibling enrolled only at a site outside your boundary does not
appear in `/children`, and the household response contains no member list, no
count and no identifier that would reveal one exists.

To list the children of a household that you may see:
`GET /api/v1/children?household_id=…`. That answer is filtered to your authority,
which is the point of asking it that way.

| Field | Notes |
| --- | --- |
| `id`, `name`, `household_type`, `status_key` | |

Billing and payment information is never part of this resource.

### 8.4 `GET /api/v1/relationships`

Requires `relationships.read`. Contact points additionally require
`relationships.contact.read`.

A relationship is an **edge with its own identity**, not a flag on a child or on
a person. The same adult can hold a different relationship to each of their
children — a parent to one, an emergency contact to another — and flattening that
into booleans would lose the distinction the model exists to keep.

A relationship is visible exactly when its child is. This resource never widens
the set of people you can see.

| Field | Notes |
| --- | --- |
| `id` | The relationship's own identifier |
| `child_id`, `household_id`, `person_id` | `person_id` is stable across every relationship that adult holds |
| `first_name`, `last_name` | |
| `email`, `phone` | **Absent entirely** without `relationships.contact.read` — not present-and-empty |
| `relationship_type`, `priority`, `status` | |
| `pickup_authorized` | See below |

#### `pickup_authorized`

This is an **effective answer computed by Alloy at read time**, not a stored
flag. It is `true` only when all three hold:

1. collection authority has been granted for this adult and this child;
2. nothing currently withdraws it;
3. the child is inside your boundary.

Anything else is `false`. It **fails closed** — where Alloy cannot be certain the
answer is safe, the answer is `false`.

**No reason is returned, and none can be requested.** Do not infer one from other
fields, and do not treat `false` as a data error: it is the answer. If your
workflow needs to know why, that conversation belongs with the operator rather
than with this API. Alloy does not publish the underlying authority in any form,
because doing so could contradict the computed result — and because the reasons
are frequently safeguarding matters that no integration should carry.

---

## 9. Service state

Alloy keeps three service commitments separate, and so does this API, because
they change independently: a child can move room without their enrollment
changing, and change schedule without moving room.

| Resource | Answers | Scope |
| --- | --- | --- |
| `GET /api/v1/enrollments` | Is this child enrolled, at which site, from when? | `enrollment.read` |
| `GET /api/v1/placements` | Which room, from when? | `enrollment.read` |
| `GET /api/v1/schedule-assignments` | Which recurring pattern applies? | `schedule.read` |
| `GET /api/v1/schedule-days` | Who is expected on Tuesday? | `schedule.read` |

Synchronize whichever you actually depend on; there is no need to take all four.

### 9.1 Enrollments

`id`, `child_id`, `household_id`, `site_location_id`, `status`, `start_date`,
`end_date`. `end_date` is null while the agreement is open — poll for it to learn
that enrollment has ended.

### 9.2 Placements

`id`, `enrollment_id`, `child_id`, `site_location_id`, `room_location_id`,
`program_category_id`, `status`, `start_date`, `end_date`,
`supersedes_placement_id`.

**Corrections arrive as new rows.** A corrected placement is a new record naming
the one it replaces in `supersedes_placement_id`, rather than an edit to the
original. A copy you already stored is therefore never silently wrong — you
receive the correction through ordinary incremental synchronization.

Sites and rooms are Location identifiers from `GET /api/v1/locations`. There is
no second room vocabulary to learn.

### 9.3 Schedule assignments — the canonical schedule

`id`, `enrollment_id`, `child_id`, `site_location_id`, `room_location_id`,
`schedule_pattern_id`, `pattern_label`, `schedule_type_key`, `weekdays`,
`status`, `commitment_kind`, `is_primary`, `start_date`, `end_date`,
`supersedes_assignment_id`.

`weekdays` uses `0` for Sunday. This resource is **persisted committed
authority** and participates fully in incremental synchronization: use it when
you hold standing schedule intent and need to be told when it changes.

Only children appear here. Staff schedules are not part of this resource.

### 9.4 Schedule days — a derived projection

`GET /api/v1/schedule-days?from=YYYY-MM-DD&to=YYYY-MM-DD`

These rows are **generated** from committed schedule assignments and their
patterns. They are not stored, have no identifier of their own, and have no
change history — so this endpoint deliberately returns **no cursor and no sync
token**.

Do not attempt to synchronize it incrementally. There is nothing to checkpoint
against, and a watermark this endpoint could not honour would be worse than none.
If you need change detection, synchronize `/schedule-assignments` and re-project
the window yourself; every returned day names its source in
`schedule_assignment_id` so that you can.

The window is required and may not exceed **92 days**. The same window over the
same committed schedules always returns the same days in the same order. The
response carries `from`, `to` and `derived_from` so that a stored copy still
identifies itself as derived months later.

---

## 10. Staff

`GET /api/v1/staff` — requires `staff.read`; contact points additionally require
`staff.contact.read`.

**Staff is a composition, not a second identity system.** Alloy models a staff
member as a person together with an employment, and this resource presents them
as one object: `id` is the employment and `person_id` is the human. Someone
employed twice appears as two records sharing one `person_id`.

Visibility follows the **assignment**, not the organization. Employment is
organization-wide, but a staff member appears only when their primary location is
inside your boundary; someone with no assigned location does not appear at all.

| Field | Notes |
| --- | --- |
| `id` | The employment identifier — the stable key for this engagement |
| `person_id` | The human |
| `external_employee_id`, `badge_number` | |
| `first_name`, `last_name` | |
| `email`, `phone` | Absent without `staff.contact.read` |
| `employment_status` | `pending_start`, `active`, `ending`, `ended`, `canceled` |
| `employment_type`, `position_label` | |
| `primary_location_id` | A Location identifier |
| `start_date`, `end_date` | |

**Never present:** compensation, pay rate, payroll, tax, HR records,
safeguarding, medical information, and Alloy's own internal access permissions.
An application role is not an employment role and the two are never conflated.

---

## 11. Attendance

Attendance is an **append-only history of facts**. This is the one place the
public API both reads and writes, and the shape of both follows from that.

### 11.1 `GET /api/v1/attendance-events`

Requires `attendance.read`. Facts are ordered by when Alloy recorded them, which
for an append-only resource is also the last-modified time — so incremental
synchronization here is exact.

A correction or a reversal is **itself a fact**, carrying a reference to the
event it supersedes. Nothing is edited and nothing disappears: to compute current
truth, fold the history in order and let later facts supersede earlier ones.

### 11.2 `POST /api/v1/attendance-events`

Requires `attendance.write`. See §14 for submission semantics, per-item outcomes
and retry behaviour.

Four event kinds may be submitted: `check_in`, `check_out`, `absence` and
`room_transfer`. Others exist inside Alloy as derived states and are not things a
producer asserts.

---

## 11a. Reads, writes, and lifecycle operations

Before you design a write, understand what Alloy offers and what it deliberately
does not.

### What a permission means

- **`.read`** — permission to read that canonical resource. Nothing else.
- **`.write`** — permission to invoke specific **named operations** on that
  resource. It is not permission to read, and it is not a generic mutation right.
- **No read implies a write, and no write implies a read.** An integration
  granted `enrollment.write` can start, end and void enrollments and assign, move
  and cancel placements — and cannot read a single one.

### There is no CRUD contract

The public API has **no `PUT`, no `PATCH` and no `DELETE`** on any resource, and
none is planned. Creation, change and ending happen through named operations that
express intent:

| You want to | You call | Scope |
| --- | --- | --- |
| Enroll a child | `POST /api/v1/enrollments` | `enrollment.write` |
| End an enrollment | `POST /api/v1/enrollments/end` | `enrollment.write` |
| Say an enrollment was never real | `POST /api/v1/enrollments/void` | `enrollment.write` |
| Assign a room | `POST /api/v1/placements` | `enrollment.write` |
| Move a room | `POST /api/v1/placements/move` | `enrollment.write` |
| Say a placement was never real | `POST /api/v1/placements/cancel` | `enrollment.write` |
| Set a schedule | `POST /api/v1/schedule-assignments` | `schedule.write` |
| Change a schedule | `POST /api/v1/schedule-assignments/change` | `schedule.write` |
| Say a schedule never applied | `POST /api/v1/schedule-assignments/cancel` | `schedule.write` |
| Record, correct or reverse attendance | `POST /api/v1/attendance-events` | `attendance.write` |

Ten HTTP operations carrying twelve domain intents, because Attendance submission
accepts `original`, `correction` and `reversal` through one endpoint. §9 covers
that endpoint's shape; the conflict conditions for each service-state operation
are in the integration guide's catalog.

You never send `status_key` or an end date as a field edit. `POST .../end` is one
intent with three possible canonical outcomes — cancel, mark ending, close — and
Alloy chooses between them from the record's current state. That is deliberate:
deciding wrongly which one applies would leave a child enrolled.

### Why some resources have no write at all

Not an oversight, and not a roadmap gap in most cases:

| Resource | Why |
| --- | --- |
| **Locations** | Site and room topology is how an organization describes itself, and every other resource names a place using it. An operator configures it. |
| **Children** | Creating a child asserts a new human being. Nothing in a create call distinguishes "new child" from "child you already have, spelled differently", and the cost of guessing wrong is a duplicate person. Identity-resolved intake is the right shape, and it does not exist yet. |
| **Households** | A household is an account carrying financial responsibility this API does not expose at all. |
| **Relationships** | A genuine gap rather than a decision. If it is built, pickup authority will remain a derived answer — an operation may grant the underlying role, never write the effective flag. |
| **Staff** | Canonical authority exists; externalizing it is a separate decision, because onboarding a person is adjacent to compensation and eligibility authorities this API excludes. |
| **Schedule days** | Derived. Changing a day means changing the assignment it came from. |

### How things end — and why `DELETE` is missing

**Canonical history is never destructively deleted.** Every resource you can
create through this API offers a governed way to end, cancel, supersede, correct
or reverse it — chosen to match what actually happened. Do not wait for `DELETE`
endpoints: the operation you need already exists under a name that says which of
those it is.

That distinction is the point, and it is not pedantry. **A change and a mistake
are different truths.** Superseding a placement says the child really was in that
room until the move. Cancelling one says they never were. If the only tool were
supersession, correcting a record created in error would publish a period of care
that never happened — and you, having already synchronized the original, would
have no way to tell the two apart afterwards.

| Resource | Ended normally | Never should have been effective |
| --- | --- | --- |
| Children | archived — `status` becomes `inactive` | — (identity is not created through this API) |
| Relationships | ended by status | — |
| Enrollment | effective end — `end_date` is set | **canceled** before it starts (`POST /enrollments/end`), or **voided** if it was recorded in error after starting (`POST /enrollments/void`) |
| Placements | **superseded** — a new placement names the one it replaces | **canceled** — `POST /placements/cancel` |
| Schedule assignments | **superseded** | **canceled** — `POST /schedule-assignments/cancel` |
| Attendance | **reversed** — a reversal fact supersedes the original | **reversed** — the fact is a tombstone, never a deletion |
| Staff | effective end | — |
| Locations, Households | not deletable through this API | — |

### The six words, and which one you want

Each names a different thing that happened. Reading `status` tells you which, so you
never have to guess why a record changed.

| Word | What it asserts | When Alloy uses it |
| --- | --- | --- |
| **end** | It was true, and then it concluded | A child finishes their time with the service |
| **cancel** | A planned commitment was withdrawn before it became true | A family signs and then withdraws before the first day |
| **supersede** | It was true, and a new state replaced it | A child moves rooms, or a schedule changes |
| **void** | The record was created in error and was never true | An enrollment recorded against the wrong child |
| **reverse** | A recorded fact did not happen | A check-in that was never real |
| **correct** | The fact happened, but a recorded detail was wrong | A check-in with the wrong time or room |

The pairs that are easy to confuse are worth stating plainly. **Cancel and void are
not synonyms**: cancelling says a commitment existed and was withdrawn in time,
voiding says the record never represented anything. **Supersede and void are not
synonyms either**: superseding keeps asserting that the old state was real for the
period it covered, which is exactly what you do not want to publish about a record
that was a mistake.

Voiding an enrollment is deliberately hard to misuse. If Alloy holds attendance for
it, a child actually arrived, and the request is refused with `409` — real history
cannot be rewritten by calling it a mistake.

Nothing disappears in any of these. The record you already stored is never
rewritten or removed; its `status` changes and you learn about it through ordinary
incremental synchronization. Read `status` to decide what a record means:
`superseded` and `ended` describe something that was true for a period, while
`canceled` says it never took effect and nothing should be derived from it.

One limit worth stating plainly rather than discovering: a record that has already
closed cannot be canceled. Once a placement or assignment has been superseded or
ended, it asserts real history that occupancy and billing already depend on, and
denying it retroactively would be a different and much larger operation than this
one. Cancellation applies while a record is still effective.

### Answering the five questions for any resource

For anything on this API you can determine, without asking Alloy:

1. **Can I create it?** — is there a `POST` for it in the reference?
2. **Can I change it?** — is there a named change operation (`/move`,
   `/change`), or a correction fact?
3. **How do I end it?** — the table above.
4. **Can I delete it?** — no.
5. **What permission do I need?** — the `x-required-scope` on the operation.

---

## 12. Errors

Every refusal uses one envelope:

```json
{
  "error": {
    "code": "invalid_cursor",
    "type": "invalid_request",
    "message": "The cursor is not valid. Restart pagination without one.",
    "request_id": "…"
  }
}
```

`request_id` is also returned as the `X-Request-Id` header, and is the value to
quote in a support conversation. An optional `details` object appears only where
a refusal has structured detail.

| Status | `type` | What it means | What to do |
| --- | --- | --- | --- |
| 400 | `invalid_request` | The request is malformed — a bad cursor, limit, filter or grant type | Fix the request. Retrying it unchanged will fail again |
| 401 | `unauthenticated` | No valid token: expired, revoked, or the installation is suspended | Exchange credentials for a new token. If it repeats, the installation needs attention |
| 403 | `forbidden_scope` | The token is valid but the installation was not granted the scope this operation requires | Ask for the scope during provisioning. Do not retry |
| 404 | `not_found` | The identifier does not exist **or** is outside your boundary — deliberately indistinguishable | Check the id came from a read you are authorized for. Never infer existence from a 404 |
| 409 | `conflict` | A well-formed, authorized operation that cannot truthfully be performed in the record's current lifecycle state | Re-read the record. The state has moved, or the intent is wrong for it |
| 422 | `invalid_request` | Understood and authorized, but the values break a domain rule — for example an effective date that does not move forward. The `code` is `validation_failed`, which is what you branch on | Correct the values. Retrying unchanged will fail again |
| 429 | `rate_limited` | A budget is exhausted | Wait for `RateLimit-Reset`, then retry |
| 500 | `internal_error` | Alloy failed. Never your input | Retry with backoff. Quote `request_id` if it persists |

**409 is the one worth understanding.** It is not a server fault and not a bad
request — it is a domain rule speaking. The lifecycle operations return it
whenever the act being asked for is untrue of the record as it stands:

| You asked to | It returns 409 when |
| --- | --- |
| Void an enrollment | Attendance was recorded under it, so service really happened |
| Void an enrollment | It is already `canceled`, which already states a narrower truth |
| Cancel a placement or schedule assignment | It has already ended or been superseded, so it asserts real history |
| Set a schedule | An operational one already exists — read it and use `change` |

Treat a 409 as information, not an error to retry through: re-read the record and
decide which intent is actually true of it.

---

## 13. Rate limiting

Durable and shared across server instances — a budget, not a per-process
approximation. **Three independent budgets:**

| Surface | Limit | Window | Keyed on |
| --- | --- | --- | --- |
| Token exchange | 30 | 60 s | presented `client_id` + hashed caller address |
| Authenticated reads | 600 | 60 s | Installation |
| Authenticated governed writes | 120 | 60 s | Installation |

Each class holds its own counter. Reading does not consume write capacity and
writing does not consume read capacity, so a partner that spends a window paging
collections still has its full write budget, and a partner submitting a backlog
of attendance still reads normally.

The window is a fixed 60-second interval aligned to the clock, not a sliding
window measured from your first request. `RateLimit-Reset` tells you how many
seconds remain in the current one.

Every authenticated response carries `RateLimit-Limit`, `RateLimit-Remaining`
and `RateLimit-Reset` describing **the budget that governed that request** — so
the same Installation sees `600` on a read and `120` on a write. A `429` also
carries `Retry-After`, and names the class that ran out.

Headers travel on refusals too, once the budget has been consulted: a `400` or a
`403` raised after admission still reports what it spent. The one exception is
deliberate — a request refused for a **missing scope** is rejected before the
budget is consulted, so that an unauthorized caller cannot drain a budget it was
never entitled to spend. Those responses carry no rate headers.

The token budget is consumed **before** credential verification, so a
credential-stuffing run cannot get free database work. It is never keyed on the
secret: keying on the value being guessed would hand every wrong guess a fresh
budget.

A request refused with `429` performs no work at all — the budget is consulted
before the body is parsed or any authority is resolved. Retrying after one is
therefore always safe.

## 14. Governed submission, idempotency, correlation

Ten governed write operations exist (§2), carrying twelve domain intents:
Attendance submission is one endpoint that accepts `original`, `correction` and
`reversal`. This section covers that endpoint, whose shape differs from the rest,
and the idempotency and correlation rules that apply to all of them. The nine
service-state operations are described in §9 and §11a.

### Attendance is fact submission, not CRUD

`POST /api/v1/attendance-events` is Attendance's **only** write, and it appends
facts. There is no `PUT`, no `PATCH` and no `DELETE` anywhere on the public
surface. Attendance is an
append-only history: a mistake is corrected by recording a **correction** or a
**reversal** that supersedes the earlier fact, never by editing or removing it.
This is why a partner's mirror of attendance can always be reconciled — nothing
it received has silently ceased to exist.

### A batch is not a transaction

A submission carries up to 200 events. Each one receives its **own outcome**, and
the call returns `200` even when some items were refused:

| Outcome | Meaning |
| --- | --- |
| `accepted` | The fact was recorded. |
| `replayed` | This exact fact was already recorded. Not an error — your retry worked. |
| `conflict` | The same identity was submitted before with different content. |
| `pending_mapping` | A referenced child or location is not mapped for this Installation. |
| `rejected` | The item was not valid. |

A batch that reported one status for a partial result would be a batch nobody
could reconcile, which is why the per-item shape is part of the contract rather
than a convenience.

### Idempotency is derived, not supplied

You do not send an idempotency key. Replay identity is derived from **your own
event identifier** on each submitted fact, scoped to your Installation. Submit
the same event identifier twice and the second returns `replayed` against the
same underlying fact.

The practical consequence: **if a submission times out, retry it unchanged.** You
cannot create a duplicate by retrying, and you do not need to reconcile first.
Two callers submitting the same event simultaneously converge on one fact.

Because the identity is yours and scoped to you, one partner can never replay,
collide with, or overwrite another partner's submission.

### Correlation

```text
Your identifier
        ↕   correlation, recorded per Installation
Alloy's canonical identifier
```

A correlation belongs to the Installation that holds it. Two partners may carry
different identifiers for the same Alloy record without either becoming a second
source of truth, and **your identifiers are never visible to another
Installation** — nor are theirs to you. Where a resource exposes `external_id`,
it is yours and only yours.

Referencing a resource by an identifier you have not mapped yields
`pending_mapping` rather than a guess. Referencing one that maps to a resource
outside your boundary is refused: a valid identifier is not a key to something
you were not granted.

There is no public self-service correlation API today; correlations are
established with Alloy during onboarding.

---

## 15. Quickstart

1. An administrator opens **Organization → Integrations** and adds your
   Application, choosing capabilities and either org-wide or selected-location
   access. This creates the Installation.
2. The administrator issues a credential and copies the secret **once**.
3. Exchange it:
   `POST /api/v1/oauth/token` with `grant_type=client_credentials`.
4. Confirm who you are: `GET /api/v1/context`.
5. List what you may reach: `GET /api/v1/locations?limit=50`.
6. Page with `next_cursor` until it is `null`, then store the `sync_token` from
   the last page you durably processed.
7. Later: `GET /api/v1/locations?since_token=<stored token>`, and page that pass
   the same way. Replace the stored token only after you have processed the pass.

Use `updated_since` only when you deliberately want time-based reconciliation
against a moment you chose — see §7.

```bash
TOKEN=$(curl -s -X POST https://<alloy-host>/api/v1/oauth/token \
  -H 'content-type: application/json' \
  -d '{"grant_type":"client_credentials","client_id":"alloy_ci_EXAMPLE","client_secret":"alloy_cs_EXAMPLE"}' \
  | jq -r .access_token)

curl -s https://<alloy-host>/api/v1/context -H "authorization: Bearer $TOKEN"
curl -s "https://<alloy-host>/api/v1/locations?limit=50" -H "authorization: Bearer $TOKEN"
```

Identifiers and secrets above are fictitious.

---

## 16. Capability matrix

| Capability | Maturity |
| --- | --- |
| OAuth-style token exchange | **IMPLEMENTED_EXTERNAL** |
| Installation context | **IMPLEMENTED_EXTERNAL** |
| Location read (sites and units) | **IMPLEMENTED_EXTERNAL** |
| Children, Households, Relationships read | **IMPLEMENTED_EXTERNAL** |
| Effective pickup authority | **IMPLEMENTED_EXTERNAL** |
| Enrollment and Placement read | **IMPLEMENTED_EXTERNAL** |
| Schedule assignment read | **IMPLEMENTED_EXTERNAL** |
| Dated schedule projection | **IMPLEMENTED_EXTERNAL** (derived; not synchronizable) |
| Staff read (person + employment composition) | **IMPLEMENTED_EXTERNAL** |
| Attendance read | **IMPLEMENTED_EXTERNAL** |
| Attendance governed submission | **IMPLEMENTED_EXTERNAL** |
| Incremental sync on every persisted collection | **IMPLEMENTED_EXTERNAL** |
| Derived idempotency and safe retry | **IMPLEMENTED_EXTERNAL** |
| Durable rate limiting | **IMPLEMENTED_EXTERNAL** |
| External resource correlation | **IMPLEMENTED_INTERNAL_FOUNDATION** — established during onboarding; no public management API |
| Public webhooks / event delivery | **NOT_REQUIRED_FOR_V1** — polling is sufficient for every resource above |
| Correlation management API | **FUTURE_UNRATIFIED** |
| Communications | **INTERNAL_ONLY** |
| Financials | **NOT_EXTERNALIZED** |
| SSO / deep linking | **FUTURE_UNRATIFIED** |

---

## 17. Domain readiness

Four independent dimensions. A domain can be fully authoritative inside Alloy and
still have no public contract — collapsing these columns is how an integration
plan acquires endpoints that do not exist.

| Domain | Canonical Alloy authority | Implemented `/api/v1` | Partner readiness |
| --- | --- | --- | --- |
| Organization / install context | COMPLETE | **IMPLEMENTED** | Ready |
| Locations (sites, units) | COMPLETE | **IMPLEMENTED** | Ready |
| Rooms / operational groups | COMPLETE | **IMPLEMENTED** (as Location `unit`) | Ready |
| Children | COMPLETE | **IMPLEMENTED** | Ready |
| Households | COMPLETE | **IMPLEMENTED** | Ready |
| Relationships / guardians | COMPLETE | **IMPLEMENTED** | Ready |
| Pickup authority | COMPLETE | **IMPLEMENTED** (effective answer only) | Ready |
| Enrollment | COMPLETE | **IMPLEMENTED** | Ready |
| Placement | COMPLETE | **IMPLEMENTED** | Ready |
| Schedules | COMPLETE | **IMPLEMENTED** (committed + derived projection) | Ready |
| Staff | COMPLETE | **IMPLEMENTED** (composition) | Ready |
| Attendance read | COMPLETE | **IMPLEMENTED** | Ready |
| Attendance submission | COMPLETE | **IMPLEMENTED** | Ready |
| External correlation | COMPLETE | Established during onboarding | Ready, no self-service API |
| Communications | COMPLETE | NOT IMPLEMENTED | Internal only for V1 |
| Financials | COMPLETE | NOT IMPLEMENTED | Not externalized |
| Events / webhooks | — | NOT IMPLEMENTED | Not required for V1 |
| SSO / deep linking | — | NOT IMPLEMENTED | Not ratified |

---

## 18. Current limitations

Stated plainly, because an integration designed around an assumption Alloy does
not meet is more expensive to correct later than to plan around now.

1. **Synchronization is polling and checkpoint based.** There are no webhooks and
   no push delivery. Every resource in this specification converges through
   `since_token` / `updated_since`, and none requires events to be correct. What
   polling costs you is latency, not accuracy — choose your interval accordingly.

2. **Deletion is not delivered as a tombstone.** Lifecycle is observable as a
   change on the record (§7). Periodic full reconciliation is the only way to be
   certain about removal.

3. **`/schedule-days` cannot be synchronized.** It is derived and bounded to a
   92-day window. Synchronize `/schedule-assignments` instead.

4. **Pickup authority is an answer without a reason**, and deliberately so. No
   endpoint exposes why it is `false`.

5. **No health, allergy, medical, dietary or safeguarding data is available** on
   any endpoint, under any scope.

6. **Communications is internal only.** Alloy does not expose messaging, consent
   or deliverability externally in V1.

7. **Financials is not externalized.** Charges, balances and payment state have
   no public contract.

8. **Correlation has no self-service API.** Mappings between your identifiers and
   Alloy's are established with Alloy during onboarding.

9. **A child with no enrollment is not visible**, in any boundary mode. This is
   the rule most likely to surprise, and it is intentional (§8.1).

10. **Only four attendance event kinds may be submitted.** Other attendance
    states exist inside Alloy as derived values and are not producer assertions.

---

## 19. How this document was verified

Every endpoint, field, parameter, status code and limit in this document was read
from the running implementation and then exercised over HTTP against a live
server — not transcribed from a design.

That exercise covers, for each resource: authentication and its refusals; the
scope requirement and the fact that a neighbouring scope does not satisfy it;
tenant isolation; boundary enforcement, including that a filter narrows and never
widens and that a valid identifier outside the boundary is refused; deterministic
paging and cursor resume; incremental continuation with no gap and no repeat;
the published field set and the absence of everything excluded from it; and
identifier correlation remaining private to the installation that owns it.

For attendance submission it additionally covers per-item outcomes, replay of an
identical submission, conflicting submission under the same identity, correction
and reversal, and concurrent submission converging on a single fact.

Where this document says a field is not published, that absence is asserted by a
test rather than left to review.

If you find a discrepancy between this document and the API's behaviour, treat it
as a defect in this document and tell us — it is written to be the thing you can
rely on.
