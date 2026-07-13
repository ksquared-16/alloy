---
owner: platform
status: proposed
last_reviewed: 2026-07-13
supersedes: []
---

# RFC — Location Operational Domain Convergence

**Status:** PROPOSED architecture (design). Governs convergence of Location · Program · Room · Capacity · Ratio · Timezone into one canonical operational domain. **Phase A (Canonical Contracts) is implemented** — see the "Implementation-proven facts" note below and the [Phase A plan §16](location-operational-domain-phase-a-implementation-plan.md); the design itself is unchanged.
**Base:** `origin/staging` @ `d3b11923f87b3f174dbf713148f93c64c8b6cc76` (2026-07-13; advanced 7 commits past the certification-audit base `25bc25c7e` — PR #183, Current-Work/Process-Builder QA only; **no** Location/Program/Room/Capacity/Ratio/Timezone files touched, so audit findings hold).
**Predecessor evidence (treated as proposals, not decisions):**
[`../../audits/active/location-operational-platform-certification-2026-07.md`](../../audits/active/location-operational-platform-certification-2026-07.md) (spatial/acquisition axis) and [`operational-expansion-phase1.md`](operational-expansion-phase1.md) / [`../../audits/active/operational-expansion-architecture-audit-2026-07.md`](../../audits/active/operational-expansion-architecture-audit-2026-07.md) (truth-flow spine).
**Reconciled doctrine:** `core/configuration-ownership-and-inheritance.md`, `core/placement-system.md`, `modules/configuration-platform.md`, `modules/actions-and-workflows.md`, `core/navigation-and-workspace-doctrine.md`, `core/operational-truth-flow-doctrine.md`, `core/entity-model.md`.

> **One-line thesis.** Alloy already contains the operational primitives of a location platform; this RFC converges them into **one** canonical domain — one Location scope root, one Program identity, one Room projection, one Capacity/Ratio resolver, one Location timezone, one configuration experience, one resolution path, one migration path — **by extension, not replacement.** Nothing here proposes a new rooms table, a fifth program model, a second capacity engine, a second scheduling substrate, or a static waitlist.

> **Implementation-proven facts (Phase A, on `origin/staging` `7f8c545e8`).** The following design claims are now proven in code (contracts only — no schema, no consumer migration): (a) Program identity is reachable through a provider over the `program_key` vocabulary with **no `programs` table**; (b) Room is a projection over `unit` Locations with **no rooms table**; (c) ratios are stepped tiers with a `most_restrictive` mixed-age policy and an extensible policy contract; (d) **regulatory (licensing) limits are a binding ceiling that overrides may only tighten** (§9/§12) — enforced at resolution and authoring; (e) capacity returns a distinct-kinds result with an explicit `resolved/incomplete/not_configured/conflicted` status and `availableNow = binding − committed − offered`; (f) Location owns timezone via a source-tagged resolver that never silently falls back to UTC. Provider paths are catalogued in the [Phase A plan §16](location-operational-domain-phase-a-implementation-plan.md). The two ratified open decisions (§21: mixed-age policy, program-identity storage) are settled; the rest remain open. The design in §1–§23 is unchanged.

---

## 1. Executive decision

**Adopt Location as the canonical operational scope root, and converge every duplicate representation onto primitives that already exist.** Seven decisions:

1. **Location** is the **canonical scope / aggregate root**, not a wide table. Identity, code, address, timezone, and operating status live *on* `locations`; everything else (programs offered, rooms, hours, closures, capacity, ratios, branding, access, tour availability, placement config) is a **scoped, effective-dated record that references the location** — resolved through the one config ladder `org → site → program → room`.
2. **Program** has exactly one canonical **identity** = the org-level **`program_key` vocabulary** (canonicalize the existing `childcare_program_type` option set). `location_program_categories` is its **per-site availability + operational-scope layer**; `program_offerings`/`variants` is the **distinct Offering (attendance product) child**, not a duplicate; `program_room_cohort_key` is a **projection**. No fifth model.
3. **Room** stays a **typed Location node** (`location_type='unit'`, `parent_location_id` = site). The existing model is proven capable; do **not** create a `rooms` table. Converge room age-band/program-eligibility out of EAV into structured, scoped config.
4. **Capacity** is resolved by the **existing multi-dimensional engine** (`web/lib/childcareOperational/config/*`). Formalize one `resolveOperationalCapacity` contract that returns the **distinct** capacity kinds — never one ambiguous number. Add the missing **positive available-seats** derivation.
5. **Ratio** is modeled as **stepped tiers**, which **already exist natively** (`childcare_ratio_rule_tiers`). Confirm and harden; never reduce to a decimal. Mixed-age resolution is **`most_restrictive`** by default under an extensible policy contract; regulatory (`licensing`) rules are a **binding ceiling that overrides may only tighten** (§9, §12).
6. **Timezone** is owned by the **Location** (exactly one, IANA). Promote it from free-text `locations.metadata.timezone` to a first-class column with a canonical control; tours/schedules/availability **resolve through** it. Distinguish storage / viewer / recipient timezones.
7. **Settings.** **Configuration Runtime V1 remains the canonical Settings shell** (`ConfigurationModeLayout`), which Location Settings already uses. Fields and Locations must **converge on shared Settings interaction primitives**, with the successful **Fields-proven behaviors extracted into shared primitives** where they are not already shared (lifecycle, delete-safety, ownership/source visibility, invalid-reference handling, dirty-state protection, canonical control resolution). This is *not* forcing Location config into Field Platform storage, *not* cloning the `/settings/fields` page layout, and *not* replacing Configuration Runtime — it is raising Location Settings to the interaction quality Fields proved. Operational config stays in its **purpose-built tables** (§11).
8. **Program identity** = the canonical **`program_key` vocabulary** (existing `childcare_program_type` option set) exposed **only through a canonical Program provider** so consumers never query option-set internals — preserving the option to promote to a first-class `programs` entity later without a consumer rewrite. No new `programs` table this initiative (§6).

**Sequencing principle:** de-duplicate and contract-freeze **before** net-new build; make already-built value visible cheaply; add the four genuinely-missing primitives (closures, branding, transfer action, capacity-aware routing) last, each on an existing pattern. **Phase A is no longer gated by mixed-age policy or Program-identity storage — both are ratified here (§9, §6).**

---

## 2. Current staging SHA

`d3b11923f87b3f174dbf713148f93c64c8b6cc76`. Confirmed advanced past audit base `25bc25c7e` by 7 commits (PR #183). Domain delta check: `git diff 25bc25c7e..d3b11923f` touches only Current-Work / Process-Builder / lifecycle-stage-config files + one screenshot — **zero** Location/Program/Room/Capacity/Ratio/Timezone data-model files. Certification-audit findings revalidated below (§3) against latest code.

---

## 3. Relationship to the completed certification audit + revalidation

This RFC **builds on**, and does not rewrite, `location-operational-platform-certification-2026-07.md`. That audit's verdict — *"Alloy already IS an operational location platform; consolidate/connect, don't build"* — is confirmed. Findings revalidated first-hand at `d3b11923f`:

| Audit finding | Revalidation at `d3b11923f` | Status |
|---|---|---|
| `locations` is polymorphic `{address, site, unit}`; rooms = unit rows | `locations` CHECK unchanged; `validate_childcare_config_scope()` still enforces unit/site typing | **Confirmed** |
| Capacity/ratio engine mature (`childcareOperational/config/*`), pure, effective-dated | Full re-read of `resolveConfigRule.ts`/`ratioRules.ts`/`capacityRules.ts` (§8–9) | **Confirmed** |
| Ratio stepped tiers exist (`childcare_ratio_rule_tiers`) | `requiredStaffForChildren`/`ratioLimitedCapacity`/`maxChildrenForStaff` verified | **Confirmed** |
| Four "program" representations | Re-read `program_offerings` DDL — it is the **Offering child**, not a 4th Program (§6) | **Refined** |
| Timezone scattered; none on `locations` | `LocationSiteDetailPanel.tsx:35` stores `metadata.timezone` free-text | **Confirmed** |
| Config precedence room>program>site>org | `SCOPE_SPECIFICITY = {room:4,program:3,site:2,org:1}` (`resolveConfigRule.ts:25`) | **Confirmed** |
| Capacity engine headless (empty metric packs) | `metrics/packs.ts` capacity/attendance/staffing still `coming_soon` | **Confirmed** |
| Location Settings on shared shell, consumes ScopePicker + EffectiveDatedEditor | Verified in `LocationOperationalRulesPanel`, `ConfigRuleAuthoringGroup`, `RatioTierFields` | **Confirmed (stronger than audit stated)** |

**New precision this RFC adds** (from targeted verification): exact resolver precedence + three gaps (mixed-age room collapse, effective-start tie non-determinism, no positive available-seats); a fourth verified gap — regulatory (`licensing`) values can be weakened by a more-specific override today (§9/§12); the Program/Offering distinction; the Settings-shell reality (Locations already ~70% on the shared Configuration Runtime shell; `/settings/fields` uses a different shell but proved interaction behaviors that must be **extracted into shared primitives** — §11).

---

## 4. Canonical domain model

```
Organization (org_id — universal tenancy)
 └── Location  [locations, location_type='site']         ← CANONICAL SCOPE ROOT
      ├── identity · code · address · timezone · status   (on locations)
      ├── Rooms   [locations, location_type='unit']        ← typed child node
      ├── Program availability  [location_program_categories]  ← "offered here" + scope target
      │      ↳ references Program identity  [program_key vocabulary / childcare_program_type option set]
      │            ↳ Offering (attendance product) [program_offerings]
      │                  ↳ Variant (quantity) [program_offering_variants]
      │                        ↳ Tuition rate [commercial_tuition_rates.variant_id]
      ├── Operational config (scoped org→site→program→room, effective-dated):
      │      Capacity rules [childcare_capacity_rules]  (physical|licensed|operational)
      │      Ratio rules    [childcare_ratio_rules → childcare_ratio_rule_tiers]  (stepped)
      │      Hours          [childcare_operating_windows]
      │      Schedule rules [childcare_schedule_rules]  · Schedule patterns [schedule_patterns]
      │      Closures/Holidays  [NEW — same scoped/effective-dated family]
      ├── Tour availability [tour_availability_rules] → bookings [tour_bookings] → public links
      ├── Comm identity bindings [communication_identity_location_bindings]
      ├── Branding [NEW — per-location config, extends comm/location config]
      └── Access [user_site_access (N:N)]

DERIVED (never authored, never tabled — truth-flow Law 2):
   Expected/Actual Occupancy · Available Seats · Required-Staff Demand · Forecast

COMMITTED OPERATIONAL TRUTH (L2, effective-dated, supersede-not-patch):
   child_enrollment_agreements → child_placements (site/program/room) → schedule_assignments
WAITLIST GRAIN:  placement_candidates (+ overrides, link groups)
```

**Reading rule:** Location **owns the scope**; specialized records **own the values**; projections **own nothing** (they recompute). This is the single mental model every consumer follows.

---

## 5. Ownership matrix

"Owner" = system of record. Per `configuration-ownership-and-inheritance.md`, no surface recreates an object it does not own; it references with a deep link.

| Concept | System of record | Scope / inherits along | Kind | Notes |
|---|---|---|---|---|
| Location identity / name / code | `locations` | itself (org) | — | `location_number` = code |
| Address | `locations` (address1..country, lat/lng) | itself | value | |
| **Timezone** | **`locations.timezone` (promote from metadata)** | itself (site); org fallback | value | one per location; §10 |
| Operating status | `locations.status_key` / `is_active` | itself | value | |
| Public visibility | `locations` + `tour_public_booking_links` | itself | availability | public profile = extension |
| Programs offered | `location_program_categories` (availability) → `program_key` identity | org→site | **availability** | §6 |
| Rooms available | `locations` unit rows (`parent_location_id`) | site | — | §7 |
| Business hours | `childcare_operating_windows` | org→site→program→room | value | |
| **Closures / holidays** | **NEW table, same scoped/effective-dated family** | org→site(→program→room) | value | genuinely missing; §19 Phase C |
| Capacity | `childcare_capacity_rules` (physical/licensed/operational) | org→site→program→room ×age | value | §8 |
| Ratios | `childcare_ratio_rules` → `_tiers` | org→site→program→room ×age | value | §9 |
| Staffing constraints | derived (`requiredStaff`); supply = future (G3) | — | derived | not this RFC's build |
| Communication identity | `communication_identity_location_bindings` | platform→org→site | value+availability | |
| **Local branding overrides** | **NEW per-location config (extends identity/location)** | org→site | value | genuinely missing; §19 Phase C · open depth §21 |
| Operator access | `user_site_access` (N:N) + `user_department_access` (orthogonal) | org + site assignment | availability | |
| Public scheduling availability | `tour_availability_rules` | location (or org fallback) | value | converge scope shape §12 |
| Placement configuration scope | `metadata.placement_priority_v1` (dept→work-unit merge) + rules | org→work-unit | value | §13 |
| Program identity | **`program_key` vocabulary (`childcare_program_type` option set)** | org | identity | §6 |
| Offering (attendance product) | `program_offerings` → `program_offering_variants` | org ×program_key | value | §6 |
| Tuition | `commercial_tuition_rates.variant_id` (Commercial Config) | org→site→program→(room) | value | referenced, not owned by Location |
| Placement (committed) | `child_placements` (effective-dated) | per agreement | fact(L2) | supersede-not-patch |
| Waitlist candidacy | `placement_candidates` | per child×cohort | grain | §13 |
| Tours | `tour_bookings` / `tour_availability_rules` | location | — | §13 |
| Enrollment | `child_enrollment_agreements` | child×site | fact(L2) | |
| Attendance | `child_attendance_events` | site×room | fact(L4) | immutable |
| Reporting / metrics | metric scope filter + per-site snapshots | org\|site\|dept\|work_unit | value | location = filter dim |

---

## 6. Program convergence decision

**Canonical Program identity = the org-level `program_key` vocabulary.** Designate the existing **`childcare_program_type` option set** as that single namespace (it already backs opportunity `program_type`, inquiry-child select, and the location-metadata convergence — verified `20260430211000`, `20260610120000`, `20260529160000`). This is designation of an existing artifact, **not a fifth representation.**

Classification of the four representations the audit found:

| # | Representation | Verdict | Role in canonical model | Action |
|---|---|---|---|---|
| 1 | **`location_program_categories`** (`org,location,key`) | **Canonical availability + operational-scope layer** | "Program offered at this site" + the capacity/ratio/placement scope target (`program_category_id`) | Keep. Constrain `key` to the canonical vocabulary. This is what the "select Location → its Programs" rule resolves. |
| 2 | **`program_offerings` + `program_offering_variants`** | **Distinct concept — the Offering (attendance product), NOT a duplicate Program.** DDL states so: `Program → offering(type) → variant(quantity) → tuition`. | Sellable attendance configuration (Full/Part/Drop-In × days); tuition attaches to `variant_id` | Keep. **Harden `program_offerings.program_key`** from free text into a validated reference to the canonical vocabulary (the real drift point). |
| 3 | **`childcare_program_type` option set** (+ deprecated `classroom_age_group`) | **The canonical key vocabulary / identity source** | Backs #1's `key` and #2's `program_key` | Designate canonical. **Retire** `classroom_age_group` (migration source) via the dual-key resolver's fallback path. |
| 4 | **`placement_candidates.program_room_cohort_key`** (text) | **Projection / composite** (program + room) | Waitlist cohort grain | Keep as compat; migrate toward derived `(program_category_id, room_location_id)`; stop authoring loose strings. |

**User-facing rule satisfied:** *Select Location → resolve `location_program_categories` where `location_id = L and is_active` → those programs (and only those) appear.* Cross-location leakage is impossible because availability rows are per-site.

**DECISION CLOSED — Program identity storage (was open decision; now ratified; removed from Phase A gating).** For this initiative, **retain the `program_key` vocabulary backed by the `childcare_program_type` option set; do NOT create a `programs` table.** But **no consumer may depend on the option-set implementation directly** — all reads go through a **canonical Program provider** so the identity can later be promoted to a first-class entity without a consumer rewrite. This is the least-migration answer that still decouples identity from storage.

**Canonical Program provider contract** (home: `web/lib/programs/*` provider layer; Phase A). May currently read from the option-set identity + `location_program_categories` for per-location availability; consumers must never query option-set internals or `childcare_program_type` rows directly.

```ts
type CanonicalProgram = {
  key: string;              // program_key vocabulary
  label: string;
  description?: string;
  status: "active" | "inactive";
};

resolveProgramsForOrganization(orgId): CanonicalProgram[];        // identity catalog (org-level)
resolveProgramsForLocation(orgId, locationId): CanonicalProgram[]; // availability at a site (location_program_categories)
resolveProgramByKey(orgId, key): CanonicalProgram | null;         // single identity resolution
```

**The four layers, disambiguated (canonical language):**

```
Program identity          → canonical Program provider over the program_key vocabulary
Program availability at a  → location_program_categories (is_active per site)
  Location
Offering / attendance      → program_offerings → program_offering_variants
  product                     (a DISTINCT concept, not a duplicate Program)
Room/program cohort        → derived projection (program_category_id + room_location_id)
```

**Ownership-shift note (informational, `configuration-ownership-and-inheritance.md` §3):** Program *identity* is org-level; *availability* is per-site. Because the canonical provider now hides storage, promoting identity to a first-class `programs` table later is an internal provider change, not a consumer migration — so it is **explicitly out of scope for this initiative and no longer an open decision.**

**Program facet ownership:** identity/label/code → vocabulary + `location_program_categories.label`; age eligibility → `age_group_key` on scoped rules (converge from EAV, §7); operating schedule → `childcare_schedule_rules` + `schedule_patterns`; eligible rooms → resolved via room age/program config; enrollment availability → `location_program_categories.is_active`; pricing → offering→variant→tuition; capacity participation → `program_category_id` scope on capacity/ratio rules; forms/documents → generic (program-scoped is future); placement rules → placement config scoped by program.

---

## 7. Room convergence decision

**Room remains a typed Location node — `locations` where `location_type='unit'`, `parent_location_id` = site.** The existing model is **proven structurally capable**: unit rows already anchor capacity (`room_location_id` scope), ratios, operating windows, schedule rules, committed placement (`child_placements.room_location_id`), and attendance (`child_attendance_events` incl. `room_transfer`). Per the non-goals in §20, a new `rooms` table is **rejected** — no behavior requires it.

**"Room" is a canonical platform concept *projected* from the Location hierarchy**, exposed through one resolver `resolveRoomsForLocation(locationId)` (today: `web/lib/admin/location/*` + `adminV2/locationsHierarchyTablePresentation.ts` `isRoom = type==='unit'`). All consumers use that resolver; none re-query `location_type='unit'` ad hoc.

**Convergence required — retire the EAV duplication.** Room capacity/ratio/age-band/program-eligibility are currently written **both** to `locations.metadata` (via `LocationRoomDetailPanel`) **and** to the `childcare_*` config tables (audit finding; `20260529160000`). Decision: **the `childcare_*` scoped config tables are the sole owner of operational values; `locations.metadata` room fields become read-through/deprecated.**

**Room facet ownership:** identity/parent → `locations`; licensing capacity → `childcare_capacity_rules capacity_kind='licensed'`; physical capacity → `capacity_kind='physical'`; configured operating capacity → `capacity_kind='operational'`; age eligibility → room-scoped `age_group_key` (promote from `classroom_age_group` EAV to a structured room attribute — storage shape is open decision §21-5); program eligibility → room↔program config; active/inactive → `locations.is_active`; schedule availability → operating windows + schedule patterns; staffing assignments → future (G3, not this RFC); capacity limits → capacity rules; ratio rules → ratio rules + tiers. *(age-band storage shape — typed column vs room-scoped config row — is open decision §21-5, a Phase B implementation choice.)*

**Known limitation to resolve (§9):** the current resolver collapses a physically **mixed-age** room to a single age group (first placement wins, `roomConfigResolvers.ts:59-65`). This is a Room+Ratio modeling decision, not a table problem — see §9.

---

## 8. Capacity model

**Do not build a second engine.** The engine exists (`web/lib/childcareOperational/config/*`, pure, effective-dated, verified §3). This RFC **formalizes its contract** and forbids UI-side re-derivation.

**Distinct capacity concepts (never one number):**

| Concept | Source today | Definition |
|---|---|---|
| **Licensed capacity** | `childcare_capacity_rules capacity_kind='licensed'` | Regulatory ceiling |
| **Physical capacity** | `capacity_kind='physical'` | Room square/bed limit |
| **Configured operating capacity** | `capacity_kind='operational'` | Operator-chosen working limit |
| **Ratio-constrained capacity** | `ratioLimitedCapacity(tiers)` = max tier `max_children` | Ceiling any staffing permits |
| **Staffed capacity** | **not built (G3)** — `staffOnHand` placeholder | Requires staff-supply facts; out of scope |
| **Binding capacity** | `min(physical, licensed, operational, ratioConstrained)` over non-null (`capacityRules.ts:52`) | The effective limit |
| **Committed occupancy** | expected occupancy from `child_placements` | Enrolled seats |
| **Offered occupancy** | placement offers (future, §13) | Offered-not-accepted |
| **Attended occupancy** | `child_attendance_events` actual | Present today |
| **Available seats** | **NOT COMPUTED today** — only over-capacity boolean | `max(0, binding − occupancy)` — **add** |
| **Forecasted availability** | schedule-expansion projection (partial) | Future openings |

**Canonical resolver contract (`resolveOperationalCapacity`)** — formalize over the existing functions; home = `web/lib/childcareOperational/` (Capacity subsystem). Consumed by Placement, Tours, Waitlist, Processing, metrics — **one resolver, no per-UI math.**

```ts
type CapacityResolutionStatus =
  | "resolved"       // binding computed from ≥1 authored rule; occupancy known
  | "incomplete"     // relevant inputs partially missing (e.g. unknown child age group, missing occupancy)
  | "not_configured" // no applicable capacity/ratio rule at any scope for this context
  | "conflicted";    // contradictory rules that cannot be reconciled (e.g. same-scope duplicate before tiebreak, or a mixed-age set with no safe binding)

resolveOperationalCapacity({
  orgId, locationId, programId?, roomId?, ageGroupKey?, ageGroupContext?, scheduleId?,
  effectiveAt /* YYYY-MM-DD */, occupancyContext /* committed/offered/attended */, staffingContext?,
  mixedAgePolicy /* default "most_restrictive" */,
}) => {
  status,            // CapacityResolutionStatus — NEVER silently 0 or unlimited
  licensedCapacity, physicalCapacity, configuredCapacity, ratioConstrainedCapacity,
  staffedCapacity /* null until G3 */, bindingCapacity,
  committedOccupancy, offeredOccupancy, attendedOccupancy,
  availableNow /* max(0, binding − committed) when status="resolved"; else null */, forecastedAvailability,
  limitingFactor /* which kind/rule set the binding */,
  appliedRules /* every rule CONSIDERED + which is binding — explainability */,
  warnings /* e.g. unknown_age_group, missing_occupancy, licensing_absent, mixed_age_unreconciled */,
}
```

- **Inputs authoritative:** scoped rules (most-specific-wins), effective date, occupancy read models, canonical Location/Program/Room resolution (never ad-hoc `location_type='unit'` queries).
- **Precedence:** §12 (room>program>site>org; age-specific>null; latest effective_start; +deterministic `id` tiebreak). Regulatory (`licensing`) handling per §12.
- **Mixed-age:** apply `mixedAgePolicy` (§9); `most_restrictive` is the default and the only Phase-A-supported policy.
- **Incomplete-data semantics (safe, not optimistic):** unknown data is **never** treated as `0` (falsely no-capacity) **nor** unlimited (falsely available). Instead: a null *kind* is excluded from the `min` (a genuinely absent constraint), but a null *required input* (unknown child age group, missing occupancy) yields `status:"incomplete"` with `availableNow:null` and a `warnings[]` entry. No applicable rule at all ⇒ `status:"not_configured"`. Unreconcilable rules ⇒ `status:"conflicted"`. Consumers (Placement/Tours/UI) must branch on `status` and must not coerce a non-`resolved` result into a number.
- **Explainability:** `limitingFactor` + `appliedRules` (all considered, one binding) so the UI can say *"Room binding 11 — limited by 2:11 ratio (effective Sep 1); licensing 15, physical 14 also considered."*
- **Caching:** projections may be **marked recomputable caches only** (truth-flow Law 2); no authoritative capacity entity.
- **Home decision:** Capacity resolution belongs to the **Capacity subsystem**, consumed by Placement/Processing — **not** owned by Processing (§13).

**Phase A completeness requirement:** this single contract must ship with **all** of — distinct capacity kinds · stepped ratio evaluation · `mixed_age_policy` · regulatory-constraint handling (§12) · deterministic config tiebreak · positive `availableNow` · explainability · the `status` incomplete-data model · canonical Location/Program/Room resolution — so that **no UI surface or Placement path ever computes capacity independently.** Anything less leaves a seam a consumer will fill with its own math.

---

## 9. Ratio model (stepped tiers — first-class, already native)

**Confirmed:** ratios are **stepped tiers today**, not decimals. `childcare_ratio_rules` (scope + effective dates + `source_key` + `jurisdiction_key`) → `childcare_ratio_rule_tiers (max_children, required_staff, sort_order)`. This directly models the required examples:

```
1 adult → max 5 children     tier(max_children=5,  required_staff=1)
2 adults → max 11 children    tier(max_children=11, required_staff=2)
```

Canonical structure (names mapped to repo):

```ts
type RatioRuleTier = { maxChildren: number; requiredStaff: number; sortOrder?: number };  // childcare_ratio_rule_tiers
type RatioRule = {
  scope: { locationId?; programId?; roomId?; ageGroupKey? };  // scope_type + FKs on childcare_ratio_rules
  tiers: RatioRuleTier[];
  effectiveFrom: string; effectiveTo?: string;                // effective_start/effective_end
  source?: 'licensing' | 'organization' | 'location_override'; // source_key / jurisdiction_key
};
```

The ten required answers:

1. **Where ratio rules exist:** `childcare_ratio_rules` + `childcare_ratio_rule_tiers`; evaluated in `ratioRules.ts` (`requiredStaffForChildren`, `ratioLimitedCapacity`, `maxChildrenForStaff`); authored via `configRuleAuthoringService.ts` + `RatioTierFields` UI.
2. **Effective-dated:** **Yes** — `effective_start`/`effective_end`, supersede-not-overwrite. Tiers version **with** the parent rule (no independent tier dates).
3. **Scoped by location/program/room/age:** **Yes** — `scope_type ∈ {org,site,program,room}` + `age_group_key`.
4. **Stepped tiers supported:** **Yes** — `requiredStaffForChildren` returns the smallest tier whose `max_children ≥ childCount`; it does **not** linear-scale. Over the top tier ⇒ `exceedsDefinedTiers=true`.
5. **Multiple applicable rules reconciled:** two distinct layers, do not conflate (see the sequence below). Rule *selection* per (scope, age-group) context is single-winner **most-specific-wins** (§12). Reconciliation *across* age groups in one room is governed by the **mixed-age policy** (item 8). Capacity binding then takes `min` **across kinds** (physical/licensed/operational/ratio).
6. **Precedence vs. restrictiveness — the exact sequence (these are different layers):**
   ```
   1. Resolve the applicable authored rule for each relevant (scope, age-group) context
      using canonical configuration precedence (§12): room>program>site>org, age-specific>null,
      latest effective_start, deterministic id tiebreak.  → selection is by SPECIFICITY, not by value.
   2. Evaluate the stepped tiers of each resolved rule (requiredStaffForChildren / ratioLimitedCapacity).
   3. Reconcile across mixed-age / multiple constraints using the mixed-age policy (default most_restrictive)
      and the capacity MINIMUM across kinds.  → binding is by RESTRICTIVENESS.
   ```
   A **less-specific rule does NOT override a more-specific rule merely because it is numerically stricter** — selection is specificity-based (step 1). Restrictiveness only decides the *binding* among already-selected constraints (step 3). The one exception is regulatory rules (item 9), which are a binding ceiling by policy.
7. **Staffing counts → available capacity:** `maxChildrenForStaff(tiers, staffCount)` gives the child ceiling for a given staff count; `requiredStaffForChildren` gives staff demand for a child count. Staffed-capacity binding needs a staff-supply fact (G3, out of scope).
8. **DECISION CLOSED — Mixed-age policy = `most_restrictive` (default; removed from Phase A gating).** Today's resolver collapses a room to one `ageGroupKey` (first placement wins, `roomConfigResolvers.ts:59-65`) — a **hardening gap**. Ratified resolution: introduce an **extensible policy contract**, ship only `most_restrictive` in the first phase:
   ```ts
   type MixedAgeRatioPolicy = "most_restrictive" | "weighted" | "explicit_room_designation";
   // Phase A supports "most_restrictive" ONLY. "weighted" is a future jurisdiction adapter (NOT Phase A).
   ```
   `most_restrictive` semantics: (a) resolve every ratio rule applicable to the age groups **actually represented among the children in the room**; (b) compute the staffing requirement / capacity ceiling under each; (c) the room binds to the **most restrictive** resulting requirement/ceiling; (d) return explainability listing **every considered rule** and the **binding** one. The engine is **not** hardcoded to one policy — `weighted` (points-based licensing math) and `explicit_room_designation` are future adapters behind the same contract.
   **Unknown/uncovered age groups (safe, not optimistic):** a child whose age group has no applicable ratio rule **must not silently disappear** from the calculation. The resolver returns `status:"incomplete"` (§8) with `availableNow:null` + a `unknown_age_group` warning, rather than optimistically ignoring the child. Production behavior is conservative: unknown ⇒ unresolved, never "fits."
9. **DECISION — Regulatory (`licensing`) precedence is a binding ceiling that overrides may only TIGHTEN (hardening gap today).** Verified: `source_key` is **not** special-cased — it defaults to `"config"` and is a mere label; within the `licensed` capacity kind, resolution is plain most-specific-wins, so **a room/location licensed rule with a *higher* number today silently weakens the licensing ceiling** (`capacityRules.ts:19-29`, no floor enforcement). Ratified answers:
   - *Can a Location override weaken a licensing rule?* **No — it must not** (current code allows it = **hardening gap**).
   - *Immutable lower bound or upper constraint?* Licensing is an **upper constraint (ceiling)**; overrides may only make it **stricter (lower)**, never higher.
   - *Does scope precedence apply equally to licensing and org rules?* Scope selection still applies, **but** the effective licensing ceiling is clamped to `min(all applicable licensing rules in scope)` so a more-specific override cannot exceed a broader regulatory limit. Operator/organization value rules remain plain most-specific-wins.
   - *Should operator config only make it stricter?* **Yes for `licensing` kind** — enforce stricter-only at author time (writer validation) **and** at resolve time (clamp). Non-regulatory kinds keep normal override semantics.
   This is recorded as a **regulatory-precedence hardening item**, resolved by policy here and implemented in Phase A's capacity contract; it is **not** left ambiguous.
10. **Overrides governed:** via the scope ladder + effective dating; `source='location_override'` distinguishes local overrides from `licensing`/`organization`. Rendered through the Inheritance Control (§11/§7-UI). Regulatory overrides are stricter-only (item 9).
11. **Settings presentation:** the **tier-row editor** (`RatioTierFields`, already built) inside `EffectiveDatedConfigurationEditor` + `ScopePicker` — add tier / remove tier / numeric validation / duplicate-`max_children` prevention (writer enforces) / effective dates / scope + resolved-rule preview. **Never a decimal control.**

**Two additional hardening items (verified gaps):** (i) exact-`effective_start` ties have **no DB-deterministic winner** (no ORDER BY; relies on V8 sort stability) — add a final tiebreak (`id`/`created_at`) to the resolver contract; (ii) writer does not enforce tier monotonicity beyond `max_children` uniqueness — readers re-sort defensively, acceptable, but document the invariant.

---

## 10. Timezone doctrine

**Rule: every operational Location owns exactly one canonical timezone (IANA).** Tours, schedules, availability, communications, appointments, and processing **resolve through** the Location timezone rather than owning duplicate configuration, except where a distinct timezone is semantically required.

**Three concepts:**
- **Storage timezone** — operational wall-clock times are interpreted against the **Location** timezone (authoritative).
- **Viewer timezone** — surfaces may render the same instant in the active viewer's timezone.
- **Recipient timezone** — customer communications may render in the recipient's timezone when known.

**Decisions:**
- **Storage:** promote to a first-class **`locations.timezone`** column (IANA string), replacing free-text `locations.metadata.timezone` (`LocationSiteDetailPanel.tsx:35`). Author via a **canonical searchable timezone control** (name + region/city + current UTC offset + DST-aware), never raw text.
- **Fallback for existing locations without tz:** resolve **org default timezone** (add if absent) → then require explicit backfill; never silently assume UTC or the server tz. Backfill is a data step, not a wall-clock reinterpretation.
- **User timezone:** resolved from `user_profiles.timezone` (exists) → browser tz → org default.
- **Recipient timezone:** from person/contact tz when known → location tz.
- **Dual-time display:** required where cross-timezone confusion is possible (e.g. an operator in PT viewing a CT center's tour): show `11:00 AM PDT` with `1:00 PM CDT at Downtown Center`. Never silently convert without context.
- **DST:** handled via IANA zones + `date-fns-tz` (already used by the tour slot engine `internalCompute.ts`); store instants as `timestamptz`, wall-clock rules as local time + zone.
- **Date-only stays date-only:** `effective_start`/`end`, closure dates, `desired_start_date` remain calendar dates — never coerced to instants.
- **Public tour booking:** renders available slots in the **Location** timezone (with the customer's local equivalent when detectable), since the tour physically occurs at the site.
- **Communication templates:** the `location` token group (`templateTokens.ts`) gains an explicit timezone/`tour_time_label`-with-zone token; templates describe the zone unambiguously.
- **Legacy convergence:** `tour_availability_rules.timezone`, `tour_bookings.timezone`, `schedules.timezone` become **derived-from / validated-against** the Location timezone over a compatibility window, then stop being independently authored (they may persist as denormalized snapshots for historical instants, but Location is the source for new writes). **Do not** rewrite stored wall-clock values during convergence.

---

## 11. Settings & Field Platform integration

**Hard boundary (per the prompt and `configuration-platform.md`):** operational configuration (Location/Program/Room/Capacity/Ratio/Tour/Placement) keeps its **purpose-built tables** — it is **not** forced into generic `field_definitions`/`field_values` to claim reuse. Reuse is at the **UI / interaction / runtime-primitive** layer.

**Corrected decision (supersedes the earlier "Fields is an outlier" framing).** The **shell** conclusion stands — **Configuration Runtime V1 remains the canonical Settings shell** (`ConfigurationModeLayout`: 260px section queue + 320px object queue + detail workspace; powers Locations, Financials, the Settings hub) and Location Settings must **not** be rebuilt to clone the `/settings/fields` page layout, nor forced into Field Platform storage, nor have Configuration Runtime replaced by the Fields shell. But the shell fact does **not** capture the product requirement, and **Fields is not irrelevant merely because its shell differs.** The requirement is:

> **Location Settings retains the canonical Configuration Runtime shell while adopting the Settings *interaction quality, lifecycle behavior, editing safety, and reusable UI doctrine* proven through the Fields convergence work.** Fields and Locations must **converge on shared Settings interaction primitives**, and successful Fields-proven patterns must be **extracted into shared primitives** wherever they are not already shared.

Fields is where several Settings behaviors were first proven to production quality (lifecycle Hide/Show/Archive/Restore, delete-safety dependency preflight, ownership/source chips, 409-safe create, polished row anatomy). Those belong to **every** Settings surface, not just Fields — so the convergence is bidirectional: Locations adopts the shared shell (already true) **and** the runtime absorbs Fields' interaction wins as shared primitives.

**Reuse inventory (all already in Locations' dependency graph unless noted):**

| Need | Reuse (exists) | Path |
|---|---|---|
| Shell (nav/queue/list/workspace) | `ConfigurationModeLayout` (`ConfigurationShell`/`Queue`/`QueueItem`/`Workspace`/`DetailCard`/`EmptyState`/`PrimaryButton`/`Context`) | `components/adminV2/settings/configurationRuntime/ConfigurationModeLayout.tsx` |
| Form controls | `ConfigEditorPrimitives` (`ConfigFieldLabel`/`ConfigTextInput`/`ConfigNumberInput`/`ConfigDateInput`/`ConfigSelectInput`/`ConfigButtonRow`) | `configurationRuntime/ConfigEditorPrimitives.tsx` |
| Scope / dependent picker (inheritance-aware, labels-not-UUIDs, org→site→program→room) | **`ScopePicker`** + `useScopeOptions` | `configurationRuntime/ScopePicker.tsx` |
| Effective-dated versioning (Current/Scheduled/Superseded/Retired timeline + "Create future version") | **`EffectiveDatedConfigurationEditor`** | `configurationRuntime/EffectiveDatedConfigurationEditor.tsx` |
| Ratio tier editor | **`RatioTierFields`** | `settings/locations` operational-rules group |
| Scope/effective badges | `ConfigReadonlyPrimitives` (`ConfigScopeBadge`/`ConfigEffectiveBadge`), `OwnershipBadge` | `configurationRuntime/*`, `components/configRuntime/OwnershipBadge.tsx` |
| Scope + inheritance runtime | `resolveInherited()` / scope model | `lib/configRuntime/scope.ts`, `lib/adminV2/operationalConfig/effectiveDatedVersioning.ts` |
| Page shell / IA / nav | `settingsPageLayout.ts`, `configurationWorkspaceDomains.ts`/`configurationModeNav.ts` (Locations already wired under **Organization**) | `lib/adminV2/*` |
| Lifecycle + delete-safety (**pull from Fields**) | `ConfigurationStatusToggle`, delete-safety preflight, ownership chips, option editor | `components/adminV2/settings/configuration/*` |

**The Inheritance Control (Override Pattern)** from `configuration-ownership-and-inheritance.md` §5 is the canonical config-value UI. It is currently realized piecemeal (ScopePicker + EffectiveDatedEditor + `LocationOperationalRulesPanel`'s "Resolved per location · most-specific-wins" card). This initiative **promotes effective-dating/inheritance from Commercial-only to a Configuration-Runtime primitive** — now justified by the runtime's own "proven in ≥2 domains" extraction rule (Commercial rates **and** Location capacity/ratio/hours).

**Information architecture (reconciled, not accepted blindly):** keep the Configuration Runtime **list→detail workspace** (Location list in the object queue; selected Location = detail workspace), with **local section navigation** inside the detail for `General · Programs · Rooms · Hours & Closures · Capacity & Ratios · Tours & Availability · Waitlist & Placement · Communications · Branding · Access`. This is **section nav within one workspace**, not route-per-subpage and not a separate mini-app — consistent with how Financials composes. Location is the **active context**: dependent lists (Programs/Rooms/rules) inherit the selected `locationId` and never show global unscoped pickers.

**Convergence gaps to close (from UI audit):** (1) converge hand-rolled `LocationSite/Program/Room/ScheduleTemplateDetailPanel` inputs onto `ConfigEditorPrimitives`; (2) add lifecycle (`ConfigurationStatusToggle`) + delete-safety to location/program/room (only a boolean `Active` today); (3) extend effective-dating beyond the rules panel where semantically needed (capacity/hours/closures/branding); (4) add object-queue **search/filter** (absent today; multi-location needs it); (5) adopt the dirty-guard pattern for multi-field edits.

**Certified UI surfaces (must reuse shared components; §17 gates):** Location list+detail; Program list scoped to Location; Room list scoped to Location; dependent Program/Room selectors (`ScopePicker`/dependent select); ratio tier editing (`RatioTierFields`); timezone control (new canonical control); inheritance/override states (`OwnershipBadge`/`ConfigScopeBadge`); effective-dated changes (`EffectiveDatedConfigurationEditor`); dirty-state; validation (client == server); permissions (`useAdminAuth().canMutate`); empty/loading/error; responsive; keyboard/focus.

**Direct comparison Location vs Fields:** *patterns reused* — page shell, config nav/IA, explicit-Save + local-draft, badges; *patterns extended* — Location adds the crown-jewel ScopePicker + EffectiveDatedEditor (Fields lacks these); *domain-specific exceptions* — ratio tier editor, timezone control, capacity multi-kind panel (no Fields analog, justified); *must-not-duplicate* — shell, form controls, scope picker, effective-dated editor, badges (all shared already).

### Fields → Configuration-Runtime behavior convergence matrix

Every Settings behavior the requirement names, classified as **[Shared]** already shared through Configuration Runtime · **[Extract]** implemented only in Fields, promote to a shared primitive · **[Locations]** already in Locations · **[New]** needs a net-new shared primitive · **[Local]** domain-specific, stays local. Target: all behaviors become **shared** primitives that both Fields and Locations consume.

| # | Behavior | Fields today | Locations today | Classification | Convergence action |
|---|---|---|---|---|---|
| 1 | **Canonical control resolution** | shared `ConfigurationFieldOptionsEditor`, dependent `<select>` | hand-rolled `config-runtime-input` inputs | **[Shared]** (`ConfigEditorPrimitives`) not yet adopted by Locations | Converge Location detail panels onto `ConfigTextInput/NumberInput/DateInput/SelectInput` |
| 2 | **Searchable list/detail** | ownership-chip filter + category grouping; **no free-text search** | **no search** | **[New]** neither has canonical list search | Add a shared `ConfigurationListSearch`/filter primitive to the object queue |
| 3 | **Canonical labels & descriptions** | `ConfigurationCategoryHeader`, label+hint | partial | **[Shared]** (`ConfigFieldLabel`) + **[Extract]** Fields label/description density | Standardize label+description slot in `ConfigEditorPrimitives` |
| 4 | **Active/inactive lifecycle** | `ConfigurationStatusToggle` + Hide/Show/Archive/Restore | boolean `Active` checkbox only | **[Extract]** | Promote `ConfigurationStatusToggle` + lifecycle verbs to a shared primitive; Locations adopts |
| 5 | **Safe deletion + dependency preflight** | delete-safety preflight (`GET …/delete-safety`, blocker labels, `window.confirm`) | **none** (no destructive path) | **[Extract]** | Promote a shared `useDeleteSafety`/preflight primitive; Locations adopts for site/program/room |
| 6 | **Ownership & source visibility** | ownership chips (Platform/Custom/Runtime/Calculated) | `OwnershipBadge`/`ConfigScopeBadge` (via rules panel) | **[Shared]** (badges) + **[Extract]** Fields ownership-chip filter | Unify badge + ownership-chip into one shared source-visibility primitive |
| 7 | **Invalid-reference handling** | renders invalid ref without crashing | inconsistent | **[New]** | Add a shared "render invalid reference safely (label + warning, never throw)" primitive; used by pickers |
| 8 | **Dirty-state protection** | **none** (silent discard) | **none** | **[New]** (pattern exists only in layout-builder editors) | Extract the `beforeunload`/`isDirty` guard from layout editors into a shared `useUnsavedGuard` |
| 9 | **Explicit-save / draft behavior** | explicit per-row Save + local draft | explicit per-panel Save + local draft | **[Locations]** + **[Shared]** (both already do it) | Standardize one explicit-Save+draft contract in the runtime; no behavior change |
| 10 | **Inline validation** | inline error, 409 key-conflict handling | `role="alert"` error | **[Shared]** partial | Standardize client==server validation surface in `ConfigEditorPrimitives` |
| 11 | **Empty/loading/error states** | present | `ConfigurationEmptyState` present | **[Shared]** (`ConfigurationEmptyState`) | Ensure both consume the shared states |
| 12 | **Permission-aware controls** | `useAdminAuth().canMutate` gating | same | **[Shared]** | Keep; assert on every mutating control |
| 13 | **Dependent reference selection** | dependent category `<select>` | `ScopePicker` (inheritance-aware) | **[Shared]** (`ScopePicker`) + **[Extract]** generic dependent-select | One shared dependent-picker family; Location program/room selectors use it |
| 14 | **Consistent add/edit/remove** | inline create row, slug derive, 409-safe | "Add Location" only; no program/room create here | **[Extract]** | Promote Fields' create-row pattern into a shared primitive; Locations gains program/room create |
| 15 | **Row/card/section/detail anatomy** | polished row (glyph/type/label/chips/hover actions) | `ConfigurationQueueItem`/`DetailCard` (simpler) | **[Shared]** shell + **[Extract]** Fields row richness | Enrich shared `ConfigurationQueueItem` with the proven anatomy where useful |
| 16 | **No duplicate legacy representations to operators** | hides legacy | exposes EAV duplicates (room metadata, dual program keys) | **[Local]** domain convergence (Program §6 / Room §7) | Resolved by the Program/Room convergence, not a UI primitive |

**Net:** 5 behaviors are **[Extract]** (lifecycle, delete-safety, ownership-chip, add/edit/remove, row-anatomy), 3 are **[New]** shared primitives (list search, invalid-ref handling, unsaved guard), the rest are already **[Shared]**/**[Locations]** or a **[Local]** domain concern. **None** requires changing the shell or the storage model. This is the concrete meaning of "converge on shared Settings interaction primitives, extracting Fields patterns where not already shared."

---

## 12. Configuration scope and precedence

**The existing pattern is canonical.** `scope_type ∈ {org, site, program, room}` + `age_group_key` + `effective_start`/`effective_end`, resolved most-specific-wins by `resolveConfigRule.ts`. Precedence (exact, verified):

```
1. Scope specificity (primary):   room(4) > program(3) > site(2) > org(1)
2. Age-group specificity (secondary, only at equal scope):  age_group_key set > null
3. Latest effective_start (tertiary tiebreak)
4. [ADD] deterministic final tiebreak: id / created_at   ← fixes the verified non-determinism
```

Note the axes are **not orthogonal**: scope dominates age (a `room` rule with null age outranks a `site` rule with matching age). Effective window is inclusive both bounds; open-ended when `effective_end` null; query is an as-of `YYYY-MM-DD`.

**Value inheritance vs availability** (per doctrine): *value* = set high, override lower (capacity, ratio, hours, branding, timezone-fallback); *availability* = defined once, offered/withdrawn per scope (programs offered at a site, workflows enabled). One control (the Inheritance Control) expresses both.

**Precedence (selection) is NOT restrictiveness (binding) — the two layers must never be conflated.** Configuration precedence (above) chooses **which authored rule applies** at a (scope, age-group) context — purely by *specificity*, never by numeric value. Restrictiveness only enters later, when the capacity resolver takes `min` **across kinds** and applies the mixed-age policy **across age groups** (§8–§9). A less-specific rule therefore does **not** override a more-specific rule merely for being numerically stricter. See the explicit 3-step sequence in §9 item 6.

**Regulatory (`licensing`) precedence — a binding ceiling, overrides may only TIGHTEN (hardening gap today; policy ratified here).** Verified in code: `source_key`/`jurisdiction_key` are **not** special-cased (`source_key` defaults to `"config"`; plain most-specific-wins within the `licensed` kind — `capacityRules.ts:19-29`, `ratioRules.ts`), so a more-specific override with a *higher* value silently **weakens** a licensing limit today. Ratified rule: for `source_key='licensing'` (capacity kind `licensed`, and ratio rules marked licensing), the **effective ceiling is clamped to `min` across all applicable licensing rules in scope**, and author-time validation **rejects** an override that would raise a regulatory limit above a broader one — operator/location config may only make regulatory limits **stricter**, never weaker. Non-regulatory (`organization`/`config`/`location_override`) value rules keep normal most-specific-wins override semantics. This closes the ambiguity; implemented in the Phase A capacity contract (§8).

**Per-config precedence is UNIFORM** — capacity, ratio, hours, schedule rules already share `resolveConfigRule`. **Do not** fork precedence per domain. **One convergence needed:** `tour_availability_rules` uses an **older `location_id`/`user_id` scope model** not yet on the unified `scope_type` shape — align it (Phase C) so tours resolve through the same ladder. Placement config (`metadata.placement_priority_v1`) uses a **department→work-unit** merge, which is an **orthogonal access axis**, correctly *not* part of value resolution — leave as-is.

For every config type define (uniformly): scope, precedence (above), effective dating, conflict resolution (specificity→age→date→id), inheritance/override (Inheritance Control), validation (client==server), publish/apply (explicit Save + create-version for effective-dated), audit (version timeline), deactivation (retire/void, not delete for effective-dated).

---

## 13. Multi-location model

**Preserve and harden the existing N:N model. Do NOT collapse a household to one location.** Verified cardinalities:

- **Persons → many locations** (`person_locations`, N:N) · **Operators → many sites** (`user_site_access`, N:N) · **Households (`customers`) → no `location_id`** (org-scoped; span sites via children). **No** one-household/one-operator→one-location constraint exists.
- Distinguish the **location roles** (all already represented — do not merge):
  - **Default / preferred** — `opportunities.location_id` (family default; fallback only, not authority).
  - **Child site authority** — `opportunity_customer_members.location_id` (enrollment proposal).
  - **Current placement** — `child_placements.site_location_id` (committed, effective-dated; transfer = supersede).
  - **Tour location** — `tour_bookings.location_id` (many bookings/lead across sites).
  - **Application/lead interest** — per-child OCM site; multiple children → multiple sites.
  - **Waitlist candidacy** — `placement_candidates.site_id` (multiple candidate rows/child).

**`Location Interest` record — NOT recommended (gap not proven).** The prompt asks to prove the gap before adding it. Multi-location *interest* is **already satisfiable** by existing records: multiple `placement_candidates` rows (per site×cohort), multiple `tour_bookings`, and per-child `OCM.location_id`. The only thing absent is a **ranked / weighted** cross-location preference. Recommendation: **do not** introduce a new `Location Interest` entity. If ranked multi-site preference becomes a real product need, model it as a thin **extension of `placement_candidates`** (a `preference_rank` + link group) — the waitlist grain already is the "interested in this site×program" record. Escalate as open decision §21-1 only if product confirms ranked interest is required.

**Harden:** transfer preserves effective-dated history (supersede `child_placements`, never patch); communications resolve the **contextual** location (fix the opportunity→location send gap, §14/§17); location list/option APIs enforce `user_site_access` (close the verified dropdown scope leak).

---

## 14. Actions convergence plan

Per `modules/actions-and-workflows.md`: an Action is a **configured invocation of a registered capability**; config controls where/when/how, code controls what/how-runs; single execution path `POST /api/admin/actions/execute → runRegisteredAction`; three operator placements (Focus Panel Manage, Work Unit rail, Workspace). **Harden existing before creating new.**

| Action | Today | Canonical target | Owner / mechanism | Notes |
|---|---|---|---|---|
| **Schedule Tour** | ~5 defs, conflicting `action_type` | **one `open_form`** capability | `tourBookingService.createTourBooking` | Collapse the 4 legacy/duplicate seeds; keep the canonical open_form; re-point placements. |
| **Enroll** | ~6 variants | **`update_child_enrollment_status` (mutation_command, enrollment_status domain)** | `mutations/domains/enrollmentStatus.ts` | Retire `mark_won`/`approve_enrollment`-as-status/`update_status_add_note` aliases; operator intent "Move Forward" resolves via `operationalIntent.ts`. |
| **Move to Waitlist** | dup (case + child grain) | **keep both grains, one registry entry each**: `move_to_waitlist` (case), `waitlist_child` (child, mutation_command) | status / enrollment_status domain | Grains are distinct, not duplicates; unify catalog authority. |
| **Assign Location** | implicit at lead creation only | **new registered `assign_location` (mutation_command)** | placement/enrollment domain | Harden the implicit `resolveCreateLeadDefaultLocation` path into an explicit, re-runnable action writing child site authority (`OCM.location_id`). |
| **Transfer Location** | **missing** | **new `transfer_location` (mutation_command)** | placement domain | Supersedes `child_placements` (effective-dated); emits placement-change event; place on Focus Panel Manage + Work Unit rail. |
| **Make Placement Offer** | missing (offered occupancy) | **new `make_placement_offer`** | placement domain | Introduces "offered" occupancy state feeding capacity (§8); ties to waitlist candidate. |
| **Accept / Decline Offer** | missing | **new `respond_placement_offer`** | placement domain (+ public/customer-facing variant) | Customer-facing execution via tokenized action (reuse `/api/action/[token]/consume`). |

For each: canonical action key + registered handler; required context (grain/subject); preflight/eligibility (`resolveEligibility`); permissions (`required_permissions` + site scope); process-transition relationship (status domain); Current Work exposure (stage work-template `primary_action`/`helpful_actions`); record-header compatibility (normalize legacy placements); customer-facing? (tour/offer yes, others no); genuinely missing? (Transfer/Offer/Accept = yes). **No new action where an existing one can be hardened** (Assign Location hardens an existing implicit path; Enroll/Tour converge).

---

## 15. Consumer convergence map

For each consumer: reads today → reads after → adapter → behavior/UI/migration.

| Consumer | Today | After convergence | Adapter | Changes |
|---|---|---|---|---|
| **Settings** | shared shell + hand-rolled panels | Configuration Runtime shell + primitives everywhere; Location = active context | — | UI: primitives, lifecycle, search |
| **Fields** | bespoke entity-nav workspace | remains (Data Model); shares runtime primitives + IA | — | none forced; optional shell reconciliation (open decision) |
| **Processes / Stages** | location in participation payload | resolve via canonical Location scope; program/room via canonical resolvers | thin | behavior: stage work references canonical actions |
| **Current Work** | location-scoped visibility (`queueMembershipLocationScope`) | + Transfer/Assign Location actions surfaced | — | UI: new actions in rail/Manage |
| **Actions** | ~2 catalog authorities | one registry, converged keys (§14) | key-normalizer | migration: placement re-point |
| **Processing (POS)** | doc-intake envelope; classifies location/program labels | consumes canonical resolvers for validation; **routing stays in Placement** | — | no routing added here |
| **Communications** | identity location-first; runtime resolves loc only for `jobs` | resolve location for `opportunities`/families; templates use location+timezone tokens | `resolveContextLocationId` fix | behavior: family sends engage location identity/branding |
| **Forms** | scoped by `selectedSiteId`; `entity_type='location'` fields | unchanged; program/room pickers via canonical resolvers | — | minor |
| **Documents** | org-scoped (no `location_id`) | add `location_id` link | additive column | migration: backfill via entity |
| **Tours** | own `timezone`; per-site rules | resolve Location timezone; canonical Schedule Tour action; honor closures | tz + closures adapter | §10/§13/§14 |
| **Waitlists** | `placement_candidates` + ranking engine | + capacity-aware recommendations, offers, deadlines, comms | capacity resolver | new offer flow (§13/§14) |
| **Placement** | candidates/placements/overrides; priority engine | + capacity-aware routing decision layer; Transfer/Offer actions | capacity resolver | §13/§14 |
| **Enrollment** | agreements→placements→schedules | reads canonical program/room/site; unchanged truth | — | none |
| **Attendance** | site+room facts | unchanged; room via canonical resolver | — | none |
| **Scheduling** | 3 substrates (tour/childcare/legacy-job) | tour+childcare resolve Location tz; legacy-job stays isolated | tz adapter | do NOT converge legacy job scheduling |
| **Queues / Record headers / Focus panels** | site-scoped | canonical Location label/timezone rendering | — | minor UI |
| **Reporting / Metrics** | per-site snapshots; location = filter | populate capacity/occupancy packs from engine | — | connect empty packs |
| **AI / BOS** | org+entity scoped, no location context | thread location/program via existing tokens/scope | — | additive context |
| **Public booking** | location-native (`tour_public_booking_links`) | render Location timezone; honor closures | tz + closures | §10 |
| **Public application** | opportunity/OCM location | unchanged; canonical program picker | — | minor |
| **Permissions / scope resolution** | app-layer `user_site_access` (mature); API leak | pass site filter into location list/option APIs; consider RLS site-scope | — | close leak; RLS is open decision |

---

## 16. Data migration strategy

**No flag-day rewrites.** Universal sequence per duplicate:

```
canonical provider (resolver/table)  →  compatibility adapter (dual-read, canonical-preferred)
  →  consumer convergence (one at a time)  →  telemetry/tests prove zero legacy reads  →  removal
```

**Convergence matrix:**

| Concept | Current representation | Consumers | Canonical target | Migration | Compat period | Deletion condition |
|---|---|---|---|---|---|---|
| Program identity | `childcare_program_type` opt-set + deprecated `classroom_age_group` | inquiry, classroom, enrollment | `program_key` vocabulary (opt-set) | dual-key resolver already exists; backfill `classroom_age_group`→`childcare_program_type` | until reads = 0 on legacy key | telemetry: no `classroom_age_group` reads |
| Program availability | `location_program_categories` | capacity/ratio/placement scope | **keep** (constrain `key` to vocabulary) | validate key FK | n/a | n/a (canonical) |
| Offering link | `program_offerings.program_key` (free text) | commercial, enrollment | validated reference to vocabulary | backfill + FK/constraint | one release | orphan program_keys = 0 |
| Room attributes | `locations.metadata` EAV **and** `childcare_*` tables | capacity/ratio/age | `childcare_*` config tables (sole owner) | migrate metadata→rules; make metadata read-through | until forms write rules only | no metadata capacity/ratio writes |
| Schedule Tour action | ~5 defs | tours, stages | one `open_form` | re-point placements; normalize legacy keys | one release | legacy defs inactive + unreferenced |
| Enroll action | ~6 variants | enrollment, Current Work | `update_child_enrollment_status` | alias→canonical via `operationalIntent` | one release | aliases unreferenced |
| Timezone | `metadata.timezone` + tour/schedule/contact/user tz | tours, schedules, comms | `locations.timezone` (IANA) | add column; backfill from metadata (no wall-clock shift); org fallback | until tour/schedule tz derive from Location | independent tz authoring removed |
| Location selectors | inconsistent scoping (org-only list/option APIs) | Settings, pickers | site-scoped canonical resolver | pass `user_site_access` filter | immediate (bugfix) | leak closed |
| Transitive location fields | documents (none), scheduled_sends (via opportunity) | comms, docs | explicit `location_id` where owned | additive columns + backfill | additive | n/a |
| Capacity metrics | `coming_soon` empty packs | dashboards | populate from engine | register metric keys | n/a | packs non-empty |
| Comms location resolution | `resolveContextLocationId` jobs-only | family sends | resolve opportunities too | code fix | immediate | opportunity sends resolve location |

---

## 17. Compatibility strategy

- **Additive first:** new columns (`locations.timezone`, `documents.location_id`), new tables (closures, branding) are additive; nothing dropped until consumers converge.
- **Dual-read adapters:** canonical provider preferred, legacy fallback, with a telemetry counter on legacy reads. Program key, room attributes, timezone all use this.
- **Effective-dated, supersede-not-patch** everywhere (placement transfer, config versions) — history preserved.
- **Fail-loud in dev/test, degrade-safe in prod** for unknown action keys (existing `assertConfiguredActionKeys` / `partitionConfiguredActionKeys`).
- **No wall-clock reinterpretation** during timezone convergence — backfill sets the zone that the stored local time already meant.
- **Legacy job scheduling (`schedules`/`recurrence_plans`) is explicitly NOT converged** — it is the home-services vertical; isolation is intentional.

---

## 18. Testing & certification strategy

**Scoping**
- `location_program_categories` filtered by selected Location; cross-location programs never appear.
- Rooms filtered by Location (`parent_location_id`); by Program eligibility where configured.
- Changing Location clears invalid Program/Room/Schedule and recomputes capacity preview.
- Cross-location references rejected **server-side** (not just UI).

**Ratios**
- 1 adult ⇒ ≤5 children under a 1:5 tier; 2 adults ⇒ ≤11 under a 2:11 tier.
- Engine does **not** reduce stepped tiers to a decimal (11 ≠ 10 for 2 adults).
- Most-restrictive applicable limit wins at the capacity binding.
- Effective-dated ratio rules resolve by as-of date; superseded rows excluded.
- Precedence room>program>site>org, then age-specific>null, then latest effective_start, then **id tiebreak** (new) — deterministic.
- Mixed-age behavior deterministic under the ratified `most_restrictive` policy (§9); unknown age group ⇒ `status:"incomplete"` + `unknown_age_group` warning, never silently dropped and never "fits."
- Regulatory (`licensing`) ceiling cannot be weakened by a more-specific override (author-time reject + resolve-time clamp) — §9 item 9 / §12.
- Capacity resolver returns the correct `status` (`resolved`/`incomplete`/`not_configured`/`conflicted`); unknown data is never coerced to 0 or unlimited; consumers branch on `status`.

**Timezones**
- Location timezone authoritative for operational times.
- Viewer-tz and recipient-tz rendering correct; dual-time display where cross-tz.
- DST transitions tested (spring-forward/fall-back around a tour slot).
- Public booking shows unambiguous times.
- Legacy tz backfill preserves wall-clock meaning (no shift).

**Settings**
- Canonical primitives drive controls (no raw inputs for scoped/effective config).
- Dependent pickers use `ScopePicker`/canonical providers; labels not UUIDs.
- Invalid references visible without crashing; dirty-state compare does not throw; explicit empty values stay explicit.
- Permissions enforced (`canMutate`); server validation matches client.

**Multi-location**
- One household → children at different locations.
- One lead → interest in several locations (multiple candidates/tours).
- One operator → several sites (`user_site_access`).
- Transfer preserves effective-dated placement history.
- Communications resolve the correct contextual Location (opportunity path).

**Certification gates (UI):** Location list/detail; Program-scoped-to-Location list; Room-scoped-to-Location list; dependent selectors; ratio tier editing; timezone control; inheritance/override states; effective-dated changes; dirty-state; validation; permissions; empty states; responsive; keyboard/focus; and a **direct parity check** that Location Settings composes from the same Configuration Runtime primitives as Financials (the shared shell), documenting reused/extended/exception/no-duplicate.

---

## 19. Phased implementation roadmap

Grouped into meaningful phases; de-duplicate + contract-freeze before net-new; each phase has objective / scope / dependencies / likely files / migrations / tests / doctrine / exit / non-goals.

### Phase A — Canonical contracts (freeze the seams) — **UNBLOCKED (mixed-age + program-identity ratified §9/§6)**
- **Objective:** lock the resolver + type contracts every consumer depends on, before any migration.
- **Scope (the *complete* contract — anything less leaves a seam a consumer fills with its own math):**
  - Canonical `Location` type + `resolveRoomsForLocation`.
  - **Canonical Program provider** (`resolveProgramsForOrganization`/`resolveProgramsForLocation`/`resolveProgramByKey`) over the `program_key` vocabulary — consumers never touch option-set internals (§6).
  - **`resolveOperationalCapacity` contract** with ALL of: distinct capacity kinds · stepped ratio evaluation · **`mixed_age_policy` (`most_restrictive` supported; extensible)** · **regulatory (`licensing`) ceiling handling** (clamp + stricter-only, §12) · **deterministic config tiebreak** (`id`/`created_at`) · positive **`availableNow`** · explainability (`limitingFactor`/`appliedRules`) · **`status` incomplete-data model** (`resolved`/`incomplete`/`not_configured`/`conflicted`) · canonical Location/Program/Room resolution.
  - Ratio-tier contract; timezone-resolution contract (storage/viewer/recipient); Settings metadata/primitive contract.
- **Dependencies:** none (contracts over existing code). **No longer gated** by mixed-age policy or Program-identity storage.
- **Likely files:** `web/lib/childcareOperational/config/*` + `expectations/*` (formalize exports; add mixed-age + licensing-clamp + `status`), `resolveConfigRule.ts` (add `id`/`created_at` tiebreak), a new `web/lib/location/*` provider, `web/lib/programs/*` (canonical Program provider), `web/lib/fields/enrollmentPlacementDoctrine.ts`.
- **Migrations:** none (tiebreak + clamp + status are code; author-time stricter-only validation is code).
- **Tests:** ratio stepped tiers (1:5, 2:11) + precedence + tiebreak; mixed-age `most_restrictive` + unknown-age `incomplete`; licensing stricter-only clamp; capacity binding + `availableNow` + `status`; Program provider scoping; resolver scoping.
- **Doctrine (additive reconciliation only — no broad rewrites):** update `placement-system.md` (remove "future" `child_placements` framing); add one line to `configuration-ownership-and-inheritance.md` §4b ratifying that **regulatory (`licensing`-source) values are a binding ceiling overrides may only tighten** (the one genuinely new inheritance rule this RFC introduces); confirm "projections are governed calculations, never entities" already stated in `operational-truth-flow-doctrine.md`. No new doctrine document is created.
- **Exit:** contracts merged; existing consumers compile against them; no behavior change beyond the safety fixes (tiebreak determinism, licensing clamp, incomplete-status).
- **Non-goals:** no schema, no UI, no data migration; no `weighted` mixed-age adapter.

### Phase B — Settings convergence (make config coherent)
- **Objective:** one Location Settings workspace on Configuration Runtime primitives.
- **Scope:** Location workspace (General/Programs/Rooms/Hours & Closures/Capacity & Ratios/Tours & Availability/Waitlist & Placement/Communications/Branding/Access via local section nav); converge hand-rolled panels → `ConfigEditorPrimitives`; timezone canonical control; dependent Program/Room selectors via `ScopePicker`; add lifecycle (`ConfigurationStatusToggle`) + delete-safety + object-queue search; ratio tier editor already present.
- **Dependencies:** A (contracts).
- **Likely files:** `web/components/adminV2/settings/locations/*`, `configurationRuntime/*` (reuse), `settingsPageLayout.ts`.
- **Migrations:** `locations.timezone` column (additive) + backfill from metadata.
- **Tests:** Settings certification gates (§18); timezone control; scoping.
- **Doctrine:** `configuration-platform.md` (Location workspace pattern); promote effective-dating to Configuration Runtime primitive.
- **Exit:** Location config authored end-to-end through shared primitives; timezone first-class.
- **Non-goals:** no capacity operations UI yet; no legacy removal.

### Phase C — Consumer convergence (one resolution path)
- **Objective:** every consumer reads the canonical resolvers; close the known gaps.
- **Scope:** Tours resolve Location timezone + honor closures + canonical Schedule Tour action; Communications resolve location for opportunities (fix `resolveContextLocationId`); align `tour_availability_rules` scope to the unified ladder; Actions catalog convergence (Schedule Tour ×5→1, Enroll ×6→1); location list/option API site-scope fix; Documents `location_id` link; Forms/queues/headers/focus render canonical Location.
- **Dependencies:** A, B.
- **Likely files:** `web/lib/tours/*`, `web/lib/communications/identity/executeCommunicationsSend.ts`, `web/lib/admin/actions/*`, `web/app/api/admin/locations/*`.
- **Migrations:** action placement re-point; `documents.location_id`; program-key validation.
- **Tests:** comms contextual location; action convergence; tz through tours; scope-leak closed.
- **Doctrine:** `actions-and-workflows.md` convergence note; `communications-identity-platform.md` runtime-feed note.
- **Exit:** telemetry shows canonical reads; duplicates unreferenced.
- **Non-goals:** no legacy table drops yet.

### Phase D — Capacity operations (make truth visible + actionable)
- **Objective:** surface and act on capacity.
- **Scope:** positive **available-seats** surface; populate `capacity`/`attendance`/`staffing` metric packs from the engine; capacity-aware **placement recommendation** decision layer (Placement/Process engine) consuming `resolveOperationalCapacity`; Make/Respond Placement Offer actions (+ offered occupancy); ratio-aware calculations + explainability (`limitingFactor`/`appliedRules`); mixed-age `most_restrictive` policy per §9.
- **Dependencies:** A, C.
- **Likely files:** `web/lib/childcareOperational/*`, `web/lib/orchestration/placement/*`, `web/lib/metrics/packs.ts`, new placement-offer action handlers.
- **Migrations:** placement-offer state (if not derivable); metric definitions.
- **Tests:** available-seats; capacity-aware routing; offer lifecycle; ratio explainability.
- **Doctrine:** `operational-intelligence-platform.md` capacity pack; placement recommendation doctrine.
- **Exit:** operators see open seats + capacity-aware placement suggestions.
- **Non-goals:** staffed-capacity supply facts (G3) remain out of scope.

### Phase E — Legacy removal (finish the convergence)
- **Objective:** remove duplicates once telemetry proves zero legacy use.
- **Scope:** drop/retire `locations.metadata` room-attribute EAV writes; retire independent tour/schedule timezone authoring; retire deprecated `classroom_age_group`; remove duplicate action defs; (optional, open decision) introduce org-level `programs` table only if vocabulary-as-identity proved insufficient.
- **Dependencies:** A–D + telemetry gates.
- **Migrations:** deprecation + removal, gated on zero-read telemetry.
- **Tests:** regression that canonical paths carry all reads.
- **Doctrine:** mark superseded representations removed.
- **Exit:** one representation each; no compat adapters remain.
- **Non-goals:** no new capability.

---

## 20. Explicit non-goals

- **No** new `rooms` table (rooms are `locations` unit nodes — proven capable).
- **No** fifth Program model (identity = existing vocabulary; offering ≠ program).
- **No** second capacity engine (formalize the existing one).
- **No** second scheduling substrate; **no** convergence of legacy job `schedules` (intentional isolation).
- **No** static waitlist competing with Placement (`placement_candidates` is canonical).
- **No** ambiguous single Location capacity number; **no** decimal-only ratio.
- **No** timezone duplicated per feature (Location owns; others resolve).
- **No** operational config forced into generic `field_definitions`/`field_values`.
- **No** childcare-specific behavior hardcoded into generic platform components.
- **No** `Location Interest` entity (gap not proven; existing records suffice).
- **No** migrations before this RFC settles the canonical target; **no** production implementation this phase; **no** pushes.
- **No** BOS/AI runtime expansion (org+entity scope; location context is additive tokens only).

---

## 21. Open decisions requiring product input

**Closed by this pass (no longer gating Phase A):** *Mixed-age ratio policy* → ratified `most_restrictive` under an extensible policy contract (§9 item 8). *Program identity storage* → ratified `program_key` vocabulary behind a canonical Program provider; no `programs` table this initiative (§6). Both are removed from the gating list.

Genuinely unresolved (do not block Phase A unless noted):

1. **Ranked multi-location interest (§13):** confirm whether ranked/weighted cross-site preference is a real need; if yes, extend `placement_candidates` (not a new entity). *Recommended: not needed.*
2. **RLS vs app-layer site scope (§13):** whether to move site-scope enforcement into `locations` RLS or keep app-layer + fix the API leak. Security posture decision.
3. **Branding scope depth (§5):** which branding attributes are per-location (from-name, logo, colors) vs org-only; whether branding is a new table or extends comm identity config.
4. **Timezone dual-display default (§10):** always show recipient/viewer + site time, or only on cross-tz mismatch. UX preference.
5. **Room age-band storage (§7):** promote room age eligibility out of `classroom_age_group` EAV to a **typed column on `locations`** vs a **room-scoped config row** in the `childcare_*` family. Implementation-shape decision (Phase B); does not gate Phase A contracts.
6. **Fields vs Configuration-Runtime shell (§11):** whether `/settings/fields` should also adopt the shared Configuration Runtime shell (out of this initiative's scope, but a coherence question). Independent of the behavior-primitive convergence, which proceeds regardless.

---

## 22. Files created / modified in this phase

- **Created:** `docs/platform/rfcs/location-operational-domain-convergence.md` (this RFC).
- **Modified:** none (design-only; no code, no migrations, no schema).

---

## 23. Summary certification

Alloy already contains one Location scope root, one config ladder, one capacity/ratio engine with native stepped tiers, one placement/waitlist grain, and one Settings runtime — most consumers just haven't converged onto them, and four small primitives (closures, branding, transfer/offer actions, capacity-aware routing) are genuinely absent. This RFC's canonical model **extends** those systems and provides a de-duplication-first, no-flag-day migration path. **Phase A (canonical contracts) is now UNBLOCKED:** the two decisions that previously gated it — mixed-age ratio policy and Program-identity storage — are ratified here (`most_restrictive` under an extensible policy; `program_key` vocabulary behind a canonical provider). The remaining open decisions (§21) are non-gating (they shape later phases, not the Phase A contracts). Phase A must ship the full capacity/ratio contract (distinct kinds · stepped tiers · mixed-age policy · regulatory ceiling · deterministic tiebreak · positive `availableNow` · explainability · `status` incomplete-data model · canonical Location/Program/Room resolution) so no consumer computes capacity independently. No production implementation, migrations, or pushes were performed in this phase.
