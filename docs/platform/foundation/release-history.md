# Release history

**Status:** Canonical platform milestones (July 2026 stabilization rebaseline). **Not** a commit or sprint task log.

> **Reconciliation note (2026-07, Operational Expansion Wave 1 freeze).** This history predates the operational truth-flow backend. Recorded here for completeness: the **L1–L4 operational spine** (config rules; effective-dated agreements/placements/schedule assignments; immutable attendance facts; expected/actual occupancy & staffing read models) and the **L4→L5 Operational Consumption runtime** (Consumption Events → Resolved Obligations → draft Charges, Slices 1–4) shipped as flag-gated/simulator backend across June–July 2026. The frozen architecture governing their productization is [`../rfcs/operational-expansion-phase1.md`](../rfcs/operational-expansion-phase1.md); its first delivery step is defined in [`../operational-expansion-wave1-implementation-spec.md`](../operational-expansion-wave1-implementation-spec.md).

---

## 2026 H1 — Platform maturation

### July 2026 — Platform Stabilization Complete

**Initiative closed.** Foundational platform architecture is certified stable. Formal declaration: [`milestones/freeze-july-2026.md`](../milestones/freeze-july-2026.md). Constitutional doctrine: [`platform-manifesto.md`](./platform-manifesto.md).

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
