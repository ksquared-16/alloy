# POS-FP2 — Processing Case Read Model Package Plan

> **Status:** Package Planning — the read-model foundation package. **Planning only; no implementation, no code, no migration files in this document.**
> **Doctrine preserved:** Processing Case is the hero object and a *thin envelope*; Sources remain owned by their source systems; canonical records remain truth; **no review/resolution/outcome workflow, no BOS, no UI** in FP2.
> **Inputs:** POS-FP1 (built: `processing_cases`, `processing_case_sources`), POS-FP1b (built: packet on-ramp), POS-F02 (object model), POS-A01/A02 (architecture). Execution model: POS-06.
> **Grounding:** the FP1 tables and their indexes; the Alloy queue-enrichment precedent (`QueueService` enriches live; `queue-record-doctrine.md`: a queue row is a compressed operational surface, the renderer never substitutes derived fields for configured ones).
> Branch: `pos-planning-v1` (planning); implementation later on a fresh branch off latest `staging`.

## Objective

Make Processing Cases **queryable** — for future Processing Workspace queues and future Processing Case detail views — **before any workspace or UI is built**, without violating the thin-envelope doctrine. FP2 delivers a **read-model layer** (typed DTOs + query functions + a per-source-kind display resolver) over the FP1 schema, plus (at most) minimal additive indexes for queue performance. It builds **no UI, no drawers, no queue UI, no BOS, and no review/resolution/outcome** — only the data-access foundation later packages consume.

## Architecture approach

A **pure application read layer** over FP1's two tables — not a denormalized store.

- **Resolve live; denormalize nothing.** The case envelope already carries everything FP2 needs that is *its own*: `status`, `case_type`, `created_at`, `status_changed_at`. Anything that belongs to a source or a canonical record (subject identity, source title, field values) is **resolved live**, never copied onto the case.
- **Queue rows** = `processing_cases` (lane/sort/filter) joined to the **primary** `processing_case_sources` row (source kind + id), with a **source display descriptor resolved live and batched per source-kind** at query time.
- **Detail** = the case + all its sources (primary + related), with the same live-resolved descriptors; structured to host later extraction/match/resolution/outcome reads without restructuring.
- **Source-kind resolver registry** turns a `(source_kind, source_id)` reference into a minimal **display label** (e.g. form/packet definition name, document name + received time) by reading the owning system — never the payload, never stored.
- Optional **additive indexes** (no columns/tables) support lane + sort + filter performance.

This mirrors how Alloy already builds operational previews (live enrichment over canonical refs), and keeps the envelope thin.

## Required analysis

### 1. The Processing Case read model
Two conceptual DTOs (shapes, not schema):

- **`ProcessingCaseQueueRow`** — the compressed operational row: `id`, `status`, `case_type`, `created_at`, `status_changed_at`, `primary_source` (`{ kind, id }`), `related_source_count`, and a **live-resolved** `source_display` (`{ label, received_at, channel }`). It contains **no source payload and no canonical record truth**.
- **`ProcessingCaseDetail`** — the case fields + `sources[]` (each `{ kind, id, role, linked_at }`) + their live-resolved descriptors. FP2 stops here; extraction/match/resolution/outcome sections are later packages and are *absent*, not stubbed with state.

Both are **read projections assembled at query time**, not stored.

### 2. Query requirements — future Processing Workspace queues
- Filter by **status** (one or more lifecycle lanes), **source_kind**, **case_type**, and **received date range**.
- **Per-status counts** for lane counters (e.g. Needs review 23).
- **Sort** newest-first by `created_at` (default) or by `status_changed_at` (attention ordering).
- **Keyset (cursor) pagination** over the sort key + `id` (stable, scalable).
- **Org-scoped** (RLS + explicit `org_id` filter).
- Returns `ProcessingCaseQueueRow[]` with batched source-display resolution per page.

### 3. Query requirements — future Processing Case detail views
- Fetch **one case by id** (org-scoped) + **all sources** (primary + related, ordered by role then `linked_at`).
- Live-resolve each source's display descriptor and a link/handle back to the owning system (for "open document in a drawer" later).
- Shaped to be **extended** by later packages (extraction/match/resolution/outcome) without changing the case read or breaking callers.

### 4. Denormalize vs resolve live
- **Resolve live (never denormalize):** subject/record identity (family/child/customer), source titles and field values, document content, received timestamps owned by sources, and anything that is **truth**.
- **Use as-is from the envelope (already FP1 fields):** `status`, `case_type`, `created_at`, `status_changed_at`; and the **primary source kind/id** from `processing_case_sources` (a reference, not payload).
- **Denormalize in FP2: nothing.** No display-projection columns are added. If, *and only if*, real performance data later proves live resolution too slow for queues, a **display-only, explicitly-non-truth** projection may be proposed as a separate escalated package — never as truth, never in FP2.

### 5. Source information in a queue without copying payloads
- The queue row exposes only the **reference** (`primary_source.kind`, `primary_source.id`) from `processing_case_sources` plus a **live-resolved display descriptor**.
- A **per-source-kind resolver registry** fetches a minimal label from the owning system, **batched per kind per page** (e.g. one query for all `form_submission` ids on the page), avoiding N+1 and avoiding any payload copy:
  - `form_submission` → form definition name + submitted-at.
  - `form_packet_session` → packet definition name + completed-at.
  - `document` → document name + uploaded-at.
  - unknown/missing → a **safe generic descriptor** (`{ label: kind, received_at: case.created_at }`), never an error.
- Nothing resolved is persisted; truth stays in the owning system.

### 6. Sorting, filtering, status
- **Status** = the seven FP1 lifecycle lanes (`received` … `archived`); multi-select lane filter; per-status counts.
- **Default sort:** `created_at` DESC (newest inflow first); alternate `status_changed_at` DESC for attention.
- **Filters:** status set, source_kind, case_type, received date range.
- **Pagination:** keyset on `(sort_key, id)`.
- All org-scoped.

### 7. Minimal indexes
- FP1 already provides `idx_processing_cases_org_status`, `idx_pcs_case`, `idx_pcs_org_source`, and the primary partial-unique indexes.
- **Proposed additive indexes (no columns/tables):**
  - `processing_cases (org_id, status, created_at DESC)` — lane + default sort + keyset.
  - `processing_cases (org_id, created_at DESC)` — the "all lanes" sort.
  - (the primary-source join uses existing `idx_pcs_case` / the one-primary partial unique.)
- These are `CREATE INDEX IF NOT EXISTS` only — additive and reversible.

### 8. Schema changes or reuse FP1?
**Reuse FP1 schema — no new tables, no new columns, no denormalization.** The only potential schema delta is **additive indexes** (§7) to support queue sort/filter, proposed minimally and reversibly; if FP2 ships without them, the read layer still works (with weaker large-table sort performance). **No data-shape change.** This is the escalation point: approve the additive indexes, or defer them until real data warrants.

## Files likely touched

**New (read-model library only):**
- `web/lib/pos/processingCase/readModel/types.ts` — `ProcessingCaseQueueRow`, `ProcessingCaseDetail`, filter/sort/pagination inputs.
- `web/lib/pos/processingCase/readModel/processingCaseReadModelDb.ts` — `listQueueCaseRows`, `countCasesByStatus`, `getCaseDetail` (extends the FP1 `dbGetProcessingCaseWithSources`).
- `web/lib/pos/processingCase/readModel/sourceDisplayResolvers.ts` — per-source-kind resolver registry; batched; generic fallback.
- `web/lib/pos/processingCase/readModel/buildProcessingCaseQueueRows.ts` — compose case rows + resolved descriptors (pure).
- Tests under `web/tests/pos/`.

**Optional new (additive indexes only):**
- `supabase/migrations/<ts>_pos_processing_case_read_indexes.sql` — `CREATE INDEX IF NOT EXISTS` only.

**Reuse (read-only):** FP1 tables; source tables (`form_submissions`, `form_packet_sessions`, `documents`) read **only** for display labels via resolvers.

**Not touched:** no routes, no UI, no workspace, no drawers, no BOS — FP2 is a library other packages call.

## Migration required or not

**Reuse FP1 schema; no tables/columns.** The only optional delta is an **additive index-only migration** (§7) for queue performance — `CREATE INDEX IF NOT EXISTS`, reversible via `DROP INDEX`. This plan is the escalation requesting approval for those indexes (or a decision to defer them). No denormalized columns are proposed.

## Risks

1. **Heterogeneous live resolution / N+1.** *Mitigation:* batch resolution per source-kind per page; one query per kind, not per row.
2. **Truth leakage into the read model.** A descriptor could drift toward exposing payload/record truth. *Mitigation:* resolvers return only labels + timestamps; DTO shape excludes payload/record fields (asserted in tests).
3. **Unknown / missing / deleted source.** *Mitigation:* generic fallback descriptor; never error; case still lists.
4. **Pagination correctness** over `(status, created_at, id)`. *Mitigation:* keyset contract + tests.
5. **Index cost / write amplification.** *Mitigation:* minimal additive indexes; measured host-side; defer if unjustified.
6. **RLS / cross-system reads.** Resolver reads of source tables must respect their own RLS/scope. *Mitigation:* org-scoped queries; appropriate client; do not widen visibility.
7. **Premature denormalization pressure.** *Mitigation:* FP2 denormalizes nothing; any future projection is a separate escalated, display-only package.
8. **Sandbox toolchain limits (carried).** Full vitest can't run in-sandbox (Mac-only native binaries). *Mitigation:* substitute gate via the FP0/FP1 method; real gate (vitest + index apply + query perf) host-side.

## Test plan

- **Query builder (mock/DI Supabase):** filter by status set, source_kind, case_type, date; sort by `created_at`/`status_changed_at`; keyset pagination; org-scope present on every query.
- **`countCasesByStatus`** returns correct per-lane counts.
- **`getCaseDetail`** returns the case + primary + related sources (ordered).
- **Resolver registry:** each kind returns a display descriptor; **batched** (assert one call per kind, not per row); unknown/missing kind → generic fallback, no throw.
- **No-truth shape test:** `ProcessingCaseQueueRow` / `ProcessingCaseDetail` contain no source payload or canonical record-truth fields.
- **Pure composition** (`buildProcessingCaseQueueRows`) tested with fakes (substitute-gateable).
- **Host-side / real gate:** additive indexes apply; representative `EXPLAIN` confirms lane+sort uses the index; full `vitest`; RLS isolation on read paths.

## Substitute gate (POS-06)

1. Build the read-model library (types, db queries, resolvers, composition).
2. Run substitute gate (in-sandbox): targeted `vitest` on FP2 tests — or, given the sandbox's Mac-only bundler binaries block vitest (as in FP0/FP1), the pure-logic harness via `tsc → node`; **scoped typecheck** (`tsconfig.fp2.json` over the FP2 files); **eslint** on new files.
3. Same-failure two-attempt limit; pause and escalate on the third.
4. **Real gate (host-side):** full `vitest`, additive index apply on a scratch DB, `EXPLAIN` on the queue query, RLS checks — none of which run in-sandbox.

Substitute-gate pass: FP2 logic tests green (composition + resolvers + query-shape), scoped typecheck 0 errors, eslint clean.

## Acceptance criteria

1. Processing Cases are **queryable** for queues (filter by status/source_kind/case_type/date; sort; keyset paginate; per-status counts) and for detail (case + sources), **org-scoped**.
2. **No source payloads and no canonical record truth** are stored on, copied into, or exposed as fields of the read model; source display is **resolved live and batched** per source-kind.
3. **Reuses FP1 schema**; the only schema delta is **additive indexes** (if approved), reversible; **no tables/columns/denormalization**.
4. Unknown/missing/deleted sources resolve to a **safe generic descriptor** and never error.
5. **No UI, no drawers, no queue UI, no BOS, no review/resolution/outcome** exist in FP2.
6. The detail read is shaped to host later sections without breaking callers.

## Rollback plan

- The read-model library is **additive code that nothing yet consumes** — revert the FP2 commit and the platform is unchanged.
- If the additive index migration shipped → **`DROP INDEX`** (additive, reversible, no data touched).
- **No tables/columns/data changed** — nothing else to undo. Library and indexes are independently revertible.

## "Must not happen" list

- **Must not** denormalize, copy, or expose source payloads or canonical record truth in the read model.
- **Must not** add tables or columns (reuse FP1); the only allowed schema delta is additive indexes.
- **Must not** build any UI, drawer, queue UI, workspace, or BOS.
- **Must not** add review/resolution/outcome state or read those (they don't exist yet).
- **Must not** add an HTTP route/endpoint in FP2 unless proven necessary and escalated (FP2 is a library foundation).
- **Must not** let an unknown/missing source kind throw or drop the case from results.
- **Must not** treat any derived display label as truth.
- **Must not** bypass org-scoping / RLS, or widen source-table visibility via resolvers.
- **Must not** issue per-row source queries (N+1); resolution is batched per kind.

## What is explicitly out of scope

Processing Workspace and queue UI, Processing Case detail UI/drawers (POS-A03 P1/P2 consume this read model); review (P3); linkage/resolution (P4); outcome recipes/engine (P5); BOS (P6); additional source on-ramps (P7); any denormalized display projection; HTTP/API routes; auto-execution. FP2 is the read-model library + DTOs + resolvers (+ optional additive indexes), and nothing more.

## Position in the roadmap

FP2 is the **read-model foundation between the envelope (FP1/FP1b) and the Processing Workspace (POS-A03 P1)**. It makes the hero object queryable so the workspace and detail packages can be pure consumers — while keeping the Processing Case a thin envelope and leaving truth where it lives.
