# Canonical Data System — Phase 2: Read-Path Alignment + Strict Mode

**Date:** 2026-06-25  
**Status:** Implemented (Phase 2)  
**Prerequisite:** Phase 1 — `docs/canonical-data-system-phase-1-reset.md`

Phase 2 makes the canonical model **trustworthy at runtime**. Phase 1 fixed write paths; Phase 2 aligns lifecycle/readiness reads, runtime loaders, status reads, strict-mode guards, and demo reset readiness.

**Principle:** Do not preserve bad demo data at the expense of correctness. Only a handful of bad records exist; reset when ready.

---

## What shipped

### 1. Lifecycle / readiness canonical read alignment

| File | Change |
|------|--------|
| `web/lib/lifecycle/lifecycleFieldRuleBindings.ts` | Profile bindings (`child:first_name`, `child:last_name`, `child:date_of_birth`) use `value_source: "customer_member_profile"` |
| `web/lib/lifecycle/lifecycleFieldRuleEvaluator.ts` | `evaluateChildProfileRule` reads via `resolveChildProfileFieldValue`; enrollment rules unchanged on `inquiry_child` |
| `web/lib/completion/loadRecordForEffectiveRequirements.ts` | OCM SELECT excludes profile columns; loads profile via `loadCustomerMemberProfileFieldsByMemberId` |
| `web/lib/completion/loadCustomerMemberProfileFields.ts` | Native + config `field_values` for `customer_member` |
| `web/lib/completion/evaluateCompletionRequirements.ts` | `extractRelatedFromRecord` maps profile from hydrated inquiry children |
| `web/lib/completion/requirementValidationTypes.ts` | Extended `InquiryChildCompletionSnapshot` with profile fields |

Tests: `web/tests/lifecycle/lifecycleFieldRuleEvaluator.test.ts`, `web/tests/fields/canonicalReadAlignment.test.ts`

### 2. Runtime read-path alignment

| File | Change |
|------|--------|
| `web/lib/fields/childProfileFieldResolution.ts` | Canonical profile resolution from inquiry-child snapshot (populated from customer_member grain) |
| `web/lib/admin/drawer/inquiryChildrenHydration.ts` | Identity (name, DOB) from `customer_members` / `persons` — unchanged, verified |
| `web/lib/admin/drawer/attachCustomerMemberProfileToInquiryChildren.ts` | **New** — merges config profile fields onto `_inquiry_children` rows from `customer_members` |
| `web/lib/admin/opportunityEntityRecord.ts` | Calls profile attach before OCM enrollment `custom_fields` attach (full hydrate + overlay paths) |
| `web/lib/layout/platformFieldResolutionManifest.ts` | `child.*` profile manifest points at `customer_members` columns |

**Grain contract (runtime):**

| Fact class | Source |
|------------|--------|
| Child name, DOB, age display | `customer_members` (+ `persons` when linked) |
| Gender, allergies, medical notes, preferred name | `customer_members` + `field_values` (`entity_type = customer_member`) |
| Program, schedule, start date, location, outcome | `opportunity_customer_members` |

Tests: `web/tests/admin/drawer/attachCustomerMemberProfileToInquiryChildren.test.ts`, `web/tests/fields/canonicalReadAlignment.test.ts`

### 3. Status read alignment

| File | Change |
|------|--------|
| `web/lib/fields/canonicalStatusRead.ts` | `resolveCanonicalStatusKey` prefers `status_key`; legacy `status` text fallback with Phase 3 TODO |
| `web/app/api/admin/opportunities/[id]/activity-signal/route.ts` | Uses `resolveOpportunityCaseStatusKey` |
| `web/app/api/admin/related/[entity]/[id]/route.ts` | Opportunity SELECT includes `status_key` |

**Status grain rules (reads):**

| Entity | Canonical column | Notes |
|--------|------------------|-------|
| Enrollment case | `opportunities.status_key` | Labels from `status_definitions` |
| Child enrollment outcome | `opportunity_customer_members.outcome_status_key` | No legacy text column |
| Person operational | `persons.status_key` | |
| Household / account | `customers.status_key` | |
| Child profile | — | **Do not** use `customer_members.status_key` for enrollment semantics |

**Remaining legacy `status` text reads (Phase 3 cleanup):**

These still SELECT legacy `status` alongside `status_key` or use non-entity status columns. Each should migrate to `resolveCanonicalStatusKey` or entity-specific helpers before column drop:

- `web/lib/communications/v2/commandCenterConversationEnrichment.ts` — opportunities
- `web/lib/communications/inboxThreadsService.ts` — opportunities
- `web/lib/admin/operationalTasksWorkspaceEnrichment.ts` — opportunities
- `web/lib/communications/v2/familyWorkspace/loadFamilyWorkspaceData.ts` — customers (has both columns)
- Task / workflow / metrics modules — `operational_tasks.status`, `form_definitions.status`, etc. (different domain — not enrollment case status)

### 4. Native-column parity dry-run

`web/scripts/canonicalNativeColumnParityDryRun.ts`

Read-only comparison of manifest rows vs `field_definitions` for an org:

```bash
DEMO_ORG_ID=<uuid> npx tsx web/scripts/canonicalNativeColumnParityDryRun.ts
```

Sources (not a new catalog):

- `INQUIRY_CHILD_NATIVE_FIELD_MANIFEST`
- `CUSTOMER_MEMBER_CONFIG_FIELD_MANIFEST`
- `OPPORTUNITY_NATIVE_REFERENCE_FIELD_MANIFEST`

**Next (Phase 3):** seed generator that inserts missing rows only — no duplicates, no invalid entity ownership.

### 5. Strict-mode guardrails

`web/lib/fields/canonicalStrictMode.ts`

| Guard | Purpose |
|-------|---------|
| `assertNoChildProfileKeysOnOcmPatch` | Profile fields must not target OCM |
| `assertNoLegacyTextStatusPatch` | Blocks legacy status text writes |
| `assertFieldDefinitionOwnership` | Invalid entity ownership on field_definitions |
| `assertLifecycleBindingGrain` | Profile vs enrollment binding grain |

Tests: `web/tests/fields/canonicalReadAlignment.test.ts` (all `LIFECYCLE_FIELD_RULE_BINDINGS`), Phase 1 ownership tests

### 6. Demo reset execution readiness

**Do not run destructive reset automatically.**

#### Preserve (config / platform)

- `field_definitions`, `field_section_definitions`, `field_values` on config-only entities
- `status_definitions`, `status_transition_rules`
- `action_definitions`, `action_placements`, `action_links`, `record_actions`
- `record_drawer_layouts`, `record_layouts`, `record_overview_layouts`
- `form_definitions`, workflows, `option_sets`, `option_set_items`
- `orgs`, `org_settings`, `departments`, `work_units`, `locations` (sites)
- `role_definitions`, permissions, auth users

#### Delete / reset (demo operational CRM graph)

- `opportunities`, `opportunity_customer_members`, `opportunity_persons`
- `customer_members`, `customer_persons`, `customers`, `persons` (demo household graph)
- `field_values` for deleted entity ids (orphan cleanup)
- `tour_bookings`, `placement_candidates`, operational tasks linked to deleted opportunities
- Notes / messages / documents tied only to deleted demo records (script handles best-effort)

#### Execution paths

| Path | Command |
|------|---------|
| Programmatic (preferred) | Dry-run: `DEMO_RESET_ORG_ID=<uuid> npx tsx web/scripts/resetStagingDemoData.ts` |
| Programmatic execute | `DEMO_RESET_ORG_ID=<uuid> DEMO_RESET_CONFIRM=RESET_STAGING_DEMO_DATA npx tsx web/scripts/resetStagingDemoData.ts --execute` |
| Manual SQL | `supabase/sql/maintenance/reset_demo_operational_data.sql` — **ROLLBACK by default**; set org id and change to COMMIT after count review |

#### Pre-execution checklist

1. Confirm target org id (staging / local demo only — **never production**)
2. Run dry-run script; review counts
3. Run `canonicalNativeColumnParityDryRun.ts` — field_definitions should be unchanged after reset
4. Verify `field_definitions` count before reset (record baseline)
5. Execute reset with explicit confirm env / SQL COMMIT
6. Post-reset verification:
   - `SELECT count(*) FROM opportunities WHERE org_id = …` → 0 (or expected clean baseline)
   - `SELECT count(*) FROM field_definitions WHERE org_id = …` → unchanged
   - Create new lead + child — profile on `customer_members`, enrollment on OCM
7. Re-seed demo data if needed via existing seed scripts

---

## Phase 3 cleanup backlog

| Item | Notes |
|------|-------|
| Remove legacy `status` text column reads | Migrate remaining SELECTs to `status_key` + `resolveCanonicalStatusKey` |
| Drop legacy `status` columns | After read cutover + analytics audit |
| Native-column parity seed migration | Insert missing `field_definitions` from dry-run gaps only |
| Backfill bad demo rows | Optional — prefer reset over backfill |
| `customer_members.status_key` semantics audit | Ensure not used for enrollment outcome |
| Layout normalize pass-through | `child.gender`, `child.allergies` flat keys on layout runtime rows (optional polish) |
| Static route tests | API routes asserting OCM profile rejection + legacy status rejection |
| Contacts deprecation path | Continue `persons` + `customer_persons` convergence |
| Home-services schema residue | Track B database cleanup (separate sprint) |

---

## Validation

```bash
cd web && npm run test -- \
  tests/fields/canonicalReadAlignment.test.ts \
  tests/fields/canonicalChildGrainMapping.test.ts \
  tests/fields/canonicalFieldOwnership.test.ts \
  tests/lifecycle/lifecycleFieldRuleEvaluator.test.ts \
  tests/admin/drawer/attachCustomerMemberProfileToInquiryChildren.test.ts

cd web && npx tsc --noEmit
```

---

## Success criteria (Phase 2)

- [x] Lifecycle/readiness uses canonical child profile reads
- [x] Runtime displays child profile data from `customer_members` (identity + config attach)
- [x] OCM only stores enrollment participation/outcome facts (writes Phase 1; reads Phase 2)
- [x] Status reads converge on `status_key` + helpers (remaining legacy fallbacks documented)
- [x] Config and runtime share canonical field identities via manifests + reference matrix
- [x] Demo data reset ready to execute safely (checklist above)
- [x] Tests prevent child grain / binding drift

---

*End of Phase 2 — see `docs/canonical-data-system-audit.md` §18 for audit cross-reference.*
