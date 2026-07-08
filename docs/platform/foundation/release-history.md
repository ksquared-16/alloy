# Release history

**Status:** Canonical platform milestones (June 2026 rebaseline). **Not** a commit or sprint task log.

---

## 2026 H1 — Platform maturation

### July 2026

- **Current Work (Focus Panel)** — config-driven operational surface on the Focus Panel: Summary → Focus → outcome completion inside Focus; primary CTA **`Record what happened`**; checklist handoffs (Communications, Household, Children, Documents); queue row current-work hints; action-registry supporting actions; right-rail demotion when Current Work owns completion. Merged to staging via PR #95.

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

Each milestone represents **shipped platform capability**, not individual PRs. For implementation detail, follow sprint closeouts in `docs/sprints/completed/` (transitional paths under month folders until migration completes).

**Update rule:** Add a milestone when a capability moves to **Complete** in `platform-capabilities.md` with operator-visible or platform-significant impact.
