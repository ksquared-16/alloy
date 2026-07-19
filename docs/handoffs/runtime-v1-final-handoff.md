---
owner: platform
status: runtime-v1-freeze-candidate
last_reviewed: 2026-07-19
---

# Runtime V1 — Freeze Candidate Handoff (authoritative)

> Assume there will never be a Runtime V2. Every decision must be made as though this foundation
> must support the next five years of Alloy products.

**This is the authoritative Runtime document for the final implementation session. The next Claude
session has no memory — everything it needs is here.**

- **Branch:** `agent/claude/3-runtime-drawer-deletion`
- **Worktree:** `/Users/Kelly/Code/alloy-worktrees/wt3-runtime-drawer-deletion` (managed Slot 3, SANCTIONED)
- **Base:** `origin/staging` — **74 ahead / 0 behind**. Nothing pushed. No PR. No merge.
- **Dev server:** `PORT=3013 npx next dev -p 3013` in `web/` → http://localhost:3013 (paths 3011–3016).
  ⚠️ The browser Supabase session was lost during a prod-swap attempt; **Kelly must sign in on
  `:3013`** before any browser/production certification.
- **Doctrine (non-negotiable):** *The operator can perform the first meaningful action from the
  provisioning answer alone.* The answer owns the commit-critical operational projection. The drawer
  VM enriches; it never creates operational truth. Settlement enriches; it never makes the app operational.

---

## SECTION 1 — CURRENT RUNTIME TRUTH (accepted runtime only)

The canonical runtime, end to end:

```
Route/URL → resolveOperationalDestination → DestinationId → K1 Attention → K2 Provisioning (D1 answer)
          → K3 Atomic Commit → [Header + Queue + Current Work from the answer] → Settlement (drawer VM enriches)
```

| Responsibility | Owner (file) | What it owns |
|---|---|---|
| **Destination Identity** | `web/lib/runtime/graph/destinationId.ts` | The canonical `DestinationId = (workUnitId, workViewId, subjectId\|null, focusMode\|null)`. `destinationNodeKey` (node = wu+wv), `destinationIdKey` (full), equality, `nodeDestinationId`. Pure. |
| **URL → identity resolution** | `web/lib/runtime/graph/resolveOperationalDestination.ts` | The ONE boundary that turns a route slug into a `DestinationId`, using the server precedence (`resolveWorkUnitByRouteSlug`: work_unit_key → work_view → queue_lane) + `firstVisibleWorkView` default resolution. Guarantees two URLs for one destination → one identical id. 5 unit tests. |
| **Attention (K1)** | `web/lib/runtime/kernel/attention.ts` `AttentionOwner` | The kernel's only cause. `AttentionRef` carries `destination: DestinationId \| null` (Blocker 1). SURFACE sets it; LENS re-points `workViewId`; SUBJECT/ASPECT inherit; `hydrate` accepts it. `urlFromAttention`/`attentionFromUrl` = URL↔attention (URL is a projection, never a cause). |
| **Provisioning (K2)** | `web/lib/runtime/kernel/provisioning.ts` `ProvisioningRuntime` | One round-trip per preparation. `provisioningKey(ref)` keyed on canonical destination when resolved (`{scope:LENS, workUnitId, workViewId, subject, principal, tenant}`), slug-derived fallback only pre-resolution. Latest-wins + emit-boundary stale guard. Three terminals: operational/empty/error. Deadline 10s (error only). |
| **Provisioning answer (D1)** | `web/lib/runtime/provisioning/workUnitProvisioningAnswer.ts` (+ route `app/api/admin/work-units/[id]/provisioning-answer/route.ts`) | ONE server answer that OWNS the commit-critical operational projection: header geometry (U-P7), queue rows (bounded page), Record of Attention (default subject), `currentBusinessState` (Situation), `primaryAction` (Action), `contextFrame` (Decision), and **`focusPanelStageWork`** (Current Work runtime: progress/requirements/blocked). Returns NO Settlement. |
| **Runtime Focus (K3)** | `web/lib/runtime/kernel/focus.ts` `FocusOwner` | The single authority on what the operator sees. `surfaceIdFor(ref)` keyed on `destinationNodeKey(ref.destination)` when resolved (slug fallback otherwise) — bare/explicit views of one destination collapse to one surface. Commits ONLY on `preparation.terminal`. Never un-commits. |
| **Atomic Operational Commit** | `FocusOwner.onPreparationTerminal` | One transaction: incoming becomes current, outgoing releases, URL projects. Header/Queue/Focus Panel are fields of one frozen snapshot — they cannot commit separately. |
| **Current Work ownership** | The **provisioning answer** (`currentBusinessState` + `primaryAction` + `focusPanelStageWork.stage_work_runtime`), surfaced via `OperationalSubjectContext` → rendered by `InlineOpportunityFocusPanel` pending state (`CurrentWorkRuntimeCard`). | First meaningful action (Record outcome) available from the answer alone, before the drawer VM. |
| **Settlement** | `web/lib/presentation/runtime/useWorkUnitSettlement.ts` + the drawer VM (`useRecordWorkRuntime` → `loadOpportunityDrawerViaViewModel`) | Fills reserved KPI values, household/contacts/activity/documents AFTER commit. Never gates commit, never creates operational truth. |
| **Loading ownership** | `web/components/admin/workspace/AlloyOperationalBootShell.tsx` (content mode) | The ONE canonical centered enlarged "Thinking…" owner — used by the workspace route layout, the Work Unit surface (`SurfaceHostContext`), AND the Workspace surface (`WorkspaceSurface`, Blocker 3). No skeletons. |
| **Workspace Runtime** | `web/lib/presentation/runtime/useWorkspaceSurfaceRuntime.ts` + `web/components/presentation/workspace/WorkspaceSurface.tsx` | Composes process tiles; retained across WU visits (ready immediately from seed); eager primary-destination prewarm; canonical Thinking owner when cold. |
| **Queue Runtime** | `web/lib/presentation/runtime/useCommittedWorkUnitSurfaceRuntime.ts` | Queue + selection from the committed snapshot. `openRecord` = SUBJECT move; `selectWorkView` = LENS move. ±2 adjacency prep warms provisioning **and** VM per neighbour subject (Blocker: queue first-use). |
| **Focus Panel Runtime** | `web/components/presentation/workUnit/{InlineOpportunityFocusPanel,FocusPanelSurface,OperationalSubjectContext,ProvisionedWorkUnitSurface}.tsx` | Renders Current Work from the answer at commit; the drawer VM enriches to the full grid (`OpportunityFocusPanelModeGrid` → `CurrentWorkCard`). |
| **Metrics Runtime** | Header KPIs = geometry in the D1 answer (U-P7); KPI **values** are Settlement (`useWorkUnitSettlement` / metrics platform `lib/metrics/platform/*`). | Values never gate commit (C-24). Not modified this session; considered accepted. |
| **Browser restoration** | `SurfaceHostContext` popstate → `attention.move` adapter | popstate builds attention from the URL. ⚠️ Does NOT stamp `destination` yet (see Blocker). |
| **SurfaceHost** | `web/lib/experience/surfaceHost/SurfaceHostContext.tsx` `SurfaceHostProvider` | Cold-load hydration (once), popstate adapter, workspace-return, URL projection (replaceState), and THE visible decision (`showWorkUnit`/`showWorkUnitLoader`) from committed Focus + the no-mixed-destination guard. The dead reducer/state/context were deleted — the Provider is the whole thing. |

---

## SECTION 2 — COMPLETED WORK

Every item below is committed on this branch. "Owner" = the file that now owns it.

| Milestone | Browser evidence (dev :3013) | Commit(s) | Tests | Owner |
|---|---|---|---|---|
| **Queue first-use fix** | Wenc→Kurzman first-use commit **5,723 ms → 115 ms**, 0 commit-critical network (VM+stage-work+provisioning warm-consumed) | `6afeec5d1` | — (browser-cert) | `useCommittedWorkUnitSurfaceRuntime` `prewarmSubjectDestination` |
| **Canonical destination resolver + collapse guarantee** | — (unit-proven) | `0e9a23d2e` | `tests/runtime/resolveOperationalDestination.test.ts` (5) | `resolveOperationalDestination.ts` |
| **K1 carries DestinationId** | entry still commits ~143 ms (inert) | `052dec1da` | d2Attention/d4Focus updated | `attention.ts` |
| **Config caching + eager preparation** | warm entry **84 ms, complete Current Work @32 ms, 0 network**; config warm wu/cfg → 0 | `f151075de` | — | `configReadCache.ts` (5 min), `useWorkspaceSurfaceRuntime` (eager primary) |
| **Mixed-frame elimination / atomic no-mixed-destination** | Repro 2 (…→Workspace→New Leads): **0 mixed Registration frames**, Thinking intermediate, coherent final; pill switch 0 workspace-flash | `734f836aa` | — | `SurfaceHostContext` `committedMatchesDesired` |
| **Canonical surface identity (Blocker 1)** | surface instance `wu:587de5bc…\|wv:new_leads`; Repro 1 collapse-restored (same id bare vs pill), Repros 1/2/Path-5 **0 mixed frames** | `94d4b15d9` | 37 kernel/resolver | `focus.ts` `surfaceIdFor` + `provisioning.ts` `provisioningKey` (both destination-keyed) |
| **Current Work projection (Blocker 2)** | at answer commit Focus Panel shows operational Current Work from the answer (`data-focus-panel-operational-current-work`), **0 Thinking frames after Header+Queue**; VM enriches to grid | `c3e537f7d` | 22 provisioning+focus | D1 answer `focusPanelStageWork` + `InlineOpportunityFocusPanel` pending render |
| **Workspace retention + canonical Thinking (Blocker 3)** | retained return ~41 ms, **0 white/skeleton frames**; cold shows one centered Thinking owner | `1436f4f4b` | — | `WorkspaceSurface` → `AlloyOperationalBootShell` |
| **Deleted abandoned Operational Graph** | tsc + tests green after removal | `5f4fbbd47` | 43 green | replaced by `resolveOperationalDestination` + server enumeration |
| **Deleted Prepared Destination experiment** | tsc + tests green | `5f4fbbd47` | 43 green | replaced by URL cache keyed by canonical identity |
| **Deleted dead SurfaceHost owner** | tsc baseline, Provider render unchanged | `5f4fbbd47` + `dfe628978` | 43 green | committed Focus is the sole visible-decision authority |
| **Docs converged (no contradiction)** | — | `1f08b8bc6`, `6374fec8d` | — | ownership matrix + superseded notice |

(Runtime Focus, Atomic Commit, Queue Runtime, and Workspace retention as *architecture* predate this
session and are accepted; this session hardened + certified them.)

---

## SECTION 3 — PURIFICATION COMPLETED (deletions)

| File deleted | Replacement owner | Why safe to delete |
|---|---|---|
| `lib/runtime/graph/operationalGraph.ts` | server-resolved workspace enumeration (`buildOperatorLifecycleLanding`) + `resolveOperationalDestination` | Zero production consumers (grep+tsc). Flag-off, never wired. |
| `lib/runtime/graph/compileOperationalGraph.ts` | `resolveOperationalDestination` (uses `resolveWorkUnitByRouteSlug`, not the compiler) | Zero consumers. |
| `lib/runtime/graph/materializeOperationalGraph.ts` | — (client materialization not needed) | Zero consumers. |
| `lib/runtime/graph/operationalGraphFlag.ts` | — | Flag for the above; abandoned. |
| `lib/runtime/store/preparedDestinationStore.ts` | `workUnitProvisioningPrefetch` URL cache keyed by canonical identity (the ONE anticipatory runtime) | Zero consumers; never wired to commit. |
| `lib/runtime/store/preparedDestinationStoreFlag.ts` | — | Flag for the above. |
| `lib/runtime/store/preparedOperationalDestination.ts` | — | Store value type; abandoned with the store. |
| `lib/experience/surfaceHost/surfaceHostState.ts` (`surfaceHostReducer`/state/actions) | committed Focus (K3) | Compatibility projection; `useSurfaceHost().state` had no consumers. |
| Dead `SurfaceHostContext` projection (`SurfaceHostValue`/`SurfaceHostContext`/`useSurfaceHost`/`useSurfaceHostOptional`/state) | committed Focus (K3) | No consumers; Provider renders via Fragment. |
| `tests/runtime/graph/operationalGraph.test.ts`, `tests/runtime/store/preparedDestinationStore.test.ts`, `tests/experience/surfaceHost/surfaceHostState.test.ts` | — | Tested only the deleted owners. |

**11 files removed.** KEPT (load-bearing): `destinationId.ts`, `resolveOperationalDestination.ts`,
`lib/runtime/prep/prepareOperationalDestination.ts` (live Phase-H sibling-prep caller).

Capability parity verified: every intended Graph/Store capability is expressible via
`resolveOperationalDestination` + `DestinationId` + URL cache + K2 with **no loss of a delivered
capability**; the only aspirational difference is revision-coherent invalidation (currently TTL-based;
parity reachable via the existing unwired `invalidateConfigReadCache`).

---

## SECTION 4 — REMAINING WORK

### BLOCKERS

**B1 — Production certification (NOT run).**
- *Why:* All dev certification used the Next dev server (~3 s compile overhead per request). Real
  production timings are unmeasured. Also the browser session was lost, so even dev browser re-cert
  is pending.
- *Evidence:* dev provisioning answer server ~2.0 s vs client ~5 s (the ~3 s delta is dev-compile);
  drawer VM 1.4–6.9 s cold. Production build exists: `web/.next-prodcert/` (built via
  `ALLOY_PROD_CERT_DIST=1 npx next build`; `next.config.ts` gates a separate distDir).
- *Approach:* **Kelly signs in on `:3013`.** Then: stop dev (`kill $(lsof -ti:3013)`), run
  `ALLOY_PROD_CERT_DIST=1 npx next start -p 3013` (same origin → the fresh session applies), run the
  full matrix (Section 7), then restore dev (`PORT=3013 npx next dev -p 3013`). The
  `.next-prodcert` dir is gitignored and doesn't clobber dev's `.next`.
- *Acceptance:* every Section-7 scenario green on production, with recorded acknowledgment / useful
  commit / requests-before-commit / Thinking duration / mixed frames / remounts.

**B2 — Back/Forward destination stamping.**
- *Why:* `SurfaceHostContext` popstate builds attention from the URL without stamping `destination`,
  so `surfaceIdFor` falls back to `target::lens` on history restoration — a residual fracture class
  (a pill-switched view isn't in the URL, so Back/Forward across New Leads↔Registration is
  URL-ambiguous).
- *Evidence:* not cleanly certified (my direct-URL loads polluted document history during the session).
- *Approach:* resolve the `DestinationId` on popstate (client catalog, or read it from the projected
  history state that K3 could write on commit), and stamp it on the hydrate/move so restoration keys
  canonically. Consider writing the `DestinationId` into `history.state` at commit so Back/Forward
  restores the exact destination (incl. pill views the URL can't express).
- *Acceptance:* Back/Forward across both views restores the correct queue/subject/Focus Panel with
  0 mixed frames and no unnecessary rebuild.

**B3 — Current Work renderer unification (zero-resize).**
- *Why:* The pending Focus Panel renders `CurrentWorkRuntimeCard` (from the answer) while the resolved
  grid renders `CurrentWorkCard` — both complete, from the same `stage_work_runtime`, but different
  components ⇒ a possible visual swap on enrichment. Doctrine says Settlement must not resize the
  primary work card.
- *Evidence:* Blocker 2 browser trace shows the answer→VM transition; the component differs.
- *Approach (preferred):* build a minimal operational `OpportunityDrawerViewModel` from the answer
  (`workspace.stage_work_runtime = focusPanelStageWork.stage_work_runtime`, empty Settlement) and feed
  the SAME `OpportunityFocusPanelModeGrid` in the pending state; the drawer VM then replaces the
  minimal VM (enriches). Grid cell positions are already identical pending→resolved.
- *Acceptance:* pending and resolved Current Work are pixel-identical; Settlement fills reserved
  geometry with no resize.

**B4 — Remaining verified legacy deletion.**
- *Why:* Purification of the zero-consumer experiments is done; the rest of the list (legacy drawer
  ownership, duplicate URL parsing, dead route helpers, minor test-only helpers e.g.
  `surfaceRef.isSameSurface`/`surfaceRefToPath`) touches **live** paths and must be browser-verified
  after each deletion — which needs the session.
- *Evidence:* audit in `runtime-v1-ownership-and-purification.md`.
- *Approach:* delete one owner at a time; typecheck + targeted tests + browser re-cert of the affected
  path per deletion. Never delete a live-path owner blind.
- *Acceptance:* no duplicate owners remain (Section 9 holds); runtime materially smaller; all Section-7
  scenarios still green.

**B5 — Publish-driven config invalidation (decision + wire).**
- *Why:* Config-read cache is 5 min TTL; a config publish is reflected only within the TTL.
  `invalidateConfigReadCache(prefix)` exists but is unwired.
- *Evidence:* `configReadCache.ts`.
- *Approach:* call `invalidateConfigReadCache` from the surface/lifecycle publish flow (bust
  `wu:`/`dept:`/`qrl:`/`hdr:` prefixes for the tenant). This is the only path to full parity with the
  deleted graph's revision-coherent invalidation.
- *Acceptance:* an admin publish is reflected on the next operator navigation without waiting for TTL.

### POLISH

- Tile-vs-pill host id: a Work View resolves host `5c0d15fc` via tile vs inherited `587de5bc` via pill
  (pre-existing view-host canonicalization split; each path internally coherent). Decide whether the
  pill's inherited `workUnitId` should be re-resolved to the view's canonical host.
- The `.next-prodcert/` dir + the `ALLOY_PROD_CERT_DIST` `next.config` gate are cert scaffolding —
  keep for prod cert, remove after freeze if desired.
- `tsc` OOMs without a heap bump; always run `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit`.

---

## SECTION 5 — OPEN QUESTIONS (product judgment only)

1. **Pill vs tile host identity** (Polish above): should a Work View reached by pill (inheriting the
   parent unit's `workUnitId`) and the same view reached by its own tile (its canonical host) be ONE
   destination or two? They currently produce different `DestinationId`s. Engineering can implement
   either; the *intent* is a product decision.
2. **Publish invalidation aggressiveness** (B5): immediate bust on publish vs a short grace TTL —
   trade admin-freshness against navigation-burst cache efficiency.

(No other open questions — everything else is autonomously solvable.)

---

## SECTION 6 — KNOWN RISKS (unsolved only)

1. **No production timings.** All performance evidence is dev-server (inflated). Until B1 runs, prod
   behaviour is inferred, not measured.
2. **Back/Forward fracture (B2).** History restoration is not yet canonical; a Back/Forward across
   pill-switched views could rebuild or mis-key.
3. **Current Work swap (B3).** Until unified, the pending→resolved Current Work may visibly change on
   enrichment on genuinely cold entries.
4. **Config staleness window (B5).** A config publish is invisible to operators for up to the 5-min TTL.
5. **Intermediate broken commit:** `5f4fbbd47` deleted `surfaceHostState.ts` but its
   `SurfaceHostContext.tsx` edit landed in the follow-on `dfe628978` (a pathspec error split them). The
   **final HEAD is correct + typechecks**; only that one intermediate commit is momentarily
   inconsistent. Squash before any future push if a clean history matters.

---

## SECTION 7 — BROWSER CERTIFICATION MATRIX

Status legend: ✅ dev-certified (pre-session-loss) · ⚠️ needs re-cert (session lost) · ❌ not certified.
**All rows require production re-certification (B1); browser session must be restored first.**

| Scenario | Current status | Browser verified? | Performance (dev) | Known issues |
|---|---|---|---|---|
| Workspace → Work Unit (warm) | ✅ | yes (pre-loss) | ~47–84 ms, complete Current Work @32 ms, 0 network | prod timings unmeasured (B1) |
| Workspace → Work Unit (cold) | ⚠️ | partial | provisioning ~2 s server + VM chain | white eliminated (B3); prod unmeasured |
| Queue Row → Queue Row (first-use) | ✅ | yes | 5,723 → 115 ms, 0 commit-critical net | — |
| Queue Row → Queue Row (revisited) | ✅ | yes | ~63 ms (K2 reuse) | — |
| New Leads → Registration (pill) | ✅ | yes | 0 workspace-flash, 0 mixed | — |
| Registration → New Leads (pill) | ✅ | yes | collapse restored (same id), 0 mixed | — |
| …→ Workspace → New Leads (Repro 2) | ✅ | yes | 0 mixed Registration frames, Thinking intermediate | prod unmeasured |
| Work ↔ Activity | ⚠️ | not this session | mode prewarm exists | needs re-cert |
| Work Unit → Workspace (left-nav) | ✅ | yes | ~29 ms, 0 network, retained, no white | — |
| Workspace → Workspace (retained return) | ✅ | yes | ~41 ms, 0 white/skeleton | — |
| Browser Back | ❌ | no | — | B2 (destination not stamped) |
| Browser Forward | ❌ | no | — | B2 |
| Cold Workspace | ⚠️ | canonical Thinking owner verified warm | — | prod cold unmeasured (B1) |
| Cold direct Work Unit | ⚠️ | Current Work from answer verified | — | prod unmeasured; VM cold 1.4–6.9 s |

---

## SECTION 8 — PERFORMANCE

**Development measurements (Next dev server, :3013):**
- Provisioning answer: **~2.0 s server** (`presentation ~1.0–1.3 s` incl. concurrent enrichment,
  `composition ~0.7–1.0 s`; `work_unit`+`configuration` ~0.35 s each cold → **0 warm** with config cache),
  **~5 s client** (the ~3 s delta is Next dev compilation).
- Drawer VM (`view-models/drawer/opportunity/{id}`): **1.4 s warm, up to 6.9 s cold** — Settlement, off
  the commit path since Blocker 2.
- Warm Workspace→WU commit: **~47–84 ms, 0 network, Current Work @32 ms** (eager prewarm).
- Queue first-use: **5,723 ms → 115 ms**. Warm adjacent row: **~63 ms**.

**Production expectations (inference, to be replaced by measurement):** removing the ~3 s dev-compile
overhead should put the cold provisioning answer near its **~2 s server** figure; warm commits remain
client-bound (~50–100 ms). **Do not treat these as certified.**

**Remaining production certification work:** B1 — build exists (`.next-prodcert`); run `next start` on
`:3013` after re-auth and measure the Section-7 matrix.

---

## SECTION 9 — RUNTIME OWNERSHIP MATRIX (exactly one owner)

| Concern | Single owner |
|---|---|
| Destination Identity | `lib/runtime/graph/destinationId.ts` (value) + `resolveOperationalDestination.ts` (resolution) |
| Attention | `lib/runtime/kernel/attention.ts` `AttentionOwner` |
| Provisioning | `lib/runtime/kernel/provisioning.ts` `ProvisioningRuntime` + D1 `workUnitProvisioningAnswer.ts` |
| Preparation (anticipatory) | `lib/runtime/kernel/workUnitProvisioningPrefetch.ts` (URL cache, canonical-identity-keyed) + `prewarmRecordWork` (VM) |
| Workspace | `lib/presentation/runtime/useWorkspaceSurfaceRuntime.ts` / `WorkspaceSurface.tsx` |
| Queue | `lib/presentation/runtime/useCommittedWorkUnitSurfaceRuntime.ts` |
| Focus Panel | `components/presentation/workUnit/InlineOpportunityFocusPanel.tsx` (+ `OperationalSubjectContext`) |
| Current Work | the D1 provisioning answer (`currentBusinessState` + `focusPanelStageWork`) |
| Settlement | `useWorkUnitSettlement.ts` + drawer VM (`useRecordWorkRuntime`) |
| Loading | `components/admin/workspace/AlloyOperationalBootShell.tsx` (content mode) |
| Metrics | header geometry in D1 answer (U-P7); values = Settlement (`lib/metrics/platform/*`) |
| Browser restoration | `SurfaceHostContext` popstate adapter (⚠️ B2: not yet destination-stamped) |
| SurfaceHost | `lib/experience/surfaceHost/SurfaceHostContext.tsx` `SurfaceHostProvider` |
| Runtime Focus (K3) | `lib/runtime/kernel/focus.ts` `FocusOwner` |

No duplicate owners remain after purification, **except** the B2 restoration path (not yet keyed on the
canonical identity).

---

## SECTION 10 — FINAL IMPLEMENTATION ORDER (do not stop between phases)

**Phase A — Restore + verify baseline.** Kelly signs in on `:3013`. Reload `/workspace`; confirm
authenticated. Re-run the Section-7 dev matrix rows marked ✅ to confirm nothing regressed.

**Phase B — Back/Forward canonical (B2).** Stamp `DestinationId` on popstate/history restoration
(write it into `history.state` at commit; read+stamp on popstate). Browser-certify Back/Forward across
both views: 0 mixed frames, correct queue/subject/Focus Panel, no unnecessary rebuild.

**Phase C — Current Work renderer unification (B3).** Feed a minimal answer-VM into the resolved grid
so pending and resolved render the SAME `CurrentWorkCard`; verify zero resize on enrichment (cold entry).

**Phase D — Remaining verified deletion (B4).** Delete live-path legacy owners one at a time
(drawer-era ownership, duplicate URL parsing, dead route helpers, `surfaceRef.isSameSurface`/
`surfaceRefToPath`), each with typecheck + targeted tests + browser re-cert of the affected path.

**Phase E — Publish invalidation (B5).** Wire `invalidateConfigReadCache` into the publish flow;
verify a publish reflects on next navigation.

**Phase F — Production certification (B1).** Build (`ALLOY_PROD_CERT_DIST=1 npx next build` if
`.next-prodcert` is stale), swap prod onto `:3013`, run the full Section-7 matrix with production
timings, restore dev, record results.

**Phase G — Runtime Freeze.** Verify Section-11 checklist; write the freeze certificate; commit
locally. Do not push.

---

## SECTION 11 — RUNTIME FREEZE CHECKLIST (freeze only when ALL checked)

- [ ] Workspace → Work Unit immediate (prod-certified)
- [ ] Queue Row → Queue Row immediate (first-use + revisited)
- [ ] Work ↔ Activity immediate
- [ ] Work View → Work View immediate (pill)
- [ ] Work Unit → Workspace immediate (left-nav + in-surface + Work View → Workspace)
- [ ] Back / Forward immediate + canonical (B2)
- [ ] Current Work available at commit from the answer (all cold paths)
- [ ] First meaningful action possible before the drawer VM (all paths)
- [ ] No mixed frames (all Section-7 scenarios)
- [ ] No white operational canvas (Workspace + Work Unit, cold + return)
- [ ] No duplicate shell
- [ ] No skeleton
- [ ] No partial Current Work (pending == resolved, no resize) (B3)
- [ ] No duplicate Runtime owners (Section 9 holds) (B4)
- [ ] No duplicate identities / duplicate preparation / legacy Runtime paths (B4)
- [ ] Publish-driven config invalidation wired (B5)
- [ ] Production certification complete (B1)
- [ ] `runtime-v1-ownership-and-purification.md` + this handoff updated to final truth
- [ ] `git status` clean, all committed, nothing pushed, no PR, no merge
