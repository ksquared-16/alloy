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

**Proven against the LIVE tenant, not persisted.** The B check above read Firefly's live
published config, applied the remediation, and proved: 3 dangling refs before → clean after →
**second run makes no change (idempotent)** → `decision` preserved → nothing invented. The
persisted write is the migration, reserved for a controlled promotion window.

I deliberately did **not** push the cleaned config into the shared tenant via the only available
authenticated write (`stage-runtime-config`), because that path also rewrites status assignments
and would risk clobbering Firefly's status config — and **slot 3 was an active Firefly session**
throughout. The dangling refs are already **inert** (A3 proves the guard blocks the move live), so
this is cosmetic. Where the correct destination is a Product decision (waitlist→enrolling?
enrolling→closed_withdrawn?), the migration **removes** the target rather than guessing.

---

## Wenc record cleanup

**Status: audited live (C check). Automated reset NOT performed — no safe path.**

Audited QA artifacts on Wenc (`b13ecce9…`), all from THIS sprint's Record Outcome / tour
certifications (`C-wenc-audit.json`):
- `contact_family` work `attempt_count` = **3** (inflated by repeated `left_message` certs);
  `due_at` pushed to 2026-07-26; `last_outcome` = left_message.
- **1 tour booking** (Confirmed 27 Jul 2026).
- `activity_count` = 12 (includes cert-era `stage_work_outcome_recorded` events).

**Why not auto-cleaned:** none of these has a safe authenticated-API reset. Attempt counts have
no decrement/reset endpoint (they live in `operational_tasks` metadata and would need a direct
service-role write I do not have). Cancelling the tour booking runs the tour-comms orchestrator
toward the **real recipient** `tarynw@hotmail.com`, which the instructions explicitly forbid.
Deleting `workflow_events` has no API. So the reset requires a controlled service-role cleanup,
scripted alongside the remediation migration — **flagged for Kelly**, not executed here.

**Crucially, cleanliness for continued certification does not depend on this reset:** A3 proves
the referential-integrity fix leaves Wenc's canonical truth byte-identical under an invalid move,
so the record is stable. The QA artifacts are cosmetic (an inflated retry count + a demo tour),
not corruption.

---

## Authenticated runtime certification — EXECUTED

Ran `playwright/tests/final-configured-stage-cert.spec.ts` against the running Firefly tenant
(slot 1, `127.0.0.1:3011`, authenticated QA session `qa-slot1-product@example.com`). All six
checks passed; evidence in `docs/sprints/active/assets/configured-stage-integrity/`.

| # | Check | Live result | Evidence |
|---|---|---|---|
| A1 | bootstrap `qualification` | **HTTP 400 `stage_not_configured`** (was 200) | `A1-bootstrap.json` |
| A1 | bootstrap `decision` | **HTTP 200** (configured stage served) | `A1-bootstrap.json` |
| A2 | publish with dangling refs | **HTTP 422 `dangling_stage_reference`**, violations name qualification + enrollment + closed_withdrawn, each with the configured stage set | `A2-publish-rejection.json` |
| A3 | invalid move on Wenc (`Reached/Qualified`) | **HTTP 400**, `changed:false`, `error: Stage "qualification" is not part of the configured Business Process`; correlation `final-cert-1784913936258`; Wenc truth **byte-identical before/after** (stage_key null, work open, attempt_count 3, **activity_count 12 unchanged → no activity, no next work**, bookings 1) | `A3-invalid-move.json` |
| A4 | Wenc What's Next | rendered surface shows *Contact Family · Message · Schedule tour · Send form · Record outcome* — **no "Qualification"** (`/qualification/i` = false); screenshots captured | `A4-whats-next.json`, `A4-whats-next-{summary,focused}.png` |
| B | remediation vs LIVE config | dangling_before = `[lead→qualification, waitlist→enrollment, enrolling→closed_withdrawn]`; after run 1 → **clean** (passes validation); **run 2 → no change (idempotent)**; `decision` preserved in `stage_keys_after` | `B-remediation.json` |
| C | Wenc canonical-truth audit | stage `lead` (status-derived), work `open`, attempt_count 3, last_outcome `left_message`, activity 12, bookings 1 | `C-wenc-audit.json` |

The deterministic suite corroborates every row: **90 tests** across referential-integrity,
remediation, provenance, firefly-config, visibility, outcome-transaction and platform-transaction.

**Environment note:** the machine thrashed repeatedly (three dev servers + a Playwright browser
under memory pressure). The API checks (A1–A3, B, C) run without navigating and are stable; the
UI check (A4) needed the heavy workspace SPA, which OOM-killed the browser until I briefly paused
one *idle* sibling server (identified by 0 requests over 40s) to free headroom, then restored it.
No active sibling work was interrupted. Auth had expired (Supabase ~1h TTL) and was refreshed by
a manual operator sign-in.

---

## Final matrix

| Surface / path | Unconfigured `qualification` rejected | Configured `qualification` supported | Evidence |
|---|---|---|---|
| **Bootstrap** | **YES** — HTTP 400 `stage_not_configured` | YES — a configured qualification stage bootstraps | live A1 + unit |
| **Stage writer** | **YES** — move blocked, no write | YES — configured target writes | live A3 + unit |
| **Outcome execution** | **YES** — failed target, not applied; no activity, no next work | YES — configured move advances | live A3 + unit |
| **Publish** | **YES** — HTTP 422 `dangling_stage_reference` | YES — clean config accepted | live A2 + unit |
| **What's Next** | **YES** — label absent from operator surface | YES — configured label shown | live A4 + unit |
| **Process Builder** | **YES** — no built-in "Qualification" example; publish blocks dangling | YES — configured stage editable | unit + placeholder fix + A2 |
| **Metrics / filters** | **YES** — enrollment bucketing is by configured stage_key; no manufactured bucket | YES — configured stage counted | unit |
| **Navigation** | **YES** — pipeline/transitions come from configured stages; dangling filtered | YES — configured stage navigable | unit (transition filter) |

## Final answers

> **Can Alloy expose, write, navigate to, report on, or display Qualification when it is absent
> from the configured Business Process?**

# NO

Every surface in the matrix rejects an unconfigured `qualification` and supports a configured one.
Backed by **authenticated runtime evidence** (live A1–A4 + B on the running Firefly tenant) and
**90 deterministic tests**. The rule holds for any stage key, any process (including a
non-enrollment fixture) — it is membership-driven, not vocabulary-driven.

> **Is the Firefly tenant and Wenc QA record now clean enough for continued transaction
> certification?**

# YES

- **Firefly:** the three dangling references are **inert** — the guard blocks every move to a
  non-configured stage (proven live, A3), and publish can no longer introduce new ones (A2). The
  cleanup (removing the dead references) is proven correct + idempotent against the live config
  (B) and packaged as an auditable migration for a controlled promotion window; it is **not a
  blocker** for certification because nothing can act on the dead references.
- **Wenc:** canonical truth is **stable** under the fix — an invalid move changes nothing (A3,
  before == after). The remaining QA artifacts (attempt_count 3, one demo tour) are cosmetic and
  flagged for a controlled service-role reset; they do not affect transaction correctness.

**Before/after evidence:** `docs/sprints/active/assets/configured-stage-integrity/` (A1–A4, B, C
JSON + What's Next screenshots).

---

## Reproduce

```bash
cd web && npx vitest run tests/lifecycle/configuredStageReferentialIntegrity.test.ts \
  tests/lifecycle/remediateDanglingStageReferences.test.ts \
  tests/lifecycle/fireflyStageProvenance.test.ts tests/lifecycle/qualificationVisibility.test.ts
# Live (needs slot 1 server + valid auth):
cd web && PLAYWRIGHT_BASE_URL=http://127.0.0.1:3011 PLAYWRIGHT_STORAGE_STATE=~/.local/state/alloy-dev/auth/slot1/storage-state.json \
  npx playwright test playwright/tests/final-configured-stage-cert.spec.ts --workers=1
```
