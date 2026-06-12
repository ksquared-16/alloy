# Status and state system

**Status:** Canonical (June 2026 freeze).

How status keys, state transitions, and lifecycle ownership work across grains.

---

## Two enrollment grains (frozen)

| Grain | Storage | Owns |
|-------|---------|------|
| **Case** | `opportunities.status_key` | Household coordination — tours, follow-up, broad open/closed |
| **Child enrollment** | `opportunity_customer_members.outcome_status_key` | Waitlisted, enrolling, enrolled, withdrawn, etc. |

**Do not** treat case status as every child's enrollment state.

Status definitions live in org config (`status_definitions`) with `entity_type` discriminating opportunity vs OCM.

---

## Business process stages vs status

| Concept | Role |
|---------|------|
| **Stage** | Operator journey step — queue membership + operating plan |
| **Status key** | Platform state on entity row — may bind to stage transitions |
| **Outcome** | Human-selected result from expected work (outcome picker) |

Stages are **not** separate work units in enrollment — they are lanes inside `enrollment_pipeline`.

---

## Transition paths

1. **Admin actions** — `executeAdminAction` with guardrails
2. **Workflow effects** — event-triggered automation
3. **Stage outcome rules** — metadata-driven routing after outcome picker
4. **Direct PATCH** — field-policy bounded; not a substitute for lifecycle actions where catalog exists

---

## Canonical action catalog

Platform `action_definitions` aligned to lifecycle matrix. Legacy `*_placeholder` keys being retired.

**In progress:** `move_to_waitlist` activation; `mark_won` deprecation.

---

## Strict mode (planned activation)

Readiness tooling shipped for child lifecycle gates. **Activation deferred** until OCM/backfill QA complete.

---

## Needs Attention (not a status)

Resolver output (`resolveOpportunityAttention`) — operational overlay with reason codes. Distinct from `status_key`.

---

## Configuration surfaces

| Surface | Location |
|---------|----------|
| Status definitions | `/admin/settings/statuses` |
| Stage ↔ status binding | Business process builder |
| Field requirements | Stage required information |

---

## Open work

Status ownership grain expansion for additional entity types — track in `../foundation/product-roadmap.md` (In Progress).

---

## Related

- `business-process-system.md`
- `record-system.md`
- Supplemental enrollment detail: `../../product/crm-system.md`
