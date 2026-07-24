---
owner: engineering
status: fix
last_reviewed: 2026-07-24
supersedes: []
---

# Configured Stage Referential Integrity — Fix Report

The provenance investigation found a platform defect: the runtime could expose and execute a
stage that is not in the configured Business Process, because built-in constants were trusted
ahead of the configured process. This report is the fix.

**Nothing pushed, nothing merged.** The Firefly remediation migration is authored, not applied.

---

## Root cause

Two independent missing guards, each trusting built-ins (or nothing) instead of the configured
process:

1. **Stage validity trusted a hardcoded list.** `isValidBootstrapBuilderStage` returned `true`
   when `LIFECYCLE_STAGE_ORDER` contained the key, **before** consulting the configured process.
   `LIFECYCLE_STAGE_ORDER` (`lib/completion/lifecycleProgressionRequirementsCatalog.ts:52`) still
   lists `qualification` + `enrollment` — the *pre-Part-9* operator-stage model. So
   stage-bootstrap served `qualification` (live HTTP 200).
2. **The stage-move writer had no membership check.** `applyStageOutcomeRuleTarget`'s
   `move_to_stage` case wrote `opportunities.stage_key` (family) and `process_instances.stage_key`
   (child) with only a non-empty check — never verifying the destination was configured. Proven
   by `closed_withdrawn`, which the validity gate *rejected* yet the writer still executed.

The trigger was operator-authored tenant data — a lead rule `Reached/Qualified → move_to_stage:
qualification` left dangling after Part 9 removed the stage. No migration or seed wrote it; no
publish-time check rejected it.

**Exact artifacts involved:**

| Kind | Location | Role in the defect |
|---|---|---|
| Stale constant | `LIFECYCLE_STAGE_ORDER` (lifecycleProgressionRequirementsCatalog.ts:52) | granted validity to qualification/enrollment |
| Stale constant | `ENROLLMENT_TEMPLATE_STAGE_KEYS` (enrollmentQueueMembershipDefaults.ts:21) | broad legacy set incl. qualification |
| Fallback path | `isValidBootstrapBuilderStage` (buildLifecycleStageBootstrap.ts) | built-in short-circuit before configured check |
| Writer path | `applyStageOutcomeRuleTarget` move_to_stage (stageOutcomeRuleTargetExecutor.ts) | wrote stage_key with no membership guard |
| Stale default | `defaultEnrollmentStageOperatingPlans.ts` `reached_to_qualification` | code default moved reached_family → qualification |
| Tenant metadata | Firefly dept `3933ac47…` lead/waitlist/enrolling plans | dangling move targets qualification/enrollment/closed_withdrawn |

---

## Fixes (commit by commit)

| Commit | Fix |
|---|---|
| `d3d45aa80` | **Fixes 1–4.** Foundation (`configuredStageInventory.ts`); stage validity = configured-membership only (built-in used only to seed first-time setup, from the *current* template that excludes qualification); canonical stage-move guard at the writer; publish-time referential integrity; stale `reached_to_qualification` default move removed. |
| `0b8941ea3` | **Fix 5.** Idempotent remediation function + Firefly-scoped SQL migration. |
| `57e6485cd` | Unit coverage (51) + authenticated cert spec. |

### The runtime contract now enforced

```
referenced stage → resolve configured Business Process → verify membership
  → present → YES  (validity gate: isValidBootstrapBuilderStage)
  → write   → YES  (canonical guard: applyStageOutcomeRuleTarget move_to_stage)
  → publish → YES  (referential integrity: validateConfiguredStageReferences)
absent →
  configuration error → no write → no partial transaction → no activity → no next work
  → transaction result changed:false → clear operator/admin explanation (+ correlation)
```

---

## Referential-integrity matrix

| Reference type | Valid target executes | Invalid target rejected | Transaction/state unchanged on reject |
|---|---|---|---|
| Bootstrap stage validity | `decision` → 200 | `qualification`/`enrollment`/`closed_withdrawn` → 400 `stage_not_configured` | n/a (read) |
| move_to_stage (family) | configured stage writes `opportunities.stage_key` | non-configured → config error, **no write** | YES — no status update, no undo, no activity, no next work |
| move_to_stage (child) | configured stage writes `process_instances.stage_key` | non-configured → config error, **no write** | YES |
| Outcome rule → move | valid target advances | invalid target → `failed_targets`, not `applied_targets`; transaction aborts | YES — work close compensated |
| Publish (outcome move target) | accepted | 422 `dangling_stage_reference` | YES — nothing saved |
| Publish (transition target) | accepted | 422 with `invalid_target` | YES |
| Publish (nested/automation target) | accepted | 422 | YES |

All rows are proven by `tests/lifecycle/configuredStageReferentialIntegrity.test.ts` (12) and the
broader suite (51 total across referential-integrity + provenance + firefly config + remediation).

---

## Vocabulary audit — `qualification`

55 non-test occurrences across `lib/`+`app/`. Classification:

| Category | Count (approx) | Runtime-validity risk after fix | Action |
|---|---|---|---|
| **Runtime-validity path** | 2 | — | **FIXED** — `isValidBootstrapBuilderStage` no longer consults built-ins; move-writer now guards membership. |
| **Stale default/template move** | 1 | none (Fix 2 blocks) | **REMOVED** — `reached_to_qualification` code default no longer moves to qualification. |
| **Presentation / display ordering** (`LIFECYCLE_STAGE_ORDER`, pill tone, lifecycle presentation, KPI switches) | ~20 | none — presentation only | **KEPT** (doctrine-allowed: "display ordering within a known configured set"), documented non-authoritative. |
| **Legacy status→stage mapping / migration support** (`enrollmentLegacyCompat`, `statusMvpCatalog`, `statusDefinitionLifecycle`, `enrollmentPipelineQueueDefinitionV2` aliases) | ~18 | none — maps historical statuses for display/migration | **KEPT** (doctrine-allowed: "migration support"). |
| **Classification/eligibility switches** (`opportunityExecutionEligibility`, `opportunityAttentionRules`, requirement catalogs) | ~14 | none — classify a record already in a stage; never grant validity | **KEPT** — harmless once no record can enter qualification. |

**None of the remaining occurrences grant runtime validity or execute a stage move.** After the
fix, `qualification` is inert unless a process explicitly configures it as a custom stage (proven
to work when configured). The same conclusion applies to `enrollment` (kept as the operator
display bucket for `enrolling`) and `closed_withdrawn`.

One legacy default move survives by design: `defaultEnrollmentStageOperatingPlans.ts:458`
(waitlist → `enrollment`). Unlike qualification, `enrollment` has its own legacy default plan, so
the move is internally consistent within the legacy default set; it only dangles for a tenant
whose configured process omits it, where Fix 2 blocks it. Removing it would break legacy-default
tenants, so it is left in place and neutralized at runtime.

---

## Tenant remediation

The Firefly published plan carries three dangling targets. The remediation (function
`remediateDanglingStageReferences.ts` + migration
`20260724000000_firefly_remediate_dangling_stage_references.sql`) is idempotent and removes only
dangling targets, inventing nothing:

| Source stage | Dangling target | Action | Why not repointed |
|---|---|---|---|
| lead | `qualification` | **removed** move target | qualification is not a configured stage; correct destination is a Product decision |
| waitlist | `enrollment` | **removed** move target | process uses `enrolling`; repoint is a Product decision |
| enrolling | `closed_withdrawn` | **removed** move target | stage not configured for this tenant |
| tour | `decision` | **preserved** | `decision` is a valid configured stage |

Dry-run against the live captured config confirms exactly these three removals, decision
preserved, and the cleaned config passes referential validation (idempotent on re-run) —
`tests/lifecycle/remediateDanglingStageReferences.test.ts`.

**Not applied to the live tenant.** The dangling references are already inert at runtime (Fix 2
blocks the moves), the Firefly DB is shared across worktrees, and "do not push/merge" governs.
Applying the migration is the promotion step. Where the correct destination is a Product decision
(waitlist→enrolling? enrolling→closed_withdrawn?), the transition is left **invalid and blocked**
rather than guessed.

---

## Wenc record cleanup

**Status: audited; QA-artifact reset pending server availability** (the toolkit's 3-server cap is
currently held by sibling worktrees, so slot 1 could not be restarted for a live write). The
authenticated cert + cleanup spec is authored and runs the moment a slot frees.

Audited QA artifacts on Wenc (`b13ecce9…`), from this session's earlier Record Outcome
certifications:
- `contact_family` work `attempt_count` inflated to 3 by repeated `left_message` certs; `due_at`
  pushed forward; `last_outcome` = left_message.
- A QA tour booking (Confirmed 27 Jul 2026).

Cleanup plan (auditable, capture before/after): reset the contact work `attempt_count`/`due_at`/
`last_outcome` to pre-cert baseline. **The QA tour booking is NOT auto-cancelled** — cancellation
runs the tour-comms orchestrator toward a real recipient (`tarynw@hotmail.com`); it is flagged for
Kelly to remove. No legitimate fixture data is deleted.

---

## Authenticated runtime certification

Spec `playwright/tests/configured-stage-integrity-cert.spec.ts` — non-destructive, live:

1. `stage-bootstrap?stage_key=qualification` → **400 `stage_not_configured`** (was 200).
2. `stage-bootstrap?stage_key=decision` → **200** (configured stage still served).
3. Publish of the still-dangling config → **422 `dangling_stage_reference`** naming qualification.
4. Invalid move on Wenc (`Reached/Qualified`) → **400**, `changed:false`, and Wenc canonical truth
   (stage_key, work state, attempt_count, activity count) **byte-identical before/after**.

**Result: authored and committed; live execution blocked on dev-server capacity.** The toolkit
caps at 3 concurrent dev servers; slots 2–4 are held by sibling worktrees (other sessions), and
slot 1 could not be started — one brief auto-resume thrashed to an unresponsive state (HTTP 000)
under machine memory pressure. I did not stop sibling servers to force capacity.

The deterministic suite proves every claim above without a server: **81 tests pass** across
referential-integrity, remediation, provenance, firefly-config, outcome-transaction and
platform-transaction suites. The authenticated spec runs unchanged the moment a slot frees:

```bash
cd web && PLAYWRIGHT_BASE_URL=http://127.0.0.1:3011 PLAYWRIGHT_STORAGE_STATE=~/.local/state/alloy-dev/auth/slot1/storage-state.json \
  npx playwright test playwright/tests/configured-stage-integrity-cert.spec.ts --workers=1
```

Prior live evidence from the provenance investigation captured the **before** state (bootstrap
served qualification, HTTP 200); the cert captures the **after** (400). Until it runs, the
after-state is proven by the unit layer, which exercises the exact same predicates.

---

## Final answer

> **Can Alloy ever expose or write a stage that is not configured in the current Business Process?**

# NO

- **Expose:** `isValidBootstrapBuilderStage` returns stages only from the configured process;
  built-ins seed first-time setup from the current template (no qualification) and grant no
  runtime validity. Non-configured bootstrap → 400. *Proven.*
- **Write:** the canonical `move_to_stage` writer verifies configured membership before any write;
  a non-configured target is a configuration error with no write, no partial transaction, no
  activity, no next work. Every caller inherits it. *Proven.*
- **Persist a new one:** publish rejects any config referencing a stage outside its own inventory
  (422, structured violations, no silent drops). *Proven.*

Backed by 81 deterministic tests today; the authenticated live layer (committed spec) runs on
server availability.

---

## Reproduce

```bash
cd web && npx vitest run tests/lifecycle/configuredStageReferentialIntegrity.test.ts \
  tests/lifecycle/remediateDanglingStageReferences.test.ts \
  tests/lifecycle/fireflyStageProvenance.test.ts
# Live (needs slot 1 server):
cd web && PLAYWRIGHT_BASE_URL=http://127.0.0.1:3011 PLAYWRIGHT_STORAGE_STATE=~/.local/state/alloy-dev/auth/slot1/storage-state.json \
  npx playwright test playwright/tests/configured-stage-integrity-cert.spec.ts --workers=1
```
