# Config Rule Grain — Decision Memo (Capacity / Ratio / Schedule rules)

**Status:** Decision memo (June 2026). Resolves Open Questions 1-3 from [`operational_execution_phase1_backend_building_blocks.md`](operational_execution_phase1_backend_building_blocks.md) before authorizing Prompt P1. **No code, migrations, schema, or implementation.**

**Doctrine basis:** [`docs/platform/core/operational-truth-flow-doctrine.md`](../../platform/core/operational-truth-flow-doctrine.md) (L1 Configuration; config-as-first-class), [`docs/platform/core/placement-system.md`](../../platform/core/placement-system.md) (School → Program → Room cascade), [`docs/archive/2026-06-runtime-convergence/archive/2026-06-runtime-convergence/platform_convergence/child_namespace_decision.md`](../../archive/2026-06-runtime-convergence/platform_convergence/child_namespace_decision.md).

**Direction tested (from operator):** org defaults with location overrides; program/room specificity where operationally required; ratio rules as first-class compliance config; `schedule_patterns` remain child schedule intent; `schedule_rules` define operating constraints/windows/eligibility/policy; expectations stay derived/non-authoritative. **This memo confirms that direction** with grain specifics and guardrails.

---

## 0. Shared resolution model (applies to all three areas)

A single repeated pattern keeps the three rule families consistent and prevents per-area drift.

### Verified scoping facts (repo)
- `locations` is a hierarchy: `location_type = 'site'` (campus) and `'unit'` (room) with `parent_location_id` (slice-1 migration triggers enforce room=`unit` under its site).
- `location_program_categories` is **per-site** (`location_id` = site row), org-scoped, with stable `key`s that "align across sites" and deterministic FK ids ([`20260610140001_location_program_categories.sql`](../../../supabase/migrations/20260610140001_location_program_categories.sql)).
- Age band vocabulary is the `classroom_age_group` option set; schedule vocabulary is `childcare_schedule_type` ([`20260430211000_childcare_mvp_control_plane_seed.sql`](../../../supabase/migrations/20260430211000_childcare_mvp_control_plane_seed.sql)).
- Config-posture RLS precedent: `has_org_role(org_id, [...])` (used by `schedule_patterns`, `location_program_categories`).

### The resolution rule (canonical for all three)
Each rule family is **one effective-dated table** carrying a **scope** and a **dimension**, resolved **most-specific-wins**:

```
Scope precedence (high -> low):  room (unit)  >  program (per-site category)  >  site  >  org default
```

- **Org defaults** key on a **stable dimension key** (e.g. age-group key, program `key`, schedule-type key) with `scope_type = 'org'`, `scope_id = null`.
- **Overrides** key on a **concrete id** (`site` = `locations.id`, `program` = `location_program_categories.id`, `room` = `locations.id` unit) with `scope_type` set accordingly.
- **Effective-dated:** every rule has `effective_start`/`effective_end`; changes are new rows, prior rows closed — never edits-in-place. A partial-unique index guarantees one active rule per (scope, dimension, date).
- **Resolver is code-owned and deterministic** — a shared helper resolves the applicable rule for a given (org, site, program, room, dimension, date). This helper is the single source of "which rule applies," so no surface re-implements precedence.

This shared model is itself the primary EAV-drift defense: one typed table per family, one resolver, no rule values scattered onto entity field rows or JSON.

---

## 1. Capacity rules

### 1. Recommended canonical grain
A single first-class `capacity_rules` table, effective-dated, using the shared scope model. A capacity rule expresses a **seat limit (integer)** for a scope, with an explicit **capacity kind** to separate licensed vs operational limits:

- `capacity_kind`: `licensed` (regulatory ceiling) vs `operational` (intended fill ceiling, ≤ licensed).
- Scope: `org` default → `site` → `program` (per-site category) → `room` (unit). Room-level is the operationally common grain; site-level expresses the license ceiling.
- Optional `dimension` (age-group key) for sites that license by age band rather than room.

Most-specific-wins resolution; both kinds resolvable independently.

### 2. Alternatives considered
- **(A) Capacity as a number column / EAV field on `locations` or `location_program_categories`.** Rejected: not effective-dated, mixes capacity into identity/config rows, is exactly the `license_capacity` EAV pattern we are retiring, and cannot express both licensed and operational ceilings.
- **(B) Separate tables per scope (`site_capacity`, `room_capacity`).** Rejected: duplicate models, duplicate resolvers, drift between them.
- **(C) Room-only capacity.** Rejected: cannot represent a site license ceiling or program-band caps; under-expressive for compliance.
- **(D) Capacity folded into `ratio_rules`.** Rejected: capacity = seats; ratio = staffing. Conflating blocks independent staffing forecasts (see Ratio §2-C).

### 3. Why it fits truth-flow doctrine
Capacity is **L1 Configuration** — it defines how the organization operates and is **separate from execution**. Effective dating honors "configuration changes the rules of the game, never the operational history already recorded." Licensed vs operational kinds keep a legal invariant (code-owned) distinct from an operating preference.

### 4. How it derives Schedule Expectations
Expected occupancy (L3) = derived headcount for a room/program/site/date (from operational `schedule_assignments` × `schedule_patterns.weekdays` × `child_placements.room_location_id`) **compared against** the resolved `operational`/`licensed` capacity. Outputs: fill rate, remaining seats, overbooking/under-fill signals. Capacity is an **input** to the derivation; it is never stored as an expectation row.

### 5. How it avoids EAV drift
Replaces the `license_capacity` location EAV field with one typed table (integer constraint, FK scope refs, kind enum), one resolver, partial-unique per (scope, kind, dimension, date). New computation reads the table, not EAV; no dual-write.

### 6. How it respects org/location scoping
`org_id` on every row; scope ids reference org-scoped `locations` / `location_program_categories`; RLS via `has_org_role(org_id, ['owner','admin','ops','manager'])` for read and admin roles for write, matching `schedule_patterns`.

### 7. Risks / tradeoffs
- **Resolution precedence complexity** — mitigated by the single shared resolver + tests.
- **Two kinds (licensed/operational)** add a column but prevent a future migration; recommended now.
- **Age-band vs room licensing** varies by jurisdiction — the optional `dimension` covers it without forcing all orgs to use it.

### 8. Final decision language
> Capacity is first-class L1 configuration: a single effective-dated `capacity_rules` family scoped org → site → program → room (most-specific-wins), distinguishing `licensed` from `operational` seat limits. It retires the `license_capacity` EAV field. Expected occupancy is derived by comparing committed-schedule headcount against resolved capacity; capacity is an input, never a stored expectation.

---

## 2. Ratio rules

### 1. Recommended canonical grain
A first-class `ratio_rules` **compliance** table, effective-dated, keyed primarily on **age group** (the regulatory key), resolved org-default → site override, with optional program/room specificity where operationally required. A ratio rule expresses **max children per staff** (and the inverse is derivable) for an age-group dimension, with an optional `jurisdiction_key`.

- Primary dimension: `age_group_key` (from `classroom_age_group` option set).
- Scope: `org` default → `site` → (optional) `program`/`room`.
- `jurisdiction_key` text now (e.g. state code) to anchor regulatory provenance; a full regulation catalog is deferred.

### 2. Alternatives considered
- **(A) Ratio as a number on the room / EAV.** Rejected: not compliance-grade, no effective dating, no jurisdiction provenance, no age-group keying.
- **(B) Ratio embedded in `capacity_rules`.** Rejected: capacity (seats) and ratio (staffing) are different invariants and feed different expectations (occupancy vs staffing). Embedding blocks expected-staffing derivation and muddies the legal ceiling.
- **(C) Org-only ratios.** Rejected: multi-site / multi-jurisdiction orgs need site-level overrides; single-site orgs simply use org defaults.

### 3. Why it fits truth-flow doctrine
Ratios are a **legal invariant** — exactly the case the doctrine names for **code-owned, first-class L1 config**, not JSON. Effective dating preserves the compliance timeline. Keeping ratios separate from capacity keeps each invariant clean.

### 4. How it derives Schedule Expectations
Expected ratio / staffing demand (L3) = expected children per room/day (from schedule expectations) ÷ resolved ratio for that room's age-group/date → **expected staff required** and a **ratio-compliance projection** (will this room be compliant given committed schedules?). Pure derivation; non-authoritative.

### 5. How it avoids EAV drift
One typed table keyed on the age-group option set, with jurisdiction provenance and a single resolver. No ratios scattered across location fields or pattern JSON. Mixed-age rooms resolve via **most-restrictive-wins** in the resolver, deterministically.

### 6. How it respects org/location scoping
`org_id` on every row; age-group keys from the org option set; site/program/room overrides reference org-scoped ids; `has_org_role` RLS consistent with other config.

### 7. Risks / tradeoffs
- **Jurisdiction scope creep** — capped now by a single `jurisdiction_key` column; a regulation catalog is a future decision, not this slice.
- **Mixed-age room resolution** — most-restrictive-wins is a resolver rule; document it so staffing forecasts are predictable.
- **Ratio expressed as children-per-staff vs staff-per-children** — pick children-per-staff as canonical storage; expose the inverse in read models.

### 8. Final decision language
> Staff:child ratios are first-class L1 compliance configuration: an effective-dated `ratio_rules` family keyed on age group (with optional program/room scope and a `jurisdiction_key`), resolved org-default → site override, stored as max children per staff. Ratios are modeled separately from capacity. Expected ratios and staffing demand are derived by dividing expected room headcount by the resolved ratio; mixed-age rooms resolve most-restrictive-wins.

---

## 3. Schedule rules

### 1. Recommended canonical grain
A first-class `schedule_rules` table for **operating constraints, windows, eligibility, and policy** — explicitly distinct from `schedule_patterns` (which remain the child schedule **intent/catalog**). Effective-dated, resolved org-default → site override, with program/age-group dimension where required. `schedule_rules` own:

- **Operating windows** — operating days/hours envelope per site.
- **Eligibility** — which `schedule_patterns` / schedule-types are valid for a given program or age-group.
- **Policy constraints** — min/max days per week, allowed combinations, enrollment policy limits.

**Calendar closures/holidays** (Open Question 4) are a closely-related but separate companion concern: recommend a small `operating_calendar_exceptions` companion (closure dates per org/site) rather than overloading `schedule_rules`. `schedule_rules` reference the operating envelope; the exceptions table supplies date-specific closures consumed by the expectation calendar expander.

### 2. Alternatives considered
- **(A) Fold rules into `schedule_patterns.metadata` (JSON).** Rejected: JSON-on-pattern is EAV drift, mixes catalog (intent) with policy (config), and breaks the intent/constraint separation.
- **(B) No `schedule_rules`; infer everything from patterns.** Rejected: patterns cannot express operating hours, closures, eligibility, or min/max policy. Expectation calendars would be wrong on closed days.
- **(C) One mega-table for windows + eligibility + closures.** Rejected: closures are date-instance data with different cardinality/lifecycle; a focused companion table is cleaner and avoids a sprawling rules row.

### 3. Why it fits truth-flow doctrine
`schedule_rules` are **L1 Configuration** (how the org operates); `schedule_patterns` are **L2 Intent** (the committed/selected child schedule); `schedule_assignments` are the committed binding. Separating rules (config) from patterns (intent) from assignments (commitment) keeps each layer clean and prevents a duplicate schedule concept.

### 4. How it derives Schedule Expectations
The calendar-expansion service uses `schedule_rules` operating windows **minus** `operating_calendar_exceptions` closures to bound which `schedule_patterns.weekdays` count as **expected service days** for a date range. Eligibility constrains which assignments are *valid* (a validation concern), not an expectation. Expectations remain derived/non-authoritative.

### 5. How it avoids EAV drift
Typed config tables instead of JSON-on-pattern or location fields; an explicit doctrine boundary (`schedule_rules` ≠ `schedule_patterns`) prevents the duplicate-schedule-concept drift the report flagged.

### 6. How it respects org/location scoping
`org_id` on every row; site overrides reference site `locations.id`; program/age-group dimensions reference org-scoped ids/option sets; `has_org_role` RLS like `schedule_patterns`.

### 7. Risks / tradeoffs
- **Boundary confusion with `schedule_patterns`** — the single biggest risk; mitigated by explicit decision language below and a doctrine line.
- **Scope creep (windows vs eligibility vs closures)** — capped by keeping `schedule_rules` to windows+eligibility+policy and pushing date-closures to the companion table.
- **Closures table couples to Open Question 4** — confirm calendar-exceptions ownership before P1 if expectation accuracy on closed days is in Phase 1 scope.

### 8. Final decision language
> `schedule_patterns` remain the child schedule intent/catalog (L2). `schedule_rules` are first-class L1 configuration defining operating windows, pattern/schedule-type eligibility, and min/max policy, resolved org-default → site override. Date-specific closures live in a companion `operating_calendar_exceptions` table. Expected service days are derived by intersecting committed schedule patterns with operating windows minus closures; eligibility validates assignments and is not an expectation.

---

## Consolidated decisions (doctrine/planning-ready)

1. **Capacity** — effective-dated `capacity_rules`, scoped org → site → program → room (most-specific-wins), `licensed` vs `operational` kinds; retires `license_capacity` EAV.
2. **Ratio** — effective-dated `ratio_rules`, first-class compliance, keyed on age group + optional program/room + `jurisdiction_key`, org-default → site override, children-per-staff; modeled separately from capacity; mixed-age = most-restrictive-wins.
3. **Schedule** — `schedule_patterns` stay intent/catalog; `schedule_rules` own operating windows + eligibility + policy (org-default → site override); closures in a companion `operating_calendar_exceptions` table.
4. **Cross-cutting** — one effective-dated table per family, one shared deterministic most-specific-wins resolver, org-default-keys-on-stable-key / override-keys-on-concrete-id, `has_org_role` RLS, no EAV/JSON rule values, expectations remain derived.

**Still open before P1 (narrowed):**
- Confirm whether `operating_calendar_exceptions` (closures) is in Phase 1 scope or deferred (links to Open Question 4).
- Confirm `jurisdiction_key` is sufficient for ratio provenance in V1 (full regulation catalog deferred).

---

## When this memo must be updated

A rule family's scope precedence, dimension keys, or the intent-vs-config boundary changes; or the calendar-exceptions ownership decision lands.
