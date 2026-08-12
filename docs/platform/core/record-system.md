---
owner: platform
status: canonical
last_reviewed: 2026-07-12
supersedes: []
---

# Record system

**Status:** Canonical (June 2026 freeze).

Authoritative record payloads, resolver paths, and the queue preview boundary.

---

## Core rule

**Queue → select entity → entity GET → act.**

Queue rows are **preview/selection only**. Never use queue JSON for business logic, workflow conditions, action payloads, financial calculations, identity resolution, or drawer authority.

---

## Authority sources

| Need | Source |
|------|--------|
| Drawer payload | `GET /api/admin/entity/[type]/[id]` |
| Jobs flat record | RRS — `resolveJobRecord` |
| Opportunities | `respondOpportunityEntityGet` (not RRS today) |
| Field policy | `_field_policy_resolved` on GET; PATCH enforcement on opportunity/job |
| Layout composition | Settings layouts + `effectiveDrawerLayoutPreview` |

---

## Entity GET surfaces

Opportunity surfaces: `drawer_visible`, `drawer_initial`, `full` — progressive loading with composed payload readiness gates.

Person/Child: canonical VM runtime with Focus Panel body (July 2026 hard cutover).

---

## PATCH and validation

- Opportunity PATCH: `enforceDrawerFieldPoliciesOnPatch` with layout-aware effective policy
- Completion guardrails on lifecycle execute paths
- Violation contract: structured `{ field_key, code, message }`

---

## Inbound identity mutation authority

Manual Create Lead and public lead-capture forms use one authority path:

`source adapter → Processing Case → immutable facts → candidate resolution → operator decision → immutable Commit Plan → exact approval → explicit executor commit`

- Intake writes no `persons`, `customers`, `customer_members`, or `opportunities`.
- Plans contain registered semantic command keys, never arbitrary table writes.
- Approval binds to one plan version/content hash; revisions invalidate approval.
- Atomic identity operations execute in one database transaction; dependent failures are recorded for retry/compensation.
- Identity-review gate: plausible matches, ambiguity, and contradictions block plan build, approval, and execution until explicit operator resolution; record creation is never the silent fallback. Subject eligibility: `confirmed_existing`, `confirmed_new`, `needs_review`, `conflicted`, `unresolved`.
- `applyFormIntakeSafe` is retired and throw-only. There is no D4/D5 legacy fallback or runtime feature flag.

Processing owns inbound information resolution; entity, workflow, and Business Process systems retain authority after handoff.

---

## Inquiry children

- `_inquiry_children` merges OCM + active `customer_members` (child relationship)
- Child enrollment SoT: `opportunity_customer_members.outcome_status_key`
- Case coordination: `opportunities.status_key` — not per-child substitute

---

## Relationship model (June 2026)

### Doctrine

| Principle | Detail |
|-----------|--------|
| Global person identity | `persons` — one human, many scoped links |
| Household membership | `customer_persons` — role on account, not child responsibility |
| Child responsibility | `customer_member_contacts`, OCM links — scoped to child/member |
| Not booleans on person | Primary contact, emergency contact, pickup authorization are **relationship actions**, not inline person fields |

### Child-scoped relationships

Guardians, emergency contacts, authorized pickup, billing/payer contacts — each may scope to:

- this child
- selected siblings
- all children in household

Runtime: `layoutRuntimeScopedRelationshipContacts.ts`, `fetchChildScopedContactLinks.ts`, relationship action wizard.

### Durable write surfaces

`contacts`, `customer_persons`, `customer_members`, `opportunity_persons`, `opportunity_customer_members`, `customer_member_contacts`, plus `workflow_events` for audit.

### Primary contact

- One primary per household scope; old primary remains linked as additional contact
- Designation via **Make Primary Contact** layout action or PATCH `/api/admin/customers/[id]/household-primary-contact`
- Event: `household.primary_contact_changed`
- **Copy from primary** (Household card, secondary / other parent-guardian action): copies Context Detail channels from the primary person onto another household adult — `email`, `phone`, and address fields only (never name). Confirm modal (`HouseholdCopyPrimaryContactConfirmModal`) → `copyPrimaryContactDetails` → `savePersonContact` on the target person. Empty primary values are skipped so secondary blanks are not wiped.

See `../modules/actions-and-workflows.md` § Relationship Action Framework.

---

## Operational attention on records

Entity GET may attach `_operational_attention`, `_attention_suggestion`, `_operational_summary` — deterministic; enrich is separate gated POST.

---

## Configuration ownership

| Concern | Settings plane |
|---------|----------------|
| Drawer field placement | Layouts |
| Field registry | Fields |
| Section labels | Field grouping |
| Action buttons | Actions |

---

## Related

- `../operator/queue-system.md`
- `../operator/drawer-system.md`
- `entity-model.md`
- Detailed PATCH/layout rules: `../../system/record-system.md` (transitional expanded reference)
