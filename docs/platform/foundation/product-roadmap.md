# Product roadmap

**Status:** Canonical (July 2026 stabilization). Sequencing and gaps — not a commit log.

> **Reconciliation note (2026-07, Operational Expansion Wave 1 freeze).** The "Future" framing of **Attendance/labor** and **Billing/payments** below is stale for the *backend truth-flow*: the L1–L4 operational spine (config rules, agreements/placements/schedule assignments, immutable attendance facts, expected/actual occupancy & staffing read models) and the L4→L5 Operational Consumption runtime (Slices 1–4, draft obligations) are **built** — see [`../rfcs/operational-expansion-phase1.md`](../rfcs/operational-expansion-phase1.md) §1 and the module docs (`../modules/attendance-system.md`, `../modules/billing-financials-platform.md`, `../modules/operational-consumption-platform.md`). What remains *future* is the operator-facing product (surfaces, Posting/authoritative money, staffing supply, forecasting) — the Implementation Waves in the RFC §6. Treat the RFC as canonical for expansion sequencing.

For capability inventory see `platform-capabilities.md`. For shipped milestones see `release-history.md`.

---

## Platform direction

Alloy is a **stable operational platform** built on finalized foundational runtimes (Presentation, Surface Host, Focus Panel, VM, Business Process, Processing, Communications, Configuration, Current Work). The canonical interaction spine is Workspace → Perspective → Queue → Row → Focus Panel → Context Frame → Mode → Card → Section → Field — see `../operator/canonical-interaction-model.md`.

**Enrollment** remains the reference implementation; **Billing** is the validation case; **Attendance / Scheduling** should fit with no new paradigm. New work extends **domain surfaces and automation** atop existing runtimes — not parallel drawer or page products. Milestone: [`../milestones/stabilization-july-2026.md`](../milestones/stabilization-july-2026.md).

---

## Complete

Foundations operators and implementers can rely on today:

- Communications V1 (canonical enqueue, webhooks, drawer)
- Business process builder with enrollment V1 stages
- Enrollment pipeline v2 (case vs child grain, single work unit)
- AdminV2 workspace runtime (Passes 1–3, atomic reveal)
- Settings four-plane control plane V1
- Forms engine + MVP productization + packet Phase 1 + review MVP
- Tour scheduling V1 + Band A comms/reminders
- Waitlist V2 + ranking validation + demo readiness
- Global search V1
- BOS assist foundation (Orchestrator, Task Assist, Workflow Assist — human-in-the-loop)
- Roles, permissions, CRM dept/site scope
- Queue/record authority boundary
- Platform manifesto + July 2026 certification published
- Presentation Runtime V2 + Surface Host (frozen July 2026)
- Focus Panel + VM Runtime hard cutover (Opportunity, Person, Child)
- Current Work Focus Panel surface (PR #95)
- Processing operational workspace (Digital Mailroom)
- Communications Command Center + identity platform
- Platform simplification — legacy drawer deleted; canonical location Settings surface
- TypeScript canonical typecheck + workspace orchestration
- Perceived performance — branded boot shell, Queue/Surface Hold

---

## In Progress

| Initiative | Outcome | Blockers / notes |
|------------|---------|------------------|
| **Waitlist mutator activation** | Replace `add_to_waitlist_placeholder` with `move_to_waitlist` | Catalog seeded; cutover + QA |
| **Lifecycle action catalog** | Canonical actions aligned to stage matrix | `mark_won` deprecation; BOS invoke wiring |
| **Backend query/payload optimization** | Queue row + VM compose latency | Dominates perceived latency post-Pass 3 |
| **Enrollment forms Phase 2 remainder** | DCP, P2-5 insight, UX hardening | Sprint cards in `later-phase/` |
| **Status ownership grain expansion** | Consistent status SoT across surfaces | Active 06_2026 sprint |
| **Messaging hardening** | Bindings, worker/cron, deliverability | |
| **Workflow RBAC alignment** | Close audit gaps | |

---

## Planned

Near-term after in-progress core:

1. **Tour Band B+** — calendar sync, public hardening, settings UI
2. **Settings Config Management** — admin CRUD for queue domain presentation
3. **Child lifecycle strict-mode activation** — after OCM/backfill QA
4. **Server-side work-unit queue search** — when client preview filters insufficient
5. **Reporting V1** — scoped reports beyond KPI strips
6. **Record Experience Builder** — deferred from settings parity
7. **Legacy-admin client module relocation** — import-path debt only; routes archived
8. **Communications phase 2** — guided setup, notifications bell

---

## Future — product evolution (post-freeze)

Platform construction is complete ([`milestones/freeze-july-2026.md`](../milestones/freeze-july-2026.md)). New execution lanes extend domain capability atop existing runtimes:

1. **Scheduling**
2. **Attendance**
3. **Billing**
4. **Payments**
5. **Commercial**
6. **Automation**
7. **AI**
8. **Operational Intelligence**
9. **Parent Experience**
10. **Teacher Experience**
11. **Partner APIs**

Additional product lanes (not foundational runtime):

- Autonomous agent catalog (enrollment agent, subsidy ops, director assistant)
- Config/Layout Assist broad NL apply
- Workflow Assist template expansion beyond maintenance
- Subsidy workflows, document extraction AI
- Dept-first operator navigation

---

## Paused

- **AI agent expansion** — assistive surfaces maintained; no new personas
- **Broad AdminV2 performance sprints** — closed; backend-only follow-on

---

## Verification debt

Track in audits and close before declaring customer-ready:

- Residual admin routes without access scope asserts
- Inbound APIs still creating `contacts` without person threading
- `primary_contact_id` coexistence until backfill complete
- Event integrity gaps (`docs/audits/event-integrity-audit.md`)

---

## Doctrine freeze requirement

Foundational platform architecture is **frozen** (July 2026). See [`milestones/freeze-july-2026.md`](../milestones/freeze-july-2026.md). New canonical **runtime** behavior requires an RFC. Product documentation for Scheduling, Attendance, Billing, and related modules may evolve without reopening Platform Stabilization.

---

## Related

- [`milestones/freeze-july-2026.md`](../milestones/freeze-july-2026.md)
- `platform-capabilities.md`
- `release-history.md`
- `docs/sprints/active/` — current execution
- Legacy detailed gap list: `../../execution/roadmap-and-gaps.md` (historical pointer)
