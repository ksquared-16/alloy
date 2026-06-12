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

Person/Child: transitional VM runtime; layout runtime v1 shipped.

---

## PATCH and validation

- Opportunity PATCH: `enforceDrawerFieldPoliciesOnPatch` with layout-aware effective policy
- Completion guardrails on lifecycle execute paths
- Violation contract: structured `{ field_key, code, message }`

---

## Inquiry children

- `_inquiry_children` merges OCM + active `customer_members` (child relationship)
- Child enrollment SoT: `opportunity_customer_members.outcome_status_key`
- Case coordination: `opportunities.status_key` — not per-child substitute

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
