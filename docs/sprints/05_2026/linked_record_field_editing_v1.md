# Sprint: Linked Record Field Editing V1 (May 2026)

**Path:** `docs/sprints/05_2026/linked_record_field_editing_v1.md`  
**Status:** **In progress — V1 person card shipped; V1b inquiry children + source fields + summary layout (May 2026)**  
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

**Code:** `web/lib/admin/drawer/linkedRecordFieldEditing.ts`, `primaryPersonCardEdit.ts`, `PrimaryPersonContactCard.tsx`, `FamilyContactsPanel.tsx`, `fieldEditabilityInDrawer.ts`, `AdminEntityDrawer` save partition, `EntityDrawerOverview` read fallback.

**UI surfaces:** Config-driven overview fields **and** inquiry summary **Family & contacts** person cards (`FamilyContactsPanel` → `PrimaryPersonContactCard` / `EditablePersonContactCard`). Card saves on **focus leaving the whole card** (350ms delay) so tabbing first → last name does not partial-save.

**Linked adults (parity, May 2026):** `_opportunity_persons` rows with `person_id` render `EditablePersonContactCard` (name, email, phone → `PATCH /api/admin/persons/:id`). Rows without `person_id` stay read-only (no fake edit affordance). Role badge + View person link preserved.

**Tests:** `web/tests/admin/drawer/linkedRecordFieldEditing.test.ts`, `web/tests/admin/opportunity/primaryPersonCardEdit.test.ts`

**Preset policy:** `personFieldOnOpportunityInteractionPolicy(fieldKey)` in `fieldInteractionPolicy.ts` (also used by config layout assist proposals).

---

## Boundaries (unchanged)

- No duplicate person columns on `opportunities`
- No raw `config_json` edits
- No `executeAdminAction` changes
- No arbitrary multi-record PATCH fanout
- Opportunity PATCH policy enforcement **skips** `editable_through_related_record` keys (client strips them before host PATCH)

---

## V1b — Inquiry children + source fields (May 2026)

**Doctrine (all drawer surfaces):** Editability follows the **source record + field policy**, not the host drawer. No denormalizing linked data onto `opportunities`. Hardcoded sections must honor the same rules.

| Surface | Source of truth | PATCH route |
|--------|-----------------|-------------|
| Inquiry children — name, DOB | `customer_members` | `PATCH /api/admin/customer-members/:id` |
| Inquiry children — program, schedule, outcome, notes, **desired start** | `opportunity_customer_members` | `PATCH /api/admin/opportunity-customer-members/:id` (auto-`POST` link when household child not yet on inquiry) |
| Inquiry children — custom fields | `field_values` (`entity_type=inquiry_child`, `entity_id=ocm.id`) | Same PATCH route → `upsertFieldValuesFromBody` for non-native keys |
| Source & external (native) | `opportunities.source`, `external_source`, `external_id` | `PATCH /api/admin/opportunities/:id` |
| Source & external (custom defs, e.g. `inquiry_source`, `desired_start_date`) | `field_values` | `PATCH /api/admin/opportunities/:id` → `upsertFieldValuesFromBody` (custom-only bodies no longer 400) |

**Children parity:** Drawer `_inquiry_children` now merges **active household `relationship=child` members** with OCM join rows (`inquiryChildrenHydration.ts`) so count matches work-unit queue enrichment.

**Summary layout (hardcoded v1, polish):** Left column — Family & contacts + **What matters for this inquiry** (desired start and tour date stacked full-width). Right column — **What BOS has to say** (attention/suggestion when present) + grouped **Tasks** / **Reminders** (or calm empty state) + **Activity** (enrollment packet status from `GET …/enrollment-packets`, helper copy, **Activity** / **Documents** tab switches; hidden when no packet sessions). Overview tab no longer duplicates packet banner. No global drawer Save for these surfaces (`data-opportunity-inquiry-summary-layout="hardcoded_v1"`). Deferred: full **Record layouts** builder for inquiry summary grid.

**Save UX (drawer surfaces):**
- Single native/custom opportunity fields (e.g. `desired_start_date`): save on **blur** to opportunity / `field_values`.
- Person contact cards (primary + linked adults): save when focus leaves the **whole card** (~350ms delay); state: Unsaved changes · Saving… · Saved · Error.
- Inquiry child rows: identity debounced; program/schedule/outcome/notes/**desired start**/custom row-level; per-row state on card.
- All linked-record writes PATCH the **source** record only — never denormalize onto `opportunities`.

**Desired start doctrine:** **Canonical:** `inquiry_child.desired_start_date` on **`opportunity_customer_members`** (Inquiry children rows). **Legacy/fallback:** opportunity-level `desired_start_date` (`field_values` / metadata) — used for placement/queue enrichment and shown as muted **Inherited: {date}** on child rows when OCM is null; **removed** from inquiry summary “What matters” (tour date only there).

**Inquiry child configurable surface (shipped):** Settings → Fields tab **`inquiry_child`** (`inquiryChildFieldRegistry.ts`). Native allowlist: `desired_start_date`, `desired_program_type`, `desired_schedule_type`, `outcome_status_key`, `notes`. Custom defs → `field_values` on OCM id. Drawer: `OpportunityInquiryChildrenSection` loads defs and renders **Desired start** + visible custom text/date columns.

**Tests:** `inquiryChildrenHydration.test.ts`, `inquiryChildFieldEdit.test.ts`, `inquiryChildFieldRegistry.test.ts`, `opportunityDrawerFieldSave.test.ts`, `primaryPersonCardEdit.test.ts`, `enrollmentPacketSummaryPresentation.test.ts`

---

## Opportunity drawer — contact / person cards (audit)

| Surface | When shown | Editable? | PATCH / write route |
|--------|------------|-----------|---------------------|
| **Family & contacts — primary** | Inquiry summary (`family_contacts` in layout) | Yes when `primary_person_id` + policy + `canMutate` | `PATCH /api/admin/persons/:id` |
| **Family & contacts — linked adults** | Same panel; `_opportunity_persons` minus primary | Yes when row has `person_id` + `canMutate` | `PATCH /api/admin/persons/:id` |
| **Family & contacts — linked adults** | Row missing `person_id` | Read-only link/display only | — |
| **Inquiry summary header contact** | Legacy header block when `family_contacts` not in layout | Read-only display | — (use Family & contacts card to edit) |
| **Household people** (`customer_booking` when `family_contacts` not in layout) | Related customer fetch | Read-only link cards | — |
| **Inquiry children** | Children section | Name/DOB → member; program/notes → OCM | See V1b table |
| **Config overview person fields** | Record layout overview | Per `interaction_policy` | `PATCH /api/admin/persons/:id` when `editable_through_related_record` |

**Reusable component:** `EditablePersonContactCard` — any drawer that supplies `personId`, `initialValues`, `gates`, and `onPersonUpdated` after person PATCH. Do not use without a clear person id and person route.

**Display merge after save:** Primary → `applyPersonPatchToOpportunityHydration`; linked list → `applyPersonPatchToOpportunityPersonList` (and primary hydration when same id).

---

## Deferred
- Job / customer / contact one-hop hosts
- Inquiry summary layout via Record layouts config (primitive documented; hardcoded grid only today)
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
