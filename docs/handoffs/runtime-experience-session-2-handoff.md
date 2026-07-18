---
owner: platform
status: active-handoff
last_reviewed: 2026-07-18
supersedes: []
---

# Runtime Experience — Session 2 Handoff

**Branch:** `agent/claude/3-runtime-drawer-deletion` · **ahead 37 / behind 0** vs `origin/staging` ·
**tree clean, nothing pushed.** Worktree: `/Users/Kelly/Code/alloy-worktrees/wt3-runtime-drawer-deletion`
(managed **Slot 3**, sanctioned; server via `alloy-dev-start wt3-runtime-drawer-deletion`, port **3013**).

North star (Kelly): **smooth, fast clicks with near-zero lag, achieved by deleting duplicative/dead
code and killing load waterfalls.** Not flashy hacks that trade one glitch for another.

---

## 1. What this session delivered (all committed locally, verified)

| Commit | What | Verification |
|---|---|---|
| `abae1ac79` | **Phase A — Operational Graph** (`web/lib/runtime/graph/*`): pure compiler + client materializer + `DestinationId` identity + revision version-vector, flag `NEXT_PUBLIC_OPERATIONAL_GRAPH` (default OFF) | 19 unit tests green |
| `64bab967b` | **Phase B — Prepared Operational Destination store** (`web/lib/runtime/store/*`): generalizes `workUnitProvisioningPrefetch` into a `DestinationId`-keyed store — dedup / latest-wins / graph+config invalidation / data-staleness / bounded budget. Flag `NEXT_PUBLIC_PREPARED_DESTINATION_STORE` (default OFF) | 14 unit tests green |
| `82ad2ba11` | **Refresh duplicate-shell fix**: gated `useSearchParams()` off the operational path in `AdminV2Shell.tsx` so the route `loading.tsx` boot shell is the single owner on refresh | 3 tests + `/workspace` 200s, no de-opt |
| `afd011f20` | **Focus-panel seed type fix**: widened the `opportunityQueuePreviewSeed` stub type → tsc errors 12 → 10 | tsc + browser render unchanged |

**Live-tenant data cleanup (Kelly's explicit ask — done via authenticated admin API, verified):**
Deleted **both** dead `enrollment_pipeline` work units — `76b21da2…` (inactive "Qualification" in the real
Enrollment dept `3933ac47`) and `5ba90557…` (orphaned active "New Leads" in the orphaned **"Enrollment
(legacy)" dept `04958a78`**, which is not in the active departments list). The `.single()` "multiple (or no)
rows" crash on `/workspace/work-unit/enrollment-pipeline` is gone — the slug now cleanly **404s**. The 7
active `lifecycle_wu_*` units are intact; workspace renders healthy. **Left the empty "Enrollment (legacy)"
department in place** (Kelly chose "WU only").

Phase A (§1) and Phase B (§2) are the **foundation** for the felt-problem fixes below; they enumerate +
prepare but **do not yet own commit** — the wiring into the live path is the remaining work.

---

## 2. The felt problems — root-caused with live browser evidence (NOT yet fixed)

All observed authenticated on :3013 (Firefly Early Learning tenant). These are the "how far away we are" list.

1. **Row-click feels stuck on the old subject.** `components/presentation/workUnit/InlineOpportunityFocusPanel.tsx:336`
   `const visible = resolved ?? heldPrior` — on a row→row switch the panel **holds the entire prior subject
   (header + cards)** until the new subject's VM fully resolves, deliberately to avoid a mixed-subject frame.
   Because nothing prepares the adjacent row, "until resolved" = "until ~14 network requests finish."
   → **Fix = prepared adjacency (Phase H) commits `resolved` instantly from the store; hold-prior becomes
   unnecessary.**

2. **Generic "Lead" pending header (no instant identity).** Same file, `:101-107`:
   `opportunityQueuePreviewSeed` is **hard-stubbed `null`** ("no longer sourced from drawer state"), so
   `seedTitle` (`:338`) falls back to `opportunitySingular` = "Lead", and `FocusPanelCompactHeader` (`:419`)
   shows no name/chips on cold open. The selected subject's **name is not in `OperationalSubjectContext`**
   (`components/presentation/workUnit/OperationalSubjectContext.tsx` — only `subjectId` + situation/decision/
   action). → **Fix = thread the clicked/default row's identity seed** (build via
   `opportunityDrawerSeedFromQueueItem`, `lib/admin/opportunityDrawerQueuePreviewSeed.ts:51`) from
   `openRecord(row)` → the operational-subject context → the pending header. This is the smallest **visible**
   win but still a multi-file critical-path change (`FocusPanelSurface` open seam → context → panel).

3. **Row-click Settlement waterfall (~14 requests at once).** A single row-click fires the commit-critical
   `provisioning-answer?subject_id=…` **and** all Settlement together: `view-models/drawer/opportunity/{id}`,
   `communications/threads`, 2× `threads/{id}/messages`, `related/opportunity/{id}`, `activity`,
   `drawer-recipients`, `layout-runtime/opportunity-drawer-body`, `…/stage-work`, `unread-count`,
   `operational-tasks`. → **Fix = commit-critical commits first (fast), Settlement loads after into reserved
   space** (the §3 commit-critical/Settlement boundary; drawer VM runtime =
   `lib/adminV2/viewModel/drawer/opportunity/composeOpportunityDrawerViewModel.ts` +
   `useRecordWorkRuntime`).

4. **Blank white canvas on work-unit navigation.** Clicking New Leads shows a **fully blank** canvas (chrome
   only) before the work unit commits — violates never-blank. Separate from the refresh fix already landed.
   → **Fix = commit from prepared state / single centered "Thinking…" owner** (Phase K/L §12–13;
   `ProvisionedWorkUnitSurface.tsx` returns `null` until Focus commits — that null is the blank).

5. **Two focus-panel skeleton phases on initial load.** Cold default-subject open renders: generic "Lead"
   header + an **empty bordered body box** (the `subjectPending ? <FocusPanelSummarySkeleton/> : null` at
   `:491-495` renders `null` when `subjectPending` is false during the earliest frame) → then settled content.
   Related to #2 (no seed) and the shellOpen/`resolveFocusPanelSubjectReveal` timing
   (`lib/admin/drawer/focusPanelSubjectReveal.ts`).

6. **Work-view pill must swap queue + focus panel immediately.** Clicking a pill (e.g. Active Pipeline)
   should atomically re-commit the queue AND focus panel from prepared adjacent-view state
   (`WorkViewPillStrip` → `intents.selectWorkView`; adjacency = sibling Work Views, already in the Phase A
   graph via `siblingWorkViews`/`adjacentWorkViewDestinations`).

7. **Work-unit → Workspace back-nav is slow/buggy** (Kelly). → **Fix = retained Workspace runtime (Phase C).**

8. **Metric drift.** Workspace tile "**7** Pipeline Children" vs work-unit header "**6**"; "Actions (1)" vs
   "(0)". → **Fix = Operational Metrics Runtime + targeted mutation invalidation (Phase J, §10.1 Gaps A–D).**

---

## 3. Repo / build truths

- **Baseline is NOT green:** **10 pre-existing tsc errors**, none introduced this session — all in files this
  session did not author: `components/presentation/workUnit/InlineOpportunityFocusPanel.tsx` had 2 (now
  **fixed**), remaining 10 in `tests/metrics/oipWarmCacheDedup.test.ts` (8, `OipMetricKey` cast),
  `tests/platform/headerSurfacePersistence.test.ts` (1, `work_unit_header`), `tests/runtime/d3Provisioning.test.ts`
  (1, `string | null`). These predate the session; treat as a separate cleanup.
- **`tsc` OOMs on this repo** unless stray `tsc`/`tsserver` processes are cleared first — do **not** just bump
  `--max-old-space-size`. Kill orphaned `tsc` (they linger after OOM), then a default-heap `tsc --noEmit`
  completes. (Kelly's guidance: keep only this session's + 1 Cursor thread.)
- **Latent code bug (unfixed, low-priority):** the page-level "multiple (or no) rows" crash came from a raw
  `.single()` work-unit lookup on the server bootstrap path (NOT the graceful `by-slug` API, which returns
  409/404). Add a defensive guard so a future duplicate/missing key returns a clean not-found, not a stack
  trace. The duplicate that triggered it is now deleted, so it won't recur unless re-seeded.
- **Backup tag:** `backup/pre-staging-rebase-66a133916` (pre-rebase branch head).

## 4. Recommended next order (each: land → authed browser cert on :3013 → measure → commit)

1. **#2 instant-identity seed** (smallest visible win) — thread the row seed to the pending header.
2. **#3 Settlement deferral** — commit-critical first, Settlement after into reserved space (biggest lag win).
3. **Wire Phase B store into the commit path + #1 prepared adjacency (Phase H)** — kills hold-prior stuck frame.
4. **#6 work-view pill immediacy**, then **#4 blank-nav**, **#7 retained back-nav (Phase C)**, **#8 metrics (Phase J)**.
5. Delete legacy owners as each is superseded (Kelly's "remove duplicative code" mandate); certify (Phase M)
   on a production build (`next build` + `next start`, dev perf numbers are noisy).

## 5. How to resume
1. Confirm root: `alloy-root` must say **SANCTIONED / managed-worktree** (this worktree is; a sibling
   `operational-calc-registry-v1-6aa271` is **unmanaged** — do not work there). If dropped elsewhere,
   `EnterWorktree` into `/Users/Kelly/Code/alloy-worktrees/wt3-runtime-drawer-deletion`.
2. `git fetch origin staging`; rebase if behind (last rebase was clean — incoming staging = local-dev R0–R3,
   zero overlap with `web/`).
3. `alloy-dev-start wt3-runtime-drawer-deletion` → http://localhost:3013 ; sign in (Kelly must enter creds —
   the assistant cannot). Then drive the felt-problem repros above.
4. **Do not push / merge / PR** without Kelly's explicit promotion authorization. Keep commits local.
