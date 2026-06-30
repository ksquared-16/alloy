# Status and state system

**Status:** Canonical (June 2026 freeze).

How status keys, state transitions, and lifecycle ownership work across grains.

---

## Status Truth Doctrine — there is no generic status (frozen)

**Every status belongs to a subject/grain.** "Status" alone is never a valid field — a status is only
meaningful with its domain. Four domains:

| # | Domain | Canonical field | `status_definitions` entity_type | Subject / grain | Answers |
|---|--------|-----------------|----------------------------------|-----------------|---------|
| 1 | **Lead Status** | `opportunities.status_key` | `opportunities` | family / opportunity | Where is this family in the enrollment pipeline? (New Lead, Contacting, Qualified, Tour Scheduled…) |
| 2 | **Child Enrollment Status** | `opportunity_customer_members.outcome_status_key` | `opportunity_customer_members` | child / member | What is this child's enrollment outcome? (Waitlisted, Enrolling, Enrolled…) |
| 3 | **Person Status** | `persons.status_key` | `persons` | person | Is this person active / inactive / archived? |
| 4 | **Customer / Account Status** | `customers.status_key` | `customers` *(registered; not yet seeded with definitions in practice)* | household / account | Is this account active / inactive / archived? |

**Rules:**
- **Lead stage uses Lead Status; Waitlist stage uses Child Enrollment Status.** Do **not** treat a
  family's lead status as a child's enrollment state, or vice versa. A family whose *lead* status is
  `waitlisted` is **not** a child-grain waitlist row.
- **Counts follow the selected grain.** Family-grain status → count families/opportunities; child-grain
  status → count child/member rows (one family with two waitlisted children counts as **2**); person-grain
  → count people.
- **`status_definitions.entity_type` discriminates the domain** (`opportunities` / `opportunity_customer_members`
  / `persons` / `customers`). The evaluator resolves each domain from its own row field — never a shared set.

> **Person / Account Status are not yet Work View conditions** — see *Work View conditions* below. Account
> Status has no seeded `status_definitions`; Person Status is not carried on opportunity/child Work View
> rows. Exposing either before it is backed would create a dead condition (resolves null → excludes all).

---

## Two enrollment grains (frozen)

| Grain | Storage | Owns |
|-------|---------|------|
| **Case** | `opportunities.status_key` | Household coordination — tours, follow-up, broad open/closed |
| **Child enrollment** | `opportunity_customer_members.outcome_status_key` | Waitlisted, enrolling, enrolled, withdrawn, etc. |

**Do not** treat case status as every child's enrollment state.

Status definitions live in org config (`status_definitions`) with `entity_type` discriminating opportunity vs OCM.

### Stage membership declares its grain + status domain

A stage's `queue_membership_v1` (`web/lib/lifecycle/queueMembershipV1.ts`) declares the grain and the
status domain explicitly:

- `subject_type: "case"` → Lead Status (`opportunities.status_key`), `included_status_keys`, count unit `cases`.
- `subject_type: "child"` → Child Enrollment Status (OCM `outcome_status_key`), `included_disposition_keys`,
  count unit `enrollment_tracks` (child rows).
- `subject_type: "candidate"` → placement candidate grain, count unit `candidates`.

So **New Leads** is `case`-grain over Lead Status; **Waitlist** is `child`/`candidate`-grain over Child
Enrollment Status. A stage that mixes domains must choose one explicitly (e.g. Registration declares
whether it is Lead-grain or Child-grain).

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

> **Update Status must be domain-aware (next action sprint).** The current registered `update_status`
> action is hardcoded to Lead Status (`opportunities.status_key`). Under the Status Truth Doctrine it must
> split into explicit domain actions — `update_lead_status`, `update_child_enrollment_status`,
> `update_person_status` (one capability per status domain) — so "update status" can never be ambiguous
> about which subject it mutates. See `../modules/actions-and-workflows.md` § Update Status by domain.

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
