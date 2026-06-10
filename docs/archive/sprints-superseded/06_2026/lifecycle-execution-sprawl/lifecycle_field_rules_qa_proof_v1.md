# Lifecycle Builder — Field Rules QA Proof v1

**Date:** May 2026  
**Scope:** Dynamic palette, runtime field enforcement, forms coverage against `field_rules`

---

## Manual QA scenario

| Step | Action | Expected |
|------|--------|----------|
| 1 | Settings → Enrollment Process | Hub loads with stage tabs |
| 2 | Select Enrollment department | Department selector shows org departments |
| 3 | Lead stage → Required Information | Entity tabs: Person, Child, Opportunity (+ Customer fields if configured) |
| 4 | Person → set First Name + Email **Required**; Last Name **Off** | Per-field toggles save |
| 5 | Save | `field_rules` persisted; derived object labels updated |
| 6 | Forms card (Lead) | Shows field-level rows (Person · First Name, Person · Email); summary Complete/Partial |
| 7 | Open lead opportunity missing primary email | Drawer shows opportunity with person lacking email |
| 8 | Run progression action (e.g. Schedule tour) | Preflight blocks with **Person · Email** violation |
| 9 | Add email on primary person | Preflight clears email violation |
| 10 | Reset Lead requirements to default | Platform defaults restored |

---

## What worked (implementation)

- **Dynamic palette:** Catalog fields merged with org `field_definitions` for person, inquiry_child (Child), opportunity, customer. Custom fields appear as config-only options with operator labels.
- **Runtime enforcement:** Enforced catalog rules (`person:*`, `child:*` program/schedule/start/classroom) evaluated in action preflight via `field_rules`. Current operator stage (from status) + action target stage both considered.
- **Object-level fallback:** Labels whose active field rules are all config-only still use legacy object checks (e.g. broad “Person” presence).
- **Forms coverage:** Published schema compared to `field_rules` with Complete / Partial / Unknown summary; guardian form labels map to person field rules.
- **Primary person load:** Opportunity preflight loads `persons` row for `primary_person_id` when evaluating from DB.

---

## Config-only (tracked, not runtime-enforced)

- Custom org fields (`custom:{entity}:{field_key}`)
- Child date of birth / age group
- Opportunity tour date/time/outcome, enrollment date, enrollment packet
- Any field without a binding in `lifecycleFieldRuleBindings.ts`

UI shows: *“Tracked in configuration; runtime enforcement coming later.”*

---

## Remaining gaps

| Gap | Notes |
|-----|-------|
| Custom field runtime | Needs value resolution path (custom field_values on person/OCM) |
| Customer entity requirements | Palette includes customer fields; no enrollment stage defaults yet |
| Status transition preflight | Field rules wired on lifecycle **actions**; generic status changes may still use object/completion rules only |
| Form ↔ stage explicit links | Still intake-type inference |
| Org label on custom fields in form coverage | Custom rules use field_key title-case fallback, not org label from palette |

---

## Automated validation

```bash
cd web && npm run test -- tests/lifecycle/
cd web && npx tsc --noEmit
```
