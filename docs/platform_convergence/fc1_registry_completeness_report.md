# FC-1 Registry Completeness Report

**Path:** `docs/platform_convergence/fc1_registry_completeness_report.md`  
**Date:** 2026-06-06  
**Sprint:** FC-1 — Layout Field Catalog Convergence  
**Status:** Post-implementation snapshot (static + code paths)

**Reference:** [`field_catalog_phase0_report.md`](./field_catalog_phase0_report.md), [`fc1_preflight.md`](./fc1_preflight.md), [`child_namespace_decision.md`](./child_namespace_decision.md)

---

## Executive summary

FC-1 aligned the **layout field catalog** (`fieldCatalog.ts`, field-catalog API) to canonical refKey namespaces and registry-backed `inquiry_child` rows. Alias-on-read bridges legacy `child_inquiry.*` and mis-grained `child.*` participation keys. **No runtime, layout doc, or lifecycle cutover** was performed.

| Group | Registry source | FC-1 behavior |
|-------|-----------------|---------------|
| `opportunity` | `field_definitions` (`entity_type: opportunity`) | DB-first; curated bootstrap if empty |
| `person` | `field_definitions` (`entity_type: person`) | DB-first; canonical `person.phone` / `person.email` in curated fallback |
| `child` (durable) | **`person`** (interim bridge) | DB-first from person rows + durable curated keys; **not** person == child |
| `inquiry_child` (OCM) | `field_definitions` (`entity_type: inquiry_child`) | DB-first; manifest narrow fallback for missing natives |

---

## Inquiry child native parity (7/7)

| field_key | Manifest | FC-1 catalog refKey | Parity risk |
|-----------|----------|---------------------|-------------|
| `desired_start_date` | Yes | `inquiry_child.desired_start_date` | Orgs missing row → curated fallback |
| `desired_program_type` | Yes | `inquiry_child.desired_program_type` | Same |
| `desired_schedule_type` | Yes | `inquiry_child.desired_schedule_type` | Same |
| `outcome_status_key` | Yes | `inquiry_child.outcome_status_key` | Same |
| `notes` | Yes | `inquiry_child.notes` | Same |
| `location_id` | Yes | `inquiry_child.location_id` | Conditional migration — gap on some orgs |
| `program_room_cohort_key` | Yes | `inquiry_child.program_room_cohort_key` | Same |

**Exit criterion not verified live in FC-1:** parity SQL on staging reference org (BL-1). API returns `catalogMeta.curatedFallbackGroups` when fallback used.

---

## Alias map (implemented)

| Legacy / mis-grained refKey | Canonical refKey |
|----------------------------|------------------|
| `child_inquiry.desired_start_date` | `inquiry_child.desired_start_date` |
| `child_inquiry.program` | `inquiry_child.desired_program_type` |
| `child_inquiry.status` | `inquiry_child.outcome_status_key` |
| `child_inquiry.child_name` | `child.name` (interim repeater summary) |
| `child.program` | `inquiry_child.desired_program_type` |
| `child.desired_start_date` | `inquiry_child.desired_start_date` |
| `child.status` | `inquiry_child.outcome_status_key` |
| `child.location` | `inquiry_child.location_id` |
| `child.room` | `inquiry_child.program_room_cohort_key` |
| `child.schedule` | `inquiry_child.desired_schedule_type` |
| `person.primary_phone` | `person.phone` |
| `person.primary_email` | `person.email` |

Module: `web/lib/layout/layoutRefKeyAliases.ts`

---

## CURATED_FIELDS shrink (FC-1)

| Group | Before FC-1 | After FC-1 |
|-------|-------------|------------|
| `opportunity` | 8 bootstrap keys | Unchanged (global seed gap B7) |
| `person` | 5 keys (`primary_phone`, `primary_email`) | 5 keys; phone/email canonical |
| `child` | 5 keys incl. participation (`program`, `desired_start_date`, `status`) | 5 durable keys only |
| `child_inquiry` | 4 deprecated-namespace keys | **Removed** — replaced by `inquiry_child` manifest fallback |

---

## Remaining gaps (FC-2+ blockers)

| ID | Gap | FC-2 impact |
|----|-----|-------------|
| G1 | All-org inquiry_child 7/7 not proven (M1 migration) | Catalog fallback on some orgs |
| G2 | `customer_member` not in field_definitions allowlist | Durable `child.*` still person-bridged |
| G3 | `person.primary_contact_name` — no single registry field | Layout Contract §1.4 strict mode |
| G4 | `child.name` / DOB / age_group — no universal registry rows | Repeater + lifecycle binding drift (FC-3) |
| G5 | Default Lead layouts still use legacy `child.program` etc. | Alias-on-read only; doc migration deferred |
| G6 | Lifecycle rules without bindings (`child:location`, waitlist) | Out of FC-1 scope |
| G7 | Opportunity field defs not all-org seeded | Opportunity curated fallback persists |

---

## FC-2 readiness assessment

**Ready to start FC-2 (layout storage metadata / field_placements linkage)** when:

- [ ] M1 backfill proves inquiry_child 7/7 on reference org(s)
- [ ] CI parity test on fixture org (BL-4)
- [ ] Product sign-off on default layout doc migration plan (alias-only until then)

**FC-1 delivered:** canonical namespace enforcement in catalog API, alias-on-read, deprecate-on-write for `child_inquiry.*`, reduced CURATED_FIELDS, tests, this report.

**Not required for FC-2 planning:** lifecycle evaluator changes, drawer runtime cutover, `customer_member` entity_type.

---

*Layout catalog only. Preview flag-gated. No production cutover.*
