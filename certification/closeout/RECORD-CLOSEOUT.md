# Workspaces + Work Unit Operator Experience — record closeout

Evidence only. No source file changed in this closeout.

Reconciled onto staging at `a7c521225`. It was written at local commit `3cac16d65`, which the closing
lane could not push; the content below is carried forward rather than cherry-picked, and the
baselines are restated against the staging head that actually exists. The canonical laws, seam map
and guard matrix are NOT repeated here — they live in
[`docs/platform/runtime/WORKSPACES-OPERATOR-EXPERIENCE-FREEZE.md`](../../docs/platform/runtime/WORKSPACES-OPERATOR-EXPERIENCE-FREEZE.md).

## 1. PR 1314 — merged, and it carried no product

PR #1314 merged as `52a410e7a`. Delta against its merge base: **10 files, 938 insertions, 0
deletions — every path evidence.**

    certification/gate-r/{analyse.py, bad-sequence-after-76ed350ae.txt,
      pill-navigation-attribution.txt, positive-control.txt,
      probe-exoneration-navkind.txt, recertification-76ed350ae.txt, session-31bcc7568.txt}
    web/playwright/tests/{zz-gateR-navkind, zz-gateR-pillnav, zz-gateR-reliability}.spec.ts

    SOURCE FILES IN DELTA = 0

## 2. The served product contained every repair — proven by content, not by SHA

At closeout `/api/build-info` reported served `gitSha = 52a410e7a…`, region `fra1::pdx1`.

A matching SHA is not a matching product, so containment was established two ways.

**(a) Product-tree identity with the build that was already content-verified.** Gate R's A/B and
recertification ran against served `76ed350ae`, whose deployed file was verified by content (5
`originPathname` references present). Between that commit and the served commit:

    git diff --name-only 76ed350ae 52a410e7a  ->  10 paths, all evidence
    PRODUCT PATHS THAT DIFFER = 0
    web/ tree digest excl. playwright  @76ed350ae = 8e23bf0c0b9f845a
    web/ tree digest excl. playwright  @52a410e7a = 8e23bf0c0b9f845a   IDENTICAL
    supabase/ IDENTICAL   scripts/ IDENTICAL

**(b) Every repair present at the served commit.**

    5 x originPathname                       web/lib/adminV2/navigation/adminV2SoftNavReloadFloor.ts
    9 x speculative                          web/lib/runtime/kernel/provisioning.ts
      - if (!speculative) this.instr.onTerminal?.(reused)       reuse redelivery guard
      - if (!f.speculative) this.instr.onTerminal?.(terminal)   miss-path guard
    1 x speculative: true                    web/lib/runtime/prep/prepareOperationalDestination.ts
    1 x data-focus-panel-cell-settled-reason  web/components/admin/focusPanel/OpportunityFocusPanelModeGrid.tsx
    3 x alloy-os-billing--detail              web/app/adminV2/components/alloyOsRuntime.css

**What could NOT be measured, and why that is stated rather than implied.** A bundle-level grep of
the deployed adminV2 chunks is recorded as **NOT MEASURED**. The deployed QA browser session had
expired, so the probe landed on `/login` and collected only public marketing chunks. Its first run
reported all nine markers as `0`; a positive control added afterwards exposed that as the probe's own
failure and the run now refuses to emit figures at all:

    zz-closeout-served-content.spec.ts
    CLOSEOUT_SERVED {"servedSha":"52a410e7a","landedAt":"/login","authed":false,"assets":16,
                     "collectionWorked":false,"markers":"NOT_MEASURED_COLLECTION_FAILED"}

Restoring that session is Director-owned. The closeout was not blocked on it because containment was
provable without it — by (a), which is strictly stronger, since tree identity covers every source
file rather than the markers someone thought to grep for. The probe is retained at
`web/playwright/tests/zz-closeout-served-content.spec.ts` for any future re-verification; it needs a
live deployed QA session, and its control will refuse to report if it does not have one.

## 3. The lane filing conflict — classified from the governor's own event log

The previous run's summary could not be filed; every attempt returned `lane_has_active_run`.
From `execution-runs/events.jsonl`:

    2026-09-28T23:34:12.514Z  execution_run.abandoned  erun_d4ce11b6c11420be  ABANDONED
                              reason: managed_reports_without_recent_activity
    2026-09-28T23:51:35.517Z  execution_run.failed     erun_4e4827463aef77ee   FAILED
                              reason: undelivered_provider_prompt_block

**Classification: FILING_TARGET_MOVED.**

The run was not refused because the lane was busy with its own work. It had already been abandoned by
the governor's inactivity sweep at 23:34:12Z — during the Gate R recertification, whose probe
populations run for long stretches without producing a report — and a successor run then held the
lane's active-run slot. Filing against a terminal run while a successor owns the lane is refused, and
that is the documented design, not a defect.

Two measured notes worth the record:

- The refusal string names the wrong half of the condition. The blocking fact was *this run is
  terminal*; `lane_has_active_run` describes the successor instead, which sent three retry loops
  looking for a conflict that was not the cause. A message naming the target run's state would have
  classified it in one attempt. **A long measurement should file an interim progress report** —
  going quiet for hours is exactly what `managed_reports_without_recent_activity` sweeps.
- The successor run `erun_4e4827463aef77ee` failed as `undelivered_provider_prompt_block` — a
  dispatch that never reached the session. Recorded because it sat between the blocked filing and the
  closeout; this lane did not cause it and cannot repair it.

No lane governance was bypassed and no other lane was touched. The summary for
`erun_d4ce11b6c11420be` stays permanently unfiled, because that run is terminal; its content was
carried into the closeout run instead, and now into this file.

## 4. Convergence at closeout, and at this reconciliation

| | at closeout | at reconciliation |
|---|---|---|
| origin/staging | `52a410e7a` | `a7c521225` |
| served | `52a410e7a` | `a7c521225` |
| region | `fra1::pdx1` | `fra1::pdx1` |
| migration head | `20261026120000` | `20261026120000` (unchanged) |
| pending governed actions (this lane) | 0 | 0 |

Staging advanced by six peer commits (enrollment, forms, billing docs). **None touched a frozen
seam** — every seam and guard file is byte-identical between `52a410e7a` and `a7c521225`. Peers did
extend four Focus Panel *cards*, which are participants in the readiness contract; the diffs are
additive content and contain no readiness, `not_applicable`, `self_loading` or settled-reason logic,
and the first-order cell registry is untouched.

Accepted debt `SHARED_AUTH_CARD_ADMISSION_CONVERGENCE` — TARGET_MET / SEMANTIC_DIFFERENCE_REQUIRED /
EQUIVALENCE_UNPROVEN — remains open deliberately and untouched.

## 5. What shipped

| PR | Merge | Repair |
|----|-------|--------|
| 1289 | `131fa153` | cell readiness instrument — the attributes every later gate measures |
| 1290 | `d2776af1` | ALL_FIRST_ORDER_READY certification |
| 1293 | `e4243f66` | reuse redelivery — return-to-visited re-commits |
| 1295 | `e54bf0ade` | runtime convergence + bounded diagnostic (`MAX_SUBJECTS = 24`) |
| 1296 | — | hover speculative authority — a warm must not navigate |
| 1299 | `87a99be9` | Accounts Details scroll shrink contract |
| 1306 | `b7c7264c4` | Gate C/D evidence |
| 1313 | `76ed350ae` | reload-floor origin predicate — operators stop being evicted |
| 1314 | `52a410e7a` | Gate R evidence |

Gates A/B/C/D/R all PASS; figures in the freeze manifest §4.

The deepest finding: one defect owned both operator symptoms. A soft-nav reload floor armed only by
sidebar links, never superseded by Work Unit entry, fired `location.assign("/workspace")` 15s later.
Fired between opens it read as a random refresh; fired mid-open it read as a Work Unit that never
became usable. Origin-scoping the predicate closed both, and Gate R measured both to zero.
