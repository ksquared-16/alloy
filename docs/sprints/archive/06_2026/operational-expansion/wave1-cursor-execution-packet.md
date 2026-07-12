# Cursor Execution Packet — Operational Expansion Implementation Wave 1

**Prepared against verified `origin/staging` commit `79eff4b52b8e9c00aafe4b9a048150f12df5985a`.**
**Authoritative implementation contract:** `docs/platform/operational-expansion-wave1-implementation-spec.md` (the "spec").
**Frozen architecture contract:** `docs/platform/operational-expansion-phase1-architecture-rfc.md` (the "RFC").
**Ground-truth note:** every Wave 1 target file and referenced migration was re-verified present on this commit. Staging advanced 7 commits since the spec's determinism-pass baseline (`de9e44617`); **none touched any Wave 1 target** (`web/lib/operationalConsumption/**`, `web/lib/childcareOperational/attendance/**`, `web/lib/financials/**`, `web/app/api/admin/financial/consumption/**`, `supabase/migrations/**`, `web/lib/mutations/domains/**`). One mechanical reconciliation: the migration tip is now `20260715000002_entity_layouts_workspace_surface.sql`, so the Wave 1 migration timestamp must be **strictly later than `20260715000002`** (see §7). No material contradiction was found.

> **Everything below is the prompt to hand to Cursor.** It is self-contained and executable without referring any decision back to Cursor. It derives entirely from the frozen RFC and the spec; it does not reproduce the spec verbatim — Cursor must open and follow the spec for full detail while treating this packet as the execution order and gates.

---

## 1. Role and operating mode

You are the **implementation engineer** for Alloy Operational Expansion **Implementation Wave 1**. Operate under these fixed rules:

- **Architecture is frozen.** The RFC (`operational-expansion-phase1-architecture-rfc.md`) is not open for revision.
- **The spec is authoritative.** `operational-expansion-wave1-implementation-spec.md` governs exactly what to build. Read it in full before writing code. This packet is the execution order, gates, and evidence contract layered on top of it.
- **You may not redesign.** Every implementation decision is already made in the spec and its four frozen decisions **DP-1…DP-4**. Where the spec marks `[DECISION]`, implement exactly that.
- **You may not broaden scope.** Wave 1 is D2 + D12a only. D12b, Scheduling, Attendance UI, Posting, Forecasting, and any other wave are out of scope.
- **Stop and report on contradiction.** If the repository contradicts the spec (see §10 Stop Conditions), stop and produce a stop report — do not silently redesign or "make it work."
- **Do not promote or merge until all gates pass.** No push to `staging`, no merge, until §9 acceptance gates are green and the §12 evidence package is complete. Commit to the feature branch only.

---

## 2. Objective

Implement **D2 (Operational Fact Contract)** and **D12a (Correction-Aware Consumption Contract)** — nothing else. By completion the repo must have:

- an **Operational Fact contract** (domain-neutral interface + descriptor), a **reusable conformance harness**, and an **attendance reference descriptor** asserted by a conformance test (D2);
- a **correction-aware consumption DTO** (`entryType`, `correctsFactId`) and **interpreter branches** (reversal → no positive directives; correction → interpret corrected values);
- **correction lineage** columns (`consumption_events.corrects_event_id`, `resolved_obligations.superseded_by_event_id`);
- an **atomic correction-reconciliation RPC** `reconcile_consumption_correction` (DP-1);
- **same-key obligation reparenting** (DP-4) and **absent-key obligation supersession**;
- **draft-charge void retirement** in place (DP-2), never deletion, never touching posted charges;
- **current-fact idempotency** (DP-3) and **replay safety**;
- a **pure attendance-fact translation** function, authored and **left unwired**.

No behavior wired from real fact writes (that is D12b, out of scope). The consumption pipeline remains invoked only by the existing `/consumption/simulate` path.

---

## 3. Required starting state

1. Start from `origin/staging` at **`79eff4b52b8e9c00aafe4b9a048150f12df5985a`**. Fetch and confirm this is current; if `origin/staging` has moved, re-run the §Repository verification below and report any Wave-1-target drift before proceeding.
2. Create a dedicated branch and isolated worktree:
   - **Branch:** `feat/operational-expansion-wave1-fact-consumption-contract`.
   - Use a fresh worktree (do not work in a shared checkout). Solo agent only — no parallel writers (git race risk).
3. Confirm a clean working tree. Record `HEAD` and `git merge-base HEAD origin/staging`.
4. Verify the authoritative docs exist on this baseline: `docs/platform/operational-expansion-wave1-implementation-spec.md` and `docs/platform/operational-expansion-phase1-architecture-rfc.md`.
5. Inspect the existing migration sequence; confirm the tip is `20260715000002_entity_layouts_workspace_surface.sql` and that these referenced migrations exist: `20260629120000_childcare_attendance_facts_p2.sql`, `20260706120050_operational_consumption_foundation.sql`, `20260707120000_operational_consumption_schedule_slice2.sql`, `20260708120000_operational_consumption_attendance_slice3.sql`, `20260709120000_draft_obligation_review_slice4.sql`, `20260331120000_charges_receivables_foundation.sql`, `20260630120000_financial_substrate_generalization_p3_1.sql`.
6. **Record baseline test state BEFORE changing code.** Run `typecheck:build` and the targeted suites (`web/tests/operationalConsumption/**`, `web/tests/childcareOperational/attendance/**`, financial lifecycle tests). The wider `web/` suite is known to carry pre-existing failures; capture the exact baseline so post-change gates compare against it, not against absolute green. Any failure you did not introduce must be shown to be pre-existing and unchanged.
7. Re-read every implementation target named in the spec §3 and §11 before editing. If any target's current content contradicts the spec's stated behavior (e.g., attendance no longer append-only, charge status vocabulary lacks `void`), **stop** (§10).

---

## 4. Non-negotiable constraints

- No universal `operational_facts` table.
- No mutation of authoritative attendance facts; **no change to `child_attendance_events` schema/trigger, `attendanceService.ts`, `attendanceEvents.ts`, `attendanceVocabulary.ts`, or attendance emission behavior** — these are asserted-only.
- Events do not replace authoritative domain facts; do not fatten `workflow_events` payloads with billing fields.
- No D12b reactor; no new fact-write subscriber; the pipeline is invoked only by `/consumption/simulate`.
- No Posting, invoices, payments, AR, ledger, or GL writes.
- No UI, no Business Process, no Current Work, no attention rules, no AI/BOS.
- No new consumption-layer `emitEvent` / workflow events (including no event emission from obligation-review actions — that is a later D9 item).
- No changes to job-vertical billing schema, RLS, or flows.
- No deletion of `charges` or `charge_line_items` rows; no mutation of posted charges.
- No sequential multi-table correction reconciliation writes outside the atomic RPC; no compensation logic.
- No implementation choice may diverge from **DP-1…DP-4**.
- `charges` has **no `updated_by` column** — do not write one anywhere.

---

## 5. Execution phases

Implement strictly in order. Each phase has a gate that must pass before the next.

### Phase A — D2 contract scaffolding
Implement only: `web/lib/operationalFacts/factContract.ts`, `web/lib/operationalFacts/factConformance.ts`, `web/lib/childcareOperational/attendance/attendanceFactDescriptor.ts`, `web/tests/operationalFacts/attendanceFactConformance.test.ts` (spec §6).
- Shared `OperationalFactEntryType = 'original'|'correction'|'reversal'` must align with the existing attendance vocabulary (`AttendanceEntryType`).
- Conformance covers **both** the storage half (append-only; `entry_type` + link-shape CHECKs; `corrects_event_id` self-FK + no-self-ref; org RLS; no `updated_at`) and the consumer-facing half (distinct emitted event types; payload carries `schema_version`, `entry_type`, `corrects_event_id`, subject, effective date, `org_id`).
- **No attendance runtime behavior change; no attendance migration.**
**Gate A:** the new conformance test passes; existing attendance tests pass; `git diff` shows attendance runtime files byte-unchanged.

### Phase B — Additive schema + atomic RPC
Create **one** migration (spec §12; §7 below): `supabase/migrations/20260716000000_consumption_correction_lineage_and_reconcile_rpc.sql` (or any timestamp strictly after `20260715000002`). It contains:
- `consumption_events.corrects_event_id uuid NULL` self-FK `ON DELETE RESTRICT`; CHECK `(corrects_event_id IS NULL OR corrects_event_id <> id)`; partial index `(org_id, corrects_event_id) WHERE corrects_event_id IS NOT NULL`.
- `resolved_obligations.superseded_by_event_id uuid NULL` FK `→ consumption_events(id) ON DELETE SET NULL`; partial index `(superseded_by_event_id) WHERE superseded_by_event_id IS NOT NULL`.
- `reconcile_consumption_correction(p_org_id uuid, p_actor_user_id uuid, p_plan jsonb) RETURNS jsonb` — `LANGUAGE plpgsql`, `SECURITY DEFINER`, `SET search_path = public`; then `REVOKE ALL ON FUNCTION … FROM public; GRANT EXECUTE … TO service_role;` and a `COMMENT ON FUNCTION`.
- **No `charges` change.**
RPC body per spec §5.8 / §7.4: org-scoped by `p_org_id`; `FOR UPDATE` locks on the immediate prior event + its obligations (+ referenced current-matching obligations and referenced draft charges); upsert the correction event with **current-fact idempotency** (DP-3) and `corrects_event_id` to the **immediate prior** (DP-4); reparent surviving same-key obligations; supersede absent-key obligations; retire prior event; retire draft charges **in place `draft → void`** (DP-2, `AND status='draft'` guard, `metadata.retirement` provenance, `voided_at`); never mutate posted charges; never delete charge/line-item rows; all-or-nothing; namespaced `RAISE EXCEPTION 'reconcile_consumption:<reason>'` (plain text, no ERRCODE); structured `jsonb_build_object('ok',true,…)` return.
**Gate B:** migration applies cleanly on a scratch/local database; SQL contract tests pass (columns, CHECK, FK, indexes, function exists, grants = service_role only); rollback documented (`DROP FUNCTION` + `DROP COLUMN`); no RLS regressions; **`git diff` shows no `charges` schema change and no attendance change.**

### Phase C — Consumption types + pure interpretation
Update `consumptionTypes.ts` (DTO `entryType`/`correctsFactId`; row/intent lineage fields; `p_plan` types; `supersession`/`superseded` result fields incl. `reparentedObligationIds`); `attendanceInterpretation.ts` + `scheduleInterpretation.ts` (correction/reversal branches); `resolveConsumption.ts` (current-fact idempotency key + lineage in context); new `attendanceFactTranslation.ts` (pure `deriveAttendanceFactType`, unwired).
- `entryType='original'` behavior unchanged; reversal → no positive directives; correction → interpret corrected values; `correctsFactId` is **lineage only**; translation is pure and has **no runtime caller**.
**Gate C:** focused unit tests pass; `grep` proves `deriveAttendanceFactType` has no runtime caller; existing consumption unit tests remain green.

### Phase D — Atomic-commit wrapper + service integration
Implement `web/lib/operationalConsumption/reconcileConsumptionCorrectionAtomicCommit.ts` (calls `supabase.rpc('reconcile_consumption_correction', { p_org_id, p_actor_user_id, p_plan })`, `{data,error}` destructure, `reconcile_consumption:` sentinel matching — house `*AtomicCommit.ts` convention). Wire `consumptionService.ts`: `previewConsumption` computes the supersession delta (read-only); `draftConsumption` for correction/reversal **plans in TS then calls the RPC exactly once**; the `original` path is **unchanged**. Add `childcareChargeService.buildDraftChargeRetirementIntent` (planning helper only — no TS charge void). Update `simulate/route.ts` to forward `entryType`/`correctsFactId`. Update `obligationReviewService.ts` to exclude `status='superseded'` obligations from posting eligibility (read-only awareness; no new actions, no event emission).
- **No** direct multi-table correction writes from TypeScript; no compensation; no new event emission; no reactor; no additional runtime caller of the pipeline.
**Gate D:** correction, reversal, supersession, reparenting, and replay tests pass; posted-charge immutability test passes; the RPC fault-injection test proves rollback leaves **no partial state**.

### Phase E — Convergence + scope audit
Run all new Wave 1 tests + existing operational-consumption tests + existing attendance tests + relevant financial lifecycle tests + the repo `typecheck:build` gate; verify the migration applies; run the scope diff and grep guards (§ below). Produce the §12 evidence package.
**Required grep evidence (all must hold):**
- no new reactor and no new `emitEvent` under `web/lib/operationalConsumption/**`;
- only the `/consumption/simulate` route invokes the pipeline (`previewConsumption`/`draftConsumption` callers = simulate route + internal service + tests);
- `child_attendance_events` migration and attendance service/emission files byte-unchanged;
- `deriveAttendanceFactType` has no runtime caller (tests only);
- the only added `.rpc(` under `web/lib/operationalConsumption/**` is the reconcile wrapper;
- no charge `.delete(` added on any childcare/consumption path; no posted-charge mutation path added.

---

## 6. Exact file inventory

Follow the spec §11. Do **not** invent files beyond these unless a repository convention requires a mechanical equivalent (e.g., a test-helper/fixture file); if you must add an unexpected file, explain why **before** proceeding and confirm it introduces **no new architectural capability**.

**New**
- `web/lib/operationalFacts/factContract.ts` — domain-neutral Operational Fact contract types + `OperationalFactEntryType`.
- `web/lib/operationalFacts/factConformance.ts` — reusable conformance harness (storage + consumer-facing).
- `web/lib/childcareOperational/attendance/attendanceFactDescriptor.ts` — attendance's conformance descriptor (reference conformer).
- `web/lib/operationalConsumption/attendanceFactTranslation.ts` — pure `deriveAttendanceFactType` (authored, **unwired**).
- `web/lib/operationalConsumption/reconcileConsumptionCorrectionAtomicCommit.ts` — TS wrapper over the reconciliation RPC (DP-1).
- `supabase/migrations/20260716000000_consumption_correction_lineage_and_reconcile_rpc.sql` — two additive columns + indexes + CHECK **and** the `reconcile_consumption_correction` function + grants.
- Tests: `web/tests/operationalFacts/attendanceFactConformance.test.ts`; `web/tests/operationalConsumption/{correctionConsumption,reversalConsumption,supersessionReplay,twoDistinctCorrections,correctionChains,reconcileRpcAtomicity,attendanceFactTranslation}.test.ts`.

**Changed**
- `web/lib/operationalConsumption/consumptionTypes.ts` — DTO correction identity + row/intent lineage fields + `p_plan` types + result fields.
- `web/lib/operationalConsumption/attendanceInterpretation.ts`, `scheduleInterpretation.ts` — correction/reversal branches.
- `web/lib/operationalConsumption/resolveConsumption.ts` — current-fact idempotency key + lineage.
- `web/lib/operationalConsumption/consumptionService.ts` — TS reconciliation planning + call RPC for corrections; original path unchanged.
- `web/lib/financials/childcareChargeService.ts` — `buildDraftChargeRetirementIntent` planning helper (no TS charge void).
- `web/app/api/admin/financial/consumption/simulate/route.ts` — forward `entryType`/`correctsFactId`.
- `web/lib/operationalConsumption/obligationReviewService.ts` — exclude superseded obligations from posting eligibility (read-only).

**Migration:** the single file above (§7).

**Asserted-but-unchanged (must remain byte-identical):** `child_attendance_events` migration, `attendanceService.ts`, `attendanceEvents.ts`, `attendanceVocabulary.ts`; `charges` schema (no migration).

**Explicitly forbidden:** any new reactor/subscriber; any `charges` migration; any Posting/AR/ledger/GL code; any UI/route beyond the simulate forward; any second `.rpc(` beyond the reconcile wrapper; any file under Business Process / Current Work / AI-BOS.

---

## 7. Database and migration instructions

- **Timestamp:** strictly later than the current tip `20260715000002` — use `20260716000000` (or later). The spec's earlier "`> 20260709120000`" guidance is superseded by this reconciled tip.
- **Additive only; no backfill; no attendance change; no `charges` schema change; no RLS redesign.**
- The RPC follows the verified house atomic-commit convention (`execute_lead_status_mutation`, `execute_enrollment_status_mutation`, `agent_v*_commit_*_apply`): `SECURITY DEFINER`, `SET search_path = public`, discrete `p_` scalars + one `p_plan jsonb`, `FOR UPDATE` locks, plain-text namespaced `RAISE EXCEPTION`, `jsonb_build_object('ok',true,…)` return, `REVOKE ALL FROM public` + `GRANT EXECUTE TO service_role`, `COMMENT ON FUNCTION`. **No in-function `has_org_role`** — isolation is `p_org_id` threading + service_role-only grant (matches house style).
- Within the RPC transaction, lock: the immediate prior consumption event, its prior obligations, the current matching obligations being upserted, and the referenced draft charges. Convergence of replay and competing branches must be deterministic (unique `(org_id, resolution_key)` + locks).
- SQL must be safe when replayed through normal migration tooling (`CREATE OR REPLACE FUNCTION`; `ADD COLUMN IF NOT EXISTS`; idempotent index/constraint creation guarded per repo convention).
- **Rollback is documented but not executed against shared environments.** Local/scratch only for verification.

---

## 8. Test matrix (require DB-outcome evidence, not just return values)

Provide explicit evidence — asserting the resulting **database rows** (statuses, lineage columns, charge status/`voided_at`) — for each:

1. Original fact → obligation + draft charge unchanged (regression).
2. Downward correction (fee reduced/eliminated) → prior obligation `superseded`, `superseded_by_event_id` set, draft charge `status='void'` + `voided_at` + `metadata.retirement`, `review_status='stale'`, correction event with `corrects_event_id`, prior event `superseded`.
3. Same-key amount correction → obligation `consumption_event_id` **reparented** to the new event, draft recalculated, `review_status='stale'`, **no** supersession.
4. Reversal → obligation `superseded`, draft retired to `void` (row + `charge_line_items` preserved), no new obligation, prior event `superseded`.
5. One prior event with two obligations, correction reproduces one → exactly the absent one superseded (its draft voided); the reproduced one reparented.
6. Current-fact replay → single correction event (fact-anchored key), superseded once, retired once, no duplicates.
7. Two different corrections targeting the same prior fact → two distinct events; each idempotent on replay; surviving obligation converges to one row.
8. Chain original → correction → correction → correct `corrects_event_id` links; live obligation owned by the last event; earlier events superseded.
9. Chain original → correction → reversal → reversal retires the currently surviving obligation; that event retired.
10. Same-key correction followed by fee-eliminating correction → first reparents; second supersedes + voids the draft.
11. Concurrent/competing correction branches → converge on one obligation via unique key + locks; no double-charge.
12. Missing lineage (`correctsFactId` null on a correction) → treated as original; `correction_lineage_missing` stamped; no supersession.
13. Missing prior event → treated as original (TS) / `reconcile_consumption:no_prior_event` (RPC race); no partial writes.
14. Posted-charge refusal → retirement `UPDATE` hits 0 rows; posted charge `status`/`amount`/`voided_at` intact.
15. Already-voided charge replay → 0 rows updated (idempotent).
16. RPC failure after partial planned operations → **full rollback**, zero partial state (fault injection).
17. Conformance harness fails on a deliberately invalid descriptor/probe (proves the harness has teeth).
18. Attendance translation has no runtime use (grep + a test asserting purity).

---

## 9. Acceptance gates

Declare complete only when **all** hold:
- Every acceptance criterion in spec §14 is met.
- All targeted tests pass; the full §8 matrix is evidenced with DB outcomes.
- `typecheck:build` passes, or each failure is proven pre-existing and unchanged vs. the §3.6 baseline.
- The migration applies cleanly (local/scratch) and rolls back per doc.
- No scope violations (§5 Phase E grep guards all hold).
- **DP-1…DP-4 are evidenced in both code and tests.**
- No D12b behavior exists (no reactor, no fact-write subscriber).
- Working tree contains **only** Wave 1 changes.
- The §12 evidence package is complete.

---

## 10. Stop conditions

**Stop and report** (do not improvise) if:
- Latest staging materially contradicts the spec.
- The charge lifecycle does not support `draft → void` (e.g., `void` not in `charges_status_chk`, or the immutability trigger blocks draft→void). *(Verified present on this baseline; if changed, stop.)*
- The RPC cannot preserve atomicity with the current schema.
- Attendance facts are not append-only as specified.
- An existing migration conflicts with the planned columns/function/timestamp.
- A required change would alter Posting, RLS architecture, attendance fact behavior, or job billing.
- A test proves the frozen DP-1…DP-4 design cannot converge safely.

**A stop report must include:** the exact contradiction; the evidence (file/line/DDL/test output); the affected spec section; and the **smallest possible decision** required from the architecture owner. Do not proceed past a stop condition on your own judgment.

---

## 11. Commit and review discipline

- Prefer **one clean feature commit** unless splitting the migration from the code is materially safer under repo convention (if split: migration commit first, then code).
- Commit message: `feat(operations): harden fact and consumption correction contracts`.
- Before commit: inspect the staged diff; confirm no generated artifacts, no unrelated files, no `charges`/attendance changes; run all required gates; record exact test commands and outputs.
- **Do not merge or push to `staging`** unless explicitly instructed. Commit to `feat/operational-expansion-wave1-fact-consumption-contract` only.

---

## 12. Required Cursor return

Your final response must include:
1. Verified staging baseline (commit) you built on.
2. Branch and worktree used.
3. Files changed (new/changed/migration), matching §6.
4. Migration name + schema summary (columns, indexes, CHECK, function signature, grants).
5. Implementation summary by **D2, DP-1, DP-2, DP-3, DP-4**.
6. Exact transaction/RPC behavior (locks, steps, all-or-nothing, sentinels, return shape).
7. Exact charge-retirement behavior (`draft→void`, `voided_at`, `metadata.retirement`, posted-refusal, no-delete).
8. Correction and replay behavior (reparent, supersede, current-fact idempotency, chains/branches).
9. Test commands and results (with the §8 DB-outcome evidence).
10. Acceptance-criterion matrix (spec §14, pass/fail with evidence).
11. Grep/scope-audit evidence (§5 Phase E).
12. Known limitations.
13. Commit hash.
14. Confirmation that **no D12b, UI, Posting, process, Current Work, or unrelated work** was introduced.
15. Recommendation for independent architecture/conformance QA (so Claude and GPT can audit).

---

**End of Cursor execution packet.**
