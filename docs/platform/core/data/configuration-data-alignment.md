---
owner: platform
status: canonical
last_reviewed: 2026-07-13
supersedes: []
---

# Canonical Configuration Data Alignment

**Status:** Phase 5 formal contract (June 2026); Child hub ownership grain clarified July 2026

How Configuration surfaces relate to canonical data — metadata only, not operational truth.

**Doctrine:** Settings → Fields models canonical ownership. Surface availability is separate. Projection onto a Child subject does not reassign Enrollment-owned fields to Child Profile.

---

## Configuration consumers

| Surface | Reads canonical | Writes canonical | Writes metadata |
|---------|-----------------|------------------|-----------------|
| Settings → Fields | field_definitions | field_definitions rows | Yes |
| Settings → Statuses | status_definitions | status_definitions rows | Yes |
| Business Processes | field_definitions, status_definitions, transition rules | BP JSON, stage bindings | Yes |
| Layouts | field_definitions, layout catalog | layout JSON (refKeys) | Yes |
| Forms | system field registry → canonical refs | form schemas | Yes |
| Actions | action_definitions | placements, config | Yes |
| Lifecycle field rules | reference matrix | rule_id bindings in BP metadata | Indirect |

---

## Fields configured vs stored

| Config action | Storage effect |
|---------------|----------------|
| Add custom field (allowed entity) | Inserts `field_definitions`; values appear in `field_values` on first write |
| Seed native parity fields | Inserts manifest rows from registries (`canonicalNativeColumnParity`) |
| Edit label / options | Updates `field_definitions` only |
| Layout picker refKey | References `{entity_type, field_key}` — does not duplicate values |

**Rule:** Configuration defines **identity and presentation** of fields; runtime entity rows hold **values**.

---

## Status configured vs stored

| Config action | Storage effect |
|---------------|----------------|
| Add status definition | Inserts `status_definitions` row |
| Stage ↔ status binding | BP metadata — applied on transition actions |
| Transition rules | `status_transition_rules` — gates action mutations |

Configuration **never** directly sets `status_key` on live records except through seeded defaults on create paths.

---

## Child grain in configuration

| entity_type in field_definitions | Meaning | Settings Child hub section |
|----------------------------------|---------|----------------------------|
| `customer_member` | Child **profile** config fields (gender, allergies, …) | Child Profile |
| `inquiry_child` | **Enrollment** participation fields on OCM | Enrollment |
| `person` | Guardian/adult fields | (Person hub) |
| `opportunity` | Case-level fields | (Lead hub) |
| `customer` | Household fields | (Family hub) |

Operator-friendly hub label **Child** may group both Child Profile and Enrollment sections. Each field row must retain its canonical owner grain. Enrollment assignment fields (location/program/room/schedule) reference Location/Program/Room **option masters**; assignment ownership stays Enrollment.

Ownership guard rejects cross-grain registration (`validateFieldDefinitionOwnership`).

Layout picker uses `child.*` refKeys for profile fields; canonical entity_type remains `customer_member`.

---

## Native parity (implemented)

Manifest rows from:

- `customerMemberFieldRegistry` (FC-CM-1 config fields)
- `inquiryChildFieldRegistry` (OCM native fields)
- `opportunityFieldRegistry` (case reference fields)

Scripts:

```bash
cd web && npx tsx scripts/canonicalNativeColumnParityDryRun.ts
cd web && CANONICAL_PARITY_CONFIRM=APPLY_FIELD_DEFINITION_PARITY npx tsx scripts/canonicalNativeColumnParitySeed.ts --apply
```

---

## Reference matrix (configuration convergence)

Legacy identifiers map to canonical refs:

| Legacy kind | Example | Canonical ref |
|-------------|---------|---------------|
| lifecycle rule_id | `child:first_name` | `customer_member:first_name` |
| forms system id | `child_first_name` | `customer_member:first_name` |
| layout refKey | `child.gender` | `customer_member:gender` |
| layout refKey | `inquiry_child.location_id` | `inquiry_child:location_id` |

Module: `web/lib/fields/fieldRegistryReferenceMatrix.ts`.

---

## Writes allowed (configuration)

| Operation | Target |
|-----------|--------|
| CRUD field_definitions | Metadata |
| CRUD status_definitions | Vocabulary |
| CRUD action_definitions | Action catalog |
| BP stage / rule config | JSON metadata |
| Layout publish | Presentation JSON |
| Parity seed apply | field_definitions insert (idempotent) |

---

## Writes forbidden (configuration)

| Operation | Reason |
|-----------|--------|
| field_definitions as runtime value store | Use field_values |
| Register profile field on inquiry_child | Ownership guard |
| Register enrollment field on customer_member | Ownership guard |
| Duplicate field_key per entity_type | Parity / duplicate detection |
| Config UI direct PATCH to entity rows | Must go through admin API / actions |

---

## Source of truth

| Concern | Source |
|---------|--------|
| Field identity | `{entity_type, field_key}` in field_definitions |
| Field value | Entity row + field_values |
| Status vocabulary | status_definitions |
| Stage journey | Business Process config |
| Layout binding | refKey → reference matrix → canonical ref |

---

## Remaining gaps

| Gap | Phase |
|-----|-------|
| Lifecycle binding UI shows `child` palette entity but stores customer_member refs | Documented; alias acceptable |
| Forms picker entity_type `child` vs canonical `customer_member` | Forms grouping only |
| Obsolete `child_inquiry.*` layout keys | Alias-on-read; migrate stored JSON Phase 6 |
| Field catalog convergence (17 parallel catalogs) | Ongoing; canonical registries are anchor |
| Configuration UI redesign for BP perspective cards | Out of scope Phase 5 |

Tests: `configurationOwnershipDoctrine.test.ts`, `configurationRuntimeDesignAlignment.test.ts`, `canonicalNativeColumnParity.test.ts`.
