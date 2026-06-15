# Product roadmap

**Status:** Canonical (June 2026 rebaseline). Sequencing and gaps — not a commit log.

For capability inventory see `platform-capabilities.md`. For shipped milestones see `release-history.md`.

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

---

## In Progress

| Initiative | Outcome | Blockers / notes |
|------------|---------|------------------|
| **Waitlist mutator activation** | Replace `add_to_waitlist_placeholder` with `move_to_waitlist` | Catalog seeded; cutover + QA |
| **Lifecycle action catalog** | Canonical actions aligned to stage matrix | `mark_won` deprecation; BOS invoke wiring |
| **Person/Child drawer VM cutover** | Default VM flags ON; legacy tab deletion | Performance + parity QA |
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
7. **Legacy-admin module retirement** — migrate remaining lists to `/admin`
8. **Communications phase 2** — guided setup, notifications bell

---

## Future

Explicitly not current execution lanes unless product re-opens:

- Autonomous agent catalog (enrollment agent, subsidy ops, director assistant)
- Config/Layout Assist broad NL apply
- Workflow Assist template expansion beyond maintenance
- Billing/payments maturity (general availability)
- Subsidy workflows, document extraction AI
- Attendance, labor modules
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

Do not document new canonical behavior until decisions are frozen for:

- Navigation spine changes
- Business process ↔ work unit binding
- BOS expansion scope
- Status ownership across grains
- Record architecture cutover

---

## Related

- `platform-capabilities.md`
- `release-history.md`
- `docs/sprints/active/` — current execution
- Legacy detailed gap list: `../../execution/roadmap-and-gaps.md` (transitional pointer)
