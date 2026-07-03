# Presentation Runtime V2 — Session Handoff / Transition Package

**Purpose:** allow a brand-new session to continue immediately without reading prior conversation.
Status snapshot at the end of the "Navigation Rails" pass.

---

> ## ⚠️ CORRECTION — final retirement pass (supersedes §3/§4/§8 below)
>
> A verification-and-retirement session re-audited this document and found **two errors** in the
> deletion inventory; the corrected audit is authoritative. See
> `presentation-runtime-v2.md` → **Architectural boundary** + **Retirement record**.
>
> 1. **`OperationalQueueRecordRow` is NOT deletable — it is Settings Runtime.** It is the live
>    renderer for the `/settings` Queue Row editor/preview (`QueueRecordLayoutPreview`,
>    `compositionFieldAdapter` → `QueueRowBuilderV2`). It is **retained** and reclassified as
>    **Settings Runtime**, not Presentation Runtime legacy. The operator product uses only
>    `CondensedQueueRow`.
> 2. **`LayoutRuntimeQueueRowView` WAS dead** (§3 wrongly marked it "still LIVE elsewhere"). Its
>    only reference was a string assertion in a since-deleted regression test. It and its
>    `…ErrorBoundary` / `…ErrorCard` / `…Hold` companions were removed.
>
> **Executed deletions (this pass):** batch 1 `legacyAdminWorkUnitHref`; batch 2
> `lib/ui-v2/demo/**` + `adapters/context-adapter.ts` (21 files); batch 3 `LayoutRuntimeQueueRowView`
> family + 2 dead tests; batch 4 `QueueRecordConfigColumn` / `QueueRowLinkedFieldButton` /
> `QueueRowOpenBackdrop` / `enrollmentQueueRowPreviewPolicy`. Branch then merged current
> `origin/staging` (no rebase). **Remaining deferred work is ONLY:** Runtime Adoption (PR #64,
> incl. Settings Runtime → `CondensedQueueRow` migration), Motion Runtime, Performance / Warm Loads
> / Caching.

---

## 0. Where things are

| | |
| --- | --- |
| **Branch** | `claude/presentation-runtime-v2` (NOT pushed) |
| **HEAD commit** | `b50499ba8` |
| **Base** | cut from `origin/staging @ 96ccada5a` |
| **Working tree** | clean (all work committed) |
| **Node for build/test** | `~/.nvm/versions/node/v22.21.1/bin` + `NODE_OPTIONS=--max-old-space-size=8192` (default node16 OOMs tsc / can't run Next) |
| **Dev login (playwright)** | `web/playwright/helpers/adminSessionAuth.ts` (magic-link mint); dev org `93667019-bd28-49b5-a688-acc9bb1e0a19` (Firefly Early Learning) |
| **Typecheck** | `cd web && NODE_OPTIONS=--max-old-space-size=8192 npx tsc -p tsconfig.json --noEmit` — ~81 PRE-EXISTING errors in tests/scripts (baseline); PRV2 files contribute **zero** |
| **Presentation tests** | `npx vitest run tests/presentation` → green (86/86 at last run) |

### Commit log (this sprint, newest first)
```
b50499ba8 PRV2 LEFT_NAV: canonical Work View counts in persistent sidebar (shared useWorkViewTotals, stable count slot); right rail persistence verified
33991644e PRV2 FP.SURFACE: gate pending skeleton on published-doc settle — pending grid == resolved grid (no strategy reflow)
f48f01ddf PRV2 FP.SURFACE: published-grid skeleton (no Preparing flash), warm first-record load, one FP.SURFACE section owner
c35787280 PRV2 WU.QUEUE_REGION: condensed rows consume published Queue Row surface config (visibility/labels), server-owned ordering
65f893ca4 PRV2 WS.PROCESS_TILE: launchpad polish — always-on operational summary, clearer row affordance
c8640dbf6 PRV2 WU.HEADER: published Work Unit Header surface — shared card renderer, coordinated reveal; pills → WU.WORK_VIEW_PILLS
8063afd47 PRV2 WS.PROCESS_TILE: operational launchpad — inert card, work-views-forward, per-view attention
7717334b5 PRV2 WS.HEADER: visibility:off cards hide at publish; test-infra hardening
4deb4a0ae PRV2 WS.HEADER: published Workspace Header surface — shared card renderer, route-VM first paint, coordinated reveal
2cdd4a398 PRV2: delete legacy presentation tree — dept routes, 7k work-unit page, orphaned workspace components (−35,335 lines)
8319da0fb PRV2: route cutover — /workspace and work-unit slug route mount PresentationRuntime
```
(Earlier commits `d0af693e0…3869e7ea5` = doctrine + runtime layer + surfaces + acceptance.)

---

## 1. Sections COMPLETE vs REMAINING

**Complete (built, tested, browser-validated):**
WS.HEADER · WS.PROCESS_TILE · WS.PROCESS_TILE_WORK_VIEWS · WU.HEADER · WU.WORK_VIEW_PILLS ·
WU.QUEUE_REGION · WU.CONDENSED_QUEUE_ROW · FP.SURFACE · LEFT_NAV · RIGHT_RAIL.

**Remaining sprint work (NOT started):**
- **Legacy deletion pass** (this handoff's §3/§4) — bulk already done in `2cdd4a398`; a small residual remains.
- **Calculations pass** (deferred): reconcile `isKnownCalculationKey` (governed-calc registry) vs `isKnownOipMetricKey` (metrics registry) — WU/WS header published-doc paths filter by the former, server value-resolution by the latter, so an OIP-only key is silently dropped from the published-doc strip. See §8.
- **Open-Surface drill-in registry** (deferred): FP drill-in uses in-panel coordination handoffs; no registry yet. See §8.
- **enrollment_pipeline / demo-data** config (deferred, see §7).

---

## 2. Ownership Audit (one owner per visible section)

All PRV2 section labels verified: each `data-runtime-label` **and** `data-alloy-section` is stamped in exactly ONE file. No legacy Work Unit page (`/workspace/dept/**` removed), no duplicate/heavy queue-row renderer active in presentation, drawer/modal suppressed on Work Unit, no query-string `work_view=`/`queue=` emitted.

| Section | Owner component (path under `web/`) | Runtime model | Config/data source | Interaction owner | Loading owner | Legacy renderer exists? | Duplicate impl exists? |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **WS.HEADER** | `components/presentation/workspace/WorkspaceHeader.tsx` (title) + `WorkspaceHeaderCalculations.tsx` (cards) | `WorkspaceSurfaceModel.header.calculations` (`WorkspaceHeaderCalculationCardVm[]`) | **Published `workspace_header` surface** (`metric_placements`) via `lib/metrics/platform/workspaceHeaderFirstPaint.ts` → Route VM seed; values refined by OIP warm cache | drill `<Link>` per card | `model.ready` (Route-VM seed → atomic; values patch in fixed card slots) | No | No |
| **WS.PROCESS_TILE** | `components/presentation/workspace/ProcessTile.tsx` (+ `ProcessGrid.tsx`) | `ProcessTileModel` | `OperatorLifecycleLandingCard` (`loadOperatorLifecycleLandingClient`); per-view attention/overdue from `computeWorkViewOperationalSignals` | tile is INERT; only Work View rows + `Open →` link | `model.ready`; footer stats hidden when null | No | No |
| **WS.PROCESS_TILE_WORK_VIEWS** | `components/presentation/workspace/WorkViewList.tsx` | `WorkViewLinkModel[]` | landing `workQueues` entries + counts from `useWorkViewTotals` (canonical location) | per-row `<Link>` to `/workspace/work-unit/{viewSlug}` | count slot placeholder; no jump | No | No |
| **WU.HEADER** | `components/presentation/workUnit/WorkUnitHeader.tsx` (title) + `WorkUnitHeaderCalculations.tsx` (cards) | `WorkUnitSurfaceModel.header` | **Published `work_unit_header` surface doc** (`GET /api/admin/analytics/surfaces/work_unit_header/doc`) folded into config `Promise.all`; values via OIP warm cache scoped to work unit | drill `<Link>` per card | `model.ready` (rides `configSettled` → title+cards+pills atomic) | No | No |
| **WU.WORK_VIEW_PILLS** | `components/presentation/workUnit/WorkViewPillStrip.tsx` | `WorkViewLinkModel[]` | `workViewLinkModelsFromConfiguredViews`; active count = live rows `total`, inactive = `useWorkViewTotals` canonical | pill click → `router.push('/workspace/work-unit/{viewSlug}')` (no query strings) | under `model.ready` | No | No |
| **WU.QUEUE_REGION** | `components/presentation/workUnit/QueueRegion.tsx` | `WorkUnitSurfaceModel.queue` | rows API `GET /api/admin/queues/{id}/{key}?work_view_id=…`; **ordering server-owned (Work View `sort_v1`)**; count = same response `total` | row select via `useFocusPanelOpen` | card-shaped skeleton rows; stable dims | No (heavy `OperationalQueueRecordRow` NOT used here) | No |
| **WU.CONDENSED_QUEUE_ROW** | `components/presentation/workUnit/CondensedQueueRow.tsx` | `QueueRowModel` (frozen `QueueRowContext`) + `CompactRowSlots` | **Published Queue Row surface** (`GET /api/admin/queue-row-layout/pipeline-queue-row` → `QueueRecordLayoutConfigV3`) → `mapQueueRowSurfaceToCompactConfig` for slot visibility/labels; generic-context fallback | whole row button → `onOpen` | inherits QueueRegion | No | No |
| **FP.SURFACE** | `components/presentation/workUnit/FocusPanelSurface.tsx` (region + selection seam) + `InlineOpportunityFocusPanel.tsx` (inline record) | drawer VM (`useOpportunityDrawerVmPayload`) + `OperationalContext` | **Published Focus Panel Summary doc** (`usePublishedFocusPanelSummaryDoc`) → composition engine (`FocusPanelCardGrid`); modal shell suppressed on work-unit paths | row click → `openDrawer` (in-page, no modal) | `FocusPanelSummarySkeleton` (published-grid placeholders, gated on doc settle); `holdPriorPayload` on row switch | No (drawer VM/cards REUSED, modal shell NOT) | No |
| **LEFT_NAV** | `app/adminV2/components/Sidebar.tsx` (shell) | `OperatorLifecycleLandingCard[]` (`loadOperatorLifecycleLandingCards`) | same landing cards as tiles; **counts from shared `useWorkViewTotals`** (canonical location) → count == tile == pill | `<AdminV2NavLink>` per work-view child (hrefs = tile hrefs) | persistent shell; count slot placeholder; `"Loading processes…"` for lifecycle load only | No | No |
| **RIGHT_RAIL** | `app/adminV2/components/AdminV2PersistentCommandRail.tsx` + `workspace/WorkspaceCommandRailShell.tsx` + `CommandRailBosMount.tsx` (shell) | page-registered actions/telemetry + `GlobalAssistantContext` (BOS) | `WorkspaceCommandRailRegistrar` (page-owned Actions/Telemetry) + BOS context | BOS chat (unchanged) | stale-while-revalidate registration; BOS NOT keyed by record id → no remount on row switch | No | No |

**Both shell rails (LEFT_NAV, RIGHT_RAIL) are mounted in `app/adminV2/components/AdminV2Shell.tsx` ABOVE the route children → persistent (not remounted) across `/workspace ↔ /workspace/work-unit/*` and row switches. Verified in code; validated in browser (sidebar node identity survives navigation; BOS shell not id-keyed).**

Note: `RR.SURFACE` (`components/presentation/rightRail/RightRailSurface.tsx`) is the PRV2 *inline* right-rail anchor — a zero-footprint hidden `<aside>` when empty. The VISIBLE operator command rail is the shell rail above. They do not conflict.

---

## 3. Deletion Inventory (what PRV2 replaced — DO NOT DELETE YET)

The **bulk legacy presentation tree was already deleted** in commit `2cdd4a398` (224 files, −35,335 lines: `/workspace/dept/**` routes incl. the 7,021-line work-unit page + 2,101-line dept switcher, both `QueueBlock` copies, `useWorkUnitQueueRuntime`, all `lib/ui-v2/adapters/*`, 35 obsolete tests). What remains below is the **residual** surface for a final cleanup pass.

### Routes
| Path | Status | Notes |
| --- | --- | --- |
| `app/adminV2/workspace/dept/**` | **Already deleted** (`2cdd4a398`) | Confirm no re-introduction |

### Helpers (dead → deletable)
| Path / symbol | Why deletable | Replaced by | Remaining refs |
| --- | --- | --- | --- |
| `lib/admin/canonicalOperatorRoutes.ts` → `legacyAdminWorkUnitHref` (builds `/dept/{id}/work-unit/{id}?queue=…`) | Emits the legacy dept URL + `?queue=` query PRV2 forbids | `operatorWorkUnitHrefFromWorkViewSlug` / `operatorWorkUnitHrefFromKey` (path slugs) | **0 non-test refs** (grep). Check test refs before removing. |

### Renderers (legacy-for-PRV2 but STILL LIVE elsewhere → DEFER)
| Path | Status | Why NOT deletable now |
| --- | --- | --- |
| `components/layout/OperationalQueueRecordRow.tsx` (+ `QueueRecordFieldRenderer`, `QueueRecordScopedColumn`) | Legacy heavy queue row | Still used by `components/layout/QueueRecordLayoutPreview.tsx`, `LayoutRuntimeQueueRowView.tsx`, and `app/dev/queue-record-doctrine-review/*` (the `/settings` Queue Row **preview**). PRV2 does NOT use it. Deletable only if/when settings preview migrates. **4 non-test refs.** |
| `lib/adminV2/runtime/alloyCanonicalLoadingSurface.tsx` (`AlloyCanonicalLoadingSurface`) | Removed from FP.SURFACE pending path | Still used elsewhere (search before removing). Not a PRV2 owner anymore. |

### Components / Adapters / Hooks / Tests / Compat
- **Already gone:** `components/presentation/shared/OperationalAnswersRow.tsx` (deleted in WU.HEADER pass); `presentation/shared/` dir empty/removed; `WorkspaceRootShell`, `WorkspaceRootLifecycleGrid`, `WorkUnitWorkspace`, both `QueueBlock`, `useWorkUnitQueueRuntime`, `lib/ui-v2/adapters/*` (all in `2cdd4a398`).
- **No known duplicate implementation remains** for any PRV2 section (audit §2).

**Net: the only clean-dead deletion candidate is `legacyAdminWorkUnitHref`. Everything else legacy is either already deleted or still powering non-PRV2 surfaces (settings preview) and must be migrated first.**

---

## 4. Deletion Execution Plan (ordered, risk-minimizing) — NOT YET EXECUTED

**Batch 1 — dead route helper (lowest risk).**
- Files: remove `legacyAdminWorkUnitHref` from `lib/admin/canonicalOperatorRoutes.ts`.
- References: none in app/lib (grep confirmed 0). Update/remove any test that references it.
- Tests: `npx vitest run tests/lib/admin` + typecheck.
- Browser validation: none needed (dead code).
- Rollback point: commit before/after; single-symbol revert.

**Batch 2 — confirm bulk-deletion completeness (audit-only, no removals expected).**
- Re-grep for any survivor of the `2cdd4a398` list (WorkspaceRoot*, QueueBlock, useWorkUnitQueueRuntime, ui-v2 adapters). Expect none.
- If a survivor is found with 0 refs → remove in this batch; else leave + document.
- Tests: full `tests/presentation` + acceptance spec.
- Rollback: per-file revert.

**Batch 3 — legacy queue-row renderer (DEFERRED, do not do without a settings-preview migration).**
- `OperationalQueueRecordRow` + `QueueRecordFieldRenderer` + `QueueRecordScopedColumn` + `QueueRecordLayoutPreview` + `LayoutRuntimeQueueRowView` + `app/dev/queue-record-doctrine-review/*`.
- Precondition: migrate `/settings` Queue Row preview off the heavy renderer (or accept its loss). PRV2 does not depend on it.
- Only then remove; full settings + presentation validation.
- Rollback: this is the highest-risk batch — do it last, isolated, with its own commit.

**General rule:** one batch per commit; run typecheck + `tests/presentation` + the acceptance spec (`web/playwright/tests/presentation-runtime-v2-acceptance.spec.ts`) after each; never delete two subsystems in one commit.

---

## 5. Loading / Reveal contract (as implemented)

- **Shell first, content fills in.** No rail-level spinner/skeleton-collapse; rails persistent above routes.
- **WS/WU surfaces** reveal atomically under `model.ready` (WS = Route-VM seed; WU = `configSettled`, which now includes the published header doc + queue-row config fetches). Title + header cards + pills commit together; no metric pop-in.
- **Fixed slots:** header metric cards (`MetricCardShell` 160×80), work-view count badges (`min-w`), left-nav count slot — values fill in place, no layout jump; pending → stable placeholder.
- **FP.SURFACE:** pending renders the SAME published card grid with card-shaped placeholders (`FocusPanelSummarySkeleton`), gated on the published doc having settled so pending strategy == resolved strategy (no "Preparing…" spinner, no arrangement reflow, no modal). Row switch holds prior payload.

## 6. Navigation contract (as implemented)
- Path routing only: `/workspace` → `/workspace/work-unit/{workViewSlug}` (label-derived slug). **No `?work_view=`, no `?queue=`, no legacy `/dept/` URL.** Record deep link: `/workspace/work-unit/{slug}/{recordId}`.
- One canonical count/host per Work View (`resolveWorkViewCanonicalLocation`): tile, pill, left-nav, and rendered rows all read the same number.
- Tile / left-nav / pill hrefs for the same view are identical.

---

## 7. enrollment_pipeline duplicate — FINDINGS + decision (mutation DEFERRED)

**Live state (dev org `93667019`):**
| id | key | name | active | dept | records |
| --- | --- | --- | --- | --- | --- |
| `5ba90557` | `enrollment_pipeline` | New Leads | **true** | `04958a78` (orphaned, NOT in accessible dept list) | 0 |
| `76b21da2` | `enrollment_pipeline` | Qualification | **false** | Enrollment (`3933ac47`) | 1 |
| `587de5bc` | `lifecycle_wu_lead` | New Leads | true | Enrollment | 3 |
| `5c0d15fc` | `lifecycle_wu_tour` | Tours | true | Enrollment | 2 |
| `b4f6ca18` | `lifecycle_wu_decision` | Decision | true | Enrollment | 2 |

**Key findings:**
1. **"No duplicate ACTIVE enrollment_pipeline key" is ALREADY satisfied** — only `5ba90557` is active; `76b21da2` is inactive (filtered out of resolution). So slug resolution is deterministic today.
2. The **Enrollment process (dept `3933ac47`) routes its Work Views via `compat_queue_key` to `lifecycle_wu_*` lanes** (New Leads→`lifecycle_lead`, Registration/Tours→`tours`, Waitlist/All Leads→`waitlist`, Active Pipeline→`communications_followup`) — **NOT** the `enrollment_pipeline` units. So the duplicate does **not** drive the operator flow.
3. The runtime is **consistent**: tile count == pill count == left-nav count == rendered rows for every view (verified). The "0 rows" seen on most views is a **demo-data ↔ view-predicate mismatch** (the seeded records don't satisfy those views' predicates; e.g. "All Leads" is bound to the `waitlist` lane), **not** a runtime bug.
4. Canonical tie-break (`disambiguateWorkUnitKeyMatches`, `pickDeptPipelineWorkUnit`) is deterministic when `sort_order`/name differ; ambiguous only if two active units share dept+sort_order+name. `is_active=false` cleanly excludes a unit from ALL resolution paths (slug, canonical host, nav, landing) with no data loss — there's even an existing `builderOwnedLifecycleRuntime` auto-inactivation pattern for empty `enrollment_pipeline` units.

**Decision: DEFERRED the DB mutation.** Reason: (a) it's the user's org data; (b) deactivating `5ba90557` would NOT unblock multi-row UI validation (the blocker is demo data/predicates, not the duplicate); (c) the acceptance item "no duplicate active key" already holds. **Recommended reversible hygiene step for a human to run** (optional): `UPDATE work_units SET is_active=false WHERE id='5ba90557…' /* empty orphaned enrollment_pipeline */;` — safe, reversible, honored by all `is_active` filters. **To actually reach a ≥2-row view in the UI:** re-seed so a single Enrollment Work View's predicates match ≥2 records, OR adjust a view's `compat_queue_key`/predicates (that is process-config, explicitly out of scope for the runtime work).

---

## 8. Known risks / deferred / open questions

**Known risks:**
- The dev-server on `:3000` is fragile (crashed mid-session; cold compiles are slow → playwright probes need long timeouts / route warming). Restart via preview_start; warm `/login`, `/workspace`, a work-unit route with `curl` before probing.
- The dept `work-unit-queue-summaries` endpoint can HANG server-side (pre-existing). The lifecycle-landing loader bounds it at 8s (`loadOperatorLifecycleLandingClient`), so nav/tiles render without it, but left-nav "Loading processes…" can linger on cold first load.

**Deferred items (documented, not bugs to fix in the deletion pass):**
- **Calculations registry divergence** — `isKnownCalculationKey` (governed) vs `isKnownOipMetricKey` (metrics) filter the header published-doc path vs value-resolution differently → an OIP-only key is dropped from the published strip (survives only via the code-owned fallback). Reconcile in the calculations pass.
- **Open-Surface drill-in registry** — FP card drill-in uses in-panel coordination handoffs (`coordination.requestFocus`, ESC/back depth); NO registry/recursion yet. Preserved as-is; PR #64 universal SurfaceRenderer would formalize it.
- **Queue Row static-hide** — `QueueRecordLayoutConfigV3.visibleWhen` is record-conditional; there's no static-hide primitive, so the published config never *hides* a compact slot today (plumbing is ready for a future explicit-hide).
- **enrollment_pipeline / demo data** — §7.

**PR #64 (universal SurfaceRenderer) compatibility:** every section is a PURE presenter of a resolved model, so future adoption is a data-mapping swap, not a refactor. WS/WU headers, FP, and (now) queue rows already consume published surface config; the tile/pills/nav consume resolved models. No section blocks the swap.

**Open questions for the user:**
1. Should the empty orphaned `enrollment_pipeline` unit (`5ba90557`) be deactivated (hygiene), or left as-is? (Runtime is unaffected either way.)
2. Is losing the `/settings` Queue Row **preview** (which uses the legacy `OperationalQueueRecordRow`) acceptable, or must it be migrated before Batch 3 deletion?
3. Push target: PR into `origin/staging` when ready?

---

## 9. Recommended FIRST task of next session
**Run the deletion pass, Batch 1 + Batch 2 only** (from §4): remove the dead `legacyAdminWorkUnitHref`, then grep-confirm the `2cdd4a398` bulk deletion left no survivors. Keep Batch 3 (legacy queue-row renderer) deferred pending the open question on the settings preview. After Batch 1/2: run `tests/presentation` + the acceptance spec, commit, and prepare the PR into staging.

**Do NOT** re-open enrollment_pipeline or demo-data as runtime work — it's config/data, out of scope, and documented in §7.
