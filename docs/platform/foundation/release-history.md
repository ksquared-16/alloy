---
owner: platform
status: canonical
last_reviewed: 2026-08-11
supersedes: []
---

# Release history

**Status:** Canonical platform milestones (July 2026 stabilization rebaseline). **Not** a commit or sprint task log.

> **Reconciliation note (2026-07, Operational Expansion Wave 1 freeze).** This history predates the operational truth-flow backend. Recorded here for completeness: the **L1–L4 operational spine** (config rules; effective-dated agreements/placements/schedule assignments; immutable attendance facts; expected/actual occupancy & staffing read models) and the **L4→L5 Operational Consumption runtime** (Consumption Events → Resolved Obligations → draft Charges, Slices 1–4) shipped as flag-gated/simulator backend across June–July 2026. The frozen architecture governing their productization is [`../rfcs/operational-expansion-phase1.md`](../rfcs/operational-expansion-phase1.md); its first delivery step is defined in `../../sprints/archive/06_2026/operational-expansion/wave1-implementation-spec.md` (historical: `../../sprints/archive/06_2026/operational-expansion/wave1-implementation-spec.md`).

---

## 2026 H1 — Platform maturation

### August 2026 — EPP / Waitlist runtime convergence (PR #404)

**Shipped to `staging` (PR #404).** Waitlist child-grain operational surface, published Work View label authority, shell stability across grains, placement Adjust UX, stage-entry time-in-stage, stage-move Activity hydration, Household **Copy from primary**, and Work View Save vs **Apply changes** publication path. Known follow-up: wire `resolveProfilePhotosForActor` into opportunity child evidence so profile photos stick after refresh (see `../../sprints/archive/future/identity_profile_photo_projection_everywhere.md`). Closeout: `../../sprints/archive/08_2026/epp-waitlist-runtime-convergence-closeout.md`.

### July 2026 — Commands architecture + product-boundary correction

**Local mission delivery (Slot 1 Commands); not yet merged to staging.** Capability Registry, Command Runtime, domain adapters, destructive safety, `command_set_v1`, and BOS Command Runtime Convergence are retained. A standalone **operator-facing Organization Commands configuration product was rejected**. **Surfaces do not configure Commands** — Business Process `command_set_v1` owns process selection. BOS is a preparation/placement over the shared Runtime bridge (`executePlatformCommandViaActionsApi`); representative families proven. Frozen closeout: `platform/milestones/bos-command-runtime-convergence-closeout.md`. `/organization/commands` remains **internal capability diagnostics** only. Normal Operations sequence is **Automation → Business Processes → Surfaces**.

### July 2026 — Documentation Platform v1.0

**Shipped to `staging`.** Canonical documentation architecture, Platform Handbook, governed frontmatter, docs-lint/CI, history separation (sprints/audits/archive), curation, repository certification, and the **Platform Decisions** register. Documentation is treated as production infrastructure; no further broad documentation reorganization is planned. Active doctrine remains clean; historical sprint/archive link debt stays intentionally baselined.

- Handbook: `platform/foundation/alloy-platform-handbook.md`
- Decisions: `platform/foundation/platform-decisions.md`
- Governance: `platform/governance/documentation-governance.md`
- Certification: `platform/milestones/documentation-rebaseline-v2-certification.md`

### July 2026 — Operational Expansion Wave 1 (fact & correction-aware consumption contracts)

**Shipped to `staging`** — PR #181, merge `9333379a9`. The first delivery step of the frozen operational-expansion architecture ([`../rfcs/operational-expansion-phase1.md`](../rfcs/operational-expansion-phase1.md)): the runtime **contracts** for operational facts and correction-aware consumption. No operator surface, no Posting, no automatic fact→consumption wiring.

- **D2 — Operational Fact contract (platform-generic)** — a domain-neutral fact contract + reusable conformance harness; `child_attendance_events` is the asserted **reference conformer** and was **not behaviorally changed**. **No universal `operational_facts` table** was introduced — per-domain authoritative fact stores conform to the contract.
- **D12a — correction-aware deterministic consumption** — correction identity on the fact DTO, correction/reversal interpretation, and an atomic reconciliation RPC; the consumption pipeline now handles correction, reversal, reparenting, supersession, chains, and replay.
- **DP-1 atomic reconciliation certified** — all correction writes execute all-or-nothing in one `SECURITY DEFINER` RPC (injected mid-reconcile fault → zero partial state).
- **DP-2 draft-consequence retirement & posted-artifact protection certified** — a superseded obligation's **draft** charge is retired in place (`draft → void`); posted charges are never mutated.
- **DP-3 source-fact idempotency certified** — the consumption event is anchored on the source fact's own identity (not on the corrected-fact reference); replay and two distinct corrections of one prior fact each remain correct and distinct.
- **DP-4 same-key reparenting & deterministic convergence certified** — reparent on same key, supersede on absent key; concurrent same-key corrections converge (one obligation, one draft charge, zero orphan draft charges).
- **D12b remains intentionally unimplemented** — no reactor and no fact-write subscriber; the pipeline is still invoked only by the consumption simulate path.

**Precise scope.** D2 is platform-generic. D12a establishes the correction-aware consumption protocol and proves it through the childcare financial consumer. Consumer-specific consequence persistence remains consumer-owned. Wave 1 is a **contract and protocol**, not a universal consumption engine.

**Deferred follow-ups** (recorded, not implemented) — see [`../../audits/active/operational-expansion-architecture-audit-2026-07.md`](../../audits/active/operational-expansion-architecture-audit-2026-07.md) §4: **F4/G10** consumption lineage uniqueness; **F5/G11** superseded obligation review-queue visibility.

### July 2026 — Processing Identity Resolution V1 (promotion candidate)

**Reconciled onto latest `origin/staging` and locally re-certified; awaiting PR merge to staging; not deployed.**

- Canonical identity normalization, org-scoped candidate generation, confidence bands, evidence signals, and conflict detection
- Durable Processing facts and resolution generations
- Registered semantic identity commands; no arbitrary table operations in plans
- Versioned immutable Commit Plans and approvals bound to exact version/content hash
- Deterministic executor with atomic identity RPC, stale-plan preflight, idempotent retry, compensation audit, and exceptions
- Operator review/correction/plan/approve/explicit-commit flow in Digital Mailroom
- Identity-review eligibility gate: plausible, ambiguous, or conflicted subjects block plan build, approval, and execution until explicit operator resolution (create-new override requires reason + rejected-candidate audit)
- Manual Create Lead and public lead-capture forms cut over to Processing; zero identity writes before approval
- D4/D5 direct-write replay and fallback authority retired
- Org-scoped RLS hardening, including authenticated `has_org_role` recursion fix

Local certification: fresh isolated migration replay, 17/17 database checks, integration scenarios including identity-review gate coverage, Processing + resolver tests on isolated serial execution, production/test typechecks, and production build.

### July 2026 — Operational Calculation Definition Registry V1 (promotion candidate)

**Locally certified; branch on `origin/staging` tip; awaiting PR merge to staging; not deployed.** The first engineering realization of the frozen Operational Calculations architecture (**architecture owned by** `../core/operational-calculations.md`; sprint constitution authored on the predecessor architecture branch and promoted separately). Establishes the registration substrate and the first reference family over existing resolvers — **changing no production behavior**.

- **Definition → Handler → Runtime → Result** — the four canonical layers as a dedicated platform module (`web/lib/operationalCalculations/`): a declarative Definition contract, a code-owned Handler abstraction (`{kind:"pure"|"oip"}`), a deterministic injected-clock Runtime, and a typed, family-shaped Result contract (non-scalar values; resolution states, never verdicts).
- **Canonical Operational Calculations Registry** — fail-closed key resolution (unknown key / unsupported handler throw); reuses the existing `@/lib/location/operationalResolutionContracts` primitives.
- **Resource Requirements & Capacity reference family** — four registered keys (`resource.required_staff`, `resource.ratio`, `capacity.room_binding`, `capacity.remaining`), each a thin adapter over the **already-authoritative** `resolveRatio` / `resolveOperationalCapacity`. No new math; `staffed` stays null (G3); beyond-range tier ⇒ `incomplete`, never a coerced number.

**Precise scope.** Additive, new files only — no existing source modified; the wrapped resolvers have zero production consumers. **Explicitly not included:** OIP-registry convergence (the existing metric registry remains transitional and untouched, no overlapping keys), consumer migration, persistence, events, Operational Expectations / judgments, APIs, configuration surfaces, and operator UI.

Local certification: 24 registry/runtime/family conformance tests; existing ratio & capacity resolver tests and the Phase-A canonical-contracts certification unchanged; production typecheck. A detailed realization record ships with the sprint branch under `docs/sprints/07_2026/operational-calculations-registry-v1/`.

**Documentation dependencies (recorded, not performed here):** the doctrine amendments elevating `../core/operational-calculations.md` to first-class-registry language, and any capability-inventory placement for a derived-truth registry, are governance decisions sequenced for the doctrine phase — not part of this reconciliation.

---

### July 2026 — Platform Stabilization Complete

**Initiative closed.** Foundational platform architecture is certified stable. Formal declaration: [`milestones/freeze-july-2026.md`](../milestones/freeze-july-2026.md). Constitutional doctrine: [`platform-manifesto.md`](../foundation/platform-manifesto.md).

- **Architecture completed** — Presentation, Surface Host, Focus Panel, VM, Business Process, Processing, Communications, Configuration, Current Work runtimes canonical
- **Legacy eliminated** — `AdminEntityDrawerLegacy` deleted; unsupported entities fail closed; Settings locations replace legacy drawer create
- **Performance improvements** — TypeScript split graphs; workspace orchestration; perceived performance (boot shell, Queue/Surface Hold, Work View + Focus Panel continuity)
- **Canonical runtime ownership** — single owner per responsibility; no dual-runtime code paths
- **Platform freeze** — no additional foundational runtime work under Platform Stabilization

**Final promotion merges:** #151 `bb720f495`, #156 `29fbcfb93`, #160 `e52e5fa2c`, #162 `51641dc44` (on staging base including #148 `e94811914`, #157 `c6e1adec8`, #159 `faa129ac9`).

- **Work Items V3 operational execution platform** — cross-record queue, creation runtime, BP/Processing/Communications virtual projections; no migrations

---

### July 2026 — Runtime Simplification & Platform Stabilization (detail)

**Major platform milestone.** Foundational runtimes are complete; duplicate legacy paths removed. See [`../milestones/stabilization-july-2026.md`](../milestones/stabilization-july-2026.md).

#### Architecture

- **Presentation Runtime** finalized — one tree: Workspace, Work Unit, Queue Region, Focus Panel, Right Rail (`c99e381f3`, PR #71 `12761a7f0`)
- **Surface Host** finalized — client-held surfaces exchange focus without route teardown (`3764e039a`, `e66c3de51`)
- **VM Runtime** canonical — Opportunity, Person, Child; permanent hard cutover; no kill-switch rollback
- **Focus Panel** canonical operator record surface (PR #95 `06202d599` — Current Work)
- **Business Processes** canonical — landing → stage queues → record focus
- **Processing** canonical — Digital Mailroom operational workspace (PR #123 `0e7845a3e`)
- **Communications** canonical — Command Center + identity platform (PR #132 `6e1f8e44d`, PR #147 `05441969a`)

#### Simplification

- **Legacy drawer removed** — `AdminEntityDrawerLegacy` deleted (PR #148 `e94811914`)
- **Legacy runtime removed** — VM-only `AdminEntityDrawer`; unsupported entities fail closed
- **Canonical operating surfaces** — Settings locations inline create (PR #144 `4c5821cce`); search → `/settings/locations?locationId=` (PR #145 `305e95c4b`)
- **Legacy admin retired** — `/legacy-admin` landing → `/workspace`
- **Duplicate runtime ownership removed** — `QueueBlock`, dept compat work-unit page, shadow PRV2 paths

#### Performance

- **TypeScript OOM eliminated** — 8 GB heap + split graphs (PR #90 `a5b8f66d8`, `ca965606c`)
- **Canonical typecheck** — `npm run typecheck` (build) + `typecheck:tests` (full); CI both jobs
- **Workspace orchestration** — repo dev entry coordination (PR #143 `00cee4183`)
- **Development operating model** — `docs/platform/governance/typescript-performance.md` canonical

#### Operator experience

- **Branded boot shell** — perceived performance sprint (PR #91 `1fea282de`)
- **Perceived performance** — Queue Hold, Surface Hold, progressive reveal; no blank between-hold surfaces
- **Work View continuity** — `?work_view=` deep links on work-unit routes
- **Canonical location experience** — Settings Configuration Mode; no legacy location drawer

**Staging certification base:** `61aefff37` (includes floor `e94811914`). Final certification: [`milestones/certification-july-2026.md`](../milestones/certification-july-2026.md).

### June 2026

- **Documentation rebaseline** — canonical platform/schema doc structure; Business Process operator model
- **Canonical Interaction Model doctrine** — Workspace → Perspective → Queue → Row → Drawer → Context Frame → Mode → Card → Section → Field; one universal drawer (Truth / Attention / Frame); interaction grammar + operator story
- **Business Processes V1** — operator rename, 13-stage enrollment defaults, outcome picker on My Tasks
- **Childcare operational enrollment V1 (flag-gated)** — `child_enrollment_agreements`, effective-dated `child_placements` / `schedule_assignments`, approve-handoff from enrollment proposals, operator edit flows (placement/schedule supersede; agreement ending/ended/cancel)
- **AdminV2 Pass 3** — atomic above-fold reveal; sidecar deferral
- **Work unit layout V3 freeze** — header → queue primary column; command rail doctrine
- **Drawer operating model V1** — subject context, warm navigation closeouts
- **BOS identity system** — visual doctrine frozen (mark, smoke, reveal, shell)
- **Lifecycle builder hardening** — canonical vocabulary, activation consolidation

### May 2026

- **Child lifecycle + work-unit convergence** — `enrollment_pipeline` v2, OCM as child SoT, candidate-grain waitlist
- **Waitlist pilot readiness** — demo reseed, ranking validation, position controls, priority fact truth
- **Forms MVP productization** — operational templates, simplified setup
- **Global Search V1** — admin header search with drawer swap
- **Settings + Record UX Parity V1** — four-plane control plane
- **AdminV2 performance closeout** — reveal doctrine, WU bootstrap, route-owned queue selection
- **Tour Phase 2 Band A** — booking lifecycle comms, scheduled reminders
- **Enrollment packet Phase 2 review MVP** — P2-1 through P2-4
- **Lifecycle action alignment (partial)** — Phase 1A entry actions, guardrails
- **Person drawer layout runtime v1** — migration + settings visibility
- **BOS operational assist** — routing, communication drafting, review assist

### April 2026

- **Routing Phase G** — slug-first workspace paths stable
- **Communications V1 production** — canonical tables, worker dequeue, webhooks
- **Forms engine foundation** — definitions, public links, admin hub

---

## 2026 Q1 — Foundations

- **AdminV2 workspace shell** — lifecycle landing, work-unit execution, drawer integration
- **CRM scope model** — access profiles, department/site restrictions
- **Queue definition v1** — configurable lanes, grains, attention overlay
- **Event/workflow spine** — hardened admin action paths
- **Enrollment packet Phase 1** — E2E intake path

---

## Pre-2026 — Architecture proof

- Multi-tenant Supabase model with RLS
- Opportunity-centric CRM with workflow automation
- Legacy admin (`/legacy-admin`) parallel operation
- Initial BOS orchestration experiments

---

## How to read this document

Each milestone represents **shipped platform capability**, not individual PRs. For implementation detail, follow sprint closeouts in `docs/sprints/**` — treat month folders as historical execution records; canonical platform state lives in `docs/platform/**`.

**Update rule:** Add a milestone when a capability moves to **Complete** in `platform-capabilities.md` with operator-visible or platform-significant impact.
