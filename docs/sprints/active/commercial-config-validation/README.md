# Commercial Configuration Validation — Sprint Closeout

**Sprint:** `commercial-config-validation` · Slot 5  
**Branch:** `agent/cursor/5-commercial-config-validation`  
**Provider:** cursor  
**Worktree:** `/Users/Kelly/Code/alloy-worktrees/wt5-commercial-config-validation`  
**Port:** 3015  
**Base:** `origin/staging` @ Focus Panel merge (`741bb4ed2`)

## Integration (local staging only — not pushed)

| Ref | SHA |
|-----|-----|
| Implementation commit | `9bc2bd59ffa98d429ed6f6677940d56b76c8ef80` |
| Closeout docs commit | `62993cee8135b4d315c16f9aa071967b2e7defb4` |
| Local staging HEAD (after merges) | `c683cca1fe1cdf725b488550ad4427dea704c771` |
| First commercial→staging merge | `3ab070ebfb90bc4b23e8da4547c6f078199c76fc` |
| `origin/staging` at integration | `741bb4ed27aa96a20899160136145393c4490d53` |

Local `staging` is **ahead 6 / behind 0** vs `origin/staging` (local toolkit stop fix + sync merge + commercial commits + doc merges). Nothing pushed.

## Acceptance verdict

**Accepted for Phase 1 product hardening** — Immediate product defects and Immediate UX improvements shipped; Phase 2 architecture documented only. No broad redesign. Ready for local staging integration (not pushed).

## Final implemented scope

| Area | What shipped |
|------|----------------|
| Tuition Plan uniqueness | PATCH pre-check excludes current id; occupied care formats disabled on create/edit; friendly 409 |
| Operator errors | Offerings + catalog products + policies + GL create/update map constraint text to product language |
| Tuition Change | Renamed from Schedule Tuition Change; sections: Identity → Scope → Pricing → Effective Date → Impact |
| Tuition Plan forms | Sectioned create/edit (Identity → Program → Care → Frequency → Revenue → Locations → Status) |
| Policies | Category grouping (Pricing/Billing/Eligibility/Workflow/Exception); “Applied to” scope label; rule-naming intro |
| Catalog charge timing | Scheduled vs Event-driven authoring via product metadata (`charge_timing`, `event_trigger`) |
| Accounting | GL Codes list grouped by Account Type field; no Account Type entity CRUD claimed |
| Docs | Schedule Offerings deferred note in ownership-model + commercial-configuration; this ledger |

## Deferred Phase 2 (document only)

- Fee / Add-on / Billing Plan as `commercial_policies` scope targets (schema + resolver)
- Contra Revenue on `gl_accounts.type` CHECK
- Event-driven charge **runtime** (billing still cadence-keyed)
- Schedule Offerings replacing day-count commitments
- BOS command execution

## Diff review checklist

| Check | Result |
|-------|--------|
| No unintended broad redesign | Pass — UI hierarchy + authoring metadata + error mapping only |
| No raw DB errors in touched Commercial flows | Pass — offerings, products, policies, GL create/update |
| Tuition edit excludes current record from uniqueness | Pass — `.neq("id", id)` |
| Occupied care formats only when genuine conflict | Pass — excludes current offering; same program only |
| Tuition Change / Plan preserve prior functionality | Pass — same mutations; layout/copy only |
| Policy categories presentation only | Pass — no new enforcement types |
| Charge timing via supported metadata | Pass — `writeChargeTimingMetadata` on catalog save |
| No fake Fee/Add-on policy attachment | Pass — scopes unchanged; editor notes Phase 2 |
| Account Types grouping ≠ Account Type CRUD | Pass — GL Codes rail; type is field on New/Edit GL |

## Browser validation evidence

**Blocked on machine contention (slot 5 Next on :3015 reaches Ready then exits; curl connection refused).** Sibling slots also unhealthy.

**Covered by focused Vitest + typecheck instead of live browser:**

- Occupied care-format exclusion unit test
- Friendly offering / commercial error mapping
- Charge timing metadata round-trip
- Policy category grouping

**Operator browser certify when quieter** (`alloy-dev-start wt5-commercial-config-validation` → `http://localhost:3015/organization/financials`):

- [ ] Create Tuition Plan  
- [ ] Edit without uniqueness change  
- [ ] Conflicting care-format edit (UI disabled + API 409)  
- [ ] Tuition Change create/edit  
- [ ] Scheduled + event-driven Fee/Add-on  
- [ ] One policy per category  
- [ ] GL create + friendly duplicate  
- [ ] Refresh persistence  

## Exact files changed

### Modified
- `docs/platform/commercial/ownership-model.md`
- `docs/platform/modules/commercial-configuration.md`
- `web/app/api/admin/commercial/policies/[id]/route.ts`
- `web/app/api/admin/commercial/policies/route.ts`
- `web/app/api/admin/commercial/products/[id]/route.ts`
- `web/app/api/admin/commercial/products/route.ts`
- `web/app/api/admin/financials/accounts/[id]/route.ts`
- `web/app/api/admin/financials/accounts/route.ts`
- `web/app/api/admin/programs/offerings/[id]/route.ts`
- `web/app/api/admin/programs/offerings/route.ts`
- `web/components/adminV2/commercial/policyEditorShared.tsx`
- `web/components/adminV2/settings/financials/accounting/GlCodesConfigurationPage.tsx`
- `web/components/adminV2/settings/financials/catalog/CatalogConfigurationPage.tsx`
- `web/components/adminV2/settings/financials/policies/PoliciesConfigurationPage.tsx`
- `web/components/adminV2/settings/financials/tuitionPlans/TuitionPlanCreateDialog.tsx`
- `web/components/adminV2/settings/financials/tuitionPlans/TuitionPlanEditDialog.tsx`
- `web/components/adminV2/settings/financials/tuitionPlans/TuitionPlanScheduleChangeDialog.tsx`
- `web/components/adminV2/settings/financials/tuitionPlans/TuitionPlanWorkspace.tsx`
- `web/components/adminV2/settings/financials/tuitionPlans/TuitionPlansConfigurationPage.tsx`
- `web/lib/commercial/execution/policy/policyTypes.ts`

### Added
- `docs/sprints/active/commercial-config-validation/README.md` (this closeout)
- `web/lib/commercial/chargeTiming.ts`
- `web/lib/commercial/operatorFriendlyCommercialError.ts`
- `web/lib/financials/gl/accountTypes.ts`
- `web/lib/financials/tuitionPlans/occupiedCareFormats.ts`
- `web/lib/programs/operatorFriendlyProgramOfferingError.ts`
- `web/tests/commercial/commercialConfigValidationPhase1.test.ts`

## Residual known limitations

- Browser QA not certified in this environment (server flakiness)
- Event-driven catalog items store trigger in metadata; billing runtime does not yet fire on those triggers
- Policies cannot attach directly to Fee/Add-on products
- Contra Revenue not in DB CHECK
- Day-count Enrollment Commitments remain interim Schedule Offerings stand-in

## Validation commands run

```bash
cd web && npm run test -- tests/commercial/commercialConfigValidationPhase1.test.ts
cd web && npm run typecheck
```
