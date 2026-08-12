---
owner: sprint
status: sprint
last_reviewed: 2026-08-11
supersedes: []
---

# EPP / Waitlist Runtime Convergence — Sprint Closeout

**Branch:** `agent/cursor/5-epp-runtime-convergence`  
**PR:** [#404](https://github.com/ksquared-16/alloy/pull/404) (target: `staging`)  
**Slot / port:** 5 / `3015`  
**Worktree:** `/Users/Kelly/Code/alloy-worktrees/wt5-epp-runtime-convergence`  
**Base:** `origin/staging`  
**Closeout date:** 2026-08-11  

---

## Summary

This sprint converges Enrollment Process Platform (EPP) Waitlist and related Work Unit surfaces onto published Work View / child-grain runtime truth: placement ranking on child rows, shell stability across grains, published label authority, child Waitlist mission after family Settlement, and operator UX for adjust / time-in-stage / Household copy-from-primary.

Committed slices (`origin/staging..HEAD`) land the child-grain operational surface and parity harness. Same-sprint follow-ups finish Waitlist adjust UX, DOB/age-fit/time-in-stage presentation, stage-move Activity hydration, Work Views Save vs **Apply changes**, Household **Copy from primary**, supporting helpers/tests, and this closeout. Kelly authorized promotion: commit the follow-up slice and merge PR **#404 → staging**.

---

## What shipped

### Committed (`origin/staging..HEAD`)

| Commit | Slice |
|--------|-------|
| `11b87a1ea` | Waitlist child-grain operational surface convergence — Placement ranking/context on child rows; published groupBy+sort; Focus Panel settles on family under child Attention; stage-scoped What's Next; All Enrollment / Pipeline Children cohort alignment |
| `99af03d09` | Keep Work Unit browse shell across Work View grains — no demotion to focus density on row select; shared `WorkUnitSurfaceBodyFromModel` anatomy |
| `c17d51253` | Restore published Work View labels and catch-all cohort parity — no code-owned catch-all rewrite; refuse ambiguous totals |
| `6d94ff737` | Keep child Waitlist mission after family Settlement — overlay child published stage work; re-select focused child; drop contradictory no-action banner |
| `f8aa2a5ef` | Honor published Waitlist row variant without family fallback — subjectFocus on rows; stop Default `children.*` inherit on child-grain |
| `634d1b0cc` | Config/runtime parity harness for labels, mission, and rows |
| `cbe8d1c03` / `086ade116` / `1329dfe3a` | Test fixture repairs for `typecheck:tests` / Work View parity |
| `c20ff11dd` | Stop conflating New Family Leads with empty-filter inventory |
| `b8ffe9b0b` | Close Waitlist row and stage-work matching follow-ups — position/wait-since on Secondary; refuse cross-stage template-key matches |

### Same-sprint follow-ups (committed with this closeout)

**Waitlist / EPP UX**

- Adjust modal: Focus Panel card styling; Bend Pine Apply (`#00A283` / `alloy-bend-pine`); no reason placeholder; **Adjust** = plain link under `#n/total`
- Queue group headers: program label only (`programLabelWithoutAgeRange`)
- Assignment rooms: age fit from DOB/asOf; **Checking…** until scored (no Eligible→Ineligible flash)
- DOB as queue-row layout field (`child.date_of_birth`)
- Time-in-stage from `stage_entered_at` (not lead `created_at`); single bottom-right stamp
- Stage moves in What's Next + Activity (`child_lifecycle_status_changed` hydration)
- Children card Program/Gender identity field alignment
- Work Views: **Save** = draft; **Apply changes** publication bar required for live labels
- New: `WaitlistPlacementAdjustControl`, `queueGroupCollapseSession`, program fallbacks, absence-copy helpers, parity tests

**Household**

- **Copy from primary** on secondary guardian (email/phone/address only; never name; confirm modal)
- `copyPrimaryContactDetails.ts` + `HouseholdCopyPrimaryContactConfirmModal.tsx`

---

## Operator-facing behavior

| Surface | Behavior |
|---------|----------|
| Waitlist queue | Child-grain rows show published placement fields/variant; group headers = program name only; `#n/total` + Adjust link; compact time-in-stage bottom-right from stage entry |
| Adjust placement | Modal matches Focus Panel cards; Bend Pine Apply; optional reason (no placeholder) |
| Work Unit shell | Browse shell stays stable when selecting rows across family/child Work Views |
| What's Next (child Waitlist) | Child Waitlist mission retained after family Settlement; no Lead Contact Family false bind |
| Work View pills/labels | Come from **published** BP revision only — Save alone does not update live labels; use **Apply changes** |
| Assignment create | Room age-fit waits on DOB score (**Checking…**), then Eligible/Ineligible |
| Household card | Secondary guardian **Copy from primary** → confirm → copies email/phone/address via `savePersonContact` |
| Activity / What's Next | Child stage moves hydrate via `child_lifecycle_status_changed` |

---

## Architecture notes

- **Published config authority:** Work View labels, catch-all cohort naming, and Waitlist row variants resolve from the published Business Process revision — not code fallbacks that rewrite operator copy.
- **Child grain vs family Settlement:** Focus Panel may settle on the family opportunity under child Attention, but Current Work / mission overlays the child's published stage work so Waitlist plans are not replaced by family Lead templates.
- **Row variant inherit guards:** Child/candidate grain is placement-compatible; Default family `children.*` slots must not inherit onto child-grain Waitlist rows (avoids duplicate name + “1 child”).
- **Stage age:** Compact queue age owns `stage_entered_at` (grain-aware via `resolveOperationalStateEnteredAt`); Work Views filter/group only and do not own stage age.
- **Household copy:** Channel copy is person-contact mutation (`savePersonContact`), not primary designation; name is never copied.
- **Photo projection (follow-up landed after closeout):** Durable `profile_photo_document_id` persists; display uses short-lived signed URLs. Opportunity / `_inquiry_children`, child-grain queue rows, and Assignment roster now wire `resolveProfilePhotosForActor` + `resolved_photo_url`. Remaining surfaces tracked in the future sprint doc.

Doctrine touchpoints updated with this closeout:

- `docs/platform/core/record-system.md` — Copy from primary
- `docs/platform/operator/queue-system.md` — Waitlist adjust + Apply changes pointer
- `docs/platform/core/business-process-system.md` — Work View draft vs published labels
- `docs/sprints/archive/future/identity_profile_photo_projection_everywhere.md` — observed projection gap (2026-08)

---

## Files / areas touched

### Runtime / presentation (representative)

- `web/lib/runtime/provisioning/*` — child-grain Waitlist placement, inquiry program fallback, surface composition, absence copy
- `web/lib/presentation/runtime/*` — variant resolve, compact slots, group/sort, `queueGroupCollapseSession`
- `web/lib/workUnits/buildChildGrainQueueRowContext.ts`, `buildPartialQueueRowContext.ts`
- `web/lib/orchestration/placement/waitlistCandidateRuntimePosition.ts`
- `web/components/presentation/workUnit/{QueueRegion,CondensedQueueRow,ProvisionedWorkUnitSurface,WaitlistPlacementAdjustControl}.tsx`
- `web/lib/adminV2/runtime/focusPanel/currentWork/*` — mission overlay / checklist truth / activity preview
- `web/lib/admin/fetchQueueActivityTimelineEvents.ts`, `loadOpportunityRelatedActivityEvents.ts`, `opportunityActivityTimelineFormat.ts`
- `web/components/admin/focusPanel/cards/{ChildrenCard,HouseholdCard,SchedulingCard}.tsx`
- `web/lib/adminV2/runtime/focusPanel/household/copyPrimaryContactDetails.ts`
- `web/components/admin/focusPanel/cards/HouseholdCopyPrimaryContactConfirmModal.tsx`
- `web/components/adminV2/settings/lifecycle/BusinessProcessPublicationBar.tsx`
- `web/components/adminV2/settings/businessProcess/WorkViewsConfigurationContext.tsx`
- `web/lib/childcare/childCareProgramFromDob.ts`, assignment quote / scheduling routes (age fit)

### Tests (representative)

- `web/tests/presentation/runtime/waitlistChildGrainOperationalSurface.test.ts`
- `web/tests/presentation/runtime/waitlistParityCapstonePresentation.test.ts`
- `web/tests/workUnits/buildChildGrainQueueRowContextWaitlist.test.ts`
- `web/tests/workUnits/familyInventoryEppPresentation.test.ts`
- `web/tests/adminV2/runtime/copyPrimaryContactDetails.test.ts`
- `web/tests/admin/opportunityStageMoveActivityTimeline.test.ts`
- Config/runtime parity harness commits + fixture repairs for `typecheck:tests`

### Docs

- This closeout
- Platform: `record-system.md`, `queue-system.md`, `business-process-system.md`
- Future: `identity_profile_photo_projection_everywhere.md`

`tmp/` browser-proof artifacts are local evidence only — **not** part of the merge.

---

## Validation

| Gate | Notes |
|------|-------|
| Focused Vitest | Waitlist child-grain / parity / placement / activity / copy-primary suites added or extended in-branch |
| `typecheck:tests` fixture repairs | Committed (`CompactRowSlot`, `WorkViewLinkModel`, Work Unit surface model, label-authority fixtures) |
| Brokered `npm run typecheck` / `typecheck:tests` | Required before merge on TS changes — run via `vac` / package scripts (not raw `tsc`) |
| PR #404 CI | Green on prior tip (P1 / Trust / Web typecheck / Vercel); re-check after follow-up push |
| Browser proof | Local Waitlist / EPP QA under `tmp/` (not committed) |

---

## Known follow-ups

1. **Child profile photo projection — core paths landed; residual surfaces remain**  
   - Upload persists durable `persons.metadata.profile_photo_document_id`.  
   - Display URLs are short-lived signed URLs; they must not be treated as durable metadata.  
   - **Landed:** opportunity / `_inquiry_children` (+ household persons), Focus Panel save merge (`resolved_photo_url`), child-grain queue `image_url` → CondensedQueueRow, Assignment roster.  
   - **Residual:** Room Board chips, person drawer chrome warm refresh, lane-preview bundle actor threading.  
   - Tracked: [`docs/sprints/archive/future/identity_profile_photo_projection_everywhere.md`](../future/identity_profile_photo_projection_everywhere.md)

2. **Staging reconcile** — merge `origin/staging` into the feature branch before final PR merge if staging moved (Vacilando / migration PRs).

---

## Merge (PR 404 → staging)

Kelly authorized promotion 2026-08-11:

1. Commit follow-ups + closeout docs on `agent/cursor/5-epp-runtime-convergence` (exclude `tmp/**`).
2. Merge `origin/staging` into the branch; resolve conflicts if any.
3. Push branch; merge PR **#404** into **`staging`**.
4. Do **not** treat profile-photo vanish as a Waitlist regression inside this PR — schedule the identity projection follow-up.
5. Exclude `tmp/**` from the PR.