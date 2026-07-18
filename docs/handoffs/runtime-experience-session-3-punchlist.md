---
owner: platform
status: active
last_reviewed: 2026-07-18
supersedes: []
related:
  - docs/handoffs/runtime-experience-session-2-handoff.md
---

# Runtime Experience — Session 3 Punch List

Branch `agent/claude/3-runtime-drawer-deletion` · managed Slot 3 · port **3013**. Keep commits
local; no push/PR without Kelly's promotion authorization.

## North star (unchanged)

Smooth, fast clicks with **near-zero lag**, achieved by **DELETING duplicative/dead code and
killing load waterfalls** — not flashy hacks that trade one glitch for another.

## The broader goal of this sprint: PREP LOADING

The core mechanism is **commit instantly from a PREPARED destination**, so a click/pill has no
waterfall to wait on:

- Wire the **Phase B Prepared Operational Destination store** (`web/lib/runtime/store/*`) into the
  **commit path**.
- **Phase H adjacency:** prepare the adjacent queue rows + sibling Work Views so the next
  click/pill commits from already-prepared state.
- This removes the hold-prior "stuck on old subject" frame and is what makes clicks feel instant.

Everything below is in service of that goal (instant identity, deferred settlement, single loading
owner) or is a visible glitch surfaced while getting there.

## Status (Session 3 — landed, all commits local)

| Item | State | Commit |
|---|---|---|
| Instant-identity seed (+ A7 name-only header) | ✅ landed | `a3a30f204` |
| A6 metric tiles not links | ✅ verified | `bbfaeb70c` |
| A1 refresh duplicate shell | ✅ landed | `68b8b8845` |
| A5 blank screen → centered Alloy loader | ✅ landed | `68b8b8845` |
| A2 Home/back-nav (retained Workspace) | ✅ verified round-trip | `ee42e5b8f` |
| A4 pill lag → Phase H sibling adjacency | ✅ verified (~79ms) | `ee7915b5a` |
| A3 two Focus-Panel skeletons | ⏳ open (needs default-subject drawer-VM prep) | — |
| Settlement deferral (~14-req stall) | ⏳ open | — |
| Phase B store into commit path (full generalization) | ⏳ open (Phase H done via K2 directly) | — |
| Metric drift (Phase J) | ⏳ open (Workspace showed 7 Pipeline Children — cross-check work-unit) | — |

A1/A5 show only on a genuinely slow load (warm dev resolves before the fallback streams) — confirm
on a hard refresh. A2/A4 are verified in-browser.

## Server-side finding — provisioning-answer over budget (documented, not yet fixed)

Measured cold `provisioning-answer` (new-leads, dev): networkMs ~2.9–4.2s, server `total_ms`
~1.5–2s, payload only 12KB. Split:
- **~half is Next.js dev-server overhead** (network minus server; not transport — payload is tiny).
  Largely gone in a production build (`next build && next start`); dev perf is noisy.
- **~half is genuine server composition, 4–5× over the composer's own ratified ≤400ms p75 budget**
  (`workUnitProvisioningAnswer.ts:8`). Dominated by **`resolveQueueRowLayoutServer` (~700ms)** — the
  queue-row **surface-config layout** DB read — plus `work_unit_ms` (~330ms) and `configuration_ms`
  (~350ms). These are published **config** reads (revision-keyed, rarely change) re-fetched from the
  DB on every answer.
- **Highest-value real fix:** revision-keyed server-side caching of the surface-config/layout reads.
  Warm-on-hover + the "Thinking…" loader already hide it in normal use; a cold/direct load pays it.
  (Kelly: keep going on the presentation list for now; revisit server caching later.)

## A. Live felt problems — Kelly, Session 3 browser (:3013, Firefly tenant)

1. **Refresh duplicate shell.** On a refresh, a blue left rail + header render **duplicated inside
   the content area** (the shell is drawn twice). Session 2 landed a refresh duplicate-shell fix
   (`82ad2ba11`, gated `useSearchParams`); this is still visible or a second instance. Re-diagnose.
2. **Back-nav to Workspace hangs.** Clicking Home (Workspace) from a work-unit page **never loads /
   never leaves the current page**. Must be instantaneous. (Was "slow/buggy" in S2; now "never
   loads.") → retained Workspace runtime (Phase C).
3. **Two Focus Panel skeletons.** On load the Focus Panel shows **two different skeletons**. Target:
   **no skeleton** — the subject Focus Panel cards should simply appear like everything else.
4. **Work-view pill lag.** Clicking a Work View pill on `/work-unit` **takes forever**. Must be
   instant — commit queue + Focus Panel from prepared sibling-view state (Phase H adjacency).
5. **No blank white screen on load.** Any page load must show the **Alloy loading visual**, made
   **larger and center-aligned**, as the single owner — never a blank white canvas. (= blank-nav
   single "Thinking…" owner, Phase K/L.)
6. **Metric tiles are not navigation.** The metric tiles (**Needs attention, Overdue work, Pipeline
   Children**) must **not be links**. `needs-attention` should not be a clickable link. Navigation
   is the **Work Views** only (workspace + work-unit pill strip). `All Leads` is grain-ambiguous and
   errors — **defer**, don't use it as a test case.
7. **Focus Panel header double-loading.** The loading header shows **two variants** — one with the
   primary contact's **phone + email**, one without. The loading/seed header must **NOT** include
   primary contact info; identity = family name + status only. (Fixed in the S3 seed builder by
   dropping the contact subtitle.)

## B. Carried from Session 2 handoff (§2 felt problems)

- **Instant-identity seed** (S2 problem #2) — pending header shows the family name, not "Lead".
  **DONE this session** (`focusPanelSeedFromQueueRow` → `OperationalSubjectContext.identitySeed` →
  pending header), refined per A7 (no phone/email).
- **Settlement deferral** (S2 #3) — a row-click fires the commit-critical answer **and** ~14
  Settlement requests together. Commit-critical commits first; activity/comms/history/messages load
  after into reserved space.
- **Hold-prior stuck frame** (S2 #1) — solved by prep loading (goal above).
- **Metric drift** (S2 #8) — Workspace "7 Pipeline Children" vs work-unit "6"; "Actions (1)" vs
  "(0)". Operational Metrics Runtime + targeted invalidation (Phase J).

## Working discipline

- **Verify fixes directly** — unit-test the pure logic, observe the settled result, read the code
  path. Do **not** fight the dev server (fetch delays / DOM polling) to catch sub-frame states;
  react-query caches resolved VMs so the delay never fires and dev is too fast.
- Each item: land → authenticated browser cert on :3013 → measure → commit, before the next.
- Baseline: 10 pre-existing tsc errors (all in test files). Clear stray `tsc`/`tsserver` before
  typechecking (do not just raise the heap).
