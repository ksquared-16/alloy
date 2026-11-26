---
owner: platform
status: superseded
last_reviewed: 2026-10-22
supersedes: []
superseded_by: docs/platform/planning/assignments-spaces-v7-master-plan.md
---

# Option C v2 — Enrollment Commitment & Scheduled Participation

> **Superseded** by [`assignments-spaces-v7-master-plan.md`](assignments-spaces-v7-master-plan.md) (Director V7 decision, 2026-10-22) wherever they conflict — notably homeroom is derived from space use, operators no longer choose Primary/Secondary, and pricing never decides homeroom. Kept as planning history.
Evidence base: staging `8bb731ea` (V6-B deployed); the deployed-database census of 2026-10-22
(`certification/census/option-c-space-and-assignment-shape.sql`); a read-only mounted pass over the
Rooms and Assignment Categories configuration UI. This version replaces the 2026-10-20 packet, whose
"Phase 0 gaps" (atomic secondary replacement, room-under-site) shipped in #1538 and whose model
predates the V6 findings.

---

## 1. Current as-built model

| Concept | Where it lives | Cardinality / rule |
|---|---|---|
| Enrollment commitment | `child_enrollment_agreements` | one operational agreement per child per site (`ux_child_enrollment_agreements_one_operational_per_member_site`); no program or service column |
| Enrollment line (commercial subject) | `opportunity_customer_members` (OCM) | one per child per opportunity; pricing terms key on it |
| Home classroom / program | `child_placements` | one live placement per agreement; room must be an `operational_group` (trigger) |
| Scheduled participation | `schedule_assignments` | many per agreement; **at most one live child primary** (`ux_schedule_assignments_one_operational_primary_child`) |
| Hours | `assignment_weekday_intervals` | **several non-overlapping intervals per weekday per assignment** (unique `(assignment, weekday, start_time)` + GiST no-overlap) — a same-day split schedule fits ONE assignment |
| Recurrence template | `schedule_patterns` (site-owned) | shared by many assignments; editing never reaches existing hours |
| Assignment category | `operational_assignment_types` | typed participation columns + `default_behavior` JSON |
| Program | `location_program_categories` (site-scoped) | a room lists supported programs in `metadata.supported_program_keys` |
| Offering | `program_offerings` | unique `(org, program_key, attendance_type)`; attendance types include `before_school`, `after_school`, `custom` |
| Price | `program_offering_variants` → `commercial_tuition_rates` | variant by quantity (days/hours/sessions) |
| Agreed price | `enrollment_pricing_terms` | `term_kind = 'tuition'` only; **one live term per (OCM, term_kind, effective_start)**; already stores `offering_id`, `variant_id` |
| Tuition obligation | `generateTuitionCharges` (from accepted terms) | one recurring charge stream per live term |
| Other charges | `financial_charge_templates` via the consumption pipeline | triggers manual / event / attendance / schedule; not scoped by category |
| Add-ons | `commercial_addons` | configuration only — **no billing consumer found** |
| Space type | `locations.unit_role` | fixed CHECK: `operational_group` · `physical_space` · `shared_space`; NULL reads as `operational_group` |

**What `is_primary` does today (V6-B):** it is the enrollment's *base schedule* — the one row the
canonical reader returns, tuition prices from (`assignmentPricingFacts`), the draft-charge basis
uses, expected attendance / occupancy / staffing / rosters read, the primary-change primitive
(`apply_participation_operational_change`) supersedes, materialization and `/api/v1` POST create,
and `setPrimaryOperationalAssignment` mirrors into the placement. Its display uses ("Primary room",
ordering, archive guard) sit on top. It is **not** a statement that a child has one home: nothing in
the database requires an enrolled child to have one, and a staff primary means only site authority.

**Category fields — authoritative vs display** (measured):

| Field | Server effect today |
|---|---|
| `subject_types` | enforced (DB trigger: category belongs to org, supports subject) |
| `staffing_participation` (column) | read by staff supply |
| `attendance_participation` (column) | **display only** |
| `billing_participation` (column) | **display only** |
| `behavior.billingExpectation` | display only; Studio writes it back to `billing_participation` on save |
| `behavior.primaryEligible` | display only — never consulted; seeded Primary Classroom shows "Primary: Not eligible" while all 5 live staging primaries carry **no** category |
| `behavior.allowsOverlap` | Studio checkbox only |
| `behavior.roomRequirement`, `eligibleSpaceMode`, `eligibleRoomIds` | UI pickers only (editor, roster) — the server enforces only room-under-site |
| `behavior.programRequirement`, `locationIds` | UI only |

**The financial conflict.** Seeded `primary_classroom` has `billing_participation = eligible` (seed
migration) and `default_behavior = {}`, which reads as `billingExpectation = none`
("No financial relationship" in the Studio). Neither value drives billing; they disagree because the
seed wrote the column and never the behavior.

**Spaces on staging (main tenant):** 12 operational groups (5 active), 8 physical spaces (2 active),
1 shared space, 13 legacy NULL (read as operational group). The Rooms UI offers only **Operational**
and **Physical**; `shared_space` can no longer be chosen. Assignment pickers offer operational groups
only (`assignableClassrooms`); the service accepts any room under the site for a child secondary.

## 2. Confirmed gaps

1. **Commitment granularity.** One live tuition term per child per date; a separately priced second
   service (Before Care priced apart from School Age) has nowhere to be agreed.
2. **No link from a session to what funds it.** An assignment carries `program_category_id` and a
   category, never the offering or term it is delivered under.
3. **Single-session expectations.** Expected attendance, occupancy, capacity and staffing read only
   the base schedule (deterministically since V6-B); every other session is invisible to them, and
   their room is the placement's, not the session's.
4. **Category settings are advisory.** Space/room/program rules are UI-only; participation columns
   other than staffing are display-only; the financial setting is duplicated and contradictory.
5. **Shared spaces are unreachable** for children (the UI cannot set the type; pickers exclude it).
6. **Primary means two things.** The base schedule (real, load-bearing) and a "home classroom"
   implication (false for BC+AC-only children, where the operator must pick one arbitrarily).

## 3. Recommended target model

**Principle: commitment and participation are separate, and both already exist.**

```
Enrollment agreement ─┬─ Placement (home cohort, optional room)            — unchanged
                      ├─ Accepted terms   (what is agreed and priced; per OFFERING)
                      └─ Assignments      (when/where participation is expected; per SESSION)
                              └─ category = purpose + participation policy
                              └─ offering it is delivered under (optional)
```

1. **Commitment = agreement + accepted terms, one live term per offering.** Widen the existing
   uniqueness from `(OCM, term_kind, effective_start)` to `(OCM, term_kind, offering_id,
   effective_start)`. `offering_id` already exists on the term. A bundle (one price for Before &
   After) is one offering; separate prices are separate offerings. No new resolver, generator or
   payment path: `generateTuitionCharges` already iterates live terms.
2. **Session → offering link.** Add nullable `schedule_assignments.program_offering_id`: the
   offering a session is delivered under. Null = included / not separately priced (enrichment
   included in tuition, transportation, therapy). A session with no offering creates no charge.
3. **Category = purpose + participation policy.** Purpose (label, icon, subject types) plus the
   three typed participation columns as the ONLY participation authority. `billingExpectation` is
   folded into `billing_participation`; `primaryEligible` is retired (Primary is not a category
   property — D2); `allowsOverlap` becomes the pull-out rule in §5.
4. **`is_primary` keeps exactly its V6-B role** — the enrollment's base schedule and placement
   mirror — through the transition. It is renamed in the UI ("Enrolled schedule"), never inferred
   from category, never required to be a classroom, and is retired only after set-aware readers are
   certified (§9).
5. **Space type stays the three-value classification.** Children's sessions may use a `shared_space`
   or `physical_space` when the session's category allows it; placement, staff rooms, licensing
   capacity and ratios stay on `operational_group` only.

## 4. Alternatives and rejected approaches

| Approach | Verdict |
|---|---|
| A. Keep Primary/Secondary, configuration-driven pickers only | **Insufficient**: cannot price BC and AC separately, cannot count sessions in their own rooms |
| B. Equal assignments, `is_primary` reinterpreted as "home" now | **Rejected now**: breaks the unique index's purpose, the primary RPC, materialization, `/api/v1` semantics, pricing and the V6-B readers in one step |
| C-full. New `enrollment_services` / commitment-line table | **Rejected**: duplicates accepted terms + offerings, which already express "what is agreed" |
| Category as room type ("Before Care room") | **Rejected**: conflates purpose with space; one gym serves enrichment and after care |
| Invent a classroom/primary for BC+AC-only children | **Rejected** (Director requirement); same-room BC+AC is one assignment with split intervals |
| **C-minimal (recommended)** | terms per offering + session→offering link + category participation authority + set-aware readers, staged |

## 5. ECE scenario coverage (target)

| Scenario | Model |
|---|---|
| School Age + Before Care | Base assignment School Age (Mon–Fri 15:00–18:00); Before Care assignment (category Before Care, eligible shared/any space, 07:00–08:30). Bundled → one School Age term; separate → a second term on the Before Care offering |
| Before Care + After Care only, same room | **One** assignment, offering School Age · `custom` "Before & After", intervals 07:00–08:30 and 15:00–18:00 each weekday. One term. No invented classroom (placement room optional) |
| Before Care + After Care only, separate rooms or prices | Two assignments on `before_school` / `after_school` offerings; two terms if priced apart, one bundle offering if not. The base schedule (`is_primary`) is whichever carries the bundle / first term — a pricing anchor, not a home |
| Preschool + Soccer Shots | Base Preschool assignment; Enrichment assignment in the gym (shared space), Tue 10:00–10:45, `allowsOverlap` (pull-out). Included → no offering; extra → its own offering/term |
| Several schedules in one program | Different hours per weekday on one assignment; different date ranges are effective-dated successors |
| Several distinct offerings | One term per offering (widened uniqueness) |
| Shared spaces | Session room may be `shared_space` / `physical_space` per category; occupancy counted in that space for the interval |
| Sessions with no charge | Session with no offering, or category `billing_participation = none` |

**Multi-session expectations (target):** an expected-attendance entry per *(child, session, date,
interval)* for sessions whose category `attendance_participation = expected`; room = session room ??
placement room. Derived measures:
- **unique children per day** — distinct children with ≥1 entry (the headline "expected today");
- **per-space occupancy per time bucket** — distinct children whose interval covers the bucket;
- **pull-out precedence** — during an `allowsOverlap` session the child counts in the pull-out space
  and not in the base room (never twice);
- **staffing demand / capacity** — from per-space peak concurrent occupancy; licensing ratios stay
  per operational group;
- **actual attendance unchanged** — check-in/out stays per child per day; room capture is separate.

Until the replacement is certified, V6-B's base-schedule-only behaviour stays exactly as deployed.

## 6. Director decisions

| # | Decision | Recommendation | Approve / Reject / Revise |
|---|---|---|---|
| D1 | Commitment = agreement + accepted terms, **one live term per offering** (widen the term uniqueness) | Approve | |
| D2 | `is_primary` = enrollment base schedule only; UI calls it "Enrolled schedule"; `primaryEligible` retired | Approve | |
| D3 | Nullable `schedule_assignments.program_offering_id` (session → offering) | Approve | |
| D4 | Category participation columns are the sole authority; `billingExpectation` folded into `billing_participation`; Studio reads/writes the columns | Approve | |
| D5 | Server-side enforcement of category room requirement / space mode / allowed rooms (service level, new writes only) | Approve | |
| D6 | Children's sessions may use `shared_space` / `physical_space` when the category allows; restore "Shared" in Rooms | Approve | |
| D7 | Set-aware expectations per §5 (unique children, per-space buckets, pull-out precedence) | Approve design; implement after D1–D6 | |
| D8 | BC+AC in one room = one assignment with split intervals (no invented classroom) | Approve | |
| D9 | Operator noun: **"Schedule"** for the per-session object ("Add schedule"); "Assignment" stays internal | Approve | |
| D10 | The 5 category-null staging primaries: read-time default "Enrolled program", **no backfill** | Approve | |
| D11 | Secondary/staff change-event parity: separate workstream owned by operations-temporal + integrations; prerequisite for exposing D7 externally | Approve as dependency | |

## 7. Proposed schema / configuration changes

| Change | Kind | Trigger |
|---|---|---|
| `enrollment_pricing_terms` unique → `(org, OCM, term_kind, offering_id, effective_start) WHERE superseded_at IS NULL` | migration (index swap) | financials recertification |
| `schedule_assignments.program_offering_id uuid NULL REFERENCES program_offerings` | migration (additive column) | `ops.temporal-table-migration` full recertification |
| `operational_assignment_types`: no column change; behavior keys `billingExpectation`, `primaryEligible` retired in code | code + Studio | none |
| `locations.unit_role`: no change; "Shared" option restored in the Rooms UI | UI | none |
| Category enforcement in `createOperationalAssignment` and the roster path | code | writer census unchanged (no new writer) |

No other table, resolver, obligation writer or payment path.

## 8. Commercial and attendance implications

- **One program, several sessions** — one offering/term; sessions reference it; one charge stream.
- **BC + AC bundled** — `custom` offering "Before & After"; one term.
- **BC + AC separate** — two offerings, two terms, two charge streams (existing generator).
- **Optional enrichment** — its own offering/term when priced; none when included.
- **Uncharged sessions** — no offering; `billing_participation = none`.
- Pricing facts for a term come from the sessions delivered under its offering (days from the union
  of their weekdays) — replacing "days from the base schedule" only when D1/D3 ship; until then the
  V6-A primary-days rule stands.
- Attendance / occupancy / staffing change only with D7 and only behind its certification.

## 9. Compatibility strategy

1. **`is_primary` contract (unchanged until D7 is certified):** one live base schedule per agreement;
   the primary RPC, materialization, `/api/v1` POST/change, placement sync and the V6 readers keep
   using it. New sessions are never primary.
2. **External API:** `/api/v1/schedule-assignments` keeps `is_primary` with its current meaning;
   `assignment_type_key` and `program_offering_id` are added as additive fields only after D11.
3. **Historical integrity:** no backfill of offerings, categories, terms or attendance; a null offering
   means "priced under the agreement's existing term" for all history.
4. **Rollout:** one PR per slice; the term-uniqueness widening is backward compatible (existing data
   has ≤1 live term per OCM/date). **Rollback:** dropping the new nullable column or restoring the
   narrower index is possible only while no second live term exists — the slice that first writes a
   second term is the one-way door.

## 10. Minimal implementation roadmap

| Slice | Operator outcome | Lane | Schema | Gates / certification | Approval |
|---|---|---|---|---|---|
| **C1 Category authority** | Studio and pickers read the participation columns; `billingExpectation` / `primaryEligible` retired; server enforces room/space rules; "Shared" restored | enrollment-placement (+configuration) | none | unit + live create/replace with refused rooms; mounted Studio + editor | D2, D4, D5, D6 |
| **C2 Schedule UX** | "Add schedule": program/service → category → eligible space → days/hours (split intervals) → pricing review | enrollment-placement (UI) | none | mounted editor flows for every §5 scenario on a preview | D8, D9 |
| **C3 Terms per offering** | separately priced services and bundles | commercial + financials | index swap | live accept / override / generate per offering; no duplicate charge; financial recert | D1 |
| **C4 Session → offering** | sessions know what funds them; pricing facts from their sessions | enrollment-placement + commercial | additive column | full temporal recert; V6-A/B live suites | D3 |
| **C5 Set-aware expectations** | sessions counted in their own spaces; unique-child and per-space counts | operations-temporal (+staffing, capacity) | none | live multi-session suites; mounted roster/attendance; recert of expectations, capacity, staffing | D7, after D11 |
| **E Event parity** | secondary/staff change events | operations-temporal + integrations | event contract | contract + consumer tests | D11 |
| **Last** | full Focus Panel certification | surfaces | — | mounted | — |

Code reused throughout: `createOperationalAssignment`, `replace_secondary_schedule_assignment`,
`assignment_weekday_intervals`, offerings/variants/rates, `acceptEnrollmentPricingTerm`,
`generateTuitionCharges`, `loadOperationalExpectationInputs`. Removed: the `primaryEligible` and
`billingExpectation` behavior keys; `assignableClassrooms` as the only child-session room filter.

## 11. Risk and certification matrix

| Slice | Main risk | Certification |
|---|---|---|
| C1 | refusing rooms operators already use | census of existing rows against category rules before enforcing; enforce for new writes only |
| C2 | regression in the V2–V6 editor flows | existing deployed Assignments cert steps + new scenario steps |
| C3 | duplicate tuition charges | live: two terms ⇒ two streams, retry idempotent, override rules intact |
| C4 | temporal-table migration | `ops.temporal-table-migration` full recert; writer census; atomicity suites |
| C5 | occupancy / ratio numbers change | side-by-side old/new on the certification stack; mounted roster and attendance |
| E | external consumers | contract tests; staged exposure |

## 12. Recommended first slice

**C1 — Category authority**, no schema. It removes the contradictory financial setting and the
unenforced room rules that every later slice depends on, makes shared spaces usable, and changes no
pricing, attendance or `is_primary` behaviour. Approval needed: D2, D4, D5, D6.
