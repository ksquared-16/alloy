---
owner: engineering
status: sprint
last_reviewed: 2026-07-21
supersedes: []
---

# Phase 5 — Engineering Execution Portfolio

**Sprint:** `alloy-phase-5-product-realization` · **Slot:** 1 · **Branch:** `agent/claude/1-alloy-phase-5-product-realization`
**Baseline:** `origin/staging @ 1217f5c93` ("Runtime V1 closeout") · **Posture:** read-only reconciliation + planning. No implementation.

**Mandate:** the canonical engineering roadmap that completes Phase 5. Product frozen · Runtime frozen · Platform frozen.
This document determines **what remains to build, what already exists, what depends on what, and the optimal sequence.** It does not redesign Product, reopen Runtime, or begin implementation.

**Evidence basis:** every row is grounded in file+line reads on this baseline (six parallel capability audits, cross-checked). `VERIFIED` = read in code/doc on staging. `INFERRED` = reasoned from structure. Judgment is stated as maturity tiers, not percentages, per the mandate.

---

## 0. Two facts that frame everything below

**0.1 — The Runtime closeout is the spine.** `docs/runtime/runtime-v1-closeout.md` (`status: historical-record`) and `runtime-v1-known-limitations.md` (`status: ratified`) settle the shape of all remaining work: Runtime V1 is **frozen, certified, Enrollment-shaped infrastructure that is extended, never reopened.** Its own §9–10: *"the next work is product development on top of Runtime V1"* via four extension points — publish a Summary composition, extend the provisioning answer, add warm-first surfaces, add actions via config. The known-limitations doc explicitly names Scheduling/Attendance, Commercial/Programs, Director/cross-org, and "any product with a new card type" as **intentional V1 boundaries — future V2 pressure, not remaining work.** This portfolio builds on the extension points and does not touch the kernel.

**0.2 — The Product corpus is `proposed`, not `canonical` (governance flag, not a Product question).** All fourteen Product review docs — including the mission intake this portfolio realizes — carry `status: proposed` and read *"Awaiting approval."* The repo's own canonical governance defines `proposed` as *"Approved for consideration; **not current truth**"* (lifecycle `proposed → canonical`). The mission frame states Product is frozen; the repository's metadata does not yet agree. **I treat Product as frozen and reopen nothing** — but engineering is being asked to realize documents the repo marks not-current-truth, so **ratification (`proposed → canonical`) is a Wave-0 prerequisite** to citation integrity. This is a one-commit governance act, not a decision.

**Scope boundary this portfolio holds.** "Phase 5 — Product Realization" = the eight bounded missions **M1–M8** = realizing the Enrollment operator experience on Runtime V1 (the Product Constitution). Four adjacent frozen **platform** programs — Billing posting, Operational Expectations activation (P2–P8), Attendance UI, Operational Intelligence Phase 2 — are inventoried below (Deliverable 1 asks for the full capability picture) but are **held out of the Phase 5 completion waves** and marked *Beyond-Constitution*, because the mandate says *"do not solve future roadmap items; stay focused on delivering the existing Product Constitution."* If Phase 5 is meant to include them, that is Kelly's call to widen the scope — flagged, not assumed.

---

## Deliverable 1 — Capability Inventory

Maturity tiers: **Hardened** (production-quality, certified/used) · **Functional** (works, gaps remain) · **Substrate** (real infra, not yet a usable capability) · **Skeletal** (stub/absent).

| Capability | Product | Runtime realizes | Maturity | Customer-ready? | Remaining (headline) |
|---|---|---|---|---|---|
| **Runtime Kernel V1** (K1–K4) | ratified/canonical | — (is the runtime) | **Hardened** — certified | **Yes** | None — frozen. Only test-hygiene initiative |
| **Current Work + Focus Panel Summary commit** | frozen | Yes (commit lifecycle) | **Hardened** | **Yes** | None in-cluster |
| **Communications** (+ identity) | canonical | contract canonical | **Hardened** — sends SMS/email, identity-resolved | **Yes** | Deferred channels (inbound email, voice, Google/MS sync); provider/grant admin UX |
| **Processing** (identity · cases · operator review) | proposed¹ | complete | **Hardened** — + own cert stack | **Yes** | Product polish / hardening only |
| **Scheduling — Tours** | *no product doc* | — | **Functional** | **Yes** | Reminder template-render batch; retire `book` vs `book-v2` |
| **Commercial** (config + execution) | config **frozen** | preview path | **Functional — preview only** | Config: yes; truth: no | Wire resolution → financial truth; stale barrel comment |
| **BOS** (orchestration layer) | **proposed** | UI orchestration | **Functional** | Substrate: yes | Ratify doctrine; verify apply-policy enforcement at write sites |
| **Operational Intelligence / Metrics / KPI** | canonical | complete | **Functional** — hardened core | Core: yes | Phase-2 backlog: reports/dashboards/charts; enable disabled adapters |
| **Business Processes** | canonical | lifecycle engine | **Functional** — Enrollment only | Enrollment, after M3 | Generic engine unproven on 2nd template; legacy-compat debt |
| **Stages · Membership · Outcomes/Transitions** | canonical | Yes (persisted) | **Functional** — new path hardened, legacy live | Partial | M1-C: migrate to `outgoing_transitions`, kill raw-destination fallback; M1-B grain converge |
| **Actions / helpful_actions** | canonical | partial | **Functional — dual authority** | **No** — disabled-action leak | M1-A: single availability gate honored by runtime |
| **Billing / Financials** | domain **frozen** | P3.1–P3.3 built | **Functional — preview only** | **No** — cannot post | Posting engine (invoices/AR/payments/ledger); legacy-substrate migration |
| **Configuration ownership / inheritance** | canonical | complete | **Functional** — scaffold | Partial | Register apply providers (8 domains); replace stubbed health |
| **Operational Consumption** | canonical ("V1 complete") | library | **Functional** | Simulate only | D12b: wire reactor to real facts |
| **Attendance** | canonical | — | **Substrate** — backend only, **no UI** | **No** | Entire operator UI; staff-scheduling data source |
| **Configuration Certification (M2)** | proposed | — | **Substrate** — single `not_assessed` enum | **No** — trust defect open | 5-level engine (L1–L4 compute + publish gate + L5 evidence) |
| **Child Attention (M4)** | proposed | mechanism only | **Substrate** — vehicle, not behavior | **No** — pilot gate | Name the child in requirements/blockers/actions; grain (needs M1-B) |
| **Modes & Frame (M5)** | proposed | two-mode + Frame plumbing | **Substrate/Functional** | Partial | Restore Summary as a mode; honest Activity; surface Frame |
| **Number Provenance (M6)** | proposed | — | **Skeletal** — no source-class descriptor | **No** | Provenance descriptor + cross-surface count-author/parity |
| **Operational Expectations** | corpus **frozen**; P1 cert canonical | P0/P1 certified | **Substrate — dormant** (flag OFF, no surface) | **No** | P5 operator surface + flag-on; P2 config; P3 engine |
| **Operational Calculations** | canonical | — | **Substrate** — registry, no consumers | **No** | Families; `oip`-handler convergence; migrate a real consumer |
| **Automation Platform (M1-D)** | ruled (in proposed doc); *no canonical doc* | — | **Skeletal** — 1 file, disabled UI button | **No** | The platform itself + non-stub authoring UI; reconcile stage-outcome automation |
| **Reporting / Dashboards** | byproduct doctrine | — | **Skeletal** — not built | **No** | Report/dashboard/portal surfaces (OIP Phase 2) |
| **M7 Certification Environment** | proposed | — | **Substrate — processing-only** | **No** | Generalize harness; **invalid-config corpus** (makes M2 provable); fail-loud gating |

¹ Processing docs carry no explicit product-status; INFERRED proposed. Frozen platform status shown in **bold**.

**Reading the inventory:** the operator *surface* Alloy already ships — Runtime, Current Work, Communications, Processing, Tours, Commercial config — is **Hardened**. What is missing is, in the Product Office's words, *"the product's ability to tell the truth about itself"*: which authority governs (M1), whether a configuration works (M2), which child is acted on (M4), why the panel looks like this (M5), and what a number counts (M6) — plus the environment that can prove any of it (M7).

---

## Deliverable 2 — Remaining Engineering (only what remains)

Classified: **Missing** (unbuilt) · **Incomplete** (built, gap remains) · **Debt** (works, needs cleanup) · **Polish** (product refinement) · **Hardening** (customer-readiness).

### The Phase-5 Constitution missions (M1–M8)

**M1 · Authority Convergence** — *the engine exists; this is migration + enforcement + data-repair, not invention.*
- M1-A action availability: **Incomplete** — build one Process-Action availability gate honored by the runtime Current Work fallback (`buildCurrentWorkSurfaceVM.ts:416-428` leaks OFF actions); **Missing** inventory/migration of templates referencing disabled actions.
- M1-B stage grain: **Missing** — converge `StageGrain` ≡ `journey_segment` (two independent authorities, no equality check today). *Blocks M4.*
- M1-C movement: **Incomplete** — migrate all plans to `outgoing_transitions` and remove the raw-destination fallback in `resolveOutgoingProcessTransitions.ts` (blocking validation already makes dangling targets unauthorable on the new path); **Missing (data)** repair dangling `qualification`/`closed_lost` targets.
- M1-D automation: **Missing** — the canonical Automation Platform + non-stub authoring UI; **Polish** reconcile existing process-owned stage-outcome automation against platform ownership.

**M2 · Configuration Certification** — **Missing:** the 5-level engine (L1–L4 compute, L2/L4 publish-block, L3 advisory, object-named remediation, L5 evidence intake), replacing the single `not_assessed` health enum. **Incomplete:** generalize the working `layoutIntegrityValidator` (a real L2 nucleus) beyond layouts. **Debt:** retire Locations' self-issued "certification" prose into the leveled model (it currently violates "L5 may never be self-issued"). *Depends on M1 + M7.*

**M3 · Reference Enrollment Repair** — **Missing (data, not code):** repair the reference tenant so Lead→Tour→…→Enrolled executes with no stale `qualification` and coherent multi-child records. Unblocks the demo; fixes nothing structural.

**M4 · Child Attention Expression** — **Missing:** child as a first-class grain named in requirements, blockers, and actions before execution; siblings-as-secondary-context; batch/multi-child explicit subject resolution. **Incomplete:** operator-visible out-of-scope-Attention copy (only a `data-` attribute today). *Vehicle exists (SUBJECT-scope attention, children roster commit-critical); behavior does not. Depends on M1-B. Pilot gate.*

**M5 · Modes & Frame** — **Missing:** restore Summary as a distinct ambient-understanding mode (today the `summary` key is relabeled "Work"; two-mode switch). **Incomplete/Hardening:** replace the raw "Could not load the opportunity drawer" Activity error with honest failure. **Polish:** surface the Frame to the operator ("why am I here") — it already has structural effect via per-view composition. *GA, not gating.*

**M6 · Number Provenance** — **Missing:** a provenance descriptor every operational number carries (cohort · grain · window · source-class · enterability · destination-parity · zero-meaning) and a cross-surface count-author enforcing `count === rows.length`. No `sourceClass`-type exists anywhere today; numbers come from uncoordinated engines. The OIP drill layer has partial destination-parity for analytics tiles only. *Demo subset then GA.*

**M7 · Certification Environment** — **Incomplete:** generalize the working Processing cert stack (`scripts/processing/processingIdentityCertStack.sh`, isolated ports 55320–55432) into a general harness. **Missing:** the **intentionally-invalid-configuration corpus** — the property that makes M2 provable, absent from every fixture set. **Debt:** commit a `config.toml` convention/generator so the isolated stack reproduces from a clean clone; make cert suites **fail loudly when the environment is absent** rather than `skipIf`-skip green (a live reporting hazard). *Gates every completion claim; blocks no build.*

**M8 · Doctrine Reconciliation** — **Missing:** reconcile durable review conclusions into existing canonical owners (no parallel tree); retire dead configuration copy. Depends on ratification (0.2).

### Beyond-Constitution platform programs (inventoried, not in Phase-5 waves)

- **Billing posting** — **Missing:** invoices, AR, payments, ledger/GL writes, split/subsidy, cadence/proration (all deferred by frozen doctrine); the Commercial-resolution → financial-truth wire. **Debt:** legacy `charges`/`payments` vs the frozen domain.
- **Operational Expectations activation** — **Missing:** P5 operator surface + flag-on path; P2 configuration; P3 keystone engine (shadow → authoritative billing parity, gate G-Parity); P4–P8. **Debt:** the never-taken P1 public-interface freeze and its open cancellation/replacement resolver.
- **Attendance UI** — **Missing:** the entire operator surface over the functional backend; a staff-scheduling capability (its absence structurally blocks compliance).
- **Operational Intelligence Phase 2** — **Missing:** report/dashboard/chart surfaces, snapshot scheduler. **Incomplete:** enable `lead_count`/`tour_completed_count`/`pipeline_value` adapters. **Debt:** two competing calculation registries; KPI targets → dedicated table.

---

## Deliverable 3 — Dependency Graph

```
                     ┌──────────────────────────────────────────────┐
   RATIFY (0.2) ────►│  proposed → canonical  (one commit, blocks    │
                     │  citation integrity for every mission below)  │
                     └──────────────────────────────────────────────┘
                                        │
        ┌───────────────────────────────┼───────────────────────────────┐
        ▼                               ▼                               ▼
   ┌─────────┐                    ┌───────────┐                   ┌──────────┐
   │  M7     │  gates PROOF of ── │    M3     │ unblocks demo     │   M8     │ independent
   │ cert env│  every mission     │ tenant fix│ (data only)       │ doctrine │
   └─────────┘                    └───────────┘                   └──────────┘
        │ (proof, not build)
        │
   ┌────┴───────────────── M1 (longest lead) ──────────────────┐
   │  M1-C ─ migrate+fallback-removal+data   (movement)        │
   │  M1-A ─ single availability gate         (actions)        │
   │  M1-B ─ grain ≡ journey_segment ─────────┐ (grain)        │
   │  M1-D ─ Automation Platform + UI          │               │
   └───────────────┬───────────────────────────┼───────────────┘
                   ▼                            ▼
              ┌─────────┐                  ┌─────────┐
              │   M2    │ needs M1+M7      │   M4    │ needs M1-B; ⟂ M5
              │ cert eng│                  │ child   │ PILOT GATE
              └─────────┘                  └─────────┘
                   │                            │
                   └───────────┬────────────────┘
                               ▼
              ┌───────────┐  ┌───────────┐  (both independent, GA)
              │    M5     │  │    M6     │
              │ modes/frame│  │ provenance│
              └───────────┘  └───────────┘
```

**Hard edges (prerequisites):** ratify → all · **M1-B → M4** · **M1 → M2** · **M7 → any completion *claim*** (not any build).
**Parallelizable:** M7 ∥ M3 ∥ M8 ∥ M1 (all start now); M4 ∥ M5 (independent — do not collapse); M6 ∥ everything.
**Blocking / longest-lead:** **M1** (decompose A/B/C/D; C highest value, B gates M4). **M2** waits on M1 (M1 retires three of M2's check categories — building them first is waste).
**Critical path to a safe pilot:** ratify → M7 + M1-B → M4, and M1(all) → M2. M4 and M1-C+M2 are the two deepest chains and should not share a slot.

---

## Deliverable 4 — Engineering Execution Waves

Waves replace Product missions with engineering-sequenced work. Each is dependency-ordered to minimize total time while preserving Runtime/Product integrity.

### Wave 0 — Ground Truth (blocking, cheap, no product code)
- **Objective:** a clean baseline that can prove anything, and a citable Product corpus.
- **Work:** ratify Product docs `proposed → canonical` (0.2); **M7** — generalize the Processing cert stack into a general certification environment *with an invalid-config corpus*, commit the `config.toml` convention, make cert fail-loud; **M3** — reference-tenant data repair.
- **Dependencies:** none.
- **Outcome:** every later wave can be certified by execution, not inspection; the demo journey is reachable.

### Wave 1 — Enrollment Authority Convergence (the leverage)
- **Objective:** one authority per concern; disabled = gone everywhere; dangling targets unauthorable.
- **Work:** **M1-C** (migrate to `outgoing_transitions`, remove raw-destination fallback, repair targets); **M1-A** (single Process-Action availability gate honored by the runtime); **M1-B** (converge grain ≡ journey_segment — unblocks M4); **M1-D** (Automation Platform + authoring UI).
- **Dependencies:** Wave 0 (M7 to certify, ratified docs).
- **Outcome:** the Enrollment engine tells the truth about which surface governs. Retires three M2 check categories before they are built.

### Wave 2 — Safe Production Pilot (the gates)
- **Objective:** an administrator can configure a journey, be told truthfully whether it works, and operate it for one named child.
- **Work:** **M2** (5-level certification engine + publish gating, replacing single "Healthy"; fold Locations into leveled cert); **M4** (child named in requirements/blockers/actions; siblings-as-context; out-of-scope copy).
- **Dependencies:** Wave 1 (M1 all; M1-B for M4), Wave 0 (M7 invalid configs).
- **Outcome:** the two pilot gates — configuration certification and child-attention safety — pass on executed evidence.

### Wave 3 — Universal Panel & Honest Numbers (GA surfaces)
- **Objective:** the panel is universal in behavior and every number is honest.
- **Work:** **M5** (restore Summary mode; honest Activity; surface Frame); **M6** (provenance descriptor + cross-surface count-author/parity; enterability + zero-meaning); **M8** (doctrine reconciliation into existing owners).
- **Dependencies:** Wave 2 (shared panel/config surfaces stable). M5 ∥ M6 ∥ M8.
- **Outcome:** **Enrollment realized to GA on Runtime V1** — the Product Constitution delivered.

### Beyond Phase 5 — adjacent frozen programs (sequenced, not scheduled here)
Held out of the Phase-5 completion set per the mandate. Listed in dependency order for when Kelly authorizes them: **Wave 4** Financial Truth (Billing posting + Commercial→truth wire + Consumption D12b) · **Wave 5** Operational Expectations Activation (take P1 freeze → P2 config → P3 keystone/G-Parity → P5 surface) · **Wave 6** Attendance & Scheduling product (staff scheduling → attendance UI → job-schedule adminV2 migration; *first genuine Runtime-V2 pressure test — build on V1 extension points first*) · **Wave 7** Operational Intelligence product (OIP Phase 2 reports/charts; Operational Calculations consumers).

---

## Deliverable 5 — Phase 5 Roadmap

| Wave | Scope (engineering size) | Order | Success criteria | Release |
|---|---|---|---|---|
| **0 · Ground Truth** | Small–Medium. Ratify (1 commit); generalize an existing cert stack; data repair | **First — unblocks all** | Cert env reproduces from clean clone with valid **and invalid** configs; suites fail-loud when absent; reference journey Lead→Enrolled executes | enables **A** |
| **1 · Authority Convergence** | Large. M1 is the deepest mission; A/B/C/D decomposed | After 0 | Disabling a capability removes it from every surface; no plan can author a dangling target or a grain≠journey stage; automation authored in one place | toward **B** |
| **2 · Safe Pilot** | Large. Cert engine + child-safety, both executed-evidence gated | After 1 (+0) | Config returns a truthful level (not "Healthy"); L2/L4 block publish; operator names the child for every blocker/action in a two-child household — proven on M7 | **B — Safe Pilot** |
| **3 · Universal Panel & Numbers** | Medium–Large. M5 ∥ M6 ∥ M8 | After 2 | Same panel entered with two intents leads differently; Summary + honest Activity present; every visible number declares its source and no number offers a destination it can't reproduce; doctrine matches product | **C — GA** |

**Release mapping (from the Product completion plan, unchanged):** Wave 0 + M3 + M6-demo → **Release A** *"Alloy runs the enrollment journey."* Waves 1–2 → **Release B** *"A director can configure and operate enrollment safely."* Wave 3 → **Release C** *"Alloy is an operational execution product for enrollment."*

```
Wave 0 ─ Ground Truth ─────────────► Release A (demo)
Wave 1 ─ Authority Convergence ────┐
Wave 2 ─ Safe Pilot ───────────────┴► Release B (safe pilot)
Wave 3 ─ Universal Panel & Numbers ─► Release C (GA)
                                          │
                                          ▼
                          ══════════════════════════════════
                             ALLOY PRODUCT REALIZATION COMPLETE
                               (Enrollment, the Product Constitution,
                                realized to GA on Runtime V1)
                          ══════════════════════════════════
```

*Beyond this line — Billing posting, Operational Expectations activation, Attendance, Operational Intelligence Phase 2 — are frozen adjacent platform programs, sequenced above but outside the Phase-5 Product Constitution. They begin only on explicit authorization.*

---

## What this portfolio preserves

Every constitutional decision (nothing above reopens one) · the Runtime kernel (extended via its four published extension points, never touched) · the protected invariants (Laws 7/8 continuity untouched until M4/M5, which the missions already gate) · and the completed platform work (OE P0/P1 certified, Commercial config frozen, Processing hardened — none reopened). **No new architecture, no new product concept.** Engineering realization only.

**Reconciliation complete. No implementation begun. Awaiting review.**
