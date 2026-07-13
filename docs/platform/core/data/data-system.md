---
owner: platform
status: canonical
last_reviewed: 2026-07-13
supersedes: []
---

# Canonical Data System

**Status:** v1 complete — sprint closed (June 2026); ownership/projection doctrine clarified July 2026  
**Audience:** Runtime, Configuration, Actions, Workflows, Analytics, BOS, Documents, Reports  
**Prerequisites:** Phases 1–4 (`docs/canonical-data-system-phase-*.md`)

---

## What it is

The **Canonical Data System** is Alloy's single source of truth for **business facts**: who people are, what households contain, which children participate in which enrollment cases, what status each grain holds, and which configurable fields extend native columns.

It is **not** a UI layer, a queue model, or a workflow engine. It is the contract that all platform consumers must read from and write through.

```
field_definitions + status_definitions + action_definitions (config metadata)
        ↓
Canonical entity rows (persons, customers, customer_members, opportunities, OCM, field_values)
        ↓
Runtime / Configuration / Actions / Workflows / Analytics / BOS (consumers — never invent facts)
```

---

## What it owns

| Domain | Owner |
|--------|--------|
| Human identity & contact | `persons` |
| Household / account shell | `customers` |
| Durable child profile | `customer_members` + `field_values` (`entity_type = customer_member`) |
| Enrollment case (family-level) | `opportunities` |
| Child enrollment participation | `opportunity_customer_members` (`inquiry_child` grain) |
| Configurable field metadata | `field_definitions` |
| Configurable field values | `field_values` |
| Status vocabulary | `status_definitions` |
| Allowed status movement | `status_transition_rules` |
| Action metadata | `action_definitions` |

Implementation libraries: `web/lib/fields/*`, `web/lib/lifecycle/*`, `web/lib/completion/*`.

---

## What it does not own

| Not owned | Where it lives |
|-----------|----------------|
| Queue row previews | Work unit queue payloads — selection only, not truth |
| Drawer layout JSON | `record_drawer_layouts` — presentation |
| Business Process stage lanes | BP config — journey, not entity storage |
| Needs Attention overlays | Resolver output — not `status_key` |
| Readiness / completion | Evaluator output — not durable status |
| Workflow run state | `workflow_runs` — orchestration |
| Task / mission state | Operational task tables |
| Analytics rollups (when copied) | Must converge to canonical resolvers — copies are debt |

---

## Platform rules (frozen)

1. **Every business fact exists exactly once** — one owner entity, one storage path.
2. **No runtime-only fields** — if Runtime displays it, Configuration can name it and Actions can mutate it (or it is computed from canonical inputs).
3. **No configuration-only fields** — `field_definitions` without storage backing is invalid for operator fields.
4. **No duplicate statuses** — use `status_key` + `status_definitions`; legacy text `status` columns are deprecated.
5. **No workflow-specific data copies** — workflows orchestrate; they do not fork CRM truth.
6. **No analytics-specific data copies** — metrics read canonical paths or derived views.

---

## Consumer roles

### Runtime (AdminV2, drawers, queues, focus panels)

- **Reads** canonical entity GET / composed drawer payloads / explicit SELECT columns.
- **Never** invents field identity, status vocabulary, or profile facts on OCM.
- **Writes** only through bounded PATCH routes and registered actions.
- See: [./runtime-data-alignment.md](./runtime-data-alignment.md)

### Configuration (Settings, Fields, Statuses, Business Processes)

- **Defines** labels, types, options, stage bindings, transition rules.
- **Does not** store operational truth — seeds `field_definitions` / `status_definitions` only.
- See: [./configuration-data-alignment.md](./configuration-data-alignment.md)

### Actions

- **Deterministic mutations** on canonical entities via `executeAdminAction` and bounded PATCH.
- **Must not** write legacy text status or child profile fields on OCM.
- See: [./action-status-field-matrix.md](./action-status-field-matrix.md)

### Workflows

- **Orchestration** — events, effects, automation.
- **May read** canonical rows; **must not** become a parallel CRM store.

### Analytics / Reports / Documents

- **Consumers** — resolve through canonical entity rows and `field_values`.
- Copies and denormalized metric fields are **convergence debt** (Phase 6).

### BOS

- **Consumer** of canonical attention/readiness signals — recommendations reference entity ids and status keys, not invented fields.

---

## Database vs semantic layer

| Layer | Role |
|-------|------|
| **Postgres tables** | Authoritative storage (`persons.status_key`, not `persons.status`) |
| **`field_definitions`** | Operator-facing metadata for configurable fields |
| **`field_values`** | EAV storage for config fields (`entity_type` + `entity_id` + `field_key`) |
| **TS registries** | Manifests, ownership guards, reference matrix — code-enforced contract |
| **Layout refKeys** | Presentation aliases (`child.*` → `customer_member` for profile) |

Legacy text `status` columns remain in schema but are **blocked at API** and **excluded from runtime SELECTs**. Maintenance fallback: `web/lib/fields/canonicalLegacyStatusMaintenance.ts` (scripts only).

---

## Child grain (critical)

| Grain | Table | Examples |
|-------|-------|----------|
| **Profile** | `customer_members` | first_name, dob, gender, allergies |
| **Enrollment** | `opportunity_customer_members` | desired_start_date, location_id, outcome_status_key |

Profile fields **must not** read/write on OCM. Guards: `canonicalFieldOwnership.ts`, `canonicalStrictMode.ts`.

### Settings ownership vs child-surface projections

Settings → Fields models **canonical ownership**. The operator **Child** hub may list related grains (profile + enrollment) but must not imply one storage grain.

| Assignment on Child surface | Owner | Storage | Option master |
| --- | --- | --- | --- |
| Current Location | Enrollment (`inquiry_child`) | OCM.`location_id` | Location entity catalog |
| Current Program | Enrollment | OCM.`program_category_id` | Location program offerings |
| Current Room | Enrollment | OCM.`program_room_cohort_key` | Room/cohort options scoped to location + program |
| Current Schedule | Enrollment | OCM.`schedule_type` | Schedule option set |

Child Profile owns neither the assignment fields nor the option masters. Projection subject = Child; mutation target = Enrollment/OCM.

Capability ↔ provider contract: if Settings declares a field available for a consumer/context, a resolvable canonical provider must exist. Reserved-key collision guards protect against duplicate custom definitions of native columns — they must not suppress legitimate profile seed fields (e.g. FC-CM-1 `gender`).

---

## Related documents

| Doc | Purpose |
|-----|---------|
| [./entity-specification.md](./entity-specification.md) | Entity ownership |
| [./status-architecture.md](./status-architecture.md) | Status vs readiness vs attention |
| [./field-catalog.md](./field-catalog.md) | Generated field inventory |
| [./field-system.md](./field-system.md) | Field type behavior spec |
| [./relationship-model.md](./relationship-model.md) | Relationship edges |
| [./action-status-field-matrix.md](./action-status-field-matrix.md) | Action/write matrix |
| [./runtime-data-alignment.md](./runtime-data-alignment.md) | Runtime consumer contract |
| [./configuration-data-alignment.md](./configuration-data-alignment.md) | Config consumer contract |
| [Data system audit](../../../audits/archive/2026-06-data-system/canonical-data-system-audit.md) | Cross-reference audit |

Phase implementation logs: `docs/canonical-data-system-phase-1-reset.md` through `phase-4-schema-deprecation.md`.

---

## Enforcement tests

Canonical contract tests live under `web/tests/fields/`:

| Test file | Enforces |
|-----------|----------|
| `canonicalFieldOwnership.test.ts` | Profile vs enrollment ownership |
| `canonicalChildGrainMapping.test.ts` | Reference matrix grain mapping |
| `canonicalReadAlignment.test.ts` | Profile reads, lifecycle bindings, status_key reads |
| `canonicalNativeColumnParity.test.ts` | Parity manifest, legacy SELECT isolation |
| `canonicalLegacyStatusIsolation.test.ts` | Explicit SELECT columns, no runtime legacy fallback |
| `canonicalEnforcement.test.ts` | Index + cross-cutting invariants |

Run:

```bash
cd web && npm run test -- tests/fields/canonical*.test.ts
```

Supporting tests: `lifecycleFieldRuleEvaluator.test.ts`, `attachCustomerMemberProfileToInquiryChildren.test.ts`, `fieldRegistryReferenceMatrix.test.ts`.

---

## Schema drop readiness (Phase 5 classification — superseded)

Legacy text `status` columns **dropped** in Phase 6 migration `20260625140100` (applied 2026-06-25).

---

## Phase 6 (physical cleanup — complete)

See `docs/canonical-data-system-phase-6-physical-cleanup.md` — DB write guards, column drops, SELECT migrations, contacts/analytics/layout audits.

---

## Phase 7 (E2E QA — complete)

See `docs/canonical-data-system-phase-7-e2e-qa.md` — roundtrip validators, intake write fixes, manual checklist, strict mode recommendation, blockers.

---

## Sprint complete (Canonical Data System v1)

**Closed:** 2026-06-25

| Milestone | Status |
|-----------|--------|
| Phases 1–7 | Complete |
| Doctrine + generated catalog | Complete |
| Phase 6 DB migrations | Applied (`20260625140000`, `20260625140100`) |
| Legacy `status` columns | Dropped on `opportunities`, `persons`, `customers` |
| Backfill verification | Passes — Firefly Early Learning (`93667019-bd28-49b5-a688-acc9bb1e0a19`) |
| Retired Alloy Bend org | Operational data removed; org `status = retired` |
| P0 `customer_member` field_values PATCH | Complete |
| Enforcement tests | `tests/fields/canonical*.test.ts` — 100+ passing |

**Canonical dev org:** Firefly Early Learning — `web/lib/fields/canonicalDevOrg.ts`

**Verification:**

```bash
cd web && npx tsx scripts/verifyCanonicalStatusKeyBackfill.ts --org-id=93667019-bd28-49b5-a688-acc9bb1e0a19
```

**Env defaults (local):** `CANONICAL_VERIFY_ORG_ID`, `ALLOY_PUBLIC_ORG_ID`, `DEV_QUEUE_ORG_ID` → Firefly UUID.

### Remaining deferred items (intentional)

See **Deferred Until Runtime / Configuration** below — not blockers for v1 freeze.

---

## Deferred Until Runtime / Configuration

These workstreams resume **against** the Canonical Data System v1 contract. They do not redefine grains, status architecture, or field ownership.

| Area | Notes |
|------|--------|
| **Runtime polish** | Queue/drawer/focus panel UX — read canonical grains only |
| **Focus Panel** | System 5 cards — consume composed canonical payloads |
| **Configuration Runtime** | BP/stage workspace — bind to `field_definitions` + canonical refKeys |
| **Experience Builder** | Presentation layers — no new field IDs |
| **Layout editor UX** | Migrate stored `child_inquiry.*` aliases per org (`migrateStoredLayoutRefKeys.ts`) |
| **Business Process editor UX** | Journey config — status via `status_definitions` |
| **Analytics UX** | Converge resolvers to canonical paths (org metric copy audit deferred) |
| **Reports** | Read canonical entity SELECTs |
| **Billing** | Vertical scope — not enrollment canonical grain |
| **Scheduling** | Jobs/schedules domain — separate from CRM canonical grains |
| **Attendance** | Operational domain — future module |

**Also deferred from Canonical sprint:**

- Contacts → persons read convergence (non-messaging paths)
- Lifecycle strict mode production activation (`CANONICAL_STRICT_MODE` server flag)
- CI ephemeral DB: seed fixture + `runCanonicalE2eDbAssertions.ts`
- Playwright smoke: create lead → drawer status label

---

## v1 frozen — do not reopen without ADR

The following are **closed** for v1:

- Entity grains (`person`, `customer`, `customer_member`, `opportunity`, `inquiry_child`)
- Status model (`status_key` + `status_definitions` only)
- Field ownership rules (`web/lib/fields/canonicalFieldOwnership.ts`)
- Legacy text `status` columns (dropped)

Resume product work in Runtime and Configuration using this contract as the stable foundation.
