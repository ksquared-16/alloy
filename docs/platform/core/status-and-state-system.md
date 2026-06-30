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

1. **Change Enrollment Status** — `update_enrollment_status` — OCM-first modal; BP transition rules; preflight (replaces generic update status on enrollment surfaces)
2. **Admin actions** — `executeAdminAction` with guardrails
3. **Workflow effects** — event-triggered automation
4. **Stage outcome rules** — metadata-driven routing after outcome picker
5. **Direct PATCH** — field-policy bounded; not a substitute for lifecycle actions where catalog exists

---

## Create Lead and New Leads lane

| Topic | Behavior |
|-------|----------|
| **Create Lead binding** | Writes `opportunity.status_key` from BP lifecycle binding (legacy `new_inquiry` retained; **displays as "New Lead"** — product language is Lead, not Inquiry) |
| **OCM at intake** | `outcome_status_key = null` — a brand-new lead has no enrollment disposition (the OCM domain defines none for "lead"); the child badge is **suppressed** until a real enrollment outcome. Never `new_inquiry`. |
| **Status language** | No operator-facing "Inquiry". `new_inquiry` definitions relabeled to "New Lead"; `canonicalNewLeadStatusLabel` covers lingering keys; legacy child `new_inquiry` rows cleaned to `null` via `scripts/suppressLegacyChildNewInquiryStatus.ts` (org-scoped, dry-run first) |
| **Legacy compatibility** | Existing `open` / `new` / `new_inquiry` records appear in New Leads via alias expansion — no per-org queue migration required |
| **Queue filter path** | V2 execution prefers `filters_compat_v1`; aliases merged at runtime (`enrollmentLeadStageStatusAliases.ts`, accepts `new_lead` + legacy `new_inquiry`/`open`/`new`) |

---

## Canonical action catalog

Platform `action_definitions` aligned to lifecycle matrix. Relationship actions seeded globally (`20260622210000_relationship_action_definitions.sql`). Legacy `*_placeholder` keys being retired.

**Shipped:** `move_to_waitlist` activation path; `update_enrollment_status`; unified relationship framework.

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
