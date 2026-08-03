# Grain Authority Map — what IS a row, per grain

**Status:** ESTABLISHED (2026-07-30). **Phase 2 of the Second Surface sprint.** **Owner doc:**
`RUNTIME-V1-CERTIFICATION-SPRINT.md` (SURF-3). **Precedes:** R1 (grain-resolved row source) and R2
(`subjectGrain` on the answer).

> **Line numbers in this document are anchors of convenience — cite the SYMBOL.** The provisioning answer's
> line numbers moved by ~65 while this sprint was in flight (`.from("opportunities")` was `:442` when
> `SECOND-SURFACE-INVENTORY.md` was written and is `:508` now, shifted by the Active Pipeline repair in the
> same file). `SECOND-SURFACE-INVENTORY.md` §3's `:442` is therefore stale, not wrong-when-written.

---

## 0. The correction this map makes to the inventory

`SECOND-SURFACE-INVENTORY.md` reasoned about the child row source from the tables I could see and named
`customer_members` as the likely candidate. **That was wrong, and the omission was total: the table the
production read path queries FIRST — `process_instances` — was not in the candidate list at all.**

Recording the error rather than quietly correcting it, because the reasoning that produced it is a trap worth
naming: "18 `customer_members` rows exist and 0 `opportunity_customer_members` rows exist" is a fact about
row counts that says nothing about which table is *authoritative*. The zero was not absence of children — it
was **a deleted writer**.

## 1. `family` grain — unambiguous

| Question | Answer |
|---|---|
| Authoritative source | `opportunities` |
| Row identity | `opportunities.id` |
| Subject identity | the opportunity (`subject_type: "case"`) |
| Org boundary | `opportunities.org_id`, direct; read is `.eq("org_id").eq("work_unit_id")` |
| Stage membership | `opportunities.stage_key` — its migration comment calls it "Membership owner for stage cohorts" |
| Status | `opportunities.status_key` |
| Parent relationship | `opportunities.customer_id → customers` (the household account) |
| Count semantics | `count_unit: "cases"` — one row per family case |
| Focus-panel subject | the opportunity (what ships today) |
| Command context | `entity_type: "opportunity"` |

## 2. `child` grain — the canonical source is `process_instances`

**Three candidates exist in the repo and they were canonical in this order.** The contradiction is *dated*,
not arbitrary:

| Era | Source | Status |
|---|---|---|
| 1 — legacy | `opportunity_customer_members` (OCM) | **demoted**; Create Lead's writer deleted |
| 2 — **current runtime** | **`process_instances`** where `process_key='enrollment'` | **read FIRST in production** |
| 3 — post-decision | `child_enrollment_agreements` + `child_placements` | durable operational contract, created only on the `enrolled` outcome |

`process_instances`' own migration comment settles the intent: *"Runtime owner of child participation for
Enrollment (**replaces opportunity_customer_members**)."*

| Question | Answer |
|---|---|
| Authoritative source | `process_instances` (`process_key='enrollment'`, `subject_type='child'`) |
| Row identity | **synthetic + currently mislabelled** — `ocmrow:<opportunityId>:<id>`, where `<id>` is a `process_instances.id` for any child created since the OCM write was removed. See §4. |
| Subject identity | `subject_id → customer_members.id` — the durable child, stable across leads and across the OCM→PI migration |
| Org boundary | `process_instances.org_id NOT NULL`, RLS org-scoped via `has_org_role`. **But `subject_id`/`context_id` have NO FKs and no same-org trigger** — see §5 |
| Stage membership | **a rule, not a column:** `effective_stage = process_instances.stage_key ?? opportunities.stage_key` |
| Status | `process_instances.state` (`null\|waitlisted\|enrolling\|enrolled\|withdrawn\|not_enrolling`). The operator is shown the **process stage**, not this. |
| Parent relationship | `context_id → opportunities.id` (application-enforced); household via `customer_members.customer_id → customers` (the only FK-guaranteed path) |
| Count semantics | `count_unit: "enrollment_tracks"` — one per *(child, lead)* journey, not per distinct child. Unique on `(org_id, process_key, subject_id, context_id)`. |
| Focus-panel subject | **today: the family case.** The child rides as `active_subject`; `drawer_open` targets `entity_type: "opportunities"`. This is what R2 must change. |
| Command context | **contradictory** — the capability registry says `"child"` for assignment/relationship commands and `"opportunity_customer_member"` for enrollment-state commands, while `PlatformActionGrain` is a closed union of `"opportunity" \| "opportunity_customer_member"` with **no `child` member**. |

**`candidate` grain is a different thing and must not be conflated:** `placement_candidates` is child ×
cohort. One child in two cohorts is two rows, which is why its `count_unit` is `"candidates"`.

### Ruled out, with reasons

- **`customer_members`** — child **identity / household roster**. No `opportunity_id`, no `stage_key`, no
  process link. A child on two leads is still one row. Its `status_key` is a **dead column** with a dedicated
  test enforcing that nothing reads it.
- **`persons`** — deeper identity; `customer_members.person_id` is nullable, so a child can exist with no
  person row. No opportunity/process linkage at all.
- **`customers`** — the household account, one level *above* the family case.
- **`child_enrollment_agreements` / `child_placements`** — post-decision durable contracts with an
  operational vocabulary (`pending_start|active|ending|ended|canceled`), not a pipeline vocabulary. Cannot
  source pre-decision lanes.

## 3. THE ANSWER THAT MATTERS FOR PHASE 4 — a child row needs no placement or schedule

**Minimum viable child row = a `customer_members` row + a `process_instances` row whose `context_id` is an
in-scope opportunity. Nothing else.**

Create Lead writes exactly that — `stage_key: null`, `state: null` — and the effective-stage rule then places
the child in its household's lane. The query deliberately fetches null-stage instances
(`.or("stage_key.eq.<lane>,stage_key.is.null")`) to make this work. Placement, schedule and agreement are all
strictly downstream of the `enrolled` outcome.

### Measured on the certified tenant (Firefly)

**11 enrollment process instances, every one `subject_type=child`, every one `stage_key=NULL`, `state=NULL`:**

```
Lennon Kurzman · Wrigley Kurzman  → Kurzman Family      Jarek Wenc · Blake Wenc → Wenc Family
Kai Almead · Rayia Almead         → Ravi Almead         Robbie Digan · Zara Digan → Digan Family
Ember Fitz → Brian Fitz    Jaxon Lyons → Alex Lyons     Billie Champan → Jenn Chapmap
```

All 7 opportunities are in stage `lead`, so **all 11 children currently ride `lead`**.

**Consequence, and it is the honest one:** Registration and Waitlist filter to `enrolling`/`enrolled`/
`waitlist`, which no child and no opportunity holds. They are **authoritatively empty**. After R1/R2 they
will still be empty — but empty *because the child provider ran and found nobody*, rather than because the
answer queried the wrong table. That difference is invisible on screen and provable structurally, which is
exactly the distinction Phase 4 requires ("do not treat provider absence as empty").

## 4. Row identity is mislabelled today (recorded, not yet fixed)

`enrollmentOffersChildQueueRowId(opportunityId, id)` builds `ocmrow:<opp>:<id>`, and the same value is
assigned to a field literally named `opportunity_customer_member_id`. Since the Create Lead OCM write was
removed, that value is a **`process_instances.id`**. Nothing on the row distinguishes the two vintages. The
honest field `_process_instance_id` exists and currently has **zero non-test consumers**.

This matters for R2: `subject_id` must become something a consumer can trust. `customer_members.id` is the
only identifier stable across leads, across the OCM→PI migration, and across materialization — and it is
already present on the row as `customer_member_id`, merely never used as the subject.

## 5. Risks carried into implementation

1. **`process_instances` has no FKs on `subject_id`/`context_id` and no same-org trigger** (OCM had both).
   Tenant and work-unit correctness for child rows is enforced **only in application code**, which re-queries
   `opportunities` scoped by org + work unit and drops non-matches. **Treat that scoping as load-bearing:
   any child provider must preserve it.**
2. **`opportunity_customer_members` RLS is role-gated but NOT tenant-gated** — its policy has no `org_id`
   predicate, unlike every other table in this map. Zero rows today and no Create Lead writer, but the admin
   API still writes it. **Reported separately; not touched by this sprint.**
3. **The child-grain queue read silently degrades to the family path on any error** — a failing child read
   surfaces as family rows rather than as an error. Directly contrary to "no silent fallback to `case`", so
   R1 must not inherit it.
4. **Template default and tenant config disagree on `decision`** (template says `case`, Firefly says
   `child`). The tenant wins at runtime — correct, but worth knowing before reading either as authoritative.
5. **Three incompatible `count_unit` unions coexist**, and the narrowest (`WorkUnitQueueCountUnit`) cannot
   represent `enrollment_track(s)` at all.
6. **A migration is recorded as both applied and not applied** (`20260714000000` — header says "NOT
   APPLIED", a closeout doc lists it as applied to staging). Unresolved; flagged.

## 6. What already exists, and therefore what R1 actually is

`QueueService` → `ocmEnrollmentTrackQueueBuilder` → `queryEnrollmentProcessInstanceTrackRows` **already reads
`process_instances` first in production**; the OCM path is the fallback and its flag defaults **off**. Row-context
selection is not flag-gated either — it sniffs row shape (`ocmrow:`/`pcrow:` or a declared grain).

So **R1 is not "write a child provider from scratch"** — it is "make the provisioning answer resolve its row
source from the grain it already computes, and route the child grain to the provider that already exists."
The provisioning answer computes `grain` and then uses it for exactly two things: the `grain_ambiguous`
refusal, and a passthrough label on the answer. It never reaches the record source.

## 7. The ordering constraint R1 must respect (and the reason it is not a problem)

The `opportunities` read is deliberately kicked off **before** configuration, with a comment stating the
invariant R1 appears to break:

> "the operational records depend ONLY on `work_unit.id` (available now), **not on configuration** … Kick the
> fetch off here so it overlaps that whole independent branch."

Grain comes from configuration (the active lens's stages), so a grain-dependent row source seems to force
config → records serialization, putting the whole config branch on the cold critical path.

**It does not, because the child path needs the opportunity set anyway.** `process_instances` has **no
`work_unit_id` and no FK to `opportunities`** — work-unit scoping for child rows is done by resolving the
in-scope opportunity ids and dropping non-matches. So the early read is not wasted work on the child path;
it is a **required input** to it.

Shape that follows:
- keep the early `opportunities` read unchanged;
- **family** grain → those rows *are* the rows (unchanged, zero added latency);
- **child** grain → those rows are the **scope**, and one dependent read of `process_instances` filtered by
  `context_id ∈ <in-scope opportunity ids>` plus the effective-stage rule follows the grain resolution.

**A distinction the structural proof must state precisely.** The certification requires that "child grain
never queries the family/opportunity row provider". Reading `opportunities` to establish tenant + work-unit
**scope** is not the same as sourcing **rows** from it — and the data model leaves no alternative, since a
process instance cannot be scoped to a work unit on its own. The provable invariant is therefore about
output, not about which tables are touched: **on a child-grain answer, no row's identity or subject may be an
opportunity id.** That is checkable, and it is the property that actually matters.
