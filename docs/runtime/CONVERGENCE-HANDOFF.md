# Runtime × Business Process Convergence — SESSION HANDOFF (START HERE)

**Date:** 2026-07-30. **Branch:** `agent/claude/3-runtime-bp-convergence`
**HEAD:** `a9ef80898` · 25 ahead / **0 behind** `origin/staging` (`a8ca07c83`)
**Worktree:** `/Users/Kelly/Code/alloy-worktrees/wt3-runtime-v1-settlement` (slot 3, port 3013)
**Tree:** clean · **Not pushed** · `vac run typecheck` **rc=0**

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
  `~/.local/state/alloy-dev/auth/slot3/storage-state.json`.

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
