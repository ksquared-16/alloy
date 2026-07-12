# Canonical Data System — Phase 6: Physical Cleanup + Resolver Convergence

**Date:** 2026-06-25  
**Status:** Implemented (Phase 6)  
**Prerequisites:** Phases 1–5 (`docs/platform/core/data/data-system.md`)

Phase 6 moves from documented/enforced canonical contract to **physical cleanup**: DB guards and column drops, explicit SELECT migrations, contacts/analytics/layout convergence audits.

---

## What shipped

### 1. Legacy status column write guards + drops

| Migration | Purpose |
|-----------|---------|
| `20260625140000_canonical_legacy_status_write_guards.sql` | BEFORE INSERT/UPDATE triggers reject legacy text `status` writes on `opportunities`, `persons`, `customers` |
| `20260625140100_canonical_drop_legacy_status_columns.sql` | Drops `status` text columns; removes triggers and guard function |

**Pre-drop verification script:**

```bash
cd web && npx tsx scripts/verifyCanonicalStatusKeyBackfill.ts
```

Requires `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`. Exits non-zero if rows have legacy `status` but null `status_key`.

**Rollback plan (drop migration header):** Re-add text columns and backfill from `status_key` if needed.

**Guard removal:** Triggers dropped automatically in drop migration. No manual cleanup after columns removed.

---

### 2. Explicit SELECT migrations (canonical CRM paths)

Replaced `select("*")` on `opportunities`, `persons`, `customers` with constants from `canonicalEntitySelectColumns.ts`:

| File | Constant |
|------|----------|
| `workflowRun.ts` | `OPPORTUNITY_CANONICAL_WORKFLOW_SELECT` |
| `opportunityIdentity.ts` | `PERSON_CANONICAL_IDENTITY_SELECT`, `CONTACT_COMPAT_SELECT` |
| `actionLinkDisplayDetails.ts` | `PERSON_CANONICAL_IDENTITY_SELECT` |
| `resolveFormPrefillValues.ts` | Admin/workflow/customer/person/contact constants |
| `loadOpportunityDrawerOperationalBootstrap.ts` | `OPPORTUNITY_CANONICAL_ADMIN_SELECT` |
| `composeOpportunityDrawerViewModel.ts` | `OPPORTUNITY_CANONICAL_ADMIN_SELECT` |
| `operationalTasksWorkspaceEnrichment.ts` | `OPPORTUNITY_CANONICAL_TASK_ENRICHMENT_SELECT` (legacy status fallback removed) |
| `book-v2/quote-start`, `specialty-quote-start`, `confirm` | Workflow/customer constants |
| `action-links/consume-accept-job` | Workflow/customer/contact constants |

**Not migrated (vertical / home-services domain):** `jobs.select("*")`, `schedules.select("*")`, `locations.select("*")` in workflow/book-v2 — different entity domain, not CRM canonical grains.

**New constants:** `CONTACT_COMPAT_SELECT`, `OPPORTUNITY_CANONICAL_WORKFLOW_SELECT`, `OPPORTUNITY_CANONICAL_TASK_ENRICHMENT_SELECT`, `CANONICAL_CRM_ENTITY_TABLES`.

---

### 3. Contacts compatibility audit

**Canonical rule:** `persons` + `customer_persons` own human identity. `contacts` is a **compatibility projection** for messaging, legacy-admin, and booking flows — not canonical Person.

| Usage area | Classification | Notes |
|------------|----------------|-------|
| `opportunityIdentity.ts` resolveOpportunityPerson | **Replace with persons** (when linked) | Contact fallback explicit `kind: contact_legacy` |
| `resolveFormPrefillValues.ts` | **Isolate** | Uses `CONTACT_COMPAT_SELECT` only when form roots need contact |
| `inboxThreadsService`, comms recipient resolution | **Keep temporarily** | Messaging projection; do not create new contact-only identity |
| `/api/admin/contacts/**` | **Keep temporarily** | Legacy-admin + vendor contacts; uses `status_key` for display |
| `bookingCustomerPersonLink`, book-v2 intake | **Replace with persons** (path exists) | Creates/links person from contact |
| `QueueService`, drawer related lists | **Isolate** | Read compat layer; converge reads to persons over time |
| `createLeadChildScopedContactPersistence` | **Phase 7** | Evaluate person-first intake without contact row |

**Do not break:** SMS/email `to_contact_id`, legacy-admin contact lists, vendor contact roles.

---

### 4. Analytics resolver convergence audit

**Rule:** Analytics consumes canonical data; it does not define it.

| Area | Status | Finding |
|------|--------|---------|
| `lib/metrics/resolvers/operationalHealthMetrics.ts` | **Converged** | Uses `opportunities.status_key` |
| `lib/metrics/dimensionsFilter.ts` | **Converged** | Filters on `status_key` |
| `lib/metrics/resolvers/eventWindowMetrics.ts` | **Converged** | Tour booking `status_key` |
| `lib/kpi/resolver.ts` | **Converged** | Legacy *placement keys* only (config labels), not CRM status columns |
| `lib/kpi/contextKpiMetrics.ts` | **Keep temporarily** | `legacyOpportunityListTotal` = queue count fallback, not text status |
| Custom metric field copies in org seeds | **Phase 7** | Audit org-specific metric definitions referencing deprecated fields |
| OCM profile in metric resolvers | **No issue found** | Resolvers use opportunity/work_unit grains |

**Phase 7:** Org-specific `metric_definitions` / analytics field copies audit; point any `opportunities.status` references at `status_key` (column dropped).

---

### 5. Layout JSON alias migration

**Read path (existing):** `normalizeRefKeyOnRead` in `layoutRefKeyAliases.ts` — alias-on-read for published layouts.

**Write path (Phase 6):** `web/lib/layout/migrateStoredLayoutRefKeys.ts` — rewrites stored JSON using same alias map.

**Audit script:**

```bash
cd web && npx tsx scripts/auditLayoutRefKeyAliases.ts
# Optional: AUDIT_ORG_ID=<uuid>
```

**Aliases migrated:**

| Legacy | Canonical |
|--------|-----------|
| `child_inquiry.*` | `inquiry_child.*` |
| `child.desired_start_date`, `child.status`, etc. | `inquiry_child.*` |
| Profile `child.*` | Unchanged (customer_member grain via reference matrix) |

**Published layout safety:** Migration function is opt-in (script/apply path). Runtime continues alias-on-read without rewriting stored JSON until operator publishes migrated layout.

**Phase 7:** Batch apply migration to `record_drawer_layouts` per org after audit dry-run; add Settings "repair layout refKeys" action if needed.

---

## Enforcement tests

| Test | Covers |
|------|--------|
| `web/tests/fields/canonicalPhase6SourceContract.test.ts` | No `select("*")` on CRM tables in Phase 6 loader list |
| `web/tests/fields/canonicalLegacyStatusIsolation.test.ts` | Explicit SELECT columns |
| `web/tests/fields/canonicalEnforcement.test.ts` | Index |
| `web/tests/layout/migrateStoredLayoutRefKeys.test.ts` | Layout JSON rewrite |

```bash
cd web && npm run test -- \
  tests/fields/canonical*.test.ts \
  tests/layout/migrateStoredLayoutRefKeys.test.ts
```

---

## Phase 7 backlog

1. **Contacts convergence:** Migrate remaining drawer/comms reads from `contacts` to `persons` where `person_id` link exists.
2. **Org metric_definitions audit:** Scan for deprecated field/status references post column drop.
3. **Layout batch migration:** Apply `migrateLayoutConfigRefKeys` to stored layouts per org after audit.
4. **book-v2 vertical isolation:** Document home-services entities (`jobs`, `schedules`) as non-canonical vertical scope.
5. **FK status_key → status_definitions:** Deferred from Phase 5; requires orphan cleanup.
6. **Lifecycle strict mode production activation:** After OCM QA sign-off.
7. **Settings contacts API:** Block new contact-only identity creates without person link (soft guard).

---

## Related docs

- Hub: `docs/platform/core/data/data-system.md`
- Phase 5: `docs/canonical-data-system-phase-5-formal-contract.md`
- Audit: `docs/canonical-data-system-audit.md` §22
