# Runtime × Business Process Convergence — SESSION HANDOFF (START HERE)

**Date:** 2026-07-30. **Branch:** `agent/claude/3-runtime-bp-convergence`
**HEAD:** `a9ef80898` · 25 ahead / **0 behind** `origin/staging` (`a8ca07c83`)
**Worktree:** `/Users/Kelly/Code/alloy-worktrees/wt3-runtime-v1-settlement` (slot 3, port 3013)
**Tree:** clean · **Not pushed** · `vac run typecheck` **rc=0**

## 0.0 PHASE 4 IS DONE — the first production child Runtime surface (2026-07-30, third session)

`subject_surface_unavailable` is **gone**, retired from the error vocabulary, and replaced by a real
child surface. `resolveChildGrainFocusPanelScope` was wired in the SAME change. Certified in the
browser against live Firefly: **10/10**.

**What an operator now sees** on *All Children in Enrollment*: thirteen children by name, each with
its family and effective stage ("Wenc Family · Lead · Jarek Wenc"), and a Focus Panel titled
**Jarek Wenc** — not "Wenc Family" — that says, where the action would be:

> This child is at a stage whose work belongs to the family, so there is no child action here.

**The judgement that makes this honest.** Every Firefly child participation carries `stage_key = NULL`,
so its effective stage is the family's `lead` — a stage whose grain is `family` and whose plan declares
`journey_segment: "family"`. That stage DOES configure work, with a real `action_ref`. None of it is
the child's. So the child path reads the segment (canonical 3B `resolveJourneySegment`) and, when it is
`family`, publishes `primaryAction: null`, `workTemplateKey: null`, `focusPanelStageWork: null`, plus a
`primaryActionAbsence` code saying which absence it is. It never asks for the family's stage work.

**Four defects found and fixed only because the surface was actually rendered:**

1. **Child rows had no `.id`.** `ChildProvisioningRow` has no such field; reading it produced the string
   `"undefined"` for every row, so selection, deep links and next/previous all addressed one phantom
   subject. The row id is now `participationId`. Unreachable before only because the refusal returned first.
2. **Thirteen raw UUIDs.** A queue row renders ENTIRELY from its `QueueRowContext`; `context: null` was
   not the neutral choice it looked like. Added a PI-native `childQueueRowContext` — deliberately NOT
   `buildChildGrainQueueRowContext`, which is OCM-keyed and would reintroduce the identity ambiguity 3A
   removed. Settlement-owned signals stay null rather than borrowing the family's.
3. **A permanent spinner.** `isOperationallyResolved` required `action != null`, so a child with no
   configured action — fully resolved — rendered as "Thinking…" forever. Resolution now means the action
   QUESTION was answered (`action` OR `actionAbsence`). The family path is unaffected: it always has one.
4. **"Could not load the opportunity drawer View Model."** `useRecordWorkRuntime` loads the OPPORTUNITY
   record VM keyed on the committed subject id; a child's is a `process_instances.id`. The fetch is now
   suppressed for a child subject — **only the fetch**: nulling `drawer.type` as well returned the whole
   panel as `null` for every child, which is a worse lie than the failed fetch.

**Live provider proof** (`scripts/tmp-proveParticipationMembership.ts`): the provider's output equals the
Enrollment Definition's own liveness verdict over the real population, 13/13. One claim is **NOT proven
here and the script says so out loud**: Firefly holds zero non-live participations, so "closed
participation never appears" is vacuously true against this data — unit-proven only.

**Typecheck: rc=1 → fixed → rerun. And a lesson worth keeping.**

The full typecheck was hard to run at all on 2026-07-30 — concurrent agents in
`wt4-phase7-slice3-participant-runtime` and `wt2-assignment-schedule-ux` pushed load to ~70 and killed
run after run with **exit 144** (leased, direct, detached and scoped-to-changed-files alike). Exit 144
here means host contention, not broken code. It eventually completed on a lease.

**It found a real defect that a careful source inspection had just declared safe.** Widening
`OperationalSubjectEntityType` with `"child"` broke
`useWorkUnitDefaultOperationalSubjectAutoOpen.ts:121` — that hook declares its OWN local
`type EntityType = "opportunity" | "job" | "schedule"` which was *silently identical* to the subject
union until the child grain existed. A grep for the type NAME could never find it, because the
coupling was structural and unnamed. Fixed with an explicit `isOpenableEntityType` guard: a subject
this hook cannot open is not opened. Without it a child participation id would have been handed to
`openRecord` as an opportunity id — opening a different record under the child's id, the wrong-subject
substitution in its most direct form.

**The lesson: "no exhaustive switch on this type" does NOT mean "widening it is safe."** Two unions
that happen to have the same members are coupled by assignability, and nothing names that coupling.
Widen a union → run the typecheck. Inspection cannot substitute for it, and this handoff previously
claimed it could.

Verified by inspection AND now by the compiler:

| Widening | Status |
|---|---|
| `OperationalSubjectEntityType` + `"child"` | **broke one hidden consumer** (above) — fixed and guarded. |
| `CurrentBusinessState.workTemplateKey/Label/required` → nullable | read only by the answer, `ProvisionedWorkUnitSurface.tsx` (fixed, browser-certified), and tests. |
| `situation.workTemplateLabel/required` → nullable | zero production readers. |
| `primaryAction` → nullable | one dereference, fixed; the panel VM already typed it `\| null`. |

**Known, NOT fixed (next slice):** the *All Children in Enrollment* pill counts **8**, not 13 — the D5
Settlement count locator is family-shaped. Counts are Settlement-only and governed by the
enrichment-independent count doctrine, which is off-limits here. Also unchanged by choice:
`actionsProjection` still resolves work-unit-scoped `entityType: "opportunity"` rail actions (they are
work-unit actions, not claims about the child).

## 0. Session of 2026-07-30 (second): steps 1, 3A, 3B are DONE

| Commit | Step | What landed |
|---|---|---|
| `0fd5fb217` | **1** | Declarable lens grain + child participation membership |
| `d5dfdf834` | **3A** | Canonical child participation identity |
| `a9ef80898` | **3B** | Stage grain × plan journey segment reconciliation |
| `be9b3a38c` | **3C** | Grain-aware scope resolution for a child subject |

**Next: Phase 4** — the child surface (§4 item 5). Every dependency it had is now in place.
The one prerequisite left outside code: author the "All Children in Enrollment" Work View in Firefly
tenant config (`row_grain_v1: "child"`, no stage predicate).

### Later that day — builder, work views, reconciliation

| Commit | What |
|---|---|
| `de31aec39` | Row Type declaration in the Work View builder (the Phase 4 prerequisite is now authorable) |
| `ba9ac24d9` | Dynamic date conditions made readable; lens order made authoritative |
| `450efb858` | Declared Work View order is the default workspace tile sort |

- **Firefly config is DONE:** Active Pipeline and All Leads now declare `row_grain_v1: "family"`.
  Both were previously dead destinations refused as `grain_ambiguous`. Confirmed in the browser.
- **Reconciled with `origin/staging`** (7 incoming commits, Cursor scheduling UX, 6 files, no
  overlap). Clean merge. Post-merge `vac run typecheck` **rc=0**.
- **Slot 3 browser auth re-captured** (`alloy-agent-login 3`) — Phase 4 certification is unblocked.
- **`last_activity_at` is DEFERRED by decision** — see `docs/runtime/DEFERRED-last-activity-operand.md`.
  It is a real requirement, but it collides with the ratified enrichment-independent count invariant,
  and **that invariant is not to be revised during this convergence**. `updated_at` stays the operand
  for Active Pipeline and must not be relabelled as last activity.

Three things a future session should not re-derive:

1. **`journey_segment ?? "family"` was NOT a live hazard** — the field is required on
   `StageOperatingPlanV1` and enforced by its parser, so a plan omitting it never parses. The real
   defect was that the plan's segment and the STAGE's grain were never reconciled: a stage edited to
   `grain: "child"` whose plan still said `family` ran as a family and never reached the child guard.
   Now refused. §4 item 3 is closed with that correction recorded.
2. **Pre-existing reds, baselined at `25870bf89` and unchanged by this work** — do not attribute them
   to the convergence branch: `tests/lifecycle` **91 failed / 1128 passed** (mostly source-scanning UI
   assertions); `tests/queues` **5 failed**; `tests/runtime` + `tests/queues` + `tests/adminV2/stageWork`
   together **9 failed / 410 passed**. The owed full-suite name diff against `origin/staging` is still
   owed — these numbers are the local half of it.
3. **`d1ProvisioningAnswer.test.ts` used to lie.** Its config-read cache is process-wide, so four
   proofs passed or failed on residue from earlier tests in the file. Cleared per test (`beforeEach`).
   That exposed a real fact worth keeping: the FAMILY page enriches from `operational_tasks` and
   `opportunity_customer_members` — so the family path has its own answer to "what children exist"
   (OCM) while the child grain reads `process_instances`. Added to the Phase 6 duplicate list below.

---

## 1. What this branch is

Two sprints converged: the Runtime **Second Surface** (child grain) work and the Cursor **Business Process
execution** work. Merged from `origin/staging`, Cursor first (domain authority), Claude second (Runtime
contracts). **Zero conflicts.** Sources preserved:

- `rollback/bp-execution-e10b064e3` — Cursor, clean at `e10b064e37b76fae738e5e5f43e4013b90b18af6`
- `rollback/runtime-grain-b45fecbac` — Claude

Ownership is clean and settled — **do not re-litigate**: Business Process owns process-instance *writes*,
stage operating plans, outcomes, readiness, blockers, Tour Scheduled, Waitlist movement, action eligibility.
Runtime owns subject grain, provider selection, subject identity, refusal/empty behaviour, presentation.

## 2. DONE (do not reopen)

- **Grain authority map** — the canonical child row is **`process_instances`** (`process_key='enrollment'`,
  `subject_type='child'`), *not* `customer_members` and *not* OCM. Effective stage is a RULE:
  `process_instances.stage_key ?? opportunities.stage_key`. `docs/runtime/GRAIN-AUTHORITY-MAP.md`.
- **`subjectGrain` derived once** on the answer (`resolveSubjectGrain`, total, failure-is-a-value), published
  on operational AND empty terminals, threaded answer → panel through 4 hops. `grain_unsupported` refuses
  `person`/`account`/`work_item`.
- **Row source routed by grain** — family → `opportunities`, child → `process_instances` via the *existing*
  production provider `queryEnrollmentProcessInstanceTrackRows`. No silent degrade to family.
- **Child identity normalized** (Runtime side): `subjectId` = `customer_members.id`, `participationId` =
  `process_instances.id`, `contextId` = `opportunities.id`, `legacyOcmId` only when genuine.
- **Active Pipeline refusal is honest and escapable** — error terminals carry `navigationFrame` (lens set),
  and `provisioningErrorKind` classifies configuration vs subject vs records. G-1 untouched.
- **Proven on real Firefly data:** 11 child process instances (Jarek/Blake Wenc, Kai/Rayia Almead, Ember
  Fitz, Wrigley/Lennon Kurzman, Robbie/Zara Digan, Jaxon Lyons, Billie Champan), all `stage_key = NULL` so
  all riding their family's `lead`. Zero opportunity ids as child subjects.
- Registration/Waitlist are **authoritatively empty** — the provider runs and the stage filter excludes all 11.

## 3. THE DECISION KELLY MADE (implement this)

Create work view **“All Children in Enrollment”** — every child with an active enrollment participation,
tenant + work-unit scoped through the related opportunity, **independent of effective stage**. It should
surface the 11 children. **Do not re-grain New Leads** (stays family/opportunities/certified).
Registration + Waitlist stay stage-specific child lenses, empty until children reach those stages.

### ⚠ The blocking fact discovered right before handoff

**A stage-independent lens cannot derive its own grain, so it would be REFUSED like Active Pipeline.**
`resolveLensRowGrain` treats "no stage predicate" as "spans every active stage"; Firefly's 6 active stages
are 2 family + 4 child → `grain_ambiguous`. Creating the lens in tenant config alone yields a second dead
destination.

**Shape of the fix:** grain must become **declarable on the Work View** — the lens says "I am a child lens";
`resolveLensRowGrain` prefers the declaration, falls back to stage derivation. G-1 stays intact (a declared
lens is unambiguous by declaration; nothing about multi-grain lenses is relaxed).

**Second consequence:** `lensStageKeys(view)` returns `[]` for this lens, so
`loadChildGrainProvisioningRows` returns `[]` early. The child provider needs a **participation-membership**
mode (all active enrollment participations in scope), distinct from its current per-stage mode. Effective
stage still applies for DISPLAY, not membership.

## 3B. PHASE 4 — the child surface (START HERE)

Everything Phase 4 depended on is in place. Its goal: **replace `subject_surface_unavailable` with
the first real child Runtime surface.**

The surface CONSUMES the Business Process projection and renders: child identity · family context ·
effective child stage · readiness · current work · evaluated actions.

It must **not fabricate**: placement · room · schedule · attendance · enrollment completion.

**Required ordering (Kelly, 2026-07-30):**

1. ~~Author/configure the Firefly child participation Work View.~~ The two family lenses are already
   declared. The child lens ("All Children in Enrollment", `row_grain_v1: "child"`, no stage
   predicate) still needs authoring — the Row Type control is in the builder now.
2. Prove its provider returns ACTIVE `process_instances` only. Unit-proven already (closed instance
   under an active family case, inactive subject, closed family case, non-enrollment subject type all
   excluded — `tests/queues/childGrainProcessInstanceQueue.test.ts`). What is NOT proven is the same
   claim against real Firefly data through the live provider. Re-run the proof harness.
3. Remove the refusal ONLY after the child surface VM is complete.
4. Wire `resolveFocusPanelScope` at the same boundary — same commit. `childGrainScope.ts` exists and
   is proven but deliberately unwired; the refusal is the only thing keeping a child row away from
   opportunity-shaped scope resolution today.
5. Browser-certify selection, deep link, next/previous, refresh, and out-of-view behaviour.
6. Add NO new identity, grain, membership, stage, readiness, or action authority.

**The live case, not a hypothetical:** Firefly's child-grain stages have NO configured primary action.
The answer requires a truthful primary action to claim `operational`. BP's outcome path supplies
child-valid actions; Runtime must not invent one. A surface with no action must say so.

## 4. NEXT, in dependency order

1. ~~**Declarable lens grain** + **participation-membership mode**~~ — **DONE** `0fd5fb217`.
   Grain is declarable via `row_grain_v1` on the Work View; derivation still owns stage-scoped lenses;
   a declaration contradicting the lens's stages is refused. Child membership follows the lens's shape
   (`stages` vs `participation`), and participation membership consumes the Enrollment Definition's
   `isLiveEnrollmentParticipant` — its first consumer — rather than enumerating stages.
   **Still to do:** author the "All Children in Enrollment" Work View in Firefly tenant config
   (`row_grain_v1: "child"`, no stage predicate). Doing it earlier would have produced a dead
   destination; now it produces `subject_surface_unavailable` until Phase 4, which is the honest state.
   No Work View BUILDER UI exists for `row_grain_v1` yet — config-only.
2. ~~**3A canonical participation identity**~~ — **DONE** `d5dfdf834`.
   `lib/lifecycle/childParticipationIdentity.ts` is the one definition; the cache key is injective;
   the projection names a child explicitly or not at all and reports
   `subject_unresolved: "child_identity_required"`. `ChildRowIdentity` is now that type (Phase 6
   duplicate #1 closed). Note `resolveStageWorkOutcomeContext` reading `task.metadata` was KEPT — it
   reads the acted-on task's OWN identity, which is not the scrape.
3. ~~**3B canonical grain translation**~~ — **DONE** `a9ef80898`. See §0 note 1 for the correction.
4. ~~**3C grain-aware scope resolution**~~ — **DONE** `be9b3a38c`. Classification is split from
   membership: `resolveFocusPanelScopeForMembership` takes the rule as a parameter, the family path
   passes the opportunity predicates unchanged, and `runtime/provisioning/childGrainScope.ts` supplies
   the child rule (effective stage for a stage-scoped lens, always-true for a stage-independent one),
   considering CHILD-grain lenses only. **Not yet wired into the answer** — it cannot be, while
   `subject_surface_unavailable` refuses first. Phase 4 wires it at the same moment it removes that
   refusal; the module and its proofs exist so that removal is safe. Note the lens readers are
   INJECTED (`stageKeysForView` / `isChildLens`) to avoid a cycle back into the answer.
5. **Phase 4 child surface** — BP supplies stage/state/readiness/blockers/outcomes/actions; Runtime supplies
   subject authority, identity, context, composition, navigation. No fabricated room/placement/schedule/
   attendance/agreement. Remove `subject_surface_unavailable` only when coherent.
6. **Phase 5 B/C/D** — Tour Scheduled path; Program-required child Waitlist blocker; successful child
   Waitlist transition through the Outcome Runtime (not the family "parking lot" control).
7. **Phase 6 duplicate removal** + document the domain→Runtime contract.
8. **Phase 7 certification**, **Phase 8 integration**.

## 5. Known duplicates still present (Phase 6)

- ~~**Child identity normalization ×2**~~ — CLOSED by 3A (`d5dfdf834`); one canonical type.
- ~~**Grain guard ×2**~~ — CLOSED by 3B (`a9ef80898`); one canonical translation.
- **"What children exist" ×2** — the FAMILY page enriches child chips from `opportunity_customer_members`
  (`enrichOpportunityRowsWithChildrenForCompactQueue`) while the child grain reads `process_instances`.
  Two sources, one question. Found via the `d1ProvisioningAnswer` touched-table proof (§0 note 3).
- **`subjectGrain?.grain ?? "case"`** in `focusPanelWorkModeModelFromProvisioningAnswer.ts` — documented
  as a compatibility default for non-answer producers, not a grain fallback. Nothing ENFORCES that a
  child answer always supplies the field; a boundary test asserting it would close this properly.
- **Degrade-vs-refuse ×2** — Runtime forbids degrading a failed child *read*; BP keeps a degrade path on the
  *write* side. Possibly justified by different stakes; neither cites the other.

## 6. Gotchas that cost time

- **“Program required” is not a string** anywhere in the repo. The blocker message is generated from
  *configured requirement labels* — it lives in tenant data. Don't grep for it.
- **Firefly's child-grain stages have NO configured primary action** (`decision`/`waitlist`/`enrolling`/
  `enrolled` = NONE). The answer requires a truthful primary action to claim `operational`. Cursor's outcome
  path is what supplies child-valid actions — Runtime must not invent one.
- **`import "server-only"`** in anything the provisioning answer imports breaks vitest collection for every
  transitively-importing suite. The answer itself doesn't use it; don't add it.
- **Long test runs get killed** (seen: exit 144 with zero output, exit 143 `class=cancelled`). Run the suite
  in chunks that finish. A cancelled run is NOT a result.
- **`web/next-env.d.ts`** flips between `.next/types` and `.next/dev/types` whenever the dev server runs.
  Generated churn — always `git checkout --` it before committing.
- **`vac run test <paths>`** runs from `web/`, so paths must be `tests/...` not `web/tests/...`.
- **The broker misclassifies a real tsc `rc=2`** as `class=config` / "the command never ran". Recorded in
  `REFUSAL-HONEST-NOT-FATAL.md` §4; belongs to the Vacilando broker, not Runtime.
- Dev server: `alloy-dev-start wt3-runtime-v1-settlement` (never bare `next dev`). Auth storage state at
  `~/.local/state/alloy-dev/auth/slot3/storage-state.json` — **re-captured 2026-07-30**. It expires;
  refresh with `alloy-agent-login 3`, which opens a browser for a MANUAL sign-in (an agent cannot
  complete it).
- **`vac` is not on PATH in every shell** — invoke it as `/Users/Kelly/bin/alloy-dev/vac`. `npx vac`
  fails with "could not determine executable to run".
- **Slow tests are usually CONTENTION, not slowness.** Three concurrent vitest/tsc jobs starve each
  other into multi-minute hangs on suites that finish in seconds alone. Check
  `ps -eo args | grep [v]itest` before concluding a suite is slow, and never run a second heavy job
  while one is live.
- **`origin/staging` is moving fast** (Cursor scheduling/avatar UX, several merges an hour). Reconcile
  before starting a slice, and expect to reconcile again before landing it. No overlap with
  convergence files so far — every merge has been clean.
- **Do NOT revise the enrichment-independent count invariant** (`countOnlyTotalsProjection`). It
  blocked `last_activity_at` and that is recorded as a deferred slice, not a problem to route around.

## 7. Owed before any merge

- **Chunked full-suite name diff against current `origin/staging`** — never yet completed.
- Production browser certification A–E incl. B/C/D.
- Update `docs/runtime/OPEN-DECISION-child-surface-exposure.md`: Kelly's lens decision resolves its
  Blocker 1; Cursor's outcome path resolves Blocker 2.

## 8. Key files

| Purpose | Path |
|---|---|
| The answer (grain, refusals, row routing) | `web/lib/runtime/provisioning/workUnitProvisioningAnswer.ts` |
| Grain seam | `web/lib/adminV2/runtime/operationalContext/subjectGrain.ts` |
| Child rows | `web/lib/runtime/provisioning/childGrainProvisioningRows.ts` |
| Error surface | `web/lib/runtime/provisioning/workUnitSurfaceModelFromSnapshot.ts` |
| BP child Waitlist | `web/lib/lifecycle/applyChildWaitlistViaOutcomeRuntime.ts` |
| BP readiness preflight | `web/lib/lifecycle/preflightStageChangingOutcomeReadiness.ts` |
| Canonical child identity (3A) | `web/lib/lifecycle/childParticipationIdentity.ts` |
| Canonical grain translation (3B) | `web/lib/lifecycle/grainVocabulary.ts` |
| Participation membership provider | `web/lib/queues/childGrainProcessInstanceQueue.ts` |
| Live proof harness | `web/scripts/tmp-proveChildProvider.ts` |
| Docs | `docs/runtime/{GRAIN-AUTHORITY-MAP,SECOND-SURFACE-INVENTORY,REFUSAL-HONEST-NOT-FATAL,OPEN-DECISION-*}.md` |
