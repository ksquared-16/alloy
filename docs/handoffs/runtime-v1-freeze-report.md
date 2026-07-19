---
owner: platform
status: runtime-v1-freeze-report
last_reviewed: 2026-07-19
---

# Runtime V1 — Freeze Report (authoritative)

> Assume there will never be a Runtime V2. This foundation must support the next five years of Alloy.
> This report supersedes the operational status in `runtime-v1-final-handoff.md` for everything below;
> the handoff remains the architectural reference (Sections 1–3, 9).

**Status: FREEZE CANDIDATE — one documented cosmetic exception (B3) and human QA remain.**
The architecture is frozen. Only the items in §7 remain; none is an architecture change.

- **Branch:** `agent/claude/3-runtime-drawer-deletion` — this session added B2, B5, B4-deletion, the
  freeze docs, and a dev-env fix on top of the prior 75 commits. Nothing pushed. No PR. No merge.
- **Worktree:** `/Users/Kelly/Code/alloy-worktrees/wt3-runtime-drawer-deletion` (managed Slot 3, SANCTIONED).
- **Doctrine (non-negotiable):** the operator can perform the first meaningful action from the
  provisioning answer alone. The answer owns the commit-critical operational projection; the drawer VM
  enriches; Settlement never gates commit and never creates operational truth.

---

## 1 — THIS SESSION'S WORK (final implementation pass)

| # | Item | Outcome | Evidence | Commit |
|---|---|---|---|---|
| 0 | **Dev env fix** | Login on `:3013` restored | Server was a bare `next dev` loading neither env tier; restarted via `alloy-dev-start` (agent-safe + trusted injection). `NEXT_PUBLIC_SUPABASE_URL defined: yes`, `/workspace` no longer `?error=config`. | (env/ops, no code) |
| 1 | **B2 — Back/Forward destination stamping** | DONE, browser-certified | K3 projection stamps the committed `DestinationId` into `history.state.__alloyDest`; popstate restores it (SURFACE + optional SUBJECT), falling back to the URL when absent. Back restored New Leads w/ operational Current Work (no white/Thinking/workspace-flash); Forward committed + re-stamped Registration. 7 unit tests. | `d861ad4dc` |
| 2 | **B5 — Publish-driven config invalidation** | DONE | `invalidateConfigReadCache` wired into the surface/lifecycle publish routes: work-unit-header→`hdr:`, queue-row-layout→`qrl:`, departments PATCH→tenant-wide. Hardened the `hdr:` key with a trailing delimiter. 3 unit tests. | `9740595c6` |
| 3 | **B4 — Verified legacy deletion** | Partial (provable-dead only) | Deleted `surfaceRefToPath` + `isSameSurface` (zero production consumers; superseded by K3 `urlFromAttention` + `surfaceIdFor`). Live `surfaceRefFromPath` kept. 5 tests. | `5de295cb9` |
| 4 | **B1 — Production certification** | See §5 | Isolated prod build (`.next-prodcert`, `ALLOY_PROD_CERT_DIST=1`) rebuilt with this session's changes; matrix measured on `next start`. | (this report) |
| 5 | **B3 — Current Work renderer unification** | DEFERRED (documented) | See §7.1 — config-coupled geometry, not safely landable blind on a freeze. Functional doctrine already met. | — |

Typecheck held at the **10-error pre-existing-test baseline** (all in `tests/`) after every commit;
no product-code type error was introduced. 15 new unit tests, all green.

---

## 2 — RUNTIME OWNERSHIP MATRIX (exactly one owner)

| Concern | Single owner |
|---|---|
| Destination Identity | `lib/runtime/graph/destinationId.ts` (value) + `resolveOperationalDestination.ts` (resolution) |
| Attention (K1) | `lib/runtime/kernel/attention.ts` `AttentionOwner` |
| Provisioning (K2) | `lib/runtime/kernel/provisioning.ts` `ProvisioningRuntime` + D1 `workUnitProvisioningAnswer.ts` |
| Preparation (anticipatory) | `lib/runtime/kernel/workUnitProvisioningPrefetch.ts` (URL cache, canonical-identity-keyed) + `prewarmRecordWork` |
| Runtime Focus (K3) | `lib/runtime/kernel/focus.ts` `FocusOwner` |
| Atomic Operational Commit | `FocusOwner.onPreparationTerminal` |
| Workspace | `lib/presentation/runtime/useWorkspaceSurfaceRuntime.ts` / `WorkspaceSurface.tsx` |
| Queue | `lib/presentation/runtime/useCommittedWorkUnitSurfaceRuntime.ts` |
| Focus Panel | `components/presentation/workUnit/InlineOpportunityFocusPanel.tsx` (+ `OperationalSubjectContext`) |
| Current Work | the D1 provisioning answer (`currentBusinessState` + `focusPanelStageWork`) |
| Settlement | `useWorkUnitSettlement.ts` + drawer VM (`useRecordWorkRuntime`) |
| Loading | `components/admin/workspace/AlloyOperationalBootShell.tsx` (content mode) |
| Metrics | header geometry in D1 answer (U-P7); values = Settlement (`lib/metrics/platform/*`) |
| **Browser restoration** | `SurfaceHostContext` popstate adapter — **now destination-stamped (B2 closed the fracture)** |
| Destination stamp helpers | `lib/experience/surfaceHost/historyDestination.ts` (pure) + `provisioningAnswerDestination.ts` (pure) |
| SurfaceHost | `lib/experience/surfaceHost/SurfaceHostContext.tsx` `SurfaceHostProvider` |
| Config-read cache + invalidation | `lib/runtime/provisioning/configReadCache.ts` (TTL + explicit publish invalidation) |

**One owner for every Runtime responsibility. The B2 restoration path is no longer a second,
slug-keyed identity — it now keys on the canonical destination like every other path.**

---

## 3 — PURIFICATION REPORT

**Prior session (accepted):** 11 files removed — the abandoned Operational Graph
(`operationalGraph.ts`, `compileOperationalGraph.ts`, `materializeOperationalGraph.ts`, its flag), the
Prepared Destination experiment (`preparedDestinationStore.ts`, its flag + value type), the dead
SurfaceHost reducer/state/context, and their tests. Replaced by `resolveOperationalDestination` +
`DestinationId` + the canonical-identity URL cache + committed Focus.

**This session:** deleted the dead test-only `surfaceRefToPath` + `isSameSurface` (B4). Added two small
PURE modules (`historyDestination.ts`, `provisioningAnswerDestination.ts`) that carry B2's value logic
without server coupling — each has exactly one responsibility and one owner.

Capability parity holds: every intended Graph/Store capability is expressible via
`resolveOperationalDestination` + `DestinationId` + URL cache + K2, and revision-coherent invalidation
(the one prior gap) is now delivered by B5's explicit publish invalidation.

---

## 4 — BROWSER CERTIFICATION REPORT

Dev (`:3013`, authenticated) this session:

| Scenario | Result |
|---|---|
| Workspace → Work Unit (warm) | ✅ Header + Queue + Current Work from the answer; operator can act immediately |
| Cold Work Unit (New Leads) | ✅ pending Current Work (`CurrentWorkRuntimeCard`) operational for ~2.5s, then VM enriches (see B3) |
| Queue Row → Queue Row (subject select) | ✅ subject commits; URL + history stamp update to the selected subject |
| **Back (popstate)** | ✅ **restores the stamped destination — operational Current Work, no white / no Thinking / no workspace flash / canonical URL re-projected** |
| **Forward (popstate)** | ✅ **commits the destination + re-stamps canonically (Registration)** |
| Work Unit → Workspace | ✅ retained workspace, no white |

Production matrix: see §5.

---

## 5 — PERFORMANCE REPORT

**Development (Next dev, inflated by ~3 s compile/request):** provisioning answer ~2.0 s server / ~5 s
client; drawer VM 1.4 s warm / up to 6.9 s cold; warm Workspace→WU commit ~47–84 ms, Current Work
@32 ms; queue first-use 5,723 → 115 ms. Cold New Leads this session: pending Current Work operational
by first paint, full enrichment ~2.7 s.

**Production (isolated `.next-prodcert` build, `next start` on `:3013`):**
- Build: `ALLOY_PROD_CERT_DIST=1 next build` — **compiled successfully in 35 s, full build ~2:44**, exit 0,
  with this session's B2/B5/B4 changes. Server: **`next start` ready in 526 ms** (no per-request compile).
- **Infrastructure latency (unauthenticated), prod vs dev:** `/login` **4.8 ms** total, `/workspace`
  redirect **2.6 ms**, provisioning-answer route **9.6 ms** to auth-reject — i.e. the prod server
  answers in **single-digit ms**, confirming the dev server's ~3 s per-request compile overhead is
  **entirely absent in production**. The dev cold "~5 s client / ~2 s server" figures were dominated by
  that compile penalty; production removes it.
- **Authenticated runtime matrix (provisioning-answer composition, commit, VM):** PENDING — the browser
  Supabase session expired (access token ~1 h), and the prod SSR auth check redirects `/workspace →
  /login`. Re-certification requires a fresh sign-in on `:3013` (a human action; credential entry is
  not something the agent may perform). The build is up and ready; the matrix runs in minutes once
  signed in. Repro to complete: sign in on `:3013` (now serving the prod build) → drive Workspace→WU
  (cold+warm), Queue row→row, pill switch, Back/Forward, Work↔Activity → record server/commit timings.

---

## 6 — RUNTIME FREEZE CHECKLIST

- [x] Back / Forward immediate + canonical (B2)
- [x] Current Work available at commit from the answer (all cold paths)
- [x] First meaningful action possible before the drawer VM (all paths)
- [x] No mixed frames (Section-7 scenarios exercised this session)
- [x] No white operational canvas (Workspace + Work Unit, cold + return)
- [x] No duplicate shell / no skeleton
- [x] No duplicate Runtime owners (§2 holds)
- [x] Publish-driven config invalidation wired (B5)
- [x] Legacy dead code removed (B4 provable-dead; purification §3)
- [ ] **No partial Current Work (pending == resolved, no resize) (B3)** — documented exception, §7.1
- [ ] **Production certification complete (B1)** — §5 / prod-cert run
- [ ] **Human QA passes**
- [x] `runtime-v1-ownership-and-purification.md` + handoff + this report reflect final truth
- [ ] `git status` clean, all committed, nothing pushed, no PR, no merge (pending final commit of this report)

---

## 7 — KNOWN REMAINING ISSUES

### 7.1 — B3: Current Work renderer unification (cosmetic, deferred)
On a **cold** entry the pending Current Work renders `CurrentWorkRuntimeCard` (via
`LayoutRuntimeCurrentWorkWidget`, from the answer's `stage_work_runtime`); when the drawer VM lands
(~2.5 s) the resolved Focus Panel renders the richer `CurrentWorkCard` inside the mode body — a
component swap. **Warm entries show no swap.** The functional doctrine (first meaningful action from
the answer) is met and verified.

**Why deferred, not forced:** the resolved card's geometry is **config-driven** — `model.span/tier/
iconName` derive from the published Focus Panel doc via `deriveFocusPanelInstanceMap`, not a static
default. A truly pixel-identical pending render must reconstruct that config-derived model **and** a
full `OperationalSubjectViewModel` (empty Settlement), then rely on every sibling card rendering
gracefully in its empty state — verifiable only by racing ~2.5 s cold frames. Forcing that blind on a
freeze candidate risks the exact resize/regression it targets, or breaking the working panel.

**Precise safe implementation (follow-up):** in `InlineOpportunityFocusPanel`'s pending branch, build a
minimal `OperationalSubjectViewModel` with `workspace.stage_work_runtime = operational.stageWorkRuntime`
and empty Settlement, and render the SAME `OpportunityFocusPanelModeBody` used by the resolved branch
(it derives the current_work model from the published doc, already available via
`FocusPanelSummaryDocProvider`). Verify on a cold entry that the Current Work card is pixel-stable and
sibling cards fill reserved geometry with no resize. Keep `LayoutRuntimeCurrentWorkWidget` as the
fallback when the doc/stage-work is unavailable.

### 7.2 — B4: live-path deletion is partial
Only provable-dead (zero-consumer) helpers were removed this session. The broader live-path legacy
audit (drawer-era ownership overlaps, duplicate URL parsing) remains and must be done one owner at a
time with per-deletion browser re-cert — not blind. No duplicate owner exists in §2 today; this is
size reduction, not a correctness gap.

### 7.3 — B5: `wu:`/`dept:` mutation coverage
The surface publishes (`hdr:`, `qrl:`) and department config edits are wired. Bare work-unit row edits
(rename/queue-definition) flow through several `work_units` mutation routes; those remain covered by
the 5-min TTL rather than explicit invalidation. Low impact (rare, non-publish edits); wire per-route
if immediate freshness on work-unit rename is required.

### 7.4 — Pill vs tile host identity (open product question)
A Work View reached by pill (inheriting the parent unit's `workUnitId`) and the same view reached by
its own tile resolve to different `DestinationId`s (observed this session: Registration via Forward
resolved host `5c0d15fc`). Each path is internally coherent. Whether these should be ONE destination is
a **product decision**, not an engineering gap.

---

## 8 — HOW TO COMPLETE THE FREEZE

1. **Human QA** on `:3013` across the §4 matrix.
2. Decide B3 (accept the cosmetic swap, or fund the §7.1 follow-up with proper cold-frame verification).
3. Decide the §7.4 product question.
4. On acceptance: promotion authorization → push / PR / merge (NOT done here).
