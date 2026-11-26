# Slot 3 — semantic overlap report against staging `e7ff8e60`

Produced **before** the rebase, as an independent judgement of what the Git probe cannot see. Sections 1–9 are the
pre-rebase analysis; section 10 records the outcome.

**Staging authority:** `e7ff8e60565ba798f3e12d25f372758c0f5d54fc`
**Slot 3 branch:** `agent/claude/3-runtime-bp-convergence` @ `8973febcd4653280763650e7b885063c17fcc23e`

## 1. Merge base and exact divergence

| | |
|---|---|
| Merge base | `935f233c407bd6513bbf40cc0de87b39e4558593` (2026-07-30) |
| Slot 3 ahead | **44 commits** — 37 non-merge + 7 merges |
| Slot 3 behind | **213 commits** |
| Files changed by slot 3 | 116 |
| Files changed by staging since the fork | 1315 |
| **Files changed by BOTH** | **1** |

The debt is **wide but shallow**. Staging moved 1315 files; it collided with slot 3 on exactly one.

## 2. Files changed on both sides

`web/components/presentation/workUnit/InlineOpportunityFocusPanel.tsx`

| Side | Commit | Change | Concern |
|---|---|---|---|
| staging | `6bf4155c5` fix(focus-panel): white elevation frost instead of grey Assignments slab | +2 / −2 | **styling** |
| slot 3 | `0caf3f20d`, `2a57c234f`, `9753f23d8` (+1 merge) | +57 / −2 | **behaviour** — child runtime surface, subject-grain threading, focus stability |

Different concerns in the same file. Textually separable, and semantically compatible: a frost/elevation treatment
does not interact with grain threading. This is the single expected merge-conflict site, and it should resolve by
keeping **both** — staging's colour treatment and slot 3's grain behaviour. Neither side is superseded.

## 3. Ownership domains touched

| Domain | Slot 3 files | Staging files since fork | Verdict |
|---|---:|---:|---|
| `web/lib/lifecycle` | 24 | **0** | slot 3 has sole ownership |
| `web/tests/lifecycle` | 11 | 0 | sole |
| `web/lib/runtime` | 9 | **0** | sole |
| `web/tests/runtime` | 9 | 0 | sole |
| `docs/runtime` | 9 | 0 | sole |
| `web/lib/adminV2` | 7 | 7 | **adjacent — same subtree, disjoint files** |
| `web/lib/presentation` | 6 | 1 | adjacent, disjoint |
| `web/components/presentation` | 5 | 1 | **the one true overlap** |

**Staging made zero changes to `web/lib/lifecycle` and `web/lib/runtime` since the fork.** That is the central
finding: slot 3's two primary domains were not contested while it was away.

## 4. Overlap with slot 1 Trust Runtime work

**None.** Slot 3 touches no file under `web/lib/trust` or `web/lib/ai`. Slot 1 moved non-reasoning utilities out of
`lib/ai` (`4de3e636e`); slot 3 never reads or writes that tree. The two sprints are disjoint at file and module
level, and neither imports the other. No reconciliation needed.

## 5. Lifecycle / runtime behaviour that changed on staging after the fork

Nothing in the owned domains. The adjacent movement worth naming:

- **`web/lib/adminV2/runtime/focusPanel/*`** — staging changed identity composition, household role config, photo
  URL resolution and date display (`identitySurfaceCompose.ts`, `householdRoleConfig.ts`,
  `resolveIdentityFieldRows.ts`, `resolveIdentityPhotoUrl.ts`, `focusPanelDateDisplay.ts`). Slot 3 changed
  work-mode modelling and operational-subject resolution in the same subtree. Same panel, different
  responsibilities: staging owns *who the record is*, slot 3 owns *what work is being done on it*.
- **`web/lib/adminV2/settings/surfaces/*`** — staging changed identity field placement and the nested surface
  editor model. Slot 3 does not touch settings surfaces.
- **`web/lib/presentation/collectionFieldPresentation.ts`** — staging only; slot 3's presentation work is in
  runtime view-models.

## 6. Commits or implementations now superseded

**None.** `git cherry -v origin/staging <branch>` reports **0 of 37** non-merge commits as already upstream by
patch-id. No slot 3 behaviour has been independently reimplemented on staging, so nothing is dropped on
behavioural grounds and no capability is discarded.

The **7 merge commits** are merges *of staging into the branch* (four `Merge remote-tracking branch
'origin/staging'`, plus `f2d8b2c12`, `9034cfa7d`, `ed88908d2` folding in sibling convergence branches). A rebase
drops all seven. That is **lossless by construction**: their content is staging, which is now the base. The
distinct work those merges carried in from `agent/cursor/5-bp-execution-convergence` survives as ordinary commits
in the replayed sequence.

## 7. Documentation that may describe stale runtime behaviour

Nine `docs/runtime` files ship with this branch. These describe a runtime as of 2026-07-30 and are **not**
re-verified by the rebase:

| Doc | Staleness risk |
|---|---|
| `CONVERGENCE-HANDOFF.md` | **High** — names next steps, slot numbers and browser-auth state that this fleet pass has since changed |
| `RUNTIME-V1-CERTIFICATION-SPRINT.md` | Medium — certification plan predating the current staging |
| `SECOND-SURFACE-INVENTORY.md` | Medium — inventory of production configuration that may have moved |
| `GRAIN-AUTHORITY-MAP.md` | Low — states the canonical child row is `process_instances`; still true |
| `OPEN-DECISION-child-surface-exposure.md`, `OPEN-DECISION-multi-grain-lens.md` | Low — open questions, not claims |
| `DEFERRED-last-activity-operand.md`, `DRAWER-VM-SETTLEMENT-CLOSURE.md`, `REFUSAL-HONEST-NOT-FATAL.md` | Low — closure records |
| `docs/platform/core/business-process-system.md` | Medium — platform doc; staging may have changed BP behaviour elsewhere |

These are carried as-is. Documentation accuracy is **not** certified by this pass and should not be read as though
it were.

## 8. Expected conflict surface even though the probe is clean

`git merge-tree` reports CLEAN. Expect anyway:

1. **`InlineOpportunityFocusPanel.tsx`** — the only file both sides touched. Likely auto-merges; if it does not,
   the resolution keeps both changes, not one side.
2. **`web/lib/adminV2/runtime/focusPanel/`** — no textual conflict, but two sprints reshaped the same panel from
   different directions. A green rebase does not prove the composed panel still behaves; the adminV2 and
   presentation suites are the check.
3. **Replay across 213 commits of drift** — 37 commits replay onto a base whose *surrounding* code moved
   substantially. Imports, types and call signatures elsewhere may have shifted under code slot 3 did not change.
   Typecheck is the instrument for this, not the rebase.
4. **Merge-commit flattening** — seven merges collapse; the replayed order must still compile and pass.

## 9. Planned certification per retained capability

No migrations ship with this branch, so there is no database suite. Certification is the sprint's own vitest
surface (31 test files) plus a full typecheck:

| Capability | Suite |
|---|---|
| Child-grain runtime (row source, scope, membership parity, surface composition) | `tests/runtime/childGrain*.test.ts`, `tests/adminV2/runtime/childGrainRowSource.test.ts` |
| Subject grain derived once; no silent substitution | `tests/adminV2/runtime/subjectGrainDerivedOnce.test.ts`, `tests/runtime/subjectAuthorityNoSilentSubstitution.test.ts` |
| Refusal stays navigable (negative control) | `tests/adminV2/runtime/provisioningRefusalStaysNavigable.test.ts` |
| Work View population vs execution lane | `tests/runtime/workUnitProcessPopulation.test.ts`, `tests/runtime/declarableLensGrain.test.ts` |
| Child participation identity; waitlist convergence | `tests/lifecycle/childParticipationIdentity.test.ts`, `childWaitlistOutcomeConvergence.test.ts` |
| BP work reconciliation across stage moves | `tests/lifecycle/reconcileBusinessProcessWorkAcrossStageMove.test.ts`, `buildBusinessProcessWorkRuntimeFingerprint.test.ts` |
| Stage-changing outcome readiness | `tests/lifecycle/preflightStageChangingOutcomeReadiness.test.ts` |
| Tour Scheduled outcome path | `tests/lifecycle/mergeTourScheduledDefaultsIntoLeadPlan.test.ts`, `tourBpRuntimeIntegration.test.ts`, `tourAdvancementConfigurationEvidence.test.ts` |
| Focus-panel refresh / seed reuse | `tests/presentation/runtime/*.test.ts` |
| Queue at child grain | `tests/queues/childGrainProcessInstanceQueue.test.ts` |
| Compile-time integrity across 213 commits of drift | `tsc --noEmit` (whole project) |

**Failure protocol:** any failure is re-run against current staging before it is called a regression, so
pre-existing staging failures are not misreported as caused by this rebase.

## 10. Outcome

_Filled in after the rebase — see the reconciliation ledger below._
