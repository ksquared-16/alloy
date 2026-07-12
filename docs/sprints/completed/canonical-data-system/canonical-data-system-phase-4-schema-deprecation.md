# Canonical Data System — Phase 4: Schema Deprecation, Drop Prep, and Legacy Isolation

**Date:** 2026-06-25  
**Status:** Implemented (Phase 4)  
**Prerequisites:** Phases 1–3 (`docs/canonical-data-system-phase-*.md`)

Phase 4 prepares the database and codebase for safe removal of legacy schema residue. Runtime/admin paths no longer depend on legacy CRM entity text status columns; drop candidates are explicit; parity apply is idempotent across orgs.

---

## What shipped

### 1. Legacy status isolation

**Runtime contract:** Admin/runtime loaders use `status_key` only via `web/lib/fields/canonicalStatusRead.ts`.

**Maintenance-only fallback:** `web/lib/fields/canonicalLegacyStatusMaintenance.ts`

- `resolveLegacyStatusKeyWithTextFallback` — scripts/backfill only
- Path prefix registries for source-contract tests
- `selectStringReferencesLegacyEntityStatus` — audit helper

**Explicit SELECT columns:** `web/lib/fields/canonicalEntitySelectColumns.ts`

| Constant | Use |
|----------|-----|
| `OPPORTUNITY_CANONICAL_ADMIN_SELECT` | Full drawer hydrate (no legacy `status`) |
| `OPPORTUNITY_CANONICAL_LEGACY_ADMIN_LIST_SELECT` | legacy-admin opportunity list |
| `CUSTOMER_CANONICAL_ADMIN_SELECT` | Admin customer entity GET |
| `PERSON_CANONICAL_IDENTITY_SELECT` | Person identity fetch pattern |

**Code changes:**

| File | Change |
|------|--------|
| `opportunityEntityRecord.ts` | `select("*")` → `OPPORTUNITY_CANONICAL_ADMIN_SELECT` |
| `entity/[type]/[id]/route.ts` | customers `select("*")` → `CUSTOMER_CANONICAL_ADMIN_SELECT` |
| `legacy-admin/opportunities/page.tsx` | Removed legacy `status` from SELECT |
| `legacy-admin/opportunities/OpportunitiesClient.tsx` | Removed `status` from type |
| `canonicalStatusRead.ts` | Removed legacy fallback export (moved to maintenance module) |

**Remaining legacy status exposure (isolated — not admin runtime):**

| Location | Grain | Recommendation |
|----------|-------|----------------|
| `web/app/legacy-admin/**` (jobs, schedules, payments, workflow) | Workflow/domain status | **Keep** — different domain; not CRM entity status |
| `web/app/api/book-v2/**` | Booking flows | **Isolate** — migrate in Phase 5 or vertical cutover |
| `web/lib/workflowRun.ts` | `opportunities.select("*")` | **Deprecate** — use explicit select when touched |
| `web/lib/opportunityIdentity.ts` | `persons.select("*")` | **Deprecate** — use `PERSON_CANONICAL_IDENTITY_SELECT` |
| `web/app/api/admin/contacts/route.ts` | `contacts.status` | **Isolate** — contacts compatibility layer |
| `customer_persons.status` | Relationship row status | **Review** — not enrollment case status |

Tests: `web/tests/fields/canonicalLegacyStatusIsolation.test.ts`

---

### 2. Drop / deprecation candidate matrix

| Candidate | Reads | Writes | Config | Runtime | API | Tests | Migration | Preserve data? | Safe drop criteria | Phase | Recommendation |
|-----------|-------|--------|--------|---------|-----|-------|-----------|----------------|-------------------|-------|----------------|
| `opportunities.status` (text) | legacy-admin (removed); book-v2; workflowRun `*` | Blocked Phase 1 | None | None (Phase 4) | Blocked | Contract tests | Column drop migration | No — use status_key | Zero reads/writes; backfill complete | 5 | **Drop** |
| `persons.status` (text) | legacy imports; some `select("*")` | Blocked Phase 1 | None | Minimal | Blocked | — | Backfill + drop | No | Same | 5 | **Drop** |
| `customers.status` (text) | legacy-admin customers UI | Blocked Phase 1 | None | None (Phase 4) | Blocked | — | Backfill + drop | No | Same | 5 | **Drop** |
| `contacts` table | Drawer related lists, comms, legacy-admin | Established server paths | contacts status defs | Compatibility only | `/api/admin/contacts` | Many | Long convergence | Yes during migration | persons+customer_persons cover all flows | 5–6 | **Isolate → deprecate** |
| `customer_members.status_key` | Unclear enrollment misuse | — | — | — | — | Audit | — | — | Confirm not used for enrollment outcome | 4–5 | **Review** |
| Home-services tables (`jobs`, `schedules`, `assignments`, …) | legacy-admin | Various | Vertical config | Not childcare primary | legacy-admin API | — | Vertical scope decision | Per vertical | Product scope sign-off | 6+ | **Keep (vertical)** |
| OCM profile field overlap | — | Blocked Phase 1 | field_definitions | Phase 2 reads | Blocked PATCH | Strict mode | — | — | Guards + tests green | — | **Done** |
| Obsolete lifecycle `child_inquiry.*` refKeys | Layout alias-on-read | — | Layout JSON | Alias map | — | layoutRefKeyAliases tests | No rewrite | — | Layout migration sprint | 6 | **Deprecate alias** |
| Analytics field copies | Metrics resolvers | — | — | Some | — | — | Point at canonical | — | Resolver audit | 6 | **Converge** |
| Demo operational bad rows | — | — | — | — | — | — | reset script | No | Dry-run 0 rows | — | **Not needed** |

---

### 3. Schema-level canonical guards (evaluation)

**Draft only:** `supabase/sql/draft/canonical_status_legacy_column_write_guard.sql`

Evaluated options:

| Guard | Status | Notes |
|-------|--------|-------|
| Reject NEW writes to legacy text `status` columns | **Draft trigger template** | API already blocks; DB trigger = defense in depth |
| FK `status_key` → `status_definitions` | **Deferred** | Requires orphan key cleanup; `assertAllowedStatusKey` exists at API |
| OCM `outcome_status_key` scope | **Application-enforced** | No cross-grain FK; status_definitions entity_type filter |
| Reject profile fields on OCM | **Application-enforced** | Phase 1 PATCH guards |

**Migration order before enabling DB triggers:**

1. Verify no API/client writes legacy status (Phase 1 ✓)
2. Verify runtime reads use status_key only (Phases 3–4 ✓)
3. Backfill null `status_key` from legacy text where needed (org-scoped script)
4. Enable per-table BEFORE UPDATE trigger on legacy column
5. Drop column in Phase 5 migration

---

### 4. Native parity apply path (completed)

**Library:** `planParityApply`, `formatParityApplyReport` in `canonicalNativeColumnParity.ts`

**Script:** `web/scripts/canonicalNativeColumnParitySeed.ts`

- Dry-run default
- `--apply` + `CANONICAL_PARITY_CONFIRM=APPLY_FIELD_DEFINITION_PARITY`
- `CANONICAL_PARITY_ALL_ORGS=1` for multi-org pass
- Idempotent: inserts missing only; skips duplicates (23505)
- Reports added / skipped / failed per org

```bash
# Single org dry-run
DEV_QUEUE_ORG_ID=<uuid> npx tsx web/scripts/canonicalNativeColumnParitySeed.ts

# Apply missing rows
CANONICAL_PARITY_CONFIRM=APPLY_FIELD_DEFINITION_PARITY \
  DEV_QUEUE_ORG_ID=<uuid> npx tsx web/scripts/canonicalNativeColumnParitySeed.ts --apply

# All orgs (staging maintenance)
CANONICAL_PARITY_ALL_ORGS=1 npx tsx web/scripts/canonicalNativeColumnParitySeed.ts
```

Verified: dev org 14/14 present (Phase 3 dry-run).

---

### 5. Demo reset decision

**Dry-run (2026-06-25, org `93667019-bd28-49b5-a688-acc9bb1e0a19`):** **0 scoped demo CRM rows** across all delete tables.

**Decision:** Reset is **ready but not needed** for the current dev org. No destructive execute run performed.

**Maintenance tooling preserved:**

- `web/scripts/resetStagingDemoData.ts` (dry-run / `--execute`)
- `supabase/sql/maintenance/reset_demo_operational_data.sql` (ROLLBACK default)

If bad records appear in another org/environment:

```bash
DEMO_RESET_ORG_ID=<uuid> npx tsx web/scripts/resetStagingDemoData.ts
DEMO_RESET_ORG_ID=<uuid> DEMO_RESET_CONFIRM=RESET_STAGING_DEMO_DATA npx tsx web/scripts/resetStagingDemoData.ts --execute
```

---

### 6. Phase 5 formal documentation backlog

| Document | Source-backed today? | Remaining authoring |
|----------|---------------------|---------------------|
| Canonical Data Doctrine | Partial (`docs/canonical-data-system-audit.md`, phase docs) | Formal single doc; north-star diagram |
| Canonical Status Architecture | Strong (`status_definitions`, phase 1–4) | Column drop runbook |
| Canonical Field Catalog | Manifests + parity generator | Automated export from DB + manifests |
| Universal Field System Specification | `fieldRegistryReferenceMatrix`, ownership guards | Convergence with 17-system audit |
| Relationship Model Specification | `entity-model.md` + phase grain tables | contacts deprecation path |
| Action → Status → Field Matrix | `canonicalActionRegistry`, lifecycle bindings | Export tooling |
| Runtime → Data Alignment Matrix | Phase 2–4 read paths | Queue/drawer exhaustive map |
| Configuration → Data Alignment Matrix | field_definitions parity | Settings UI crosswalk |

**Already authoritative in code (prefer over chat memory):**

- `web/lib/fields/canonicalFieldOwnership.ts`
- `web/lib/fields/canonicalEntitySelectColumns.ts`
- `web/lib/fields/canonicalNativeColumnParity.ts`
- `web/lib/lifecycle/lifecycleFieldRuleBindings.ts`
- Phase 1–4 docs + audit

---

## Validation

```bash
cd web && npm run test -- \
  tests/fields/canonicalLegacyStatusIsolation.test.ts \
  tests/fields/canonicalNativeColumnParity.test.ts \
  tests/fields/canonicalReadAlignment.test.ts \
  tests/fields/canonicalFieldOwnership.test.ts

cd web && npx tsc --noEmit
```

---

## Success criteria (Phase 4)

- [x] Legacy status usage removed or isolated from admin/runtime paths
- [x] Source-contract tests prevent legacy status drift
- [x] Drop/deprecation matrix explicit and actionable
- [x] Parity apply idempotent with multi-org support
- [x] Demo reset: ready, not needed (0 scoped rows)
- [x] Phase 5 formal doc backlog defined
- [x] Schema guard draft documented (not applied)

---

*End of Phase 4 — see audit §20.*
