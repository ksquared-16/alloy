# Sprint (planned): Staging demo data reset + realistic seed

**Timing:** After the **communications** sprint. **Do not wipe or reseed staging until that work lands** — this document is planning only.

## Why

`access_validation_demo_v1` / `v2` served access-model and UI hardening. It is **not** the long-term product-validation dataset. **Do not continue expanding** `access_validation_demo` seeds; use cleanup envs (`ACCESS_VALIDATION_CLEAN_DEMO`, etc.) when you need a quiet org, then move to realistic data below.

## Goal

Replace ad-hoc validation seeds with **one realistic demo/reseed path** that reflects how customers actually configure Alloy:

- Departments, work units, queue definitions, layouts  
- Actions / placements and communications  
- Opportunities, customers, persons, jobs, schedules, payments  

## Personas (unchanged intent)

Seeded or scripted users should still support manual checks:

| Persona   | Departments | Sites                          |
|----------|-------------|---------------------------------|
| Corporate | All         | All                             |
| Regional  | Relevant set| Multiple allowed sites          |
| Director  | Allowed set | Single (or restricted) site   |

## Location filter (product direction)

Layer filters for workspace and lists:

1. **Site first** (`location_type = site`), intersected with access scope — **view filter only**, not permission elevation.  
2. **Optional** room / age grouping where the org configures it.  
3. Effective rows = `access_scope ∩ selected_site ( ∩ optional subgroup )`.

Plumbing for site-only header filter exists; full layering comes with this sprint’s list/workspace wiring.

## Deliverables (when executed)

- One documented `npm`/script entry (or CI-safe dry-run) to **reset** non-production staging demo data and **reseed** realistic rows.  
- No dependency on expanding `access_validation_demo_*` for new features.
