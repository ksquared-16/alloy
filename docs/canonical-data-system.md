# Canonical Data System

**Status:** Formal contract (Phase 5 — June 2026)  
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
- See: [canonical-runtime-data-alignment.md](./canonical-runtime-data-alignment.md)

### Configuration (Settings, Fields, Statuses, Business Processes)

- **Defines** labels, types, options, stage bindings, transition rules.
- **Does not** store operational truth — seeds `field_definitions` / `status_definitions` only.
- See: [canonical-configuration-data-alignment.md](./canonical-configuration-data-alignment.md)

### Actions

- **Deterministic mutations** on canonical entities via `executeAdminAction` and bounded PATCH.
- **Must not** write legacy text status or child profile fields on OCM.
- See: [canonical-action-status-field-matrix.md](./canonical-action-status-field-matrix.md)

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

---

## Related documents

| Doc | Purpose |
|-----|---------|
| [canonical-entity-specification.md](./canonical-entity-specification.md) | Entity ownership |
| [canonical-status-architecture.md](./canonical-status-architecture.md) | Status vs readiness vs attention |
| [canonical-field-catalog.md](./canonical-field-catalog.md) | Generated field inventory |
| [universal-field-system.md](./universal-field-system.md) | Field type behavior spec |
| [canonical-relationship-model.md](./canonical-relationship-model.md) | Relationship edges |
| [canonical-action-status-field-matrix.md](./canonical-action-status-field-matrix.md) | Action/write matrix |
| [canonical-runtime-data-alignment.md](./canonical-runtime-data-alignment.md) | Runtime consumer contract |
| [canonical-configuration-data-alignment.md](./canonical-configuration-data-alignment.md) | Config consumer contract |
| [canonical-data-system-audit.md](./canonical-data-system-audit.md) | Cross-reference audit |

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

## Schema drop readiness (Phase 5 classification)

| Candidate | Classification | Notes |
|-----------|----------------|-------|
| `opportunities.status` (text) | **Ready to drop** | Runtime reads/writes blocked; backfill via maintenance helper |
| `persons.status` (text) | **Ready to drop** | Same; some `select("*")` paths remain in workflow/book-v2 |
| `customers.status` (text) | **Ready to drop** | Admin list migrated to `CUSTOMER_CANONICAL_LIST_SELECT` |
| `contacts` compatibility layer | **Ready to isolate** | Converge to persons + customer_persons |
| Home-services residue tables | **Keep temporarily** | Vertical scope — not childcare-primary |
| Obsolete lifecycle/layout aliases | **Ready to isolate** | `layoutRefKeyAliases` alias-on-read |
| Analytics/workflow field copies | **Needs additional audit** | Phase 6 convergence |
| Remaining `select("*")` on CRM entities | **Needs additional audit** | `workflowRun.ts`, `book-v2`, `opportunityIdentity.ts` |
| DB write-guard triggers | **Keep temporarily** | Draft: `supabase/sql/draft/canonical_status_legacy_column_write_guard.sql` |

Do **not** drop columns until org backfill verified and migration approved.

---

## Phase 6 recommendations

1. Apply DB-level legacy status write guards after org backfill.
2. Drop `opportunities.status`, `persons.status`, `customers.status` columns (single migration per table).
3. Migrate remaining `select("*")` on CRM entities to explicit canonical SELECT constants.
4. Update Forms reference matrix overrides where still stale.
5. Converge analytics resolvers to canonical field paths.
6. Layout migration: retire `child_inquiry.*` alias-on-read after stored JSON rewrite.
7. Activate lifecycle strict mode in production after OCM QA sign-off.

---

## Phase 6 (physical cleanup — complete)

See `docs/canonical-data-system-phase-6-physical-cleanup.md` — DB write guards, column drops, SELECT migrations, contacts/analytics/layout audits.
