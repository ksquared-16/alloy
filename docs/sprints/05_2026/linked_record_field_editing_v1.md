# Sprint: Linked Record Field Editing V1 (May 2026)

**Path:** `docs/sprints/05_2026/linked_record_field_editing_v1.md`  
**Status:** **Shipped (V1 — Opportunity → Person)**  
**Parent:** Settings control plane closeout; record UX parity.

---

## Problem

Opportunity drawer fields that represent **primary person** identity (name, email, phone) were shown as linked-record cards or config-driven fields, but inline edit either did not appear or would have PATCHed the opportunity host. Operators need to edit person-owned scalars in place when field policy allows, without denormalizing data onto `opportunities`.

---

## V1 rule

If a field is shown on a drawer surface and **`field_definitions.interaction_policy`** marks it **`editable_through_related_record`** with a valid **one-hop** write target, inline edit is enabled and blur-save PATCHes the **linked record** (`person`), not the host (`opportunity`).

---

## Shipped (Opportunity → Person)

| Host field keys (opportunity `field_definitions`) | Write target | PATCH route |
|---------------------------------------------------|--------------|-------------|
| `first_name`, `last_name`, `email`, `phone` (when policy = `editable_through_related_record`) | `persons` native columns | `PATCH /api/admin/persons/:id` |

**Read path:** `respondOpportunityEntityGet` hydrates mirror scalars on the opportunity GET payload (`first_name`, …) from the linked primary person for display only — not stored on `opportunities`.

**UI:** Drawer overview labels append `(Primary person)`; read-only when no `primary_person_id` / `_primary_person_id`.

**Code:** `web/lib/admin/drawer/linkedRecordFieldEditing.ts`, `fieldEditabilityInDrawer.ts`, `AdminEntityDrawer` save partition, `EntityDrawerOverview` read fallback.

**Tests:** `web/tests/admin/drawer/linkedRecordFieldEditing.test.ts`

**Preset policy:** `personFieldOnOpportunityInteractionPolicy(fieldKey)` in `fieldInteractionPolicy.ts` (also used by config layout assist proposals).

---

## Boundaries (unchanged)

- No duplicate person columns on `opportunities`
- No raw `config_json` edits
- No `executeAdminAction` changes
- No arbitrary multi-record PATCH fanout
- Opportunity PATCH policy enforcement **skips** `editable_through_related_record` keys (client strips them before host PATCH)

---

## Deferred

- Job / customer / contact one-hop hosts
- `_primary_person_name` / `_primary_person_email` display keys as inline editors (use opportunity field defs with interaction policy instead)
- Person **custom** `field_values` from opportunity drawer
- Ops-role inline edit (`canMutate` remains admin-only)
- Server-side person field policy enforcement on `PATCH /api/admin/persons` (admin gate only today)

---

## Validation

```bash
cd web && npx tsc --noEmit
cd web && npm run test -- tests/admin/drawer/linkedRecordFieldEditing.test.ts tests/admin/drawer/fieldEditabilityInDrawer.test.ts tests/fields/fieldInteractionPolicy.test.ts
```
