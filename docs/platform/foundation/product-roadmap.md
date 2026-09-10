---
owner: platform
status: canonical
last_reviewed: 2026-09-10
supersedes: []
---

# Product roadmap

**Status:** Canonical (July 2026 stabilization). Sequencing and gaps — not a commit log.

> **Reconciliation note (2026-07, Operational Expansion Wave 1 freeze).** The "Future" framing of **Attendance/labor** and **Billing/payments** below is stale for the *backend truth-flow*: the L1–L4 operational spine (config rules, agreements/placements/schedule assignments, immutable attendance facts, expected/actual occupancy & staffing read models) and the L4→L5 Operational Consumption runtime (Slices 1–4, draft obligations) are **built** — see [`../rfcs/operational-expansion-phase1.md`](../rfcs/operational-expansion-phase1.md) §1 and the module docs (`../modules/attendance-system.md`, `../modules/billing-financials-platform.md`, `../modules/operational-consumption-platform.md`). What that note called *future* — surfaces, Posting/authoritative money, staffing supply — has since shipped too; see the Future section below, corrected 2026-09-10. Forecasting remains future. Treat the RFC as canonical for expansion sequencing, but not for what is built.

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
- BOS actionable interface V1 (Create Lead command session: Conversation + Form → registered action; Processing identity gate preserved; slash/briefing deferred — distinct from paused autonomous agents)
- Roles, permissions, CRM dept/site scope
- Queue/record authority boundary
- Platform manifesto + July 2026 certification published
- Presentation Runtime V2 + Surface Host (frozen July 2026)
- Focus Panel + VM Runtime hard cutover (Opportunity, Person, Child)
- Current Work Focus Panel surface (PR #95)
- Processing operational workspace (Digital Mailroom)
- Processing Identity Resolution V1 — locally certified promotion candidate: canonical candidate resolution, durable evidence, approved immutable Commit Plans, executor, and authoritative Create Lead/public-form intake
- Communications Command Center + identity platform
- Platform simplification — legacy drawer deleted; canonical location Settings surface
- TypeScript canonical typecheck + workspace orchestration
- Perceived performance — branded boot shell, Queue/Surface Hold

---

## In Progress

| Initiative | Outcome | Blockers / notes |
|------------|---------|------------------|
| **Waitlist mutator activation** | Replace `add_to_waitlist_placeholder` with `move_to_waitlist` | Catalog seeded; cutover + QA |
| **Lifecycle action catalog** | Canonical actions aligned to stage matrix | `mark_won` deprecation; Create Lead BOS session shipped locally — broader BOS invoke for other keys follow-up |
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

**Four of these have since shipped and are no longer future work** — corrected 2026-09-10
against migrations and certification packs; see
[`release-history.md`](./release-history.md) §2026 H2 and
[`platform-capabilities.md`](./platform-capabilities.md).

| Lane | State | Evidence |
|---|---|---|
| **Attendance** | **Shipped** Sept 2026 | Capture hardening, `attendance.record`/`attendance.read` capability, kiosk producers and person codes (`20260909220000` … `20260910130000`); `AttendanceWorkspace`, `web/app/kiosk/`. Permission-gated, not flag-gated |
| **Billing** | **Shipped** Sept 2026 | Financial periods + journal, charge correction lineage, reduction applications, financial responsibility, subsidy (`20260902130000` … `20260909140000`); `certification/financials/` |
| **Payments** | **Shipped** Sept 2026 | Stripe Connect collection: merchant, collection attempts (card + ACH), provider events, refunds, provider-initiated reversal (`20260909160000` … `20260909270000`); webhook `web/app/api/stripe/webhook/route.ts`. Not built: autopay, dunning, card chargebacks |
| **Commercial** | **Shipped** (largely) | Accounting v1, catalog RLS, fees/addons/deposits, policies, products primitive, revenue categories, tuition rates v2 |
| **Scheduling** | **Partial** | Employment foundation, staff assignment eligibility, staff presence facts (Aug 2026) and `web/app/adminV2/scheduling/` exist. **No shift model** — staff supply is `schedule_assignments` with `subject_type='staff'`. No canonical module doc owns this domain yet |
| **Operational Intelligence** | **V1 frozen; Phase 2 begun** | The Answer-presentation seam ships (`web/lib/presentation/runtime/useOperationalAnswers.ts`) and renders on Workspace and Work Unit — two of the five named consumers. Neither "next" nor complete |

Genuinely still future:

1. **Automation**
2. **AI**
3. **Parent Experience**
4. **Teacher Experience**
5. **Partner APIs** — nothing exists today: no inbound machine credential, no API versioning, no
   outbound event delivery. See
   [`../../audits/active/documentation-truth-audit-2026-09/api-inventory-and-gaps.md`](../../audits/active/documentation-truth-audit-2026-09/api-inventory-and-gaps.md).

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
- Inbound APIs still creating `contacts` without person threading — lead-capture forms + Manual Create Lead now route through Processing identity resolution (07_2026); remaining: comms/booking matchers
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
