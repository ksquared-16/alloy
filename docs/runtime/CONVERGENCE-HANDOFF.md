# Runtime × Business Process Convergence — SESSION HANDOFF (START HERE)

**Date:** 2026-07-30. **Branch:** `agent/claude/3-runtime-bp-convergence`
**HEAD:** `f2d8b2c128896575f095e18d7b1d11160d9c620f` · 21 ahead / **0 behind** `origin/staging` (`a8ca07c83`)
**Worktree:** `/Users/Kelly/Code/alloy-worktrees/wt3-runtime-v1-settlement` (slot 3, port 3013)
**Tree:** clean · **Not pushed** · `vac run typecheck` **rc=0** · **51 tests / 7 files green**

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

1. **Declarable lens grain** + **participation-membership mode** (§3) — gates everything below.
2. **3A canonical participation identity.** Replace Cursor's `resolveChildIdentityForProjection` (first-wins
   across three unrelated ids) and the `opportunityStageWorkResource` cache key that collapses all three into
   one opaque component. Drop task-metadata identity scraping from the authoritative path. Add boundary
   contract tests.
3. **3B canonical grain translation.** Centralize `StageGrain` (`family|child|person|account|work_item`) ×
   `journey_segment` (`family|child`) × `OperationalGrain` (`case|child|candidate`). Remove
   `journey_segment ?? "family"` and `subjectGrain ?? "case"` once authority exists.
4. **3C grain-aware scope resolution** — **the post-merge semantic collision.** Cursor's new scope code calls
   `resolveFocusPanelScope({ record: subjectRow })` / `firstMatchingVisibleWorkView` on the subject row; a
   CHILD row would be evaluated by an opportunity-shaped predicate. Unreachable today only because
   `subject_surface_unavailable` refuses first — **it goes live the moment the child surface ships. Fix
   before removing that refusal.**
5. **Phase 4 child surface** — BP supplies stage/state/readiness/blockers/outcomes/actions; Runtime supplies
   subject authority, identity, context, composition, navigation. No fabricated room/placement/schedule/
   attendance/agreement. Remove `subject_surface_unavailable` only when coherent.
6. **Phase 5 B/C/D** — Tour Scheduled path; Program-required child Waitlist blocker; successful child
   Waitlist transition through the Outcome Runtime (not the family "parking lot" control).
7. **Phase 6 duplicate removal** + document the domain→Runtime contract.
8. **Phase 7 certification**, **Phase 8 integration**.

## 5. Known duplicates still present (Phase 6)

- **Child identity normalization ×2** — mine (`childGrainProvisioningRows.ts`) vs Cursor's
  (`projectStageWorkRuntime.ts` + cache key). Incompatible precedence.
- **Grain guard ×2** in three vocabularies — `resolveSubjectGrain` vs the `journey_segment` check in
  `completeStageWorkWithOutcome.ts`.
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
| Live proof harness | `web/scripts/tmp-proveChildProvider.ts` |
| Docs | `docs/runtime/{GRAIN-AUTHORITY-MAP,SECOND-SURFACE-INVENTORY,REFUSAL-HONEST-NOT-FATAL,OPEN-DECISION-*}.md` |
