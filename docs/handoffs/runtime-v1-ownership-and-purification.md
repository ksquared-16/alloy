---
owner: platform
status: active-handoff
last_reviewed: 2026-07-18
---

# Runtime V1 — Ownership Matrix + Purification Audit

> Assume there will never be a Runtime V2. Every decision below is made as though this
> foundation must support the next five years of Alloy products.

Branch `agent/claude/3-runtime-drawer-deletion`, 70 commits ahead of `origin/staging`,
nothing pushed. Blockers 1–3 implemented + **dev-certified** (see certification section).

## Non-negotiable doctrine (holds in the current implementation)

The operator can perform the first meaningful action from the **provisioning answer alone**.
- Current Work + Situation/Decision/Action come from the answer (`currentBusinessState`,
  `primaryAction`, `focusPanelStageWork.stage_work_runtime`).
- The Focus Panel renders operational Current Work + the Record-outcome action at commit,
  **before** the drawer VM resolves (`InlineOpportunityFocusPanel` pending state).
- The drawer VM **enriches** the surrounding Settlement cards; it never gates operation.

## Phase 4 — Runtime Ownership Matrix (exactly one owner each)

| Concern | Canonical owner | Notes |
|---|---|---|
| Operational Destination Identity | `lib/runtime/graph/resolveOperationalDestination.ts` (+ `destinationId.ts`) | URL/slug → canonical `DestinationId`. Collapse guarantee unit-tested. |
| Attention (K1) | `lib/runtime/kernel/attention.ts` `AttentionOwner` | Carries `destination` since Blocker 1. Sole cause. |
| Runtime Focus (K3) | `lib/runtime/kernel/focus.ts` `FocusOwner` | Atomic commit; `surfaceIdFor` keyed on canonical destination. |
| Provisioning (K2) | `lib/runtime/kernel/provisioning.ts` `ProvisioningRuntime` | `provisioningKey` keyed on canonical destination. |
| Provisioning answer (D1) | `lib/runtime/provisioning/workUnitProvisioningAnswer.ts` | Owns commit-critical projection incl. `focusPanelStageWork`. |
| Selected Subject | committed Focus via `OperationalSubjectContext` | One owner (drawer store read deleted long ago). |
| Queue | `useCommittedWorkUnitSurfaceRuntime` (from committed snapshot) | Adjacency prep warms provisioning+VM per subject. |
| Focus Panel | `InlineOpportunityFocusPanel` (answer→pending, VM→enrich) | Current Work from answer; VM enriches. |
| Workspace Runtime | `useWorkspaceSurfaceRuntime` / `WorkspaceSurface` | Eager primary prewarm; canonical Thinking owner. |
| Loading owner | `AlloyOperationalBootShell` (content mode) | ONE canonical centered "Thinking…" — route layout + WU + Workspace. |
| Anticipatory preparation (cross-surface) | `workUnitProvisioningPrefetch` (URL cache) + `prewarmRecordWork` | The realized owner. See conflict below. |
| Browser restoration | `SurfaceHostContext` popstate → `attention.move` adapter | popstate does not stamp `destination` (see known issues). |
| Config-read cache | `configReadCache` (5 min TTL) | Publish-invalidation hook exists (`invalidateConfigReadCache`), unwired. |

## Phase 3 — Purification audit

### SAFE to delete (zero consumers, no doctrine tension) — pending execution
| File / symbol | Owner removed | Replacement owner | Why safe |
|---|---|---|---|
| `surfaceHostReducer` + `surfaceHostState` (`surfaceHostState.ts`), and the `state`/`SurfaceHostState` projection in `SurfaceHostContext` | Phase-1 pathname-projection state model | The visible decision is committed Focus (`focus.current`/`desired`) — already the sole authority | `useSurfaceHost().state` has NO consumers (grep-verified; the `focus.ts` `this.state` hits are K3's own state). Compatibility-only, explicitly "no longer decides what is visible". |

### DELETED (2026-07-19, commits `5f4fbbd47`) — abandoned experiments, no capability loss
Kelly's rule: architecture not consumed by Runtime V1 is an experiment, not architecture — delete.
Capability parity verified (every intended capability is expressible via
`resolveOperationalDestination` + `DestinationId` + URL cache + K2; the only aspirational gap is
revision-coherent invalidation, reachable via the existing unwired `invalidateConfigReadCache`).

| File(s) removed | Replacement owner |
|---|---|
| `lib/runtime/store/preparedDestinationStore.ts` + `preparedDestinationStoreFlag.ts` + `preparedOperationalDestination.ts` + test | `workUnitProvisioningPrefetch` URL cache keyed by canonical identity (the ONE anticipatory runtime) |
| `lib/runtime/graph/operationalGraph.ts` + `compileOperationalGraph.ts` + `materializeOperationalGraph.ts` + `operationalGraphFlag.ts` + test | `resolveOperationalDestination` (URL→DestinationId) + server-resolved workspace enumeration |
| `lib/experience/surfaceHost/surfaceHostState.ts` (`surfaceHostReducer`/state) + test + the dead `SurfaceHostContext` projection | Committed Focus (K3) — the sole visible-decision authority |

KEPT (load-bearing): `destinationId.ts`, `resolveOperationalDestination.ts`,
`lib/runtime/prep/prepareOperationalDestination.ts` (live Phase-H sibling-prep caller).

`destinationId.ts` is KEPT and load-bearing (used by `resolveOperationalDestination`,
`focus.ts` `surfaceIdFor`, `provisioning.ts`, link models). The graph files above import from
it but are themselves unused.

## Certification status

- **Dev-certified (browser, :3013, before the prod-swap):** Blocker 1 (repros 1/2/path-5 zero
  mixed frames, collapse restored), Blocker 2 (Current Work from answer at commit, 0 Thinking
  after Header+Queue, VM enriches), Blocker 3 (canonical Thinking owner, retained ~41 ms, no
  white/skeleton), queue first-use (5,723 ms → 115 ms), warm Workspace→WU (~47–84 ms, complete
  Focus Panel @32 ms).
- **Production build:** built + isolated (`.next-prodcert` via `ALLOY_PROD_CERT_DIST`,
  next.config gate). **Prod browser cert is BLOCKED on auth** — the prod build does not share
  the dev Supabase session and the session cannot be transferred (token handling is disallowed).
  Needs a one-time sign-in on the prod server.

## Known issues (must clear before Runtime Freeze)
1. **Browser session lost** during the prod-swap attempt → browser needs re-auth on `:3013`
   before ANY further browser/production certification.
2. **Back/Forward canonical identity:** popstate (`SurfaceHostContext`) builds attention from the
   URL without stamping `destination`, so `surfaceIdFor` falls back to `target::lens` on history
   restoration — a residual fracture class. Fix: resolve `destination` on popstate.
3. **Blocker 2 polish:** pending render uses `CurrentWorkRuntimeCard`, resolved grid uses
   `CurrentWorkCard` — unify (or feed the answer into the grid via a minimal VM) for pixel-
   identical zero-resize enrichment.
4. **Tile-vs-pill host id:** a Work View resolves host `5c0d15fc` via tile vs the inherited
   `587de5bc` via pill — pre-existing view-host canonicalization split; each path coherent.
5. **Prod-cert scaffold:** `next.config.ts` `ALLOY_PROD_CERT_DIST` distDir gate is uncommitted
   cert tooling — commit as chore or revert after certification.

## Freeze gate (not yet met)
Production certification incomplete (auth-blocked) + known issues 1–4 open → **Runtime V1 does
NOT freeze.** Freeze only after: prod cert complete, Back/Forward canonical, no residual
fractures, and the purification decision executed.
