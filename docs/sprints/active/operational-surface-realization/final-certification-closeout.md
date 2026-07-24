# Operational Surface Realization — Final certification closeout

**Date:** 2026-07-24  
**Slot:** 4 · `wt4-operational-surface-realization` · port 3014  
**Branch:** `agent/cursor/4-operational-surface-realization`  
**HEAD (at closeout write):** see `git rev-parse HEAD` on slot 4 (includes Secondary fix `d82f58a6d` after rebase)  
**Stance:** local certification only — **do not push or merge** until Kelly authorizes promotion.

## Live product QA (operator acceptance)

Kelly accepted live product QA on 2026-07-24. Confirmed working:

| Check | Result |
|-------|--------|
| Queue Secondary names/count render live | **Accepted** |
| Linked configuration collapses after setup | **Accepted** |
| Scheduling opens the correct child detail | **Accepted** |
| Back returns correctly | **Accepted** |
| Fresh Children reopen starts at Summary | **Accepted** |
| Schedule summary behavior | **Accepted** |

No further product changes after this acceptance.

## Secondary root cause (proven)

Live Secondary was absent because D1 operational projection enrichment attached CRM contact fields but not `_crm_compact_children` / `_household_children`, so `related_subjects_summary` stayed empty and `resolveCompactSecondaryBand` returned null (**values absent before render**, not CSS clipping).

Shared live row: `web/components/presentation/workUnit/CondensedQueueRow.tsx`.

## Automated gates

| Gate | Result | Notes |
|------|--------|-------|
| Slot 4 clean restart | **ok** after orphaned PID cleared | `/login` **200** when server exclusive |
| `npm run typecheck` | **pass** (exit 0) | After `rm -rf .next` |
| `npm run typecheck:tests` | **fail** (exit 2) | Exact files below |
| `npm run build` | see latest exclusive rerun | Compile often succeeds; page-collect / ENOENT races classified as **environment/tooling** when concurrent with `next dev` on the same `.next` |
| `verify:module-imports` | **pass** (8315 files) when build reaches prebuild | |

### `typecheck:tests` — exact failing files (`TCT_EXIT:2`)

Evidence: `/tmp/wt4-cert-typecheck-tests.out`

| File | Codes | Classification |
|------|-------|----------------|
| `tests/layout/queueRowCompactPublishValidation.test.ts` | TS2322, TS2345 | **Pre-existing baseline** — QueueRecordLayoutConfigV3 fixture gaps |
| `tests/presentation/runtime/queueRowPublishParity.test.ts` | TS2322, TS2352 | **Pre-existing baseline** |
| `tests/presentation/runtime/queueRowVariantResolve.test.ts` | TS2322, TS2741 | **Pre-existing baseline** |
| `tests/adminV2/runtime/childrenNamesAndInquiryCatalog.test.ts` | TS2345 | **Branch fixture typing** (same layout fixture gap) |
| `tests/adminV2/runtime/queuePublishRematchAndDobCatalog.test.ts` | TS2322, TS2741 | **Branch fixture typing** |
| `tests/adminV2/runtime/queueSecondaryBand.test.ts` | TS2352 | **Branch fixture typing** (Vitest runtime passed earlier) |
| `tests/adminV2/runtime/queueSecondaryLiveAbsenceProof.test.ts` | TS2352 | **Branch fixture typing** |
| `tests/adminV2/runtime/liveQueueSurfaceAuthorityAndCategories.test.ts` | TS2322, TS2739 | **Branch test typing** — `builderSlot: "primary"` vs compact union |
| `tests/adminV2/runtime/publishedQueueAuthorityAndCollectionPresentation.test.ts` | TS2322 | **Branch fixture typing** — missing `display` |
| `tests/adminV2/runtime/nestedSurfaceFieldLayoutSurface.test.ts` | TS1501 | **Branch test typing** — regex `s` flag vs test tsconfig target |

No production `tsconfig.build.json` errors.

## Commits vs `origin/staging`

Ahead/behind at closeout: **23 ahead / 0 behind** (branch rebased onto current staging during certification window).

Complete `origin/staging..HEAD` list (newest first):

```
c3965ee36 fix(surfaces): align builder identity to What's Next
81d36207b feat(whats-next): add Lucide icons to action buttons
84d704e4e style(focus-panel): shared Universal Card soft depth chrome
d82f58a6d fix(surfaces): live Secondary children + Linked collapse/Back/Summary reset
606468148 fix(surfaces): canonical schedule summary, Linked targets, Secondary band
d54ba25de fix(surfaces): published queue authority plus identity Editable/Linked/schedule
f6d7c9973 fix(surfaces): live queue reads published Surface Builder layout; /fields categories in composer
d37f82429 fix(surfaces): distinct children names/count providers and inquiry picker namespaces
231a4eb06 fix(surfaces): rematch live queue after publish; restore /fields DOB catalog
c27dc2905 fix(queue): inherit Default children slots when stage variants match
50f3a0dd8 feat(focus-panel): milestones blueprint, grid-flow, and Card Link history
b8a324fa5 fix(identity): make published field layout and edit contract authoritative
76f27e259 feat(focus-panel): Card Links foundation on shared coordination
c5a3f9aac fix(queue): capability-aligned picker and restored compact providers
c3e9b991e fix(queue): make published Surface Builder config drive live rows
e89a049af docs(sprint): certify Operational Surface Realization follow-up
44ef68a91 fix(queue): Children summary publish contract and precise diagnostics
f5a123da0 fix(work-unit): restore compact metric objects in Focus header
b5e029025 feat(workspace): extend shared overview width to Work Items and OI
b92866770 docs(sprint): index Operational Surface Realization discovery note
b122d28a7 fix(queue): compact field contract and correct variant matching
12cc59e89 feat(workspace): shared responsive overview layout for large desktops
f0a22151d feat(work-unit): compact Focus header when a record is selected
```

## Browser evidence

- **Authoritative:** Kelly live acceptance (table above).
- Agent browser: slot 4 `/login` reachable at **200** after clean restart; authenticated capture not re-run post-acceptance (operator proof stands).

## Recommendation

**HOLD** for promote until:

1. Exclusive `npm run build` exits 0 with no concurrent `next dev` on the same `.next` (recent failures: page-data MODULE_NOT_FOUND cascade after successful compile; ENOENT `_buildManifest.js.tmp` — **environment/tooling**, not Secondary/Linked product regression).
2. Optional follow-up: green `typecheck:tests` via fixture typing only (not product behavior).

Product P0/P1 acceptance criteria are **live-accepted**. **Do not push or merge** until Kelly authorizes promotion.
