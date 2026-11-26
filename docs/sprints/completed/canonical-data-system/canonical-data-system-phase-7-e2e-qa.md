# Canonical Data System — Phase 7: End-to-End QA + Production Strict Mode

**Date:** 2026-06-25  
**Status:** Implemented (Phase 7)  
**Prerequisites:** Phases 1–6

Phase 7 **proves** the canonical model works end-to-end — not more doctrine. Focus: create → persist → read → display → lifecycle, with automated validators and manual QA checklist.

---

## Automated coverage

| Layer | Location |
|-------|----------|
| E2E roundtrip validators | `web/lib/fields/canonicalE2eValidators.ts` |
| Integration tests (no DB) | `web/tests/fields/canonicalE2eRoundtrip.test.ts` |
| Full canonical suite | `web/tests/fields/canonical*.test.ts` |
| Layout alias migration | `web/tests/layout/migrateStoredLayoutRefKeys.test.ts` |
| Phase 6 source contract | `web/tests/fields/canonicalPhase6SourceContract.test.ts` |

Run:

```bash
cd web && npm run test -- \
  tests/fields/canonical*.test.ts \
  tests/layout/migrateStoredLayoutRefKeys.test.ts \
  tests/opportunityIdentity.test.ts \
  tests/admin/actions/createLeadStatusBinding.test.ts
```

---

## Manual QA checklist

### 1. Fresh Lead creation

| Step | Action | Expected |
|------|--------|----------|
| 1.1 | Create Lead via AdminV2 (right rail or workspace action) with guardian + child | Success |
| 1.2 | Inspect `opportunities` row | `status_key` set (e.g. `new_inquiry`); **no** `status` column (dropped Phase 6) |
| 1.3 | Inspect `customers`, `persons`, `customer_persons` | Household + guardian linked |
| 1.4 | Inspect `customer_members` | Child profile native columns populated |
| 1.5 | Inspect `opportunity_customer_members` | `outcome_status_key` set; enrollment fields on OCM only |
| 1.6 | Confirm no profile fields on OCM columns | `first_name`/`dob` not on OCM row |

**Seed shortcut:**

```bash
cd web && npx tsx scripts/seedCanonicalLeadE2eFixture.ts
# Apply:
CANONICAL_E2E_SEED_CONFIRM=APPLY_CANONICAL_LEAD_FIXTURE npx tsx scripts/seedCanonicalLeadE2eFixture.ts --apply
cd web && npx tsx scripts/runCanonicalE2eDbAssertions.ts --opportunity-id=<uuid>
```

---

### 2. Child profile save

| Step | Action | Expected |
|------|--------|----------|
| 2.1 | Open child in drawer; edit first/last name, DOB | PATCH `customer-members` or linked person path |
| 2.2 | Reload drawer | Values display from profile grain |
| 2.3 | Trigger lifecycle rule requiring `child:first_name` | Passes when name present |
| 2.4 | Attempt PATCH profile field on OCM API | **400** — profile guard |

**Known gap (resolved P0):** Config profile fields (`gender`, `allergies`, `medical_notes`) PATCH via `/api/admin/customer-members/:id` upserts `field_values` on `entity_type = customer_member`.

---

### 3. Enrollment participation save

| Step | Action | Expected |
|------|--------|----------|
| 3.1 | Edit desired start, program, location on inquiry child | PATCH `opportunity-customer-members` |
| 3.2 | Reload | OCM columns updated |
| 3.3 | Verify profile unchanged on OCM | No `first_name` on OCM |

---

### 4. Status transition

| Step | Action | Expected |
|------|--------|----------|
| 4.1 | Change Enrollment Status action | Writes `outcome_status_key` (OCM) and/or `opportunities.status_key` |
| 4.2 | Queue row + drawer header | Same label from `status_definitions` |
| 4.3 | PATCH with `{ status: "open" }` | **400** — legacy guard |
| 4.4 | Invalid `status_key` | Rejected by `assertAllowedStatusKey` |

---

### 5. Runtime hydration

| Surface | Verify |
|---------|--------|
| Work unit queue | Row preview uses composed fields; status from `status_key` |
| Drawer / focus panel | No blank status when `status_key` set |
| Child repeater | Profile from `customer_members` attach path |
| Readiness | Profile rules use `customer_member_profile` bindings |
| Actions | Preflight uses lifecycle field_rules on canonical grains |

---

### 6. Configuration alignment

| Step | Action | Expected |
|------|--------|----------|
| 6.1 | Settings → Fields for `customer_member` / `inquiry_child` | Ownership valid |
| 6.2 | Layout with legacy `child_inquiry.*` refKey | Renders via alias-on-read |
| 6.3 | Publish layout after migration script | Stored JSON uses canonical refKeys |

---

### 7. Database enforcement

| Check | Command / evidence |
|-------|-------------------|
| Legacy columns dropped | Migrations `20260625140100_*` applied |
| Write guard (pre-drop) | `20260625140000_*` triggers |
| Backfill complete | `npx tsx scripts/verifyCanonicalStatusKeyBackfill.ts` exits 0 |
| No broad CRM `select("*")` | `canonicalPhase6SourceContract.test.ts` green |
| Intake paths no `status: "open"` | `canonicalE2eRoundtrip.test.ts` source contract |

---

## Code fixes shipped (Phase 7)

| Fix | Purpose |
|-----|---------|
| `normalizeOpportunityWritePayload` always strips legacy `status` | Central intake write guard |
| Removed `status: "open"` from create_lead, forms intake, book-v2 | No legacy writes at source |
| OCM PATCH `assertNoChildProfileKeysOnOcmPatch` | API-level profile grain guard |

---

## Strict mode activation recommendation

**Current state:** Strict-mode **validators** ship in `canonicalStrictMode.ts`; tests enforce bindings, ownership, legacy PATCH rejection.

**Recommend for production:**

1. **Keep test suite mandatory in CI** — `tests/fields/canonical*.test.ts` on every PR touching admin/API/fields/lifecycle.
2. **Do not add runtime-only strict throws yet** — lifecycle hard-block activation remains deferred until config profile `field_values` PATCH is complete (see blocker).
3. **Enable after blockers cleared:**
   - `customer_member` config field PATCH (`gender`, allergies, etc.)
   - One manual QA pass on seed fixture in staging
   - `verifyCanonicalStatusKeyBackfill.ts` green on production clone

**Optional env flag (future):** `CANONICAL_STRICT_MODE=1` for server-side double-check on admin PATCH routes — not implemented in Phase 7; tests are the enforcement layer.

---

## Blockers before resuming Runtime/Configuration feature work

| Priority | Blocker | Status |
|----------|---------|--------|
| P0 | `customer_member` config `field_values` PATCH for gender/allergies/medical | **Resolved** — `customer-members/[id]` route + tests |
| P1 | Batch layout refKey migration in production orgs | Script ready; apply per org |
| P1 | Contacts → persons read convergence (non-messaging) | Documented Phase 6 |
| P2 | Org-specific `metric_definitions` post-drop audit | Phase 7 deferred |
| P2 | Lifecycle strict mode production activation | After P0 + staging QA |

**Safe to resume:** Queue/drawer/BP UX work that reads canonical grains and does not introduce new field IDs or status columns.

---

## Phase 8 recommendations (optional)

1. Implement `customer_member` `field_values` PATCH on customer-members route (mirror persons route).
2. CI job: `seedCanonicalLeadE2eFixture --apply` against ephemeral DB + `runCanonicalE2eDbAssertions`.
3. Playwright smoke: create lead → open drawer → verify status label.
4. `CANONICAL_STRICT_MODE` server flag on admin PATCH routes.

---

## Related docs

- Hub: `docs/platform/core/data/data-system.md`
- Phase 6: `docs/canonical-data-system-phase-6-physical-cleanup.md`
- Audit: `docs/canonical-data-system-audit.md` §23
