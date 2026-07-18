---
owner: platform
status: handoff
last_reviewed: 2026-07-18
branch: agent/claude/3-runtime-drawer-deletion
---

# Runtime & Experience Implementation — Session Handoff

Comprehensive transfer document for continuing this work in a new session. Read the companion
`SESSION_HANDOFF.md` first for the 1–2 page executive summary.

---

## Mission summary

Make the Alloy Work Unit a fully **configuration-driven operational surface** with **exactly one owner per
responsibility**, then make the product **feel like an operating system** (anticipatory, never-blank,
atomic commits). The session ran in phases:

1. **Regressions + Record Runtime extraction** — fixed the mixed-subject frame, extracted a headless
   Opportunity Record Work Runtime, made the K2 preparation identity subject-aware.
2. **Configuration Runtime (P0–P4)** — introduced `resolveSurfaceVariant` as the single applicability
   resolver and cut Header, Queue, Focus Panel, Editing, and Actions over to it, deleting legacy ownership.
3. **P2-V** — proved config consumption is browser-observable (DOM provenance).
4. **Experience (EXP-1/EXP-2)** — removed blank time (intent prefetch + cold-path server parallelism) and
   corrected queue-row builder fidelity.
5. **Anticipatory Operational Runtime (architecture only)** — designed the inversion where the Workspace
   prepares operational destinations before click; the click commits one.
6. **Queue Runtime Correction** — fixed queue-row *rendering fidelity* (Failure 1, implemented + proven)
   and defined the queue *selection* state machine + adjacency + performance contract (Failure 2, design).

---

## Current Truth (what is complete today)

**Implemented, browser-certified, committed (local only):**
- **Work Unit Configuration Runtime is CERTIFIED.** Every visible region is config-driven through
  `resolveSurfaceVariant` (or its per-row/record wrappers) with one owner each:
  - **Header** — `resolveSurfaceVariant` (server, no HTTP); legacy `metric_placements` header path deleted.
  - **Queue** — `resolveSurfaceVariant` + `resolveQueueRowVariant`; ad-hoc selector + drawer follower deleted.
  - **Focus Panel** — `resolveSurfaceVariant` via `resolvePublishedFocusPanelSummaryRecord`; committed
    Work-View/stage threaded via `FocusPanelSummaryDocProvider`; `highestVersion` runtime pick deleted.
  - **Editing** — published `NestedSurfaceConfig` via `resolveIdentityFieldPolicy`; dead
    `fieldEditabilityInDrawer` builders deleted; editability provenance in the DOM.
  - **Actions** — `action_placements` via `resolveActionsForContext`; already config-driven.
  - Documented in `docs/platform/runtime/work-unit-configuration-runtime-constitution.md` (§5 final audit).
- **Config consumption is browser-provable** — the queue emits `data-queue-row-source="published"`,
  `data-queue-surface-id`, `data-queue-row-variant`; identity fields emit `data-identity-policy` +
  `data-identity-editable`.
- **Blank time removed (EXP-1).** Hover/focus intent prefetches the exact K2 provisioning answer into a
  short-TTL cache K2 consumes → **warm commit ~150 ms**. Cold server compose **~2850 → ~1500 ms (−47%)**
  via three semantics-preserving parallelizations (records hoist; presentation ∥ composition; queue ∥
  header). **0 blank frames cold** (coherent surface ~60 ms; never blank).
- **Queue-row builder fidelity (EXP-2)** — a "Live preview" renders the real `CondensedQueueRow` through
  the real mapper + sample row; the main field library warns on non-effective ("Not in row") fields.
- **Queue-row RENDER fidelity (Queue Failure 1)** — the row now renders exactly the authored supported
  fields (contact = "Taryn Wenc · tarynw@hotmail.com", **no phantom phone**). Fixed the server CRM enricher
  (`display_name` = name only) + runtime vocab (legacy `primary_email`/`primary_phone` aliases).

**Design complete (approved architecture, NOT implemented):**
- `docs/platform/runtime/workspace-operational-preparation-runtime.md` — **The Alloy Anticipatory
  Operational Runtime**: Operational Graph, `PreparedOperationalDestination`, commit-critical/Settlement
  contract, scheduler (P0–P5), queue adjacency, Focus-mode continuity, Work-View continuity, shared-data
  dedup, Metrics Runtime, stale/invalid matrix, single loading owner, security/resource model, Settings
  compilation, phased plan (A–M), browser + perf certification plans, and the **Queue Selection State
  Machine** (§6.1–6.4).

---

## Remaining Mission (what still needs implementation — approved architecture only)

All items below are **defined in the runtime doc's phases A–M**. None are theoretical — each has a named
owner, invariant, evidence requirement, and stop condition in `workspace-operational-preparation-runtime.md`.

- **Phase A — Operational Graph + Presentation Manifest** (server compiles config + authz → graph; client materializes).
- **Phase B — Canonical Prepared Destination Store** (promote `workUnitProvisioningPrefetch` to a keyed,
  revision-tagged, priority-scheduled store; single K2 resource identity).
- **Phase C — Workspace retained runtime** (EXP-4: return-to-Workspace never reconstructs).
- **Phase D — Visible Work Unit preparation** (viewport-gated P2/P3).
- **Phase E — Work View adjacency preparation** (EXP-3: many Work Views share one variant).
- **Phase F — Queue-row renderer fidelity correction** — **DONE** (Queue Failure 1; committed).
- **Phase G — Queue selection state machine + atomic Runtime Focus commit** (Queue Failure 2; §6.1–6.4).
- **Phase H — Queue subject adjacency preparation** (selected ± W window).
- **Phase I — Focus Panel mode preparation** (Work ↔ Activity immediate; shared subject truth).
- **Phase J — Metrics Runtime + targeted invalidation** (fixes the count-after-deletion bug, §10.1).
- **Phase K — Canonical "Thinking…" preparation experience** (single loading owner).
- **Phase L — Delete duplicate loading + legacy preparation ownership** (fixes duplicate midnight-blue, §13).
- **Phase M — Certification + performance freeze** (browser §17/§6.3 + perf §18 on a production build).

Legacy-deletion mission item **EXP-5** (remove remaining drawer/resolver/provider/route/API/flag/test/doc)
folds into phases L + the config-runtime deletion doctrine.

---

## Architectural decisions made

1. **`resolveSurfaceVariant` is the sole applicability resolver** for every configured region (Header,
   Queue, Focus Panel). Precedence Work View ≻ stage ≻ status; ties by version then layoutId; published-only.
2. **Acceptance = one owner per responsibility, not one HTTP request.** Requests are classified *duplicate*
   (dedupe to 1) vs *independent scope* (one owner, N legitimate scopes) — e.g. `queue-view-totals` is
   Workspace-scope + Work-Unit-scope, not a duplicate.
3. **Commit-critical vs Settlement is a *usefulness* boundary**, enforced server-side (the answer carries
   only commit-critical fields) and honored client-side (preparation never prefetches Settlement).
4. **Intent-prefetch is the seed of the Prepared Destination Store** — one canonical K2 resource path, no
   second cache. Cold-path speed is achieved by preparing *ahead* of the gesture, not a faster endpoint.
5. **Server compose parallelism preserves one atomic answer** — records/presentation/composition and
   queue/header reads run concurrently; still one Preparation round-trip, latest-wins/no-mixed-subject/
   one-commit are client-side and untouched.
6. **`PreparedWorkUnitSnapshot` → `PreparedOperationalDestination`** with identity
   `(workUnitId, workViewId, subjectId, focusMode)` — content-addressed on config + authz revision.
7. **Queue selection is a first-class Runtime Focus transition** with an explicit state machine
   (`committed/intent/prepared/pending/failed`); latest-wins by subject id, never row index; row highlight =
   `intent`, Focus Panel/URL/Focus = `committed`.
8. **Metrics are a separate runtime plane** (projections), not presentation config; invalidated by
   revision-token fan-out, never a global recompute.
9. **Card capability manifest (`focusPanelCardLifecycle`) is component implementation, not tenant policy** —
   editability policy is the config layer above it (`resolveIdentityFieldPolicy`).
10. **Queue-row fidelity: the renderer was faithful; the server CRM enricher was wrong** — `display_name`
    must be the name only; the composite belongs only to the default (unauthored) contact line.

## Decisions intentionally rejected

- **Do NOT force `queue-view-totals` to a single HTTP request** — that would delete the Workspace-scope
  responsibility. Independent scopes stay independent.
- **Do NOT rebuild the Record Runtime greenfield** — it was *extracted* (headless `useRecordWorkRuntime`),
  not reconstructed.
- **Do NOT treat Person/Child/Household/Enrollment as separate subjects/hosts/runtimes** — they are
  configured cards bound to the sole committed Opportunity subject.
- **Do NOT move the queue-row capability matrix into config** — it is a component-implementation contract,
  not tenant policy (proven by the A/B test the mission requested).
- **Do NOT fix only the builder preview** for queue-row fidelity — the wrong owner was the server enricher.
- **Do NOT hide cold latency behind a late skeleton** — the never-blank invariant requires a coherent prior
  surface or the single centered "Thinking…" shell, never blank → shell → skeleton.
- **Do NOT create a second navigation cache** — the prefetch cache is the canonical K2 resource path.
- **Rejected mutating uncontrolled tenant configuration** — the double-phone/redundant-field cases were
  flagged for operator cleanup (spawn tasks), never edited in the tenant's published surface.

---

## Browser-certified findings (kept cert specs under `web/playwright/tests/`)

| Cert | Spec | Result |
|---|---|---|
| Queue config runtime | `p2-queue-cert.spec.ts` | WU.QUEUE renders via Presentation Runtime; Runtime-owned selected row; Work-View re-resolution; **0 drawer hosts in WU.SURFACE** |
| Queue config provenance | `p2v-final-cert.spec.ts` | `data-queue-row-source="published"`, `data-queue-surface-id`, `variant="crm_compact"` |
| Focus Panel runtime | `p3-focuspanel-cert.spec.ts` | resolves on commit; `workViewId`+`stageKey` threaded; **0 drawer/modal hosts render the record**; Work-View re-resolution |
| Interaction runtime | `p4-interaction-cert.spec.ts` | 8 identity fields emit `data-identity-policy`/`-editable`; 0 drawer hosts; Focus Panel resolves |
| Blank time | `exp-blanktime-cert.spec.ts` | cold client commit 5732→~3664 ms; **warm (hover) ~150 ms**; 0 blank frames (via `runtimeStatRunner` cold) |
| Builder fidelity | `exp2-builder-fidelity.spec.ts` | Live preview renders the real `CondensedQueueRow` |
| Queue-row render fidelity | `qf-fidelity-capture.spec.ts` | authored fields vs runtime row match; contact = "Taryn Wenc · tarynw@hotmail.com", **no phantom phone** |

## Performance findings

- **Warm (intent-prefetched) commit: ~150 ms** (~40× faster than cold).
- **Cold server compose: ~2850 → ~1500 ms (−47%)** — measured via the answer's internal `timings`
  (production-representative; dev HTTP overhead excluded). Per-phase: work_unit ~350, configuration ~350,
  queue_layout ~700 (biggest), header ~335, records ~350 (now overlapped → ~0), composition ~670 (now
  hidden under presentation).
- Critical-path provisioning **1 request / 0 duplicates**; 0 continuity breaks; ack ~13–14 ms, legible
  ~14–15 ms warm; ~60 ms cold. No regression across P1→P4 (measured pre/post each phase).
- **Not yet measured**: production-build (`next build`) client p50/p95/max per input mode — the dev server
  is too noisy for reliable client percentiles (§18 requires a production build).

## Root-cause analyses completed (in the runtime doc)

1. **Queue-row render fidelity (Failure 1)** — `enrichOpportunityQueueProjection` baked `name·email·phone`
   into `_primary_contact_line`, used as `primary_contact.display_name`. **Fixed.**
2. **Metrics stale after deletion (§10.1)** — one event `OPPORTUNITY_QUEUE_UPDATED_EVENT` + membership gate;
   Gaps: (A) delete never dispatches it, (B) `delete_child` outside the allow-list, (C) delete UI is a stub,
   (D) 4 s batched-totals cache never busted. **Mapped, not fixed (phase J).**
3. **Duplicate midnight-blue loader (§13)** — `app/adminV2/loading.tsx:8` renders `AlloyOperationalBootShell`,
   then `AdminV2Shell.tsx:319` Suspense fallback (triggered by `useSearchParams()` at `:100`) re-paints the
   identical shell. **Mapped, not fixed (phase K/L).**

---

## Commits produced (oldest → newest, 32; branch `agent/claude/3-runtime-drawer-deletion`)

```
8c0275b81 fix(runtime/K2): subject-aware preparation identity
223650966 feat(runtime): extract headless Opportunity Record Work Runtime; drop queue-row drawer follower
f6a31885f fix(runtime): atomic subject swap in inline Focus Panel — eliminate mixed-subject frame
dc5d922e5 P0: introduce resolveSurfaceVariant — one applicability resolver (behavior-neutral)
fea9a485a P1 (partial): repoint Work Unit header resolution onto resolveSurfaceVariant
5afac7baf P1-A: delete legacy metric_placements Work Unit Header path
cefe8f690 P1-C: deterministic Header KPI batching — metrics/resolve 3 -> 1
db20cf459 P1-D/E: Header applicability certification + Configuration Runtime Constitution
f9d01654d P1-H: delete dead WorkUnitHeaderCalculations renderer
601f9d3cd P2-A: repoint queue-row layout selection onto resolveSurfaceVariant (+ Work View axis)
00d71e39b P2-B: wire per-row queue variants into the live snapshot (behavior-neutral)
06d0e3466 P2-D: queue row-variant applicability certification
0b1ebdd19 P2-C/E/F: Constitution queue region — fallback ledger, request ownership
c3d9b30be P2-E: acceptance criterion — one owner, not one HTTP request; duplicate vs independent scope
d41b5720e P2-H: queue configuration runtime certification spec
763bb6d6d P2-I: Queue region CERTIFIED — constitutional audit + verdict
d3b433f7a P3-A/D: repoint Focus Panel Summary selection onto resolveSurfaceVariant
f35106897 P3-B: thread committed Work-View/stage context into Focus Panel resolution
363e9a790 P3-C/E/F/G/H/I: Focus Panel region CERTIFIED
6d85599ba P2-V: surface queue-row config-consumption provenance to the DOM
2bb0d9c6e P2-V: Constitution — config-consumption verification + verdict
7e62880da P4-A: retire dead fieldEditabilityInDrawer editability logic
d64da8f82 P4-B/D: editability provenance to DOM + Constitution Actions/Editing + final audit
b985d50cd P4: interaction runtime browser certification
40750035e P4: Work Unit Configuration Runtime COMPLETE — final perf + verdict
f068a6fbf exp: remove blank time — hover-prefetch the K2 provisioning answer
3d7af59cf exp: cold-path server parallelism — records + presentation ∥ composition
a977fd994 exp: cold-path — parallelize queue-row + header layout DB reads
8167de56d EXP-2: queue-row builder faithfully reflects authored config — live preview + no-op warnings
0ac4cffe6 architecture: Workspace Operational Preparation Runtime (design only)
35a3b1a25 Queue Failure 1: queue-row renderer fidelity — stop rendering unauthored contact values
c284a8896 architecture: Queue Runtime correction — selection state machine, fidelity phase, metrics root-cause
```

## Current repository state

- Branch `agent/claude/3-runtime-drawer-deletion`; **ahead 32 / behind 16** vs `origin/staging`.
- **Working tree CLEAN. Nothing pushed. No uncommitted files.**
- 61 files changed, +3459 / −1151.
- Runs on the managed slot-3 dev server (port 3013) via `alloy-dev-start wt3-runtime-drawer-deletion`.

## Files modified (key)

- **Kernel / provisioning**: `runtime/kernel/{provisioning,workUnitEntryResourceClient,workUnitProvisioningPrefetch}.ts`;
  `runtime/provisioning/{workUnitProvisioningAnswer,operationalPresentation,workUnitSurfaceModelFromSnapshot}.ts`.
- **Resolver / config**: `layout/resolveSurfaceVariant.ts`, `layout/runtime/queueRowLayoutServer.ts`,
  `adminV2/runtime/focusPanel/{resolveFocusPanelSummaryVariant,usePublishedFocusPanelSummaryDoc}.ts`,
  `app/api/admin/entity-layouts/focus-panel-summary/route.ts`.
- **Queue render / fidelity**: `presentation/runtime/{queueRowSurfaceConfig,resolveCompactSlotDisplay,types}.ts`,
  `workspace/enrichOpportunityQueueProjection.ts`, `workUnits/buildPartialQueueRowContext.ts`,
  `components/presentation/workUnit/{CondensedQueueRow,QueueRegion,InlineOpportunityFocusPanel}.tsx`.
- **Prefetch wiring**: `admin/operatorWorkUnitEntryWarm.ts`,
  `components/presentation/workspace/{ProcessSummaryCard,WorkspaceHeader,WorkViewList}.tsx`.
- **Builder fidelity**: `components/adminV2/settings/surfaces/{QueueRowBuilderV2,QueueRowItemLibraryPanel}.tsx`.
- **Editing**: `admin/drawer/fieldEditabilityInDrawer.ts` (trimmed), `components/admin/focusPanel/identity/IdentityFieldValue.tsx`.
- **Deleted**: `workUnitHeaderCards.ts`, `useWorkUnitHeaderSurfaceConfig.ts`, `WorkUnitHeaderCalculations.tsx`,
  `fieldEditabilityInDrawer.test.ts`, plus header-surface builder symbols.
- **Docs**: `platform/runtime/work-unit-configuration-runtime-constitution.md`,
  `platform/runtime/workspace-operational-preparation-runtime.md`,
  `platform/operator/focus-panel-architecture-vocabulary.md`.

---

## Testing completed

- **Unit (vitest), all green**: `resolveSurfaceVariant` (11), `headerVariantApplicability` (6),
  `queueRowVariantApplicability` (7), `focusPanelVariantApplicability` (8), `oipWarmCacheDedup` (6),
  `workUnitProvisioningPrefetch` (7); D1 provisioning suite (`d1ProvisioningAnswer`,
  `d1OperationalPresentation`, route, stage-membership, `operationalProjection`, `d5WorkUnitSettlement` = 80+).
- **Typecheck**: `tsc --noEmit` **0 errors** project-wide (re-verified after each phase).
- **Browser certs**: the 7 specs above.

## Testing still required

- **Production-build performance certification** (§18): `next build` + `next start` on a spare port; p50/p75/
  p95/max for ACK/LEGIBLE/commit/coherence/Focus-first-content/Settlement, request/dupe/payload, per input
  mode (intent/immediate/keyboard/touch/deep-link/back-forward/miss/expired/failure). Dev server is too noisy.
- **Queue selection cert** (§6.3, 12 scenarios) — once phase G/H land.
- **Metrics-after-deletion cert** — once phase J lands (delete → tile/Header/totals correct immediately).
- **Single-loading-owner cert** (§13) — once phase K/L land (one shell, no duplicate midnight-blue).

---

## Remaining risks

1. **Metrics still stale after deletion** — NOT fixed (phase J). Root cause mapped (§10.1). User-visible.
2. **Duplicate midnight-blue loader on refresh** — NOT fixed (phase K/L). Root cause mapped (§13). User-visible.
3. **Prefetch/store staleness** — bounded by a 15 s TTL today; the full store needs revision-token
   invalidation (phases B/H/J) or bounded staleness can surface a stale composition after a fast publish.
4. **Legacy `person.primary_email`/`primary_phone` aliases** — accommodate non-canonical published keys;
   acceptable for fidelity but is tech debt (prefer normalizing published surfaces to `person.email`/`.phone`).
5. **73 pre-existing `tests/adminV2/runtime/` failures** — verified present at the merge base; **not caused by
   this session** (unrelated CSS-selector/navigation-contract/card-archetype tests). Should be triaged
   separately.
6. **Cold direct-click** (no hover) still ~2–3.7 s in dev — coherent (0 blank frames) but multi-second;
   the durable fix is the anticipatory store (phases A–H), not more endpoint tuning.

## Known regressions

- **None introduced.** Every change was browser-verified and/or covered by green unit tests; tsc 0 errors;
  the config-runtime cutovers were behavior-neutral or improved; the queue-fidelity fix corrected a defect.
- Pre-existing (not this session): the 73 adminV2/runtime test failures; the `setState`-in-render warning in
  `QueueRowBuilderV2` (verified pre-existing, flagged as a spawn task); the metrics-after-deletion bug; the
  duplicate midnight-blue loader.

---

## Exact implementation order recommended (next session)

Follow the runtime doc phases, adjusted to what is already done:

1. **G — Queue selection state machine + atomic Runtime Focus commit** (§6.1–6.4). Highest user-visible
   value; depends only on the current committed-subject path (not the full store). Certify the 12 scenarios.
2. **J — Metrics Runtime + targeted invalidation** (§10, §10.1). Independent; fixes a live correctness bug
   (counts after deletion). Wire the delete runtime → fan-out; include `delete_child`; bust the 4 s cache.
3. **K + L — Single "Thinking…" loading owner + delete the duplicate** (§12, §13). Independent; fixes the
   duplicate midnight-blue. Neutralize the `AdminV2Shell:319` fallback (or hoist the `useSearchParams`
   suspension); subordinate `WorkspaceSurfaceSkeleton`.
4. **A — Operational Graph + Presentation Manifest**, then **B — Prepared Destination Store** (promote
   `workUnitProvisioningPrefetch`). These unlock the anticipatory phases.
5. **C — Workspace retained runtime** (EXP-4).
6. **D → E → H → I** — visible prep → Work-View adjacency (EXP-3) → queue adjacency → Focus-mode prep.
7. **M — Certification + performance freeze** (production build).

Each phase: land behind a flag where noted, browser-certify, measure, then delete the legacy owner it
replaces (config-runtime deletion doctrine). Do not begin a phase until the prior earns its evidence.

---

## Next Session Kickoff

1. **Re-establish context**: read `SESSION_HANDOFF.md`, then this file's *Current Truth* + *Remaining
   Mission*, then `docs/platform/runtime/workspace-operational-preparation-runtime.md` (the approved
   architecture) and `…/work-unit-configuration-runtime-constitution.md` (owners already cut over).
2. **Rebase onto staging**: this branch is behind 16. Rebase `agent/claude/3-runtime-drawer-deletion` onto
   `origin/staging`, resolve conflicts (expect overlap in `workUnitProvisioningAnswer`, the queue
   presentation files, and Settings surface builders), and re-run `tsc --noEmit` + the kept unit suites +
   the 7 browser cert specs to confirm green after the rebase.
3. **Bring up the surface**: `alloy-dev-start wt3-runtime-drawer-deletion` (slot 3, port 3013);
   `alloy-agent-status 3`; the browser certs run against the authenticated slot storage state.
4. **Start Phase G** (queue selection state machine) unless re-prioritized. Keep local-only commits; do not
   push/merge without explicit authorization.
