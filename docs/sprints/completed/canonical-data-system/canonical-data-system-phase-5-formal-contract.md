# Canonical Data System — Phase 5: Formal Contract and Handoff

**Date:** 2026-06-25  
**Status:** Complete (Phase 5)  
**Prerequisites:** Phases 1–4

Phase 5 turns the implementation work into the formal Alloy canonical data contract — doctrine, specifications, generated field catalog, alignment matrices, enforcement index, and schema drop staging.

---

## What shipped

### 1. Formal doctrine and specifications

| Document | Purpose |
|----------|---------|
| `docs/platform/core/data/data-system.md` | Permanent hub doctrine |
| `docs/platform/core/data/entity-specification.md` | Entity ownership |
| `docs/platform/core/data/status-architecture.md` | Status vs readiness vs attention layers |
| `docs/platform/core/data/field-catalog.md` | Generated field inventory (100 rows) |
| `platform/core/data/field-system.md` | Field type behavior spec |
| `docs/platform/core/data/relationship-model.md` | Relationship edges |
| `docs/platform/core/data/action-status-field-matrix.md` | Action/write matrix |
| `docs/platform/core/data/runtime-data-alignment.md` | Runtime consumer contract |
| `docs/platform/core/data/configuration-data-alignment.md` | Configuration consumer contract |

### 2. Field catalog generator

| Module | Role |
|--------|------|
| `web/lib/fields/buildCanonicalFieldCatalog.ts` | Deterministic rows from layout catalog + registries |
| `web/scripts/generateCanonicalFieldCatalogDoc.ts` | Emits `docs/platform/core/data/field-catalog.md` |

Regenerate:

```bash
cd web && npx tsx scripts/generateCanonicalFieldCatalogDoc.ts
```

### 3. Enforcement alignment (code)

| Change | Purpose |
|--------|---------|
| Lifecycle bindings → `customer_member_profile` for profile fields | Grain-correct preflight |
| `lifecycleFieldRuleEvaluator` profile evaluation | Reads profile from customer_member snapshot |
| `fieldRegistryReferenceMatrix` profile mapping | Forms/layout/lifecycle → customer_member |
| Removed `legacyStatus` from status display resolver | status_key-only display |
| Explicit SELECT migrations | customers list, activity-signal, family workspace, opportunityEntityRecord, legacy-admin |

### 4. Enforcement tests

| File | Role |
|------|------|
| `web/tests/fields/canonicalEnforcement.test.ts` | Phase 5 index |
| Existing `canonical*.test.ts` suite | 55+ tests — all green |

```bash
cd web && npm run test -- tests/fields/canonical*.test.ts
```

### 5. Audit cross-reference

`docs/canonical-data-system-audit.md` — §21 Phase 5 handoff added.

---

## Schema drop readiness (final Phase 5 classification)

See `docs/platform/core/data/data-system.md` § Schema drop readiness.

| Candidate | Phase 5 status |
|-----------|----------------|
| `opportunities.status` | Ready to drop |
| `persons.status` | Ready to drop |
| `customers.status` | Ready to drop |
| contacts layer | Ready to isolate |
| home-services tables | Keep temporarily |
| analytics copies | Needs additional audit |
| remaining select("*") | Needs additional audit |

---

## Phase 6 recommendations

1. Column drop migrations (legacy text status) after org backfill verification.
2. Enable draft DB write-guard triggers.
3. Migrate workflowRun, book-v2, opportunityIdentity to explicit SELECT constants.
4. Layout JSON migration off `child_inquiry.*` aliases.
5. Analytics resolver convergence audit.
6. Production activation of lifecycle strict mode.

---

## Demo reset / parity (unchanged from Phase 4)

- Demo reset: dry-run showed 0 scoped rows for dev org — execute only with explicit confirm env.
- Parity apply: idempotent via `canonicalNativeColumnParitySeed.ts --apply`.
