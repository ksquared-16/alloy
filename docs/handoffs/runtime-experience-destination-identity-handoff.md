---
owner: platform
status: active-handoff
last_reviewed: 2026-07-18
supersedes: []
related:
  - docs/handoffs/runtime-experience-session-3-punchlist.md
  - docs/handoffs/runtime-experience-session-2-handoff.md
  - docs/handoffs/runtime-experience-next-session-kickoff.md
---

# Runtime Experience — Destination Identity Handoff

**Branch:** `agent/claude/3-runtime-drawer-deletion` · **59 commits ahead / 0 behind** `origin/staging`
(base `ba5f50cb6`, head `364e4d9c7`) · **tree clean, nothing pushed, no PR, no merge.**
Worktree: `/Users/Kelly/Code/alloy-worktrees/wt3-runtime-drawer-deletion` (managed **Slot 3**,
sanctioned). Server: `alloy-dev-start wt3-runtime-drawer-deletion` → http://localhost:3013.

## Mission summary

Make Runtime Experience transitions **genuinely immediate**, not just visually clean. The prior work
removed skeletons, partial Current Work rendering, and card resize (atomic Focus Panel reveal). The
remaining problem is **prepared-destination identity and consumption**: warm paths are fast, but the
common cold/first paths still fetch before commit because producers (prewarm) and consumers (entry /
queue selection) do not always derive **one canonical destination identity** and one prepared value.

The required end state (Kelly's acceptance gates):
- Queue selection is obvious immediately.
- Complete Focus Panel appears effectively instantly for prepared rows.
- Workspace returns immediately without white-page loading.
- No skeleton, resize, duplicate shell, partial subject, or mixed subject.
- Loading is uncommon and only used for genuine cold misses.

## Current architectural truth

- **K2 (`lib/runtime/kernel/provisioning.ts`)** owns *live transition* preparation + latest-wins.
  `provisioningKey(ref)` = `{scope(normalised to LENS), target, lens, subject, principal, tenant}`
  (NOT version). A `prepare(ref)` for a target **other than the current Attention** is **disposed at
  the emit boundary** (`run()`'s stale guard: `supersedes(currentAttention, f.ref)`), so it is never
  stored in `completed`. → **K2 cannot be used for cross-surface anticipatory prep** (Workspace→WU).
  Same-target/different-lens prep (Phase H sibling views) is NOT superseded and works.
- **URL-cache prefetch (`lib/runtime/kernel/workUnitProvisioningPrefetch.ts`)** is the cross-surface
  prep path. `prefetchWorkUnitProvisioning(target,{lens})` warms `provisioningAnswerUrl(target,lens)`;
  the entry gesture's K2 `EntryResource` (`workUnitEntryResourceClient.ts`) calls
  `consumeFreshProvisioning(url)` first. Prewarm and consume must produce the **same URL string**.
- **Drawer VM** = `loadOpportunityDrawerViaViewModel(id, null)` (VM cache 20 min, in-flight dedup).
  **Stage-work** (Current Work card) = a SEPARATE `.../stage-work` fetch (cache 90 s). The Focus
  Panel cannot reveal usefully until **VM + stage-work** are both present → both are **commit-critical
  preparation**, not Settlement.
- **Atomic reveal (`useRecordWorkRuntime.ts`)**: `completeVmWithStageWork(vm)` resolves stage-work
  BEFORE `applyVm`, so the panel only ever shows a COMPLETE VM. Prior subject is held until complete →
  no skeleton, no resize, no partial. `prewarmRecordWork(id)` warms VM+stage-work together.
- **Destination prep helper (`lib/runtime/prep/prepareOperationalDestination.ts`)**: K2 prepare +
  chain default-subject `prewarmRecordWork`. **Correct ONLY for same-target lens prep (Phase H).**
- **Config-read cache (`lib/runtime/provisioning/configReadCache.ts`)**: tenant-keyed TTL memo over
  the 4 provisioning config DB reads. Warm server composition ~1974→~1004 ms (~49%).

## Exact browser findings + timing evidence

All measured on :3013, Firefly tenant, work unit `new-leads` (Enrollment), subjects Wenc
(`b13ecce9`), Kurzman (`df771481`), Digan (`c78a8e14`). **Dev numbers are inflated** (~2 s Next dev
overhead per request; certify on a production build).

| Path | Result |
|---|---|
| **Warm adjacent Queue Row → Row** | commit + complete reveal **~63 ms, ZERO network** (prepared HIT). PROVEN. |
| **Workspace → Work Unit (prep fresh)** | after the TTL fix: commit **97 ms**, default subject complete reveal **101 ms**, **ZERO network** on entry (verified at 7 s and 18 s prep-age). Provisioning consumed (HIT), default subject VM+stage-work prepared. |
| **Workspace → Work Unit (prep stale, pre-fix)** | cold provisioning fetch **~4 s** on entry; consume returned STALE (15 s TTL aged out). Root cause was TTL, not identity, on THIS path. |
| **Default / cold Focus Panel (no prep)** | before this session's prep: revealed **>7 s** after click (commit ~4 s + VM+stage-work ~3 s AFTER). With workspace prep: revealed **at commit**. |
| **First-time Queue Row (clicked ~4 s after entry)** | row acknowledgment, commit, and reveal all landed together at **~3.4 s** — the neighbour's **stage-work was NOT warm** (adjacency prep hadn't completed; only a `.../stage-work` request fired, no VM request → VM warm, stage-work cold). Also: **no immediate row acknowledgment** (rail lit only at commit). The optimistic-ack commit addresses the feedback; the stage-work timing remains (see Remaining Failure). |
| **Work Unit → Workspace (Home / left-nav)** | retained Workspace un-hides via the A2 fix (`slot: held→current`, work-unit surface unmounts). Verified earlier this session as instant round-trip. NOT re-certified against the white-page report in this pass — treat as **needs re-cert** (Blocker 3). |
| **Browser Back/Forward, direct refresh** | **NOT independently traced this session.** Incomplete. |

## What is complete (landed + verified this session)

- **Atomic complete Focus Panel reveal** — no skeleton, no "Loading current work…" placeholder, no
  card resize; row→row holds prior then reveals complete. (`04b58cc8f`) ✅ verified Wenc→Kurzman.
- **Config-read cache** — ~49 % faster warm server composition. (`deaff4bb0`) ✅ measured.
- **Commit-critical destination prep (Workspace entry)** — provisioning consumed + default subject
  VM+stage-work prepared; entry **~100 ms, zero network** after the **60 s prefetch TTL** fix.
  (`cbc9c62d1`) ✅ measured at 7 s and 18 s prep-age.
- **Phase H sibling-view prep now also prepares each sibling's default subject.** (`cbc9c62d1`)
- **Immediate optimistic row acknowledgment.** (`364e4d9c7`) ✅ type-clean, ⚠️ **NOT browser-certified**
  end-to-end (the measurement tool errored at session close — re-run the trace in the next session).
- Earlier Session-3 wins still hold: A1 duplicate shell, A2 retained Workspace, A4 pill-in-place,
  metric tiles not links, instant-identity seed, "Thinking…" never-blank owner. (see punch list)

## What remains broken / unverified

1. **First-use Queue Row consistency.** A neighbour clicked before adjacency prep completes still
   waits on **stage-work** (~3.4 s dev). VM warms fast; stage-work is the sequential tail. The row now
   acknowledges immediately (optimistic), but the *complete* reveal can still lag on a genuine miss.
   Adjacent rows must NOT normally miss — the prep must complete faster or be triggered sooner.
2. **One canonical Operational Destination Identity.** The Workspace ENTRY path identity aligned
   (bare URL both sides), but this is fragile string-matching. Phase H prewarms with **explicit**
   `?work_view_id=new_leads` while the entry uses **implicit** `lens=null` — a latent mismatch class.
   Do NOT paper over with dual-key/alias/fallback (Kelly). Build one identity all paths derive.
3. **Retained Workspace return path** — needs re-certification against the white-page report
   (Blocker 3): trace WU→Workspace link, left-nav, Back, Forward, direct refresh independently.
4. **Optimistic ack** — needs browser cert (ack < 1 frame; committed truth unambiguous).

## Current hypotheses

- The Workspace→WU cold slowness was **primarily a TTL staleness bug** (15 s), now fixed (60 s). The
  identity DID match on the entry path (evidenced: consume **HIT** at 7 s and 18 s). But the identity
  is still derived by URL-string equality, which is brittle across paths — **the durable fix is a
  canonical identity**, not the TTL bump.
- First-use row slowness is **stage-work latency + prep timing**, not identity: the VM was warm, only
  stage-work fetched. Faster/earlier neighbour prep (or bundling stage-work with the VM warm so both
  finish together) is the lever.
- `kernel.provisioning.prepare` cross-target disposal is a hard K2 semantic, not a bug — anticipatory
  cross-surface prep must live on the URL cache (today) or the canonical destination store (target).

## Code paths inspected (not exhaustively modified)

- `lib/runtime/kernel/provisioning.ts` — K2 lifecycle, `provisioningKey`, dispose/supersede at emit.
- `lib/runtime/kernel/workUnitEntryResourceClient.ts` — entry `consumeFreshProvisioning` seam.
- `lib/runtime/kernel/attention.ts` — `attentionFromUrl`, `urlFromAttention` (note:
  `urlFromAttention` ALWAYS renders `/workspace/work-unit/{target}` and cannot express bare workspace).
- `lib/runtime/kernel/useWorkUnitEntryGesture.ts` — `attentionTargetFromEntryHref` (click parse).
- `lib/runtime/store/preparedDestinationStore.ts` — the Phase B canonical store (built, flag-off,
  **not wired to commit** — the intended home of canonical identity).
- `lib/runtime/graph/*` — Phase A Operational Graph + `DestinationId` (flag-off).
- `lib/presentation/runtime/useRecordWorkRuntime.ts`, `useCommittedWorkUnitSurfaceRuntime.ts`,
  `useWorkspaceSurfaceRuntime.ts` — VM/stage-work prep + adjacency + workspace prep.
- `components/presentation/workUnit/QueueRegion.tsx`, `CondensedQueueRow.tsx` — row selection/ack.
- `lib/experience/surfaceHost/SurfaceHostContext.tsx` — showWorkUnit gate, retained Workspace (A2),
  never-blank loader.

## Code paths modified this session (see commits)

`useRecordWorkRuntime.ts` (atomic reveal, `prewarmRecordWork`), `useCommittedWorkUnitSurfaceRuntime.ts`
(#6 adjacency + Phase H via `prepareOperationalDestination`), `useWorkspaceSurfaceRuntime.ts` (workspace
prep: URL-cache provisioning + default-subject chain), `workUnitProvisioningPrefetch.ts` (return
promise + 60 s TTL), `configReadCache.ts` (new), `workUnitProvisioningAnswer.ts` (config cache wiring),
`prepareOperationalDestination.ts` (new), `AlloyOperationalBootShell.tsx` + `SurfaceHostContext.tsx`
(never-blank/retained), `InlineOpportunityFocusPanel.tsx` (Thinking loader, seed), `WorkspaceHeader.tsx`
(tiles not links), `ProvisionedWorkUnitSurface.tsx` (pill-in-place + identitySeed), `QueueRegion.tsx`
(optimistic ack).

## Commits created during this session

59 commits ahead of `origin/staging` (base `ba5f50cb6`). This session's new work (most recent first):
`364e4d9c7` optimistic row ack · `cbc9c62d1` commit-critical destination prep · `04b58cc8f` atomic
reveal · `5252e39d1` workspace prep · `deaff4bb0` config cache · `35fdf8f95` pill-in-place ·
`ff2c9394c` #6 adjacency · `b37caedd1`/`1f6f4eef7` A3 skeleton/blank · `ee7915b5a` Phase H ·
`ee42e5b8f` A2 Home · `68b8b8845` A1/A5 shell · `bbfaeb70c` tiles · `a3a30f204` seed. Plus doc commits.
Run `git log --oneline origin/staging..HEAD` for the full list.

## Tests completed / baseline

- **Typecheck:** `tsc --noEmit` = **10 errors, ALL pre-existing test files** (`tests/metrics/
  oipWarmCacheDedup.test.ts` ×8, `tests/platform/headerSurfacePersistence.test.ts` ×1,
  `tests/runtime/d3Provisioning.test.ts` ×1). **Zero new errors from this session.** ⚠️ `tsc` OOMs
  (exit 134) under memory pressure — kill stray `tsserver` and run with
  `NODE_OPTIONS=--max-old-space-size=8192` (do not treat the OOM as a clean 0-error result).
- **Unit tests:** NOT run this session for the new prep code (no new unit tests authored). Two stale
  runtime test files fail with ENOENT reading removed legacy route files —
  `tests/adminV2/runtime/ownershipDeletionPass.test.ts`,
  `tests/adminV2/runtime/kpiSingleOwnerAndColdShell.test.ts` — **pre-existing**, not regressions
  (spawned as a background cleanup task earlier).
- **Browser cert:** the workspace-entry (~100 ms) and warm-adjacent (~63 ms) paths are browser-proven.
  Optimistic ack, first-use timing, and Workspace return are NOT fully certified — see Remaining.

## Current feature flags

- `NEXT_PUBLIC_OPERATIONAL_GRAPH` — Phase A graph. **Default OFF.**
- `NEXT_PUBLIC_PREPARED_DESTINATION_STORE` — Phase B store. **Default OFF** (store built, not wired).
- `NEXT_PUBLIC_ADMIN_V2_SOFT_SIDEBAR_NAV` — soft sidebar nav (unchanged this session).
Key TTLs now: provisioning prefetch **60 s**, config-read cache **15 s**, VM session cache **20 min**,
stage-work cache **90 s**.

## Repository / worktree / branch state

- Root: `/Users/Kelly/Code/alloy-worktrees/wt3-runtime-drawer-deletion` — SANCTIONED managed Slot 3.
- Branch: `agent/claude/3-runtime-drawer-deletion`, head `364e4d9c7`, 59 ahead / 0 behind
  `origin/staging` (`ba5f50cb6`). **Nothing pushed. No PR. No merge. Tree clean.**
- Backup tag from prior sessions: `backup/pre-staging-rebase-66a133916`.

## Local server + validation instructions

```bash
alloy-root                                   # must say SANCTIONED / managed-worktree
alloy-dev-start wt3-runtime-drawer-deletion  # http://localhost:3013 (port 3013)
# Sign in in the browser pane (Kelly enters creds — the assistant cannot).
# Typecheck (clear stray tsserver FIRST, then heap-bumped):
pkill -9 -f tsserver; NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit   # in web/
```

## Exact next implementation sequence

1. **Canonical Operational Destination Identity.** Define ONE value (build on `DestinationId` in
   `lib/runtime/graph/destinationId.ts`) that every producer and consumer derives: workspace entry
   href, rendered link, prewarm input, prewarm cache key, click input, K1 `AttentionRef`, K2
   `provisioningKey`, and the drawer-VM/stage-work keys. Resolve **implicit default vs explicit
   `work_view_id`** to ONE representation at the identity boundary (do not dual-key).
2. **Wire the Phase B store (`preparedDestinationStore`) as the anticipatory producer/consumer** of
   that identity for cross-surface prep (Workspace→WU, adjacency), keeping K2 as the live-transition
   owner. Prepared state must never become a second truth owner.
3. **Default-subject complete VM preparation** through that store (VM + stage-work), so cold/default
   Focus Panel commits complete — generalise the current `useWorkspaceSurfaceRuntime` chain.
4. **Queue Row first-use consistency** — trigger neighbour prep earlier and/or bundle stage-work with
   the VM warm so both finish together; certify adjacent rows do not normally miss.
5. **Retained Workspace return** — re-certify WU→Workspace (link/left-nav/Back/Forward/refresh) with
   no white page / no boot shell / no reconstruction.
6. **Production-like browser certification** of the full matrix (below) on `next build && next start`.

---

## Current Operator Reality

- **Workspace → Work Unit:** FAST when the workspace prep is fresh (~100 ms, complete Focus Panel,
  zero network). On a genuinely cold first load (server composition cold) the provisioning itself is
  ~1–4 s (dev-inflated); the "Thinking…" owner shows, then a complete reveal — no blank, no skeleton.
- **Adjacent Queue Row → Row:** FAST when prepared (~63 ms, zero network, complete). A row clicked
  before adjacency prep completes waits on stage-work (~3.4 s dev) but now **acknowledges the row
  immediately**.
- **Cold / default Focus Panel:** reveals complete (no skeleton/resize). With workspace prep it
  reveals at commit; without prep it waits on VM+stage-work.
- **Work Unit → Workspace:** retained Workspace un-hides (A2). **Re-cert needed** vs the white-page
  report — not independently traced this pass.
- **Browser Back/Forward:** popstate → `attention.move` adapter exists; **not traced this session.**
- **Direct refresh:** route `loading.tsx` → content-only "Thinking…" owner (no duplicate shell).

## Proven Fast Path (measured)

Adjacent warm Queue Row → Row (Wenc→Kurzman):
- **Preparation:** `#6 adjacent subject preparation` in `useCommittedWorkUnitSurfaceRuntime.ts` →
  `prewarmRecordWork(neighbourId)` on idle after commit → warms **VM (`loadOpportunityDrawerViaViewModel`)
  + stage-work (`completeVmWithStageWork`→`prefetchOpportunityStageWork`)**.
- **Resource identity:** VM key via `resolveOpportunityDrawerVmCacheKey(id, null)`; stage-work key via
  `opportunityStageWorkCacheKey({opportunityId, departmentId, stageKey, stageLabel})` — identical for
  prewarm and click (both from the same VM, null context).
- **Cache/store hit:** VM `cache_hit`, stage-work warm; K2 lens preparation reused (subject move).
- **Network:** ZERO before commit.
- **Runtime Focus commit + complete reveal:** ~63 ms.

## Remaining Failure

**Workspace preparation → consumed provisioning answer.** After the 60 s TTL fix the ENTRY path IS
consumed (HIT, ~100 ms). The residual risk is the **identity derivation** across all paths. Every
known identity representation, with evidence status:

| Representation | Value observed | Status |
|---|---|---|
| Configured entry href (`ProcessTileModel.entryHref`) | parsed to `{target:new-leads, lens:null}` | via K2 log (REUSE key `lens:null`) |
| Rendered link href (workspace DOM) | `/workspace/work-unit/new-leads` (bare, ×6 links) | confirmed |
| Prewarm input | `entryHref` (above) | confirmed |
| Parsed prewarm destination | target `new-leads`, lens `null` | confirmed |
| Prewarm resource key | `/api/admin/work-units/new-leads/provisioning-answer` (bare) | confirmed (in cache keys) |
| Click input | `/workspace/work-unit/new-leads` (bare) | confirmed |
| Parsed click destination | target `new-leads`, lens `null` | confirmed |
| Consumption resource key | `/api/admin/work-units/new-leads/provisioning-answer` (bare) | confirmed (consume **HIT** vs same key) |
| K1 AttentionRef | `{target:new-leads, lens:null, subject:null, principal:b2562c99…, tenant:93667019…}` | confirmed (entry) |
| K2 provisioning key | `{scope:1, target:new-leads, lens:null, subject:null, principal, tenant}` | confirmed (logged REUSE) |
| Work View identity | entry uses **implicit default** (`lens:null`); Phase H prewarms **explicit** `work_view_id=new_leads` for the SAME default view | confirmed — **latent mismatch class** |
| Org/location scope | tenant `93667019…`, principal `b2562c99…`; site filter "All locations" during test | partially confirmed (site variance untested) |
| Default subject identity | `recordOfAttention.id` from the operational answer (`b13ecce9` Wenc) | confirmed |

**INCOMPLETE evidence (do not guess):** behaviour under a non-"All locations" site filter; entry via a
work-view ROW carrying an explicit `?work_view_id` (vs the bare tile CTA); multi-process workspaces;
whether any path canonicalises the default view to `new_leads` and thereby diverges from the bare
entry URL. The **implicit-vs-explicit default work view** is the single most likely identity fracture.

## Architectural Boundary

- **K2 owns live transition preparation + latest-wins.** A movement supersedes and disposes
  preparations it leaves — correct for live ownership; fatal for off-attention anticipatory prep.
- **Anticipatory preparation may author the SAME canonical answer** — but through the URL cache (today)
  or the canonical destination store (target), NEVER by forcing a cross-target `provisioning.prepare`
  that K2 will cancel at its emit boundary.
- **Off-attention preparation must not be forced through a lifecycle that cancels it.**
- **All paths must share ONE destination identity and ONE canonical prepared value.**
- **Prepared state must never become a second truth owner** — committed Focus remains the sole subject
  owner; prep only warms caches the committed path reads.

## Remaining Mission

The next session must finish, in order:
1. Canonical Operational Destination Identity.
2. Workspace preparation consumption (through that identity).
3. Default-subject complete VM preparation (through that identity).
4. Queue Row first-use consistency (adjacent rows must not normally miss).
5. Retained Workspace return path (no white page; re-cert).
6. Production-like browser certification of the full matrix (A–I in the punch list / kickoff).
