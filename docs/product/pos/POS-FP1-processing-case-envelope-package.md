# POS-FP1 — Processing Case Envelope Package Plan

> **Status:** Package Planning — the second execution package. **Planning only; no implementation, no code, no migration files in this document.**
> **Doctrine preserved:** Processing Case is a *thin envelope*; Sources remain owned by their source systems; canonical records remain truth; POS owns only review/resolution/outcome *state*; Outcomes resolve to existing executors *later*; BOS stays right-rail/recommendation only.
> **Inputs:** POS-F01/F02/F03/F04 (Foundation), POS-A01/A02/A03 (Architecture), POS-FP0 (built: field-registry binding). Execution model: POS-06.
> **Grounding (real systems):** `form_submissions`, `form_packet_sessions`/items, `documents` (+ `documents.entity_type`/`entity_id` polymorphic precedent), `status_definitions`, `emitEvent` best-effort pattern, the FP0 marker (`isPosConnectedSurface`, `web/lib/forms/binding/posConnectedMarker.ts`), forms admin DB helpers (`web/lib/admin/forms/formsAdminDb.ts`).
> Branch: `pos-planning-v1` (planning); implementation later on a fresh branch off latest `staging`.

## Package objective

Stand up the **smallest possible Processing Case envelope** that can sit on top of the existing Forms/Packets/Documents/Communications systems **without creating a parallel runtime**. After FP1:

1. A **Processing Case** record exists as a thin, source-agnostic envelope with a POS-internal lifecycle.
2. A case **references** one or more Sources (primary + related) by polymorphic pointer — Sources stay owned by their source systems.
3. A **POS-connected** form or packet submission **opens exactly one Processing Case** (status `received`) with that submission as the **primary source**; legacy submissions open none.
4. Nothing else: no review/resolution/outcome state, no UI, no BOS, no outcome engine, no auto-execution.

FP1 is the envelope and the form/packet on-ramp — the foundation that later packages (Workspace, Review, Linkage, Outcome Engine, BOS) hang off. It deliberately stores **no source data and no record truth**.

## 1. Does FP1 need schema / migration?

**Yes — a minimal additive migration is required, and this is the escalation requesting approval for it.**

Burden-of-proof check (per Foundation doctrine — assume no new infra until proven): can the envelope ride existing storage?
- **Ride `form_packet_sessions`?** No. It is packet-specific; forcing non-packet sources (documents, future uploads/email) through it would couple POS to packet semantics and recreate the very *competing/parallel runtime* FP1 must avoid.
- **Ride a JSONB blob on `documents` / `opportunities` / a source row?** No. A Processing Case is **source-agnostic** and may reference **multiple** sources; stuffing it onto one source's metadata reproduces the fork and breaks the "one envelope, many sources" model.
- **Ride FP0-style existing metadata (like the marker)?** No. The marker is a boolean on an existing row; a Processing Case is a new operational record with its own identity, lifecycle, and source set. There is no existing row to be.

Therefore a dedicated thin table is the **minimal correct** foundation. Unlike FP0 (which needed no migration), FP1 genuinely does — but it is **purely additive** (new tables only, zero changes to existing tables), so legacy is untouched and rollback is a clean drop.

## 2. Minimal additive schema (proposal — conceptual, not a migration file)

Two new org-scoped tables. **No alterations to any existing table.** Column intent only; final types/constraints decided at implementation.

**`processing_cases`** — the envelope:
- `id` (uuid, pk)
- `org_id` (uuid, tenant scope; RLS like existing forms tables)
- `status` (text) — POS lifecycle state (§3); text now, with optional later alignment to `status_definitions(entity_type='processing_cases')` — not built now to stay thin
- `case_type` (text, nullable) — classification derived from the primary source (e.g. `subsidy_contract`, `enrollment_packet`); nullable, supports later recipe selection; not required in FP1
- `status_changed_at`, `created_at`, `updated_at`, `archived_at` (nullable) timestamps
- `metadata` (jsonb, default `{}`) — thin extension point

Explicitly **absent** (by doctrine): no copied source fields, no canonical record FK (matched-record linkage is *resolution state*, a later package), no review/outcome columns.

**`processing_case_sources`** — the source reference model (junction; §4):
- `id` (uuid, pk)
- `org_id` (uuid)
- `processing_case_id` (uuid, fk → `processing_cases.id`, `ON DELETE CASCADE` — cascade only within POS-owned tables)
- `source_kind` (text) — `form_submission` | `form_packet_session` | `document` | … (POS-02 taxonomy)
- `source_id` (uuid) — **polymorphic** pointer into the owning system's table; **no cross-table FK** (mirrors the existing `documents.entity_type`/`entity_id` pattern), so Sources stay owned by their systems
- `role` (text) — `primary` | `related`; **partial unique index** enforces exactly one `primary` per case
- `linked_at` (timestamp), `metadata` (jsonb, default `{}`)

Plus: standard org-scoped **RLS** policies mirroring the forms tables, and indexes on `(org_id, status)`, `(processing_case_id)`, and `(org_id, source_kind, source_id)`.

That is the whole migration: 2 tables, indexes, RLS. Additive and reversible.

## 3. Processing Case lifecycle fields (conceptual)

The envelope carries the POS-02 lifecycle as a single `status` plus timestamps — POS-internal, **distinct from CRM status and Lifecycle stages**:

| Lifecycle state | Meaning (FP1 sets only the first) |
|-----------------|-----------------------------------|
| `received` | Information entered; a case was opened from a source. **FP1 sets this.** |
| `processing` | Deterministic/BOS processing underway (later) |
| `needs_review` | Human review required (Review package) |
| `needs_resolution` | Ambiguity/conflict/missing info (Linkage package) |
| `ready` | Outcome prepared, awaiting approval (Outcome package) |
| `completed` | Approved outcome executed (Outcome package) |
| `archived` | No active work |

FP1 implements state as a text field with the documented allowed set and a `status_changed_at` stamp. **Transitions beyond `received` → `archived` are out of FP1** (they belong to the packages that own that state). No workflow engine, no status_definitions coupling in FP1.

## 4. Source reference model: primary + related

- A case has **exactly one primary source** (`role='primary'`) and **zero or more related sources** (`role='related'`).
- **Primary** anchors the case's identity, classification, and later recipe selection (e.g. the subsidy contract). **Related** sources enrich the same case (rate sheet, amendment, supplemental upload) — they add evidence, never fork the case.
- References are **polymorphic** (`source_kind` + `source_id`) into the owning systems; Sources are **owned by their systems** and only pointed at. No source data is copied onto the case or the junction.
- **One runtime:** there is a single case lifecycle and a single source set; sources differ only by `source_kind` and `role`. Promotion of a related source to primary (operator action) is a later-package capability; FP1 only needs to *model* primary vs related and enforce the one-primary invariant.

## 5. How form/packet sources become Processing Cases (the on-ramp)

A thin, marker-gated service — not an auto-runtime over all forms:

- A service `openProcessingCaseFromSource({ orgId, sourceKind, sourceId, caseType? })` creates one `processing_cases` row (`status='received'`) and one `processing_case_sources` row (`role='primary'`). Idempotent per source (a second call for the same primary source returns the existing case, does not duplicate).
- **Wiring (gated, legacy-safe):** at form-submission completion (the `dbSubmitSubmission` call site / submit route) and packet-session completion, the on-ramp fires **only when the surface is POS-connected** (reuse FP0 `isPosConnectedSurface` on the definition/version/packet metadata). Legacy (non-POS-connected) submissions open **no** case — preserving "do not touch legacy forms beyond FP0."
- **Best-effort, non-blocking:** case creation runs after the submission succeeds and **must not block or fail the submission** (mirrors the `document_uploaded` `emitEvent` pattern — failures are logged, the submission still succeeds).
- Related sources are attached via the same service with `role='related'` (no auto-attach logic in FP1; the capability exists, the policy for *what* auto-attaches is a later package).

This makes "sources become cases" real and minimal, for POS-connected forms/packets only.

## Files likely touched

Grouped; paths are expected surface area, not a commitment.

**New (small):**
- Migration: one additive file under `supabase/migrations/` (the 2 tables + indexes + RLS). *Created at implementation, not now.*
- `web/lib/pos/processingCase/types.ts` — `ProcessingCase`, `ProcessingCaseSource`, lifecycle + role unions, source-kind union.
- `web/lib/pos/processingCase/processingCaseDb.ts` — thin DB helpers (insert case, insert source ref, get case + sources, find-by-primary-source) — Supabase, mirrors `formsAdminDb.ts` style.
- `web/lib/pos/processingCase/openProcessingCaseFromSource.ts` — the on-ramp service (idempotent; one primary).
- Tests under `web/tests/pos/` (mock-Supabase + pure logic).

**Extend (additive, marker-gated):**
- Form submit path (`dbSubmitSubmission` call site / submit route under `web/app/api/.../forms/.../submissions`) — gated, best-effort call to the on-ramp for POS-connected forms.
- Packet-session completion path — same gated, best-effort call.
- Reuse `web/lib/forms/binding/posConnectedMarker.ts` (FP0) for the gate.

**Reuse (read-only):** `form_submissions`/`form_packet_sessions`/`documents` (referenced, not modified); `emitEvent` best-effort precedent.

## Migration needed or not

**Needed — minimal additive (2 new tables, no alters).** This document is the escalation requesting approval (per POS-06 / FP0 "no migration unless escalated and approved"). Justification in §1; schema in §2. Approve the additive migration before implementation begins.

## Risks

1. **Polymorphic `source_id` (no FK).** Soft referential integrity. *Mitigation:* org-scope + `source_kind` validation in the service; documented convention (matches `documents.entity_type`/`entity_id`); a periodic integrity check is a later concern, not FP1.
2. **On-ramp affecting submission latency/behavior.** *Mitigation:* best-effort, post-success, non-blocking; case-creation failure logs and is swallowed — submission never breaks (the binding gate from FP0 stays the only hard publish-time check).
3. **Scope creep into review/resolution/outcome state.** *Mitigation:* the must-not-happen list; FP1 ships envelope + source refs only.
4. **Parallel-runtime drift.** Reimplementing packet review semantics on the case. *Mitigation:* FP1 adds no review/approval logic; it only references sources.
5. **One-primary invariant.** *Mitigation:* partial unique index + service-level guard.
6. **RLS / multi-tenant correctness on new tables.** *Mitigation:* mirror existing forms-table RLS; covered by host-side integration tests (real gate).
7. **Idempotency of the on-ramp.** Duplicate cases on retried submissions. *Mitigation:* find-by-primary-source before create; idempotent contract + test.
8. **Sandbox toolchain limits (carried from FP0).** Full vitest can't run in-sandbox (Mac-only native binaries). *Mitigation:* substitute gate via the FP0 method; real gate (full vitest + migration apply + RLS) host-side.

## Test plan

- **On-ramp service (mock Supabase, FP0-style):** opens one case (`status='received'`) + one primary source row for a given source; **idempotent** (second call returns existing case, no duplicate); attaching a related source yields `role='related'`; attempting a second primary is rejected (service guard).
- **Source reference model:** primary/related roles; polymorphic kinds (`form_submission`, `form_packet_session`, `document`); get-case returns one primary + N related.
- **Marker-gated wiring (non-interference):** a POS-connected submission triggers the on-ramp; a **legacy** submission triggers **no** case (the critical legacy-safety test); on-ramp failure does not propagate to the submission result.
- **Lifecycle:** a new case is `received`; FP1 exposes no transition beyond `archived` (no review/resolution/outcome transitions exist yet).
- **Envelope thinness:** the case/junction store no source field values and no canonical record FK (assert shape).
- **Host-side / real gate (DB):** migration applies cleanly; RLS isolates orgs; partial-unique-primary constraint holds; cascade deletes only within POS tables; full `vitest` + `npm run build`.

## Substitute gate (POS-06)

1. Build the envelope service + DB helpers + types + gated wiring.
2. Run substitute gate (in-sandbox): targeted `vitest` on FP1 tests (mock-Supabase, no DB) — or, if the sandbox's Mac-only bundler binaries block vitest as in FP0, the pure-logic harness via `tsc → node`; **scoped typecheck** (FP1 files + edited submit paths via a `tsconfig.fp1.json` like FP0's); **eslint** on new/edited files; **legacy fixture sweep** asserting non-POS-connected submission opens no case.
3. Same-failure two-attempt limit; pause and escalate on the third.
4. **Real gate (host-side):** full `vitest`, `npm run build`, **migration apply on a scratch DB**, RLS + constraint integration tests, DB reset — none of which run in-sandbox.

Substitute-gate pass: FP1 tests green, scoped typecheck 0 errors, eslint clean, legacy sweep green.

## Acceptance criteria

1. Migration is **additive-only** (2 new tables, no alters) and reversible (drop).
2. A **POS-connected** form/packet submission opens **exactly one** Processing Case (`received`) with that submission as the **primary** source; a **legacy** submission opens **none**.
3. **Related** sources attach with `role='related'`; **exactly one primary** is enforced (DB + service).
4. Sources are **referenced** (polymorphic), never copied; the case/junction hold **no** source field values and **no** canonical record truth.
5. The case carries the POS lifecycle `status` (initially `received`); **no** review/resolution/outcome state, **no** UI, **no** BOS, **no** executors, **no** auto-execution exist in FP1.
6. On-ramp is **best-effort**: its failure never breaks form/packet submission.
7. **Legacy forms unaffected beyond FP0.**

## Rollback plan

- **Drop the 2 new tables** — clean rollback; no existing-table changes means nothing to revert there and no data migration to undo.
- **Un-wire the gated on-ramp call** — it is marker-gated and best-effort, so removing it affects nothing legacy and breaks no submission path.
- Partial rollback is safe: the envelope tables and the on-ramp wiring are independent; either can be reverted alone.
- Any `processing_cases`/`processing_case_sources` rows created during testing are POS-owned and removed with the table drop; no source/record data is touched.

## "Must not happen" list

- **Must not** copy source data or canonical record truth onto the Processing Case or its source junction.
- **Must not** add review, resolution, outcome, matched-record-linkage, or confidence **state** in FP1.
- **Must not** build any UI, BOS integration, Outcome Engine, or auto-execution.
- **Must not** auto-create cases for **legacy / non-POS-connected** sources.
- **Must not** let on-ramp (case-creation) failure block or fail a form/packet submission.
- **Must not** create more than one primary source per case.
- **Must not** add a cross-table FK from `source_id` into source tables, or any cascade that could delete source records.
- **Must not** extend `form_packet_sessions` (or any source table) to act as the case — no parallel/packet-coupled runtime.
- **Must not** alter any existing table (additive migration only).
- **Must not** touch legacy forms beyond FP0.

## What is explicitly out of scope

Processing Workspace and Processing Case UI (POS-A03 P1/P2); Review surface (P3); Linkage/Resolution and matched-record state (P4); Outcome recipes/sequencer/engine and executor wiring (P5); BOS participation (P6); additional source on-ramps — upload-as-case, email attachment, import, recreated document (P7); document AI extraction/OCR; auto-execution; confidence-threshold storage; lifecycle transitions beyond setting `received`; `status_definitions` alignment for cases. FP1 is the envelope + source model + the POS-connected form/packet on-ramp, and nothing more.

## Position in the roadmap

FP1 is **POS-A03 P0→P1 boundary / POS-F03 step 2** — the Processing Case envelope that FP0's registry binding and every later surface depend on. It is the first package that requires storage, and it is deliberately the thinnest record that can host the rest of POS without becoming a parallel platform.
