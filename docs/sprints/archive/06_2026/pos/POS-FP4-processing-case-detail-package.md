# POS-FP4 — Processing Case Detail Package Plan

> **Status:** Package Planning — the first Processing Case *detail* surface. **Planning only; no implementation, no code.**
> **Objective:** introduce the Processing Case Detail experience (a read-only drawer from `/admin/processing`) that proves: **Processing Case is the hero object; sources are supporting evidence; records remain the source of truth; proposed values are visible but not promoted; the drawer model works cleanly from `/admin/processing`.**
> **Hard scope-outs:** no mutations/promotion/edit, no review runtime, no resolution runtime, no outcome runtime, no BOS, no document ingestion.
> **Inputs:** FP1/FP1b (envelope + on-ramps), FP2 (read model: `getProcessingCaseDetail`, source resolvers — **single read-model owner**), FP3 (queue at `/admin/processing`) + its audit, POS-13 (case visual direction), Alloy doctrine: `drawer-doctrine.md`, `drawer-operating-model-v1.md`, `routing-doctrine.md` (drawer URL sync), `typography-and-presentation-doctrine.md`, `documents-and-forms.md` (proposals-until-promoted).
> Branch: `pos-planning-v1` (planning); implementation later on a fresh branch off latest `staging`.

## Carried forward from the FP3 audit (locked)

1. **`/admin/processing` must become a canonical drawer host** — FP4 extends `isCanonicalDrawerHostPath` (and the shallow drawer URL-sync) to include it. (FP3 audit B.)
2. **Approve the additive queue index** `processing_cases(org_id, status, created_at DESC)` — FP4 ships it as an **index-only** additive migration. (FP3 audit B / FP2 deferred decision.)
3. **FP3 visual debt is recorded as future refinement, not done here** — bounded queue shell, canonical queue glyphs, POS-12/POS-13 Alloyification pass, canonical date formatting. **FP4 does not stop for a queue-polish sprint;** it establishes the correct *structure/hierarchy* and inherits the deferred visual debt.

## UX model

Opening a queue row opens a **read-only Processing Case detail drawer** on the same route (shallow URL sync), proving the hero-object hierarchy.

- **Open:** clicking a row (FP3 rows are currently non-interactive) opens the drawer; the URL gains `/admin/processing/:caseId` via `history.replaceState` — **no queue remount** (drawer doctrine). Close removes the segment; refresh/deep-link restores the drawer.
- **Hierarchy (POS-13, read-only subset):**
  1. **Processing Case — the hero.** Drawer header: case title (the resolved primary-source label), **status** (lifecycle lane, read-only — no status control), received time, related-source count. The case is the anchor; nothing about a source or record outranks it.
  2. **Proposed values — visible, explicitly *not promoted*.** For form/packet sources, the source's labeled answers are shown read-only under a clear **"Proposed — not yet promoted to records"** treatment. They are live-resolved from the source, never written to canonical records, never editable here.
  3. **Supporting evidence — the sources.** Primary + related sources listed with their FP2 descriptors (label, type, received). A document source shows as evidence with an **"open document"** handle (the actual preview/peek is a later nested concern; FP4 lists and links, does not embed a viewer).
- **Records remain truth:** the drawer renders *proposals* and *evidence*; it performs **no promotion, edit, approve, reject, or write**. There are no review/resolution/outcome controls.
- **Visual:** FP4 establishes the correct structure and read-only semantics; full POS-13 chrome (pine-accent panels, Midnight Forge tokens, glyphs) is part of the deferred Alloyification pass (carry-forward #3), not this package.

## Architecture

A read-only drawer that **delegates to FP2** for all read-model logic; the drawer reuses Alloy's drawer **URL-sync contract and chrome**, decoupled from the entity-VM/RRS runtime.

- **Canonical drawer host:** extend `isCanonicalDrawerHostPath` (+ a processing-scoped shallow URL-sync, generalizing or paralleling `operatorWorkUnitDrawerUrlSync.ts`) so `/admin/processing/:caseId` opens/closes the drawer without remounting the queue (per `routing-doctrine.md` drawer URL behavior).
- **Read-only detail endpoint:** `GET /api/admin/processing/cases/[caseId]` — delegates to FP2 `getProcessingCaseDetail` **plus** an FP2-owned **source-evidence resolver** (below). Serializes FP2 output; **no duplicated shaping/filtering/enrichment** (FP3-audit discipline).
- **FP2-owned source-evidence / proposed-values resolution (the substantive new read logic):** added to the **FP2 read-model module** (`web/lib/pos/processingCase/readModel/`), keeping FP2 the single owner. Per source kind, it live-resolves a **read-only** evidence projection:
  - `form_submission` / `form_packet_session` → **labeled proposed values** (answer label + value), reusing existing labeling read-helpers (e.g. the packet review rollup's *read/labeling* path) — **read-only; never the review approve/reject actions.**
  - `document` → evidence descriptor + open handle; **no proposed values** (extraction is a later package).
  - unknown/missing → graceful generic evidence (never an error).
  Nothing is copied or persisted; values are proposals resolved at view time.
- **Drawer rendering:** a `ProcessingCaseDrawer` consuming the detail read model; **not** routed through the entity-drawer VM/RRS or `OperationalQueueRecordRow` (same decoupling rationale as FP3).
- **Deep-link restore:** a thin route segment (`app/adminV2/processing/[caseId]`) restores the drawer on refresh, mirroring the work-unit `/:recordId` pattern, without owning a separate full page.
- **Index migration:** the approved additive `CREATE INDEX` only.

## Files likely touched

**New:**
- `web/app/api/admin/processing/cases/[caseId]/route.ts` — read-only GET detail endpoint (delegates to FP2).
- `web/app/adminV2/processing/ProcessingCaseDrawer.tsx` — read-only detail drawer body.
- `web/app/adminV2/processing/[caseId]/page.tsx` — deep-link/refresh restore segment (drawer state).
- FP2 read-model extension: `web/lib/pos/processingCase/readModel/resolveSourceEvidence.ts` (+ types) — FP2-owned proposed-values/evidence resolver.
- A pure detail-response shaper (if needed) under the same read-model module.
- `supabase/migrations/<ts>_pos_processing_queue_index.sql` — **additive index only** (`processing_cases(org_id, status, created_at DESC)`).
- Tests under `web/tests/pos/`.

**Extend (additive):**
- `web/lib/admin/canonicalAdminRoutes.ts` — add `/admin/processing` to `isCanonicalDrawerHostPath`.
- Drawer URL-sync helper (generalize/parallel `operatorWorkUnitDrawerUrlSync.ts` for the processing route).
- `web/app/adminV2/processing/ProcessingQueueClient.tsx` — row click opens the drawer (shallow URL sync); render the drawer when a `:caseId` is active.

**Reuse (read-only):** FP2 detail read model; existing labeled-answer/rollup *read* helpers; drawer chrome tokens + URL-sync contract.

## Migration required or not

**Yes — one additive, index-only migration** (`CREATE INDEX IF NOT EXISTS processing_cases(org_id, status, created_at DESC)`), pre-approved (carry-forward #2). **No tables, no columns, no denormalization.** The detail experience itself needs no schema (reuses FP1 + FP2). Reversible via `DROP INDEX`.

## Risks

1. **Drawer coupling.** The existing drawer host / URL-sync is entity/work-unit-coupled. *Mitigation:* reuse the **shallow-URL-sync contract + chrome**, render POS content decoupled from entity VMs/RRS; confirm against `drawer-doctrine.md`; generalize the URL-sync helper rather than fork behavior.
2. **Proposed-values resolution pulling in review runtime.** *Mitigation:* reuse only the **read/labeling** path; **no** approve/reject/correct actions; no mutation imports.
3. **"Proposed but not promoted" ambiguity.** Risk of implying values are truth. *Mitigation:* explicit "proposed — not promoted" treatment; no edit/promote affordance; values clearly attributed to their source.
4. **Records-own-truth violation.** *Mitigation:* the detail performs **no writes** to canonical records or sources; read-only endpoint.
5. **FP2 ownership drift.** Evidence resolution could leak into the endpoint/UI. *Mitigation:* it lives in the FP2 read-model module; endpoint/UI only consume.
6. **Drawer remount / warm-nav regressions.** *Mitigation:* follow `routing-doctrine.md` shallow-sync (no remount), `platform-performance-doctrine.md` warm open.
7. **Deep-link/refresh restore correctness.** *Mitigation:* `[caseId]` restore segment + tests.
8. **Detail load cost.** A case has few sources, but labeled-answer resolution per source can be non-trivial. *Mitigation:* bounded per case; resolve lazily/batched; document-only sources skip values.
9. **Visual debt carried (no POS-13 chrome).** *Mitigation:* explicitly deferred (carry-forward #3); FP4 ships correct structure, not final polish.
10. **Sandbox toolchain limits (carried).** Full vitest + drawer render can't run in-sandbox. *Mitigation:* substitute-gate the pure resolver/URL-sync/mapping; render + migration host-side.

## Test plan

- **Detail endpoint:** delegates to FP2 `getProcessingCaseDetail` + evidence resolver; **GET-only**; org-scoped; missing/other-org case → not found; no mutation paths.
- **Source-evidence resolver (FP2-owned, pure/DI):** form/packet source → labeled proposed values (read-only); document → evidence + open handle, no values; unknown/missing → graceful; values never marked promoted/truth.
- **Drawer URL-sync (pure):** opening sets `/admin/processing/:caseId` (no remount signal); closing removes the segment; deep-link parses `:caseId`; `isCanonicalDrawerHostPath('/admin/processing/<id>')` is true.
- **Hierarchy/read-only (host-side render):** case is the header/hero; sources render as evidence; proposed values show under the "not promoted" treatment; **no** promote/edit/approve controls exist.
- **Records-own-truth:** rendering proposed values issues no writes.
- **Host-side / real gate:** full `vitest` + drawer render + URL-sync runtime; endpoint + RLS integration; index migration apply + queue `EXPLAIN`; `npm run build`.

## Substitute gate (POS-06)

1. Build the evidence resolver (FP2-owned), detail endpoint, drawer URL-sync helper, drawer component, restore segment, and the index migration.
2. Run substitute gate (in-sandbox): targeted `vitest` on the resolver + URL-sync + endpoint-shape tests — or, given the sandbox's Mac-only bundler binaries block vitest (FP0–FP3), the **`tsc → node` harness** for the pure logic; **scoped typecheck** (`tsconfig.fp4.json` over the FP4 files + edited route helpers + queue client); **eslint** on new/edited files.
3. Same-failure two-attempt limit; pause and escalate on the third.
4. **Real gate (host-side):** full `vitest` + drawer/render + URL-sync, endpoint/RLS integration, **index migration apply**, `npm run build`.

Substitute-gate pass: resolver + URL-sync + endpoint-mapping logic green, scoped typecheck 0 errors, eslint clean on new/edited files.

## Acceptance criteria

1. Clicking a queue row opens a **read-only** Processing Case detail **drawer** at `/admin/processing/:caseId` via **shallow URL sync (no queue remount)**; close removes the segment; **refresh/deep-link restores** the drawer.
2. **`/admin/processing` is a canonical drawer host** (`isCanonicalDrawerHostPath`).
3. The hierarchy is proven: **Processing Case is the hero**; **sources are supporting evidence**; **proposed values are visible but explicitly not promoted**; **records remain truth** (zero writes).
4. The detail **delegates to FP2** (single read-model owner), including the new source-evidence resolver living in the FP2 module; **no duplicated read-model logic** in the endpoint/UI.
5. The **approved additive index** ships; **no other schema** (no tables/columns/denormalization).
6. **No review/resolution/outcome/BOS/mutation/document-ingestion** exists in FP4.
7. Unknown/missing sources render gracefully; document sources show evidence without proposed values.
8. FP3 **visual debt remains deferred** and acknowledged (no polish sprint).

## Rollback plan

- The detail endpoint, drawer, restore segment, evidence resolver, row-open wiring, and the `isCanonicalDrawerHostPath`/URL-sync edits are **additive and consumed only by the POS surface** — revert the FP4 commit and the platform is unchanged (FP3 queue keeps working; rows revert to non-interactive).
- The **index** rolls back via `DROP INDEX` (additive, reversible, no data touched).
- **No table/column/data change** — nothing else to undo.

## "Must not happen" list

- **Must not** mutate / write / promote / edit any canonical record or source (read-only end to end).
- **Must not** add review/resolution/outcome/BOS/document-ingestion runtime.
- **Must not** copy or persist source payloads; proposed values are **live-resolved, read-only**.
- **Must not** treat proposed values as truth or expose any promote/approve affordance.
- **Must not** route the case through the entity-drawer VM/RRS runtime or `OperationalQueueRecordRow`.
- **Must not** duplicate FP2 read-model logic in the endpoint or UI; the evidence resolver lives in the FP2 module.
- **Must not** add schema beyond the **approved additive index** (no tables/columns/new store/JSON/field system).
- **Must not** remount the queue page on drawer open/close.
- **Must not** introduce a new primary object — the Processing Case stays the hero.
- **Must not** start the FP3 visual-debt polish sprint here.

## What is explicitly out of scope

Review (approve/reject/correct), resolution/linkage (match decisions), outcome recipes/engine and any promotion of proposed values, BOS participation, document extraction/OCR and in-drawer document preview/peek beyond a link handle, any mutation/action surface, the FP3 visual-debt Alloyification pass (bounded queue shell, glyphs, POS-12/13 chrome, canonical date formatting), and additional source on-ramps. FP4 is the **read-only Processing Case detail drawer** that proves the hero-object hierarchy and the drawer model — and nothing more.

## Position in the roadmap

FP4 is **POS-A03 P2 (Processing Case surface), read-only first slice** — the row-open target FP3 defined. It validates the most important POS claim (Case → evidence, records own truth, proposals visible-not-promoted) and the drawer model from `/admin/processing`, while keeping FP2 the sole read-model owner and deferring visual polish.
