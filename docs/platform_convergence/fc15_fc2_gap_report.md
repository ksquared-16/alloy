# FC-1.5 + FC-2 Gap Report

**Date:** 2026-06-07  
**Branch:** `cursor/field-catalog-fc15-fc2`  
**Scope:** Seed parity + layout-config picker alignment (no runtime cutover)

---

## FC-1.5 — inquiry_child seed parity

| Item | Status |
|------|--------|
| All-org idempotent migration (`20260607120000_inquiry_child_native_parity_fc15.sql`) | Added — 7/7 native keys |
| CI migration SQL test | `web/tests/fields/inquiryChildNativeParityMigration.test.ts` |
| Parity helper + unit test | `web/lib/fields/inquiryChildFieldParity.ts` |
| Live org parity on Seed World | **Not verified in CI** — requires deployed migration + reference org query |

**Required keys (manifest-aligned):** `desired_start_date`, `location_id`, `desired_program_type`, `program_room_cohort_key`, `desired_schedule_type`, `outcome_status_key`, `notes`

Prior migrations (`20260520120000`, `20260529120000`) partially seeded keys; FC-1.5 migration consolidates 7/7 idempotently.

---

## FC-2 — Picker / manifest gaps

| ID | Gap | FC-3 / FC-5 owner |
|----|-----|-------------------|
| G1 | `person.primary_contact_name` — no single registry field; hidden from picker | FC-3 computed display |
| G2 | `location.*` / `customer.*` declared in manifest but picker-hidden (no resolvable fields) | FC-3 reference bindings |
| G3 | Durable `child.*` (DOB, age_band, first/last) hidden until FC-5 | FC-5 customer_member registry |
| G4 | `child` picker group on Lead layouts omitted (FC-5) — only `child.name` on child drawer | FC-5 |
| G5 | Default stored LayoutDocs still contain legacy refKeys (`child_inquiry.*`, `person.primary_*`) | FC-6 alias retirement |
| G6 | `customer_member` not in field_definitions allowlist — child group still person-bridged in API load | FC-5 |
| G7 | Opportunity field_definitions not all-org seeded — curated fallback may still apply | Ops / seed follow-up |

---

## Optional person identity system defs (identified, not built)

| field_key | Note |
|-----------|------|
| `first_name` | Registry-backed; layout binding FC-3 |
| `last_name` | Registry-backed; layout binding FC-3 |
| `display_name` | No `person.primary_contact_name` row — computed in FC-3 |

---

## Picker confirmation

- `child_inquiry.*` is **not** emitted by manifest-filtered Lead / person / child picker paths.
- Mis-grained `child.program`, `child.location`, etc. are blocked.
- Widgets remain separate from fields (unchanged global widget catalog).

---

*Layout config only. No AdminV2 reveal, drawer VM, queue runtime, or LayoutDoc migration.*
