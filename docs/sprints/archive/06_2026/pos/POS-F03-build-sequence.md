# POS-F03 — Build Sequence

> **Status:** Foundation Gate artifact — conceptual sequencing. Draft.
> **No tickets, code, schema, migrations, APIs, or package plans.** This recommends *what to build first, second, and what to defer*, aligned to the POS-A03 roadmap.
> **Immutable inputs:** POS-A03 (roadmap), POS-F01 (foundation analysis), POS-F02 (processing case foundation), and all frozen product/architecture/visual artifacts.
> Branch: `pos-planning-v1`. Companions: **POS-F01**, **POS-F02**.

## Purpose

Translate the foundation analysis into a **build order**: the smallest first move that unlocks the most reuse, the second moves that compose existing systems, and the work that should be deferred because it is the most net-new or depends on unresolved convergence. This order **aligns with POS-A03's P0–P7 phases**; it does not introduce a different plan.

## Sequencing rule (carried from POS-A01/A03)

Build the **shared-model binding and the Processing Case envelope first**, then the reuse-heavy surfaces (Workspace → Review → Linkage), then the outcome sequencer, then BOS participation, and defer the most net-new work (additional source on-ramps, document AI extraction, automation) to last. Earlier = more reuse; later = more new.

## Build first (the unlock)

These are the minimum that make everything after them reuse rather than invention.

### 1. Unified-model binding (POS-F01 Foundation 1) — *first because everything renders/binds here*
- Establish that POS surfaces and POS extracted fields use the existing `field_definitions` registry + Layout Runtime, and confirm the **forms↔field-registry convergence** path (POS-F01 Risk 2). This is foundational because the Processing Workspace, Processing Case, Review, and outcome promotion all depend on it.
- Why first: it is the deepest dependency and the locked centerpiece decision; building case surfaces before this risks a parallel field model.

### 2. Processing Case envelope + lifecycle (POS-F02) — *the spine*
- The thin envelope generalizing the packet-session pattern: source references, the POS lifecycle, extraction/match/resolution/outcome slots, history. Multi-source (primary + related) is part of the envelope's concept from the start.
- Why first: POS-A03 P0; nothing else exists without a case to hold the work.

### 3. First Source on-ramp (forms / packets) — *prove convergence with the cheapest sources*
- Reuse existing forms/packet capture; the on-ramp wraps a submission/session as Source evidence on a case.
- Why first: forms/packets are already captured, so this on-ramp is the least new while proving the envelope end-to-end.

**Exit (aligns to POS-A03 Foundation Gate):** a Processing Case can be opened from a form/packet source, references it, binds extracted values to `field_definitions`, and moves through its lifecycle. The open decisions (already locked here: approval-only, multi-source, confidence tiers, vocabulary, documents boundary) are settled.

## Build second (compose the reuse-heavy surfaces)

In dependency order; each is predominantly reuse.

### 4. Processing Workspace (POS-A03 P1)
- Render the Processing queue through the Work Unit Workspace + queue record renderer, with the Actions → Telemetry → BOS command rail (POS-12/13).
- Depends on: the envelope (something to render).

### 5. Processing Case surface (POS-A03 P2)
- The case view via drawer overview composition + the Action Workspace flow (Gather → Review → Execute → Continue), document opened as evidence in a drawer (POS-13 hierarchy: Case → Outcome → Evidence).
- Depends on: the envelope + unified-model binding.

### 6. Review (POS-A03 P3)
- Generalize the packet review console/rollup into the POS Review surface across sources; record impact + missing-info presentation.
- Depends on: the case surface.

### 7. Linkage & Resolution (POS-A03 P4)
- Generalize the intake/linkage flow into Match/Resolution across family/person/child/customer/provider, resolving to canonical CRM records.
- Depends on: Review (resolve what review surfaces).

### 8. Outcome Engine (POS-A03 P5)
- The thin outcome sequencer + approval gate over existing executors (`executeAdminAction`, `emitEvent`/`executeWorkflowRun`, Communications enqueue, Documents generation), idempotent, preflight-guarded, approval-only; outcome-recipe configuration as a Settings V2 surface (POS-13 Outcome Configuration).
- Depends on: resolved cases to act on; reuses the entire execution spine.

### 9. BOS Integration (POS-A03 P6)
- Wire BOS capabilities across the lifecycle (extraction, classification, matching, review assistance, outcome preparation) into the right rail as proposals, using frozen BOS identity primitives.
- Depends on: outcomes existing to prepare; reuses the capability registry + Action Workspace pattern.

## Defer (most net-new or convergence-dependent)

Deferred because each is the most invention-heavy or depends on work that should mature first.

- **Additional source on-ramps** — email attachment, upload-as-case, imported file, recreated document (POS-A03 P7). Forms/packets prove the pattern first; these broaden it.
- **Document AI extraction (OCR)** — the only sizeable net-new capability; platform AI expansion is currently paused, and V1 leans on mapped (forms/packets) and manual/assisted (documents) extraction. Defer to P7.
- **Auto-execution** — not in V1 (locked approval-only). The foundation supports it later without rework; build only when product approves.
- **Field-level confidence overrides** — the future tier of the confidence model (POS-F02); platform/org/recipe tiers come first.
- **Deep forms↔field-registry convergence** beyond what POS needs — track as a platform dependency (POS-F01 Risk 2); POS should not deepen the fork, but full convergence is a broader effort than POS V1.

## Alignment to POS-A03

| POS-F03 step | POS-A03 phase | Gate (POS-06) |
|--------------|---------------|---------------|
| 1 Unified-model binding | P0 Foundation | Foundation Gate |
| 2 Processing Case envelope | P0 Foundation | Foundation Gate |
| 3 First source on-ramp (forms/packets) | P0 Foundation | Foundation Gate |
| 4 Processing Workspace | P1 | Workspace Gate |
| 5 Processing Case surface | P2 | Workspace Gate |
| 6 Review | P3 | Review Gate |
| 7 Linkage & Resolution | P4 | Review Gate |
| 8 Outcome Engine | P5 | (pre-BOS) |
| 9 BOS Integration | P6 | BOS Gate |
| Deferred (on-ramps, OCR, auto-exec, field-level confidence) | P7 | Final QA Gate |

This is the POS-A03 sequence, refined with the foundation specifics — not a competing plan.

## Dependencies (critical path)

```
Unified-model binding ─▶ Processing Case envelope ─▶ first on-ramp (forms/packets)
        │                          │
        ▼                          ▼
  Processing Workspace ─▶ Processing Case surface ─▶ Review ─▶ Linkage/Resolution ─▶ Outcome Engine ─▶ BOS Integration
                                                                                                  │
                                                                                                  ▼
                                                                            Deferred: more on-ramps · OCR · auto-exec · field-level confidence
```

- **Unified-model binding gates everything** (shared data model is the locked foundation).
- **Outcome Engine gates BOS** (BOS prepares outcomes that must exist).
- **Deferred work depends on the spine + BOS** and is intentionally last.

## Build-sequence verdict

The order is **reuse-first and dependency-clean**: a small first unlock (shared-model binding + envelope + the cheapest on-ramp), reuse-heavy surfaces second, the thin outcome sequencer and BOS participation next, and the genuinely new work deferred. It matches POS-A03 exactly. With POS-F01/F02/F03 accepted, **POS is ready to advance to Package Planning and Execution Design**, beginning with the unified-model binding and the Processing Case envelope.
