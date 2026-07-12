# POS-A03 — Implementation Roadmap

> **Status:** Architecture Gate artifact — planning only. Draft.
> **No tickets, no code, no schema, no migrations, no APIs.** Phases, gates, dependencies, and sequencing for future execution.
> Inherits POS-01/02/03/05/06/13 (immutable), **POS-A01** (assessment), **POS-A02** (foundation). Implementation detail belongs to the Foundation Gate and the package planning that follows it.
> Branch: `pos-planning-v1`.

## Purpose

Define the **order** in which POS is built and the **gates** that govern progression, so execution can later be planned package-by-package (POS-06) without re-litigating architecture. The roadmap is reuse-first: early phases are integration-shaped because most capability already exists (POS-A02).

## Sequencing principle

Build the **spine before the surfaces, surfaces before review, review before resolution, resolution before outcomes, outcomes before BOS preparation, and net-new automation last.** Each phase composes existing systems first and adds only the thin new pieces POS-A02 identified.

## Phase overview

| Phase | Builds | Mostly | Named gate (POS-06) |
|-------|--------|--------|---------------------|
| **P0 — Foundation** | Processing Case envelope + lifecycle; first Source on-ramp (forms/packets) | New (thin) + reuse | **Foundation Gate** |
| **P1 — Processing Workspace** | Processing queue via Work Unit Workspace + queue runtime | Reuse | **Workspace Gate** |
| **P2 — Processing Case surface** | Case view via drawer composition + Action Workspace flow | Reuse | (Workspace Gate cont.) |
| **P3 — Review** | POS Review surface generalized from packet review | Reuse + generalize | **Review Gate** |
| **P4 — Linkage & Resolution** | Match/Resolution generalized from intake/linkage | Reuse + generalize | (Review Gate cont.) |
| **P5 — Outcome Engine** | Sequencer + approval gate over existing executors | New (glue) + reuse | (pre-BOS) |
| **P6 — BOS Integration** | BOS capabilities in the rail (extract/match/recommend/prepare) | Reuse | **BOS Gate** |
| **P7 — Advanced Automation** | More source on-ramps; document AI extraction; auto-execute (if approved) | New (deferrable) | **Final QA Gate** |

## Phases in detail

### P0 — Foundation
- **Goal:** the Processing Case exists operationally and can be opened from a form/packet source.
- **Build:** the Processing Case envelope + POS lifecycle (Received → Archived); source-reference model (case points at `form_submissions`/`form_packet_sessions` as evidence); the first **Source on-ramp** wrapping existing forms/packet capture.
- **Reuse:** forms/packet engine, the packet-session precedent.
- **Exit (Foundation Gate):** a Processing Case can be created from a form/packet source, holds references and lifecycle, and persists — with the open Foundation-Gate decisions resolved (auto-execute V1, multi-source consolidation rules, confidence thresholds, intake-rename scope). Real toolchain validation host-side.

### P1 — Processing Workspace
- **Goal:** operators see and triage Processing Cases as a Work Unit.
- **Build:** the Processing queue rendered through `WorkUnitWorkspace` + the queue record renderer; Header→Queue two-zone layout; command rail (Actions → Telemetry → BOS) per POS-12/13.
- **Reuse:** Layout Runtime, Work Unit Workspace, command rail.
- **Exit (Workspace Gate):** the Processing Workspace matches POS-13 and reads as an Alloy work unit.

### P2 — Processing Case surface
- **Goal:** opening a case feels like a Drawer + Action Workspace, hierarchy Case → Proposed Outcome → Supporting Evidence (POS-13).
- **Build:** the case view via drawer overview composition + the Action Workspace step flow (Gather→Review→Execute→Continue), with the source document opened in a drawer as evidence.
- **Reuse:** drawer composition, Action Workspace.
- **Exit:** the case surface matches POS-13; document is evidence, not hero. (Folds into Workspace Gate acceptance.)

### P3 — Review
- **Goal:** completed sources can be reviewed and approved.
- **Build:** the POS **Review** surface generalized from the packet review console/rollup to all source kinds; record-impact and missing-info presentation.
- **Reuse:** packet review rollup, operator review states.
- **Exit (Review Gate, part 1):** review works across form/packet/upload sources.

### P4 — Linkage & Resolution
- **Goal:** ambiguity is resolved against canonical records.
- **Build:** **Match** (candidate links + evidence) and **Resolution** (confirm / create new / request info / reject / defer), generalized from the intake/linkage flow across family/person/child/customer/provider.
- **Reuse:** intake/linkage operator flow, CRM record resolution.
- **Exit (Review Gate, part 2):** linkage/resolution works across sources; confirming a match yields a CRM-owned record.

### P5 — Outcome Engine
- **Goal:** an approved case executes its outcome recipe.
- **Build:** the **outcome sequencer + approval gate** — resolve recipe steps to existing executors (`executeAdminAction`, `emitEvent`/`executeWorkflowRun`, Communications enqueue, document generation), sequence them, gate on operator approval, run idempotently with preflight; record Operational Results; open the created record drawer (`onCreated`). Outcome-recipe **configuration** as a Settings V2 surface (POS-13 Outcome Configuration).
- **Reuse:** the entire execution spine; preflight; idempotency precedent; Settings V2 chrome.
- **Exit:** an approved subsidy/enrollment case produces real records/workflows/communications/documents through the spine, gated by approval.

### P6 — BOS Integration
- **Goal:** BOS prepares the work in the rail.
- **Build:** wire BOS capabilities — extraction (suggestions + confidence), classification, matching recommendations, review assistance, outcome preparation (recipe + readiness + impact) — into the right rail as proposals, using frozen BOS identity primitives.
- **Reuse:** BOS capability registry, identity primitives, Action Workspace suggestion pattern.
- **Exit (BOS Gate):** BOS recommends across extraction/matching/recommendation/outcome-prep; operators approve; no silent execution; rail-only.

### P7 — Advanced Automation
- **Goal:** broaden sources and add the net-new capability.
- **Build:** additional **Source on-ramps** (email attachment, upload-as-case, import, recreated document); **document AI extraction (OCR)**; **auto-execute** within approved recipes *if* the V1 decision approves it.
- **Reuse:** Communications (attachments), Documents (uploads); BOS registry (extraction).
- **Exit (Final QA Gate):** full program ready for a real gate; host-side `vitest` / `npm run build` / DB reset / regression.

## Dependencies

```
P0 Foundation
   ├─▶ P1 Processing Workspace ──▶ P2 Processing Case surface
   │                                   │
   │                                   ▼
   └─────────────────────────────▶ P3 Review ──▶ P4 Linkage & Resolution
                                                       │
                                                       ▼
                                                  P5 Outcome Engine ──▶ P6 BOS Integration ──▶ P7 Advanced Automation
```

- **P0 blocks everything** (the spine must exist).
- **P1/P2** depend on P0 (need a case to render).
- **P3** depends on P2 (review acts on a case surface); **P4** depends on P3 (resolve what review surfaces).
- **P5** depends on P4 (outcomes act on resolved cases) and on the execution spine (already present).
- **P6** depends on P5 (BOS prepares outcomes that must exist to prepare).
- **P7** depends on P5/P6 (more sources and extraction flow into the same case + outcome path).
- **Cross-cutting:** every phase inherits POS-13 visual direction and the frozen ownership boundaries (POS-A01 Decision 3); none may contradict POS-01/02/03/05.

## Gate map (to POS-06)

| POS-06 gate | Satisfied by |
|-------------|--------------|
| Doctrine Gate | POS-01…03, 05, 06 (already accepted) |
| UX Gate | POS-04/07/08/10/12/13 (already accepted) |
| **Architecture Gate** | **POS-A01/A02/A03 (this package)** |
| Foundation Gate | P0 exit + open decisions resolved |
| Workspace Gate | P1 + P2 exit |
| Review Gate | P3 + P4 exit |
| BOS Gate | P6 exit |
| Final QA Gate | P7 exit + host-side full toolchain |

## Execution model (carried from POS-06)

Once a phase is accepted, execution proceeds **package-by-package without stopping after every package**: build → substitute/self-verification gate → fix → rerun → if the same failure survives 2 repair attempts, pause and escalate → if green, continue → report only at named gates unless blocked. Real `vitest` / `npm run build` / DB reset run host-side where the sandbox cannot. Doctrine does not change during implementation without escalation to the Doctrine Gate.

## Open decisions to resolve at the Foundation Gate

Carried from POS-11 / POS-A01 (not blockers to *entering* the Foundation Gate, but to be settled there):

1. **Auto-execute in V1** — approval-only, or auto-execute within approved recipes?
2. **Multi-source consolidation** — may one Processing Case hold multiple sources, and under what rules?
3. **Confidence thresholds** — values separating high-confidence / needs-review / needs-resolution.
4. **Intake-rename scope** — how far to retire "intake" vocabulary beneath POS language.
5. **Documents boundary / pillar placement** — confirmations from POS-11.

## Roadmap verdict

The sequence is reuse-first and dependency-clean: a thin Foundation unlocks reuse-heavy Workspace/Review/Linkage phases, a glue-shaped Outcome Engine, a rail-only BOS integration, and a deferred Advanced Automation phase for the genuinely new work. With POS-A01/A02 accepted, **POS is ready to enter the Foundation Gate and begin package planning** for P0.
