# Canonical Data System — Phase 3: Parity Seeds, Legacy Status Cleanup, Demo Reset

**Date:** 2026-06-25  
**Status:** Implemented (Phase 3)  
**Prerequisites:** Phase 1 (`docs/canonical-data-system-phase-1-reset.md`), Phase 2 (`docs/canonical-data-system-phase-2-read-path-alignment.md`)

Phase 3 converges remaining platform drift: runtime no longer depends on legacy entity status text columns, native persisted fields align with `field_definitions`, strict-mode guards are strengthened, and demo reset is verified ready.

---

## What shipped

### 1. Legacy status read cleanup

**Runtime rule:** Admin/runtime loaders use `status_key` + `status_definitions` only for CRM entity grains.

| Grain | Column |
|-------|--------|
| Enrollment case | `opportunities.status_key` |
| Child enrollment outcome | `opportunity_customer_members.outcome_status_key` |
| Person operational | `persons.status_key` |
| Household / account | `customers.status_key` |

**Core helpers** (`web/lib/fields/canonicalStatusRead.ts`):

- `resolveCanonicalStatusKey` — **runtime default**, `status_key` only
- `resolveCanonicalStatusKeyWithLegacyFallback` — **Phase 4 migration scripts only** (documented, not used in runtime loaders)

**Updated runtime paths** (removed legacy `status` from SELECT / display fallback):

| Module | Change |
|--------|--------|
| `operationalTasksWorkspaceEnrichment.ts` | Opportunities SELECT + label from `status_key` + defs |
| `commandCenterConversationEnrichment.ts` | Opportunities SELECT |
| `inboxThreadsService.ts` | Opportunities SELECT + status display |
| `taskAssistOpportunityContext.ts` | SELECT + label from defs |
| `loadFamilyWorkspaceData.ts` | Customers SELECT |
| `opportunityEntityRecord.ts` | Display via `resolveOpportunityCaseStatusKey` |
| `buildOpportunityDrawerViewModelHeader.ts` | No legacy record.status fallback |
| `resolveOpportunityStatusLabelsBatch.ts` | No legacy status in meta |
| `opportunityStatusDisplayResolve.ts` | Removed `legacyStatus` param |
| `activity-signal/route.ts` | SELECT + resolve |
| `related/[entity]/[id]/route.ts` | Opportunities use `status_key` |
| `customers/route.ts` | List SELECT |
| `layout-proof/opportunities/route.ts` | SELECT + display |
| `legacy-admin/dashboard/page.tsx` | Metrics from `status_key` |

**Phase 4 only (not runtime):**

- `opportunities.select("*")` in full entity hydrate still returns legacy column from DB but **does not read it**
- `legacy-admin/opportunities/page.tsx` — legacy admin surface
- `contacts.status` — compatibility layer
- Task/form/workflow/document `status` columns — different domain (not enrollment entity status)
- `payments.status` + `status_key` dual column — financial lifecycle (separate cutover)

Tests: `web/tests/fields/canonicalNativeColumnParity.test.ts` (source contract), `web/tests/fields/canonicalReadAlignment.test.ts`

---

### 2. Native-column parity seed generator

**Library:** `web/lib/fields/canonicalNativeColumnParity.ts`

- Builds expected rows from existing manifests (`inquiryChildFieldRegistry`, `customerMemberFieldRegistry`, `opportunityFieldRegistry`)
- Detects missing / duplicate `field_definitions`
- Validates ownership via `canonicalFieldOwnership`
- Deterministic insert payloads (`is_system: true`)

**Scripts:**

| Script | Mode |
|--------|------|
| `web/scripts/canonicalNativeColumnParityDryRun.ts` | Read-only gap report |
| `web/scripts/canonicalNativeColumnParitySeed.ts` | Dry-run default; `--apply` requires `CANONICAL_PARITY_CONFIRM=APPLY_FIELD_DEFINITION_PARITY` |

```bash
# Dry-run
DEV_QUEUE_ORG_ID=<uuid> npx tsx web/scripts/canonicalNativeColumnParityDryRun.ts

# Apply missing rows only (no duplicates, no overwrites)
DEV_QUEUE_ORG_ID=<uuid> CANONICAL_PARITY_CONFIRM=APPLY_FIELD_DEFINITION_PARITY \
  npx tsx web/scripts/canonicalNativeColumnParitySeed.ts --apply
```

**Verified dry-run (2026-06-25, org `93667019-bd28-49b5-a688-acc9bb1e0a19`):**

- Expected: 14 manifest rows
- Present: 14
- Missing: 0
- Duplicates: 0

Tests: `web/tests/fields/canonicalNativeColumnParity.test.ts`

---

### 3. Demo reset dry-run summary

**Not executed destructively** — dry-run only.

```bash
DEMO_RESET_ORG_ID=93667019-bd28-49b5-a688-acc9bb1e0a19 npx tsx web/scripts/resetStagingDemoData.ts
```

**Result:** All scoped operational CRM tables report **0 rows** matching demo markers for this org. Config/meta preserved by script design. `locations: 20` listed but not in delete scope (platform config).

**To execute when bad records exist:**

```bash
DEMO_RESET_ORG_ID=<uuid> DEMO_RESET_CONFIRM=RESET_STAGING_DEMO_DATA \
  npx tsx web/scripts/resetStagingDemoData.ts --execute
```

**Pre-execute checklist:**

1. Confirm org id (never production)
2. Run dry-run; record table counts
3. Baseline `field_definitions` count
4. Run parity dry-run (should stay unchanged post-reset)
5. Execute with confirm env
6. Verify opportunities/persons/customers counts → 0 or clean baseline
7. Verify `field_definitions` / `status_definitions` unchanged
8. Create new lead + child — profile on `customer_members`, enrollment on OCM

Manual SQL alternative: `supabase/sql/maintenance/reset_demo_operational_data.sql` (ROLLBACK default)

---

### 4. Strict-mode guard strengthening

`web/lib/fields/canonicalStrictMode.ts` — re-exports `findDuplicateFieldDefinitionKeys`

Tests cover:

- Lifecycle binding grain (profile vs enrollment)
- No legacy status in runtime loader SELECTs (source contract)
- `resolveOpportunityStatusDisplay` has no `legacyStatus`
- Parity ownership / duplicate detection
- OCM profile patch rejection (Phase 1)

---

### 5. Phase 4 drop / deprecation plan

| Candidate | Reason | Read paths | Write paths | Safe drop criteria | Phase |
|-----------|--------|------------|-------------|-------------------|-------|
| `opportunities.status` (text) | Replaced by `status_key` | `select("*")` hydrate only; legacy-admin | Blocked Phase 1 | Zero runtime reads; analytics migrated | 4 |
| `persons.status` (text) | Replaced by `status_key` | Legacy imports, legacy-admin | Blocked Phase 1 | Same | 4 |
| `customers.status` (text) | Replaced by `status_key` | Legacy-admin, imports | Blocked Phase 1 | Same | 4 |
| `contacts` table | Compatibility layer vs `persons` | Contact drawer, related lists, comms | Established server paths | All identity flows use `persons` + `customer_persons` | 4–5 |
| `customer_members.status_key` | Not enrollment semantics | Audit only | — | Confirm no enrollment UI reads | 4 |
| Home-services tables (`jobs`, `schedules`, `assignments`, …) | Vertical residue | legacy-admin, financials | Various | Product scope decision | 5+ |
| Workflow/form `status` columns | Different domain | Many modules | Many modules | **Not** enrollment status — do not conflate | N/A |
| Analytics field copies | Drift from canonical | Metrics resolvers | — | Point at canonical grains | 5 |
| `resolveCanonicalStatusKeyWithLegacyFallback` | Migration helper | Scripts only | — | After column drop | 4 |

**Migration pattern for status columns (Phase 4):**

1. Backfill `status_key` where null (scripted, org-scoped)
2. Remove `select("*")` → explicit columns on opportunity hydrate
3. Drop column via migration with rollback window
4. Remove `resolveCanonicalStatusKeyWithLegacyFallback`

---

## Validation

```bash
cd web && npm run test -- \
  tests/fields/canonicalNativeColumnParity.test.ts \
  tests/fields/canonicalReadAlignment.test.ts \
  tests/fields/canonicalFieldOwnership.test.ts \
  tests/lifecycle/lifecycleFieldRuleEvaluator.test.ts \
  tests/admin/drawer/resolveOpportunityStatusLabelsBatch.test.ts

cd web && npx tsc --noEmit
```

---

## Success criteria (Phase 3)

- [x] Runtime admin loaders no longer SELECT or depend on legacy CRM entity `status` text
- [x] Native persisted fields and `field_definitions` converged (14/14 for demo org)
- [x] Demo reset dry-run verified; execute command documented
- [x] Strict-mode / contract tests prevent drift
- [x] Phase 4 drop list documented
- [x] Lifecycle profile bindings restored on `customer_member_profile` grain

---

*End of Phase 3 — see audit §19.*
