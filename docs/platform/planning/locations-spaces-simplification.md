---
owner: platform
status: proposed
last_reviewed: 2026-09-22
supersedes: []
---

# Did we expose too much of the platform model to the operator?

Yes — in one specific place, and less than it looks.

This is a discovery packet. Nothing in the certified V2 topology was mutated to produce
it. Every claim below is measured against the deployed primary and the mounted product on
staging build `9dbab7824`, and the measurements are named so they can be re-run.

The short answer: **the topology model is sound and almost entirely invisible already.
Capacity is where the platform leaked into the product.** The role vocabulary needs one
deletion, not a redesign.

## The finding that decides the mission

On one screen, at North Campus, the Rooms list says:

    Infant A     Classroom · Active · 8 capacity · 1 program

and the detail panel for the same room, at the same moment, says:

    Capacity
    No capacity configured for this room.
    Manage capacity rules →

Both are honest readings. The list reads `locations.metadata.capacity`; the detail reads
the canonical capacity rules. **The operator is shown two capacities for one room and told
the real one is somewhere else.** That is not a styling problem and no facelift fixes it.

Measured, not inferred: 17 of 19 units still carry `metadata.capacity`, and exactly 3
canonical capacity rules exist in the entire deployed database.

## A. Current operator model — what a director must understand today

| # | Concept they meet | Where |
|---|---|---|
| 1 | Room vs Classroom vs Physical room vs Shared space | Add room, list, detail |
| 2 | Which of those may sit *inside* another | Add room ("Inside") |
| 3 | That capacity is absent here and lives elsewhere | Room detail |
| 4 | Capacity *kind*: physical / licensed / operational | Legacy adoption chooser |
| 5 | Rule scope precedence: Room → Program → Location → Org | Operational Rules |
| 6 | Effective dating, versions, supersede, retire, void | Operational Rules |
| 7 | "Fallback applies" | Operational Rules |

Items 4–7 are rule-engine mechanics. A director configuring a classroom should meet none
of them.

There is also a **perverse incentive** in the room editor, at
`LocationRoomDetailPanel.tsx:151`:

```ts
const canEditLegacyCapacity = (capacityStanding?.canonicalRules.length ?? 0) === 0;
```

While a room has no canonical rule, the editor offers a plain **Capacity** box — which
writes the ambiguous legacy field. The moment the operator does the *right* thing and
adopts a canonical rule, the box disappears and is replaced by *"Capacity for this room is
set in Operational Rules."* **Doing the correct thing costs you the simple editor.** That
single branch is the mission's observed problem in its entirety.

## B. Required domain model — what Alloy actually needs internally

Measured by inventorying every consumer of `unit_role`.

| Distinction | Real? | Enforced where |
|---|---|---|
| operational group vs everything else | **Yes, load-bearing** | `isPlaceableUnitRole`, `operationalGroupRooms`, `loadSiteOperationalRooms` |
| physical space may contain classrooms | **Yes** | `eligibleInsideOptions`, DB `nested_physical_space` |
| capacity kinds are not additive | **Yes** | `resolveCapacityBreakdown` takes a MIN, never a sum |
| licensed is a *ceiling*, not an override | **Yes** | `resolveLicensedCeiling` clamps to MIN across rules |
| **shared space vs physical space** | **No** | *nothing* |

That last row is the key measurement. Across all product code, `shared_space` appears
**five times**: once in the type union, once in a runtime string check, once in the
external API passthrough, once in the allowed-values list, and once as an operator-visible
option. **No behavioral branch anywhere distinguishes it from `physical_space`.**

- Placement excludes both (`isPlaceableUnitRole` → `operational_group` only).
- Scheduling excludes both (`loadSiteOperationalRooms`).
- Attendance offers **every** unit and filters by nothing but a non-empty label
  (`siteRoomsFor`) — `isAttendanceLocatableRole` returns true for any role and is cited
  only in a comment.

So the one behavioral difference between Playground and Room 1 is that a classroom may be
created *inside* Room 1 and not inside Playground.

Confirmed against live data: of 29 child attendance events, 2 staff presence events and 1
schedule assignment, **every single one targets an operational group**. Nothing has ever
been located in the shared space that role exists to serve.

## C. Simplified operator model

### Rooms vs Spaces → **Spaces**

One recommendation, on evidence. The collection at North Campus already contains
Playground, and the list header already reads "9 rooms" while showing something that is
not a room. "Rooms" is already false at the only site that exercises the model. **Spaces**
covers a classroom, a physical room and a playground without strain, and it is the noun
the rest of the model already uses (`shared_space`, `physical_space`).

Cost: the tab label, the collection header, the "+ Add room" button, and `roomTypeLabel`
copy. No identifier, table, column or route needs renaming — `locations` is already the
table, and `room_location_id` is a foreign key operators never see.

### Classroom vs Physical space → **keep, exactly as they are**

This is the distinction V2 got right and it must survive. A Classroom is the group a child
belongs to; a Physical space is where a body is. Keep both operator-visible.

### Shared space → **retire from the operator vocabulary**

Three visible types collapse to two. `Playground` becomes a **Physical space**.

The canonical role may stay in the enum — retiring a value is a migration with no benefit —
but nothing should author it, and `ROOM_TYPE_OPTIONS` should stop offering it. The single
consequence is that a classroom becomes creatable inside Playground. That is not a defect:
a toddler class that meets on the playground is a true statement, and no consumer changes
behavior.

I am not recommending this because the role is unused in the UI. I am recommending it
because **no code anywhere reads it to make a decision**, and a type an operator must
choose that changes nothing is a tax on every room they will ever create.

### Ordinary capacity → **one field, on the object, meaning `operational`**

A director typing `Capacity 10` on Toddler 1 means *"this class holds ten children."* That
is `operational` capacity: most-specific-wins, ordinary override semantics, safe to change.

It must **not** be written as `licensed`. Licensed capacity is a binding regulatory ceiling
with two guards: `resolveLicensedCeiling` resolves it as the MIN across every applicable rule
regardless of scope, and `assertLicensedCapacityNotWeakened` **refuses at author time** any
rule whose value would exceed the current ceiling. So a director who typed 10 today and 12
next term would simply be told no, for reasons about licensing law that nobody put in front
of them. Licensed capacity is a regulator's number, not a director's.

The live data shows this is not hypothetical: **Toddler 1 and Toddler 2 — both classrooms —
already carry `licensed` rules of 10**, authored through the adoption chooser. The chooser
asked a question the operator could not answer correctly, and it got the wrong answer twice
out of three.

For a **Physical space**, the honest ordinary field is different. A physical room's number
is how many bodies fit, which is `physical`. Licensed capacity stays an advanced fact in
Operational Rules, because its clamp semantics are genuinely not ordinary-edit semantics.

So the grammar is:

| Object | Field label | Canonical kind |
|---|---|---|
| Classroom | **Capacity** | `operational` |
| Physical space | **Capacity** | `physical` |
| either, advanced | Licensed capacity | `licensed` (Operational Rules only) |

One label, two truthful mappings, chosen by the object's own type rather than by asking the
operator to classify their own number.

**No double counting.** `resolveConfigRule` matches room scope by exact id — a rule on
Room 1 does not reach Toddler 1 inside it. The kinds are combined by MIN, never summed. A
physical space and the classrooms inside it holding separate numbers is already safe.

One live helper does sum naively: `roomCapacitySummaryForSite` adds `metadata.capacity`
across a site and would report 48 for a campus that holds 24. It is **destructured and
never called** — dead at the render layer — and `tests/location/capacityAggregationDebt.test.ts`
pins it as a deliberate tripwire. It should be deleted with the legacy field, and that test
is expected to fail when the decision below is taken; that failure is the reminder, not a
regression.

### Operational Rules → **keep, demote to advanced**

It should not be the default authoring surface, and it should not be deleted. Its four
families classify cleanly:

| Family | Normal object config | Advanced | Derived |
|---|---|---|---|
| Capacity | **yes** — ordinary value on the object | effective dating, site/org/program scope, licensed ceiling | — |
| Ratios | no | **yes** — tiers, mixed-age policy | required staff comes from the resolver |
| Operating windows | site-level, belongs on the Site | overrides | — |
| Schedule rules | no | **yes** | — |

Evidence for "advanced": **zero rooms in the deployed database have more than one capacity
version.** The version timeline — the most prominent thing on the page, with *"Create future
version"* as its green primary button — has never been used. The rarest operation currently
has the loudest affordance.

### Effective dating → **hidden by default, preserved always**

The authority already exists. `configRuleAuthoringService` exposes create / version /
retire / void, and the route at `/api/admin/operational-config/capacity-rules` dispatches
on `action`. Saving `Capacity 10` from a classroom should call `create` when no rule exists
and `version` when one does, with `effective_start` = today.

The operator sees a number and a Save button. Alloy writes a typed, effective-dated,
audited version. History is preserved without the director administering history — and
because versioning is real underneath, the advanced surface keeps working for anyone who
needs a future-dated change.

## D. Migration and data impact

No topology migration is required. Specifically:

- **No role data changes.** The one `shared_space` row (Playground) may stay as it is or be
  updated to `physical_space`; nothing reads the difference. Recommend updating it so the
  stored fact matches the shown fact.
- **`metadata.capacity` must be retired, not revived.** 17 of 19 units still hold it. Those
  values are the ones the list is displaying today. Each needs a one-time adoption into a
  typed rule — the existing adoption machinery does exactly this, but it currently asks the
  *operator* to pick the kind. With the object-type mapping above, the kind is derivable,
  so adoption can be proposed rather than interrogated.
- **The two mis-typed rules** (Toddler 1, Toddler 2 carrying `licensed` 10) should be
  reviewed. They are semantically wrong for a classroom and will behave as unraisable
  ceilings. This is a data repair, and it needs an explicit operator decision.

## E. Downstream impact

| Domain | Impact |
|---|---|
| Child Assignment | **none.** `placeableRooms` filters to `operational_group`; collapsing shared→physical does not touch it. |
| Staff / Scheduling | **none.** `loadSiteOperationalRooms` filters identically. |
| Attendance | **none.** `siteRoomsFor` already offers every unit, Playground included. |
| OI | **none.** Site ancestry is `rowsBelongingToSite`, which walks parents and ignores role. |
| Capacity | resolver untouched; it gains a second, simpler *writer*. No new authority. |

Every one of these is a filter on `operational_group`, which this proposal does not alter.
That is why the simplification is cheap: **the only thing being removed is a distinction
nothing consumes.**

## F. Visual convergence

The chrome is already Alloy: shell, rail, breadcrumb, cards, status pills and the Infant A
detail grid all match current mounted pages. The divergence is **grammar and emphasis**,
not styling.

1. **Machine-composed titles.** `Capacity · Licensed · Room: Toddler 2` is a scope
   expression, not a name. Alloy object cards lead with the object.
2. **Inverted action hierarchy.** "Create future version" is the green primary; the common
   case has no affordance at all.
3. **Engine vocabulary in body copy.** "most-specific-wins", "fallback applies",
   "Org default means inherited".
4. **An empty state that hands off instead of helping.** "No capacity configured for this
   room." + "Manage capacity rules →".
5. **The list/detail contradiction** in §0, which is a product defect wearing a visual
   costume.

Target grammar for a Space detail — close to what Infant A already renders:

    Toddler 1                                    [Edit]
    TYPE Classroom   SITE North Campus   INSIDE Room 1
    CAPACITY 10      PROGRAMS Toddler    SCHEDULE None
    STATUS Active

    Advanced: licensed capacity, ratios, future-dated changes →

## G. Implementation slices

1. **Capacity on the object.** One field on the Space editor, typed by the object's role,
   writing canonical rules through the existing authoring service. Delete
   `canEditLegacyCapacity`; the field is always available.
2. **Retire `metadata.capacity`.** Adopt survivors with a derived kind, make the list read
   the resolver, delete `roomCapacitySummaryForSite`, retire the aggregation-debt tripwire.
3. **Two types.** Remove Shared space from `ROOM_TYPE_OPTIONS`; update the one row.
4. **Rooms → Spaces.** Copy-only rename across tab, collection and buttons.
5. **Operational Rules as advanced.** Re-title cards by object, demote versioning, rewrite
   the engine copy, link inward from each Space.
6. **Visual convergence pass** over the result.
7. **Director QA walkthrough** (§16 of the brief).

Slices 1–2 are the mission. 3–4 are cheap once 1–2 land. 5–6 are the facelift, and doing
them before 1–2 would be restyling a surface that is about to lose most of its traffic.

## Decisions that need Kelly

1. **Rooms → Spaces?** Recommended, on the evidence that "Rooms" already contains a
   playground.
2. **Retire Shared space from the operator vocabulary?** Recommended; nothing reads it.
3. **Ordinary Capacity maps to `operational` for a Classroom and `physical` for a Physical
   space?** Recommended; `licensed` is unsafe for ordinary editing.
4. **Repair Toddler 1 / Toddler 2, whose classroom capacity was recorded as `licensed` 10?**
   Needs an operator ruling — it changes stored regulatory facts.
5. **Retire `metadata.capacity` entirely, adopting the 17 survivors?** Recommended, and it
   is the only way the list and the detail can ever agree.

## Measurements behind this packet

| Claim | Artifact |
|---|---|
| role distribution, capacity-rule inventory, version counts | `certification/migrations/spaces-discovery-1.sql.results.json` |
| attendance/presence/scheduling targets by role; per-unit capacity | `certification/migrations/spaces-discovery-2.sql.results.json` |
| mounted operator journey, list/detail contradiction | `certification/migrations/spaces-mounted-discovery.json` |

## Director QA walkthrough — specification

Written after slices 1–6 land, not now. This is the shape it must take, so the
implementation is built against a known acceptance target.

- **Length**: 10–15 minutes, 17 steps, one screen each. Plain operator language — the words
  `unit_role`, `operational_group`, `parent_location_id`, "precedence" and "rule version"
  may not appear.
- **Environment**: mounted staging, North Campus, against the fixture already in place.
- **Every step carries an explicit PASS / FAIL expectation**, in the director's own terms
  ("You should see Toddler 1 listed as a Classroom inside Room 1, with capacity 10").

The steps, per the brief: open North Campus → open Spaces → create Room 1 as a Physical
space → set its operating facts → create Toddler 1 as a Classroom inside Room 1 → set
capacity → create Toddler 2 inside Room 1 → create Playground as a Physical space → create
Infant A as a direct Classroom → edit each → verify list and detail agree → verify child
Assignment offers only Classrooms → verify Staff/Scheduling offers only Classrooms →
verify Attendance can use Playground → verify capacity behaves → verify no duplicate or
technical configuration was required → verify it feels like Alloy.

Three checks are the ones that would have caught today's defects, and they are not
optional:

1. **The list and the detail must show the same capacity for the same space.** This is the
   §0 contradiction; it is the single most important assertion in the document.
2. **Setting capacity must never send the director to another screen**, and must not
   disappear after it has been set once.
3. **Playground must be creatable without the director classifying it as anything but a
   Physical space**, and must still be selectable in Attendance afterwards.

It must also state plainly what is *not* being tested: ratios, operating windows, schedule
rules and future-dated policy changes stay in Operational Rules and are out of scope for
the ordinary journey.
