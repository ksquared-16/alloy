# POS-FP3 — Read-Only Processing Workspace Queue Package Plan

> **Status:** Package Planning — the first **visible** POS surface. **Planning only; no implementation, no code.**
> **Doctrine:** this package exists to **validate the Processing Case object model** by rendering it. Read-only. No new concepts, no POS-specific queue framework. **Reuse Alloy Work Unit queue patterns.** The queue **consumes FP2**; it does not become a new runtime.
> **Hard scope-outs:** no mutations, no drawer, no case detail page, no review/resolution/outcome runtime, no BOS, no document ingestion.
> **Inputs:** FP1/FP1b (envelope + on-ramps), FP2 (read model: `listProcessingCaseQueue`, `countProcessingCasesByStatus`, source descriptors), POS-13 (Alloy-native visual direction), and Alloy doctrine: `work-unit-layout-doctrine.md`, `queue-record-doctrine.md`, `navigation-doctrine.md`, `typography-and-presentation-doctrine.md`.
> Branch: `pos-planning-v1` (planning); implementation later on a fresh branch off latest `staging`.

## Objective

Ship the **first read-only Processing Workspace**: a Work-Unit-style queue of Processing Cases, rendered from the FP2 read model, that lets an operator *see* the hero object before any review/resolution/outcome/BOS/document runtime exists. It validates that the FP1/FP2 model produces a coherent operational surface using **existing Alloy queue patterns**, and nothing more.

## UX approach

Alloy-native per POS-12/13, reusing the Work Unit workspace shell:

- **Shell:** Midnight Forge left nav (POS pillar, **Processing** active) + dark top bar + white canvas.
- **Two zones only (Work Unit doctrine):** a **Header** (title "Processing" + status **lane pills** with counts + a source-kind filter) over a **dominant Queue** that owns scroll (~6–7 rows).
- **Rows** are compressed, read-only Processing Case rows: a **neutral** source-kind glyph, the **live-resolved source label** as the row title, a **status pill** (lane), the **received date** (compact), and a **related-source count** when > 0. No action rail, no row-open behavior.
- **Restraint (POS-13):** neutral metadata icons; Bend Pine only for the active lane / selection; amber only for genuine attention; no rainbow.
- **Empty state:** tier-6 "No active processing." with full queue chrome retained.
- **No command rail in FP3** (Actions → Telemetry → BOS arrive in later packages); the rail slot is omitted or shown as a quiet placeholder.

## Architecture approach

A thin **read-only consumer of FP2** — not a new queue engine:

- A **server-rendered page** at the Processing route renders a client queue component that calls **one read-only GET endpoint**.
- The endpoint composes FP2 directly: `makeProcessingCaseReadDeps(supabase)` + `makeDefaultSourceDisplayResolverRegistry(supabase, orgId)` → `listProcessingCaseQueue` + `countProcessingCasesByStatus`. It returns `ProcessingCaseQueueRow[]` + lane counts + next cursor. **No mutation, GET only.**
- **Reuse, don't rebuild:** the Work Unit **workspace shell**, queue list **bounded-scroll** shell, status-pill and lane-pill patterns, presentation **typography/date** tokens, and Midnight Forge nav. FP3 renders a **minimal Processing row** from the FP2 DTO and deliberately **does not** route Processing Cases through the opportunity/lifecycle-coupled `OperationalQueueRecordRow` + `queue_record_layout` config renderer (that is RRS/opportunity-bound; coupling to it would create exactly the entanglement this package must avoid).
- Org-scoped (admin context + RLS). All display labels remain **live-resolved via FP2** (no payload copied).

## The eight questions

**1. What route owns the Processing Workspace?**
A new AdminV2 POS area route — recommended **`/adminV2/processing`** (the POS "Processing" landing), registered like other AdminV2 workspace routes, with the canonical `/admin/processing` alias if `routing-doctrine.md` requires the rewrite. Exact path confirmed against routing-doctrine at implementation; the recommendation is `/adminV2/processing`.

**2. How does it fit existing Alloy navigation?**
POS is a left-nav **pillar** (POS-03/13); **Processing** is its first area and the FP3 surface. FP3 adds **one nav entry** to the existing AdminV2 sidebar/nav config — no new nav framework. It sits in the Midnight Forge shell exactly like other pillar areas.

**3. What queue columns appear?**
A compressed operational row (queue-record-doctrine anatomy), minimal for FP3:
- **Source** — neutral source-kind glyph (channel-driven; not colored).
- **Case** — the **resolved source label** (tier-1 title) + a muted case reference/`case_type` when present.
- **Status** — lifecycle **status pill** (lane).
- **Received** — compact date (`formatQueueRecordDateDisplay` style).
- **Related** — related-source count when > 0.
No action rail column (read-only; BOS/Actions later).

**4. What queue filters appear?**
From FP2's query surface: **status lane** (primary), **source-kind**, and optionally **received date range**. `case_type` filter is omitted in FP3 (nullable, not yet meaningful). Filters map 1:1 to `ProcessingCaseQueueQuery`.

**5. What status lanes appear?**
The seven FP1 lifecycle states as lanes with **counts** (`countProcessingCasesByStatus`): Received, Processing, Needs review, Needs resolution, Ready, Completed, Archived. Default view = the **active set** (received → ready); Completed/Archived available but not default. Lane pills follow POS-13.

**6. How should source descriptors appear?**
Exactly as FP2 resolves them: a **neutral kind glyph** (by `channel`) + the **resolved `label`** as the row title + the **`receivedAt`** date. Unknown/missing sources show the **generic fallback** label (`resolved=false`) — never an error, never a blank row. No payload, ever.

**7. What queue row opens later (future detail package)?**
Each row carries the **case id** and is structured to become a link to the future **Processing Case detail** (an Alloy **drawer** per `drawer-doctrine.md`, consuming FP2 `getProcessingCaseDetail`). **In FP3 the row opens nothing** — no drawer, no detail page, no navigation — preserving read-only scope. FP3 only defines the eventual target.

**8. What existing Work Unit queue patterns should be reused?**
- `WorkUnitWorkspace` / `WorkspaceShellLayout` two-zone shell (Header → Queue).
- Queue **bounded-scroll** list (6–7 visible rows; queue owns scroll).
- **Lane pills / filter** pattern; **status pill** rendering; **neutral metadata icon** treatment.
- Presentation **typography tiers** and **date formatters**.
- Midnight Forge shell + left-nav registration.
**Not reused:** the opportunity/lifecycle-coupled `OperationalQueueRecordRow` + `queue_record_layout` renderer (kept decoupled; FP3 renders from the FP2 DTO).

## Files likely touched

**New:**
- `web/app/adminV2/processing/page.tsx` — server page (POS Processing landing).
- `web/app/adminV2/processing/ProcessingQueueClient.tsx` — read-only client queue (lane pills, filters, rows, empty state).
- `web/app/api/admin/processing/queue/route.ts` — **read-only GET** endpoint composing FP2.
- A small mapping helper (e.g. `web/lib/pos/processingCase/readModel/buildProcessingQueueResponse.ts`) — pure shaping of FP2 output to the endpoint response (substitute-gateable).
- Tests under `web/tests/pos/` and/or `web/tests/admin/`.

**Extend (additive):**
- AdminV2 left-nav config — add the POS **Processing** entry.

**Reuse (read-only):** Work Unit workspace shell, queue CSS/tokens, presentation formatters, status/lane pill components; FP2 read model.

## Migration required or not

**None. Reuse FP1 schema + FP2 read model.** FP3 is page + read-only endpoint + nav. **Note:** FP3 is the moment the deferred index decision (FP2 §7) may be revisited — if profiling the queue endpoint shows the lane+sort scan needs `processing_cases(org_id, status, created_at DESC)`, that additive index is escalated separately. No schema change ships in FP3 itself.

## Risks

1. **Coupling to the opportunity queue renderer.** *Mitigation:* render a minimal Processing row from the FP2 DTO; reuse only decoupled shell/tokens/pills.
2. **A read-only surface acquiring write paths.** *Mitigation:* GET-only endpoint; no mutation imports; must-not-happen list; tests assert non-GET rejected.
3. **Performance without the deferred index.** *Mitigation:* profile at this gate; escalate the additive index only if justified by real query patterns.
4. **Reinventing a queue framework.** *Mitigation:* reuse `WorkspaceShellLayout` + queue patterns; FP3 adds rendering, not a framework.
5. **Nav placement drift.** *Mitigation:* register through the existing nav config per `navigation-doctrine.md`; one entry only.
6. **Live source-resolution latency in the list.** *Mitigation:* FP2 batches per kind; page size bounded.
7. **RLS / org-scope on the endpoint.** *Mitigation:* admin context + org-scoped FP2 deps; tests cover scoping.
8. **Sandbox toolchain limits (carried).** Full vitest + component render can't run in-sandbox. *Mitigation:* substitute-gate the pure mapping; render/integration host-side.

## Test plan

- **Endpoint mapping (pure/DI):** given FP2 output, the response shape (rows + lane counts + next cursor) is correct; filters (status, source-kind, date) pass through to `ProcessingCaseQueueQuery`; **GET-only** (non-GET rejected); org-scoped.
- **Read-only:** no mutation code paths; endpoint never writes.
- **Row rendering (host-side, jsdom):** rows show neutral glyph + resolved label + status pill + compact date + related count; **unknown/missing** source renders the fallback; **empty** state renders; **no row-open** behavior (no link/drawer).
- **Lanes:** lane pills reflect `countProcessingCasesByStatus`; switching lane re-queries with the status filter.
- **Host-side / real gate:** full `vitest` + component tests; endpoint integration with RLS; queue `EXPLAIN` (index decision input).

## Substitute gate (POS-06)

1. Build the page, client queue, read-only endpoint, and pure mapping helper.
2. Run substitute gate (in-sandbox): targeted `vitest` on the mapping/endpoint-shape tests — or, given the sandbox's Mac-only bundler binaries block vitest (as in FP0–FP2), the **pure-logic harness via `tsc → node`** for the mapping helper; **scoped typecheck** (`tsconfig.fp3.json` over the FP3 files); **eslint**.
3. Same-failure two-attempt limit; pause and escalate on the third.
4. **Real gate (host-side):** full `vitest` + React render tests, endpoint + RLS integration, `npm run build`, and queue profiling — none of which run in-sandbox.

Substitute-gate pass: mapping logic green, scoped typecheck 0 errors, eslint clean.

## Acceptance criteria

1. A **read-only** Processing Workspace exists at the route, in the POS nav, rendering Processing Case **queue rows from FP2**.
2. **Lane pills with counts** (the seven lifecycle states); **status + source-kind** filters; compact **received** dates; **neutral** source glyph; **resolved** source label; **related-source count**.
3. **No mutations, no drawer, no detail page, no row-open, no review/resolution/outcome, no BOS, no document ingestion.**
4. Reuses the **Alloy Work Unit workspace shell + queue visual patterns**; introduces **no POS-specific queue framework**; does **not** route Processing Cases through the opportunity queue-record renderer.
5. **No migration**; reuses FP1 schema + FP2 read model.
6. **Unknown / missing / empty** sources render gracefully (FP2 fallback).
7. The row defines (but does not implement) the future detail (drawer) open target.

## Rollback plan

- The page, client component, read-only endpoint, mapping helper, and the single nav entry are **additive and consumed by nothing else** — revert the FP3 commit and the platform is unchanged.
- **No schema/data change** → nothing to undo there. Nav entry and surface are independently revertible.

## "Must not happen" list

- **Must not** perform any mutation / write (read-only GET only).
- **Must not** build a drawer, a case detail page, or any row-open/navigation behavior.
- **Must not** add review/resolution/outcome/BOS/document-ingestion runtime.
- **Must not** invent a POS-specific queue framework; reuse the Alloy workspace shell + queue patterns.
- **Must not** route Processing Cases through the opportunity/lifecycle `OperationalQueueRecordRow` / `queue_record_layout` renderer.
- **Must not** copy or display source payloads; consume FP2 descriptors only.
- **Must not** add schema/migration in FP3 (escalate the deferred index separately if profiling proves it).
- **Must not** introduce a new primary object or concept.
- **Must not** bypass org-scoping / RLS.

## What is explicitly out of scope

Processing Case detail (drawer/page) and any row-open behavior (next package); review (P3 of POS-A03), linkage/resolution (P4), outcome engine (P5), BOS (P6); document ingestion/OCR; any mutation, action, or write surface; layout-config-driven Processing rows; the command rail (Actions/Telemetry/BOS). FP3 is the read-only queue surface that consumes FP2 — and nothing more.

## Position in the roadmap

FP3 is **POS-A03 P1 (Processing Workspace), read-only first slice** — the first surface to make the hero object visible, validating FP1/FP2 before any heavier runtime. It is deliberately a thin consumer of FP2 over reused Alloy patterns, proving the model renders as "another Alloy work unit" without becoming a new runtime.
