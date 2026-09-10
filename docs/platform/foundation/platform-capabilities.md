---
owner: platform
status: canonical
last_reviewed: 2026-09-10
supersedes: []
---

# Platform capabilities

**Status:** Canonical inventory (July 2026 stabilization). Answers: *What has Alloy actually built?*

Statuses: **Complete** · **In Progress** · **Planned** · **Future**

---

## Foundational runtimes (July 2026 — stable)

| Capability | Status | Description | Notes |
|------------|--------|-------------|-------|
| Presentation Runtime V2 | **Complete** | One presentation tree — WS, WU, Queue, Focus Panel, Right Rail | Frozen July 2026 |
| Surface Host | **Complete** | Client-held surfaces; focus exchange without route teardown | NAV-1 (A) shipped |
| Focus Panel Runtime | **Complete** | Canonical record execution surface | VM-backed cards + embeds |
| VM Runtime (Opportunity/Person/Child) | **Complete** | Hard cutover; no kill-switch rollback | Legacy drawer deleted |
| Business Process Runtime | **Complete** | Landing → stage queues → record focus | Operator model frozen |
| Processing Runtime | **Complete** | Digital Mailroom operational workspace | Reference module shell |
| Processing Identity Resolution V1 | **Complete** (promotion candidate) | Canonical normalization/candidates, durable facts/resolutions, immutable approval-bound plans, deterministic executor, identity-review gate, operator review, Create Lead + public-form cutovers | Locally certified; reconciled onto staging tip; awaiting PR merge; not deployed |
| Communications Runtime | **Complete** | Command Center + Activity embed + identity platform | PR #132, #147 |
| Configuration Runtime | **Complete** | `/settings/*` control plane + Surfaces builder | Locations inline create |
| Current Work Runtime | **Complete** | Config-driven stage work in Focus Panel | PR #95 |
| TypeScript canonical typecheck | **Complete** | Split build/full graphs; 8 GB heap; CI both jobs | `typescript-performance.md` |
| Workspace orchestration | **Complete** | Repo dev entry coordination | PR #143 |
| Documentation Platform v1.0 | **Complete** | Handbook, governance, docs-lint/CI, curation, certification, Platform Decisions register | Production infrastructure; incremental maintenance thereafter |
| Platform simplification (legacy drawer) | **Complete** | Legacy drawer deleted; canonical surfaces | PR #144–#148 |

---

## Operational truth (two-ledger ontology)

The frozen [Operational Expectations architecture](../core/operational-expectations-system-design.md) establishes **two authored ledgers** — the platform's authoritative operational truth. Both are append-only, actor-attributed, and **neither is derived from the other**; that non-derivability is precisely why each is a *capability* rather than a projection. Everything downstream (Judgment, Gap, Projection, Scheduling, Forecasting, Current Work, Billing, Communications) is **derived** and is therefore intentionally **not** listed here as a capability. Terminology is locked in the [glossary two-ledger map](../governance/glossary.md); Law 2 is in the [truth-flow doctrine](../core/operational-truth-flow-doctrine.md).

| Capability | Status | Description | Notes |
|------------|--------|-------------|-------|
| Operational Facts (authored ledger — observed) | **Complete** | The **observed** operational truth ledger ("what IS"): append-only, effective-dated, corrected-by-reference facts. Realized today by the event→workflow spine (`workflow_events`, `emitEvent`, SELECT-only JWT). | Converged, not rebuilt — see [`operational-expectations-architecture-closeout.md` §3](../milestones/operational-expectations-architecture-closeout.md). Read seam = the correction-carrying Fact Contract |
| Operational Expectations (authored ledger — intended) | **In Progress** | The **intended** operational truth ledger ("what SHOULD / WILL be"): tuple ⟨Authority · Modality · Subject · Condition · Temporal Frame · [Beneficiary]⟩; closed five-modality set (required/prohibited/intended/committed/predicted). Twin substrate of Facts (bitemporal/lineage/replay). | Architecture **frozen**; implementation sequenced P0–P8 per the [engineering realization](../milestones/operational-expectations-engineering-realization.md). **P0 and P1 are complete and certified** ([P1 certification](../milestones/operational-expectations-p1-certification.md)): the append-only ledger, the one authoring intake (five verbs, modality closure, semantic line, Temporal Frame, footprint), Authority→Standing + ratification, and revision/correction effectivity exist and are held as standing CI gates. The generic intake remains **server-side and flag-gated `oe.ledger.author`, OFF by default**. That is no longer the whole posture: an **activated-purpose seam** (`web/lib/operationalExpectations/intake/activatedAuthoringPurposes.ts`) lets a named purpose author production ledger rows **without** the env flag — `isActivatedAuthoringPurpose(purpose) || isOeLedgerAuthorEnvEnabled()` in `ledgerAuthoringFeatureFlag.ts`. One purpose is activated today, `attendance.service_day_exception`, and it **does** have an operator surface (`web/app/api/admin/childcare-attendance/service-day-exception/route.ts`, reached from `AttendanceWorkspace`). So the ledger is authored in production for that one purpose, while remaining Facts-only everywhere else. Judgment/Gap (P3, the keystone) onward are not started, so the capability is **not yet generally operational** — that is M7. Broad operator surfaces are still P5 and configuration is still P2 |

---

## Operator workspace

| Capability | Status | Description | Notes |
|------------|--------|-------------|-------|
| Business process landing | **Complete** | `/workspace` lifecycle/process tiles + KPI strip | Operator label: Business Process |
| Stage queue execution | **Complete** | Work-unit slug routes, multi-lane queues | Internal: work units |
| Site filter context | **Complete** | Sticky site scope on workspace fetches | Session + URL param |
| Atomic reveal (Pass 3) | **Complete** | Coordinated above-fold reveal | Locked doctrine |
| Global search | **Complete** | Header search → canonical surfaces (VM Focus Panel or Settings deep links) | Campus → `/settings/locations?locationId=` |
| **Current Work surface** | **Complete** | Config-driven Focus Panel work owner; outcome completion + handoffs | Canonical July 2026 — PR #95 |
| Focus Panel card library (Core Four + extensions) | **Complete** | Household, Children, Current Work, Readiness + Billing/Tour/Comms/Timeline | See focus-panel-card-library.md |
| Dept-first navigation | **Future** | — | Explicitly not canonical |

## Business processes

| Capability | Status | Description | Notes |
|------------|--------|-------------|-------|
| Process builder UI | **Complete** | 13-stage enrollment V1 defaults | `/admin/settings/lifecycle` |
| Stage operating plans | **Complete** | Purpose, expected work, outcomes | V1 metadata |
| Outcome picker (My Tasks) | **Complete** | Human-confirmed stage outcomes | Drawer chips follow-up open |
| Stage queue membership | **Complete** | `queue_membership_v1` resolver | |
| Canonical action catalog | **In Progress** | Platform action_definitions alignment | ~84%; waitlist mutator open |

## Records & drawers

| Capability | Status | Description | Notes |
|------------|--------|-------------|-------|
| Opportunity VM Runtime | **Complete** | Composed payload, warm navigation, Focus Panel | Canonical |
| Person VM Runtime | **Complete** | Focus Panel body; permanent hard cutover | July 2026 |
| Child VM Runtime | **Complete** | Focus Panel body; permanent hard cutover | July 2026 |
| Legacy entity drawer | **Complete** (removed) | `AdminEntityDrawerLegacy` deleted | Fail closed for unsupported |
| Location operating surface | **Complete** | `/settings/locations` Configuration Mode | Inline create; search deep links |
| Record resolver (RRS) | **Complete** | Jobs and selected entities | |
| Linked record inline edit | **Complete** | PATCH from drawer | |
| Queue → record authority boundary | **Complete** | Documented + enforced pattern | |

## Queues

| Capability | Status | Description | Notes |
|------------|--------|-------------|-------|
| QueueService | **Complete** | queue_definition v1 interpreter | |
| Enrollment pipeline v2 | **Complete** | Case vs candidate grain domains | Single WU model |
| Needs Attention overlay | **Complete** | Resolver buckets + explainability | Not a stage |
| Queue record layout v3 | **Complete** | Config-driven operational rows | Locked doctrine |
| Server-side queue search | **Planned** | Scale replacement for client filters | |
| **Work Items V3 execution platform** | **Complete** | Cross-record queue, folders/views/sources, creation runtime, BP/Processing/Communications convergence | Virtual projections; no schema change |

## Status & lifecycle

| Capability | Status | Description | Notes |
|------------|--------|-------------|-------|
| Case status (opportunity) | **Complete** | `opportunities.status_key` | |
| Child enrollment status (OCM) | **Complete** | `outcome_status_key` SoT | |
| Strict-mode activation | **Planned** | Readiness tooling shipped | Activation deferred |
| Status ownership expansion | **In Progress** | Grain alignment sprint | See roadmap |

## Communications

| Capability | Status | Description | Notes |
|------------|--------|-------------|-------|
| Communications V1 | **Complete** | Canonical threads/messages, webhooks | |
| Inbox warm on WU entry | **Complete** | Deferred load pattern | |
| Scheduled sends | **Complete** | Tour reminders, quiet hours | Band A |
| Legacy messages table | **Complete** | Compatibility | Retirement path documented |
| Comms V2 architecture | **Complete** | Conversation core, delivery events/receipts, preferences/recipients, templates and announcements | Shipped June 2026 (`supabase/migrations/20260619120000_comms_v2_conversation_core.sql` … `20260623140000_*`), plus `20260715120000_communications_identity_platform_foundation.sql`. Inbound email/SMS ingress followed in August 2026 — see [`../modules/communications-platform.md`](../modules/communications-platform.md) |

## Documents & forms

| Capability | Status | Description | Notes |
|------------|--------|-------------|-------|
| Forms engine foundation | **Complete** | Definitions, versions, public links | |
| Forms MVP productization | **Complete** | Operator templates, share UX | |
| Enrollment packet Phase 1 | **Complete** | E2E intake | |
| Packet review MVP (P2-1–4) | **Complete** | Review rollup console | |
| DCP / UX hardening | **In Progress** | Phase 2 remainder | |
| Inbound identity resolution | **Complete** (promotion candidate) | Public lead-capture and Manual Create Lead enter Processing; zero identity writes before approval | Identity-review gate; explicit commit; no legacy fallback or runtime flag |

## Actions & workflows

| Capability | Status | Description | Notes |
|------------|--------|-------------|-------|
| Event → workflow spine | **Complete** | workflow_events, workflowRun | |
| Admin action router | **Complete** | executeAdminAction | |
| Action links (tokenized) | **Complete** | Public consume routes | |
| Completion guardrails | **Complete** | Contextual validation | |
| Workflow RBAC alignment | **In Progress** | Audit findings | |

## Configuration

| Capability | Status | Description | Notes |
|------------|--------|-------------|-------|
| Settings four-plane V1 | **Complete** | Fields, grouping, layouts, actions (control plane) | May 2026 |
| Configuration Workspace Platform | **In Progress** | Object-centric configuration experience every domain inherits; canonical doctrine `platform/operator/configuration-workspace-platform-doctrine.md` | Reference impl = Locations (Phase B); prototype landed |
| Field policy enforcement | **Complete** | Opportunity/job subset | Forms parity open |
| Record Experience Builder | **Planned** | Deferred from parity sprint | |
| Placement priority | **Complete** | Opt-in ordered cohort ranking layer | Childcare waitlist is one use; off by default |

## Trust Platform

| Capability | Status | Description | Notes |
|------------|--------|-------------|-------|
| Trust Platform (cognitive / reasoning) | **Complete (V1)** | Trusted operational reasoning: Decision Contracts → Trust Runtime → Decision Packages; privacy, knowledge, learning, economics, governance | Entry: [`../trust/trust-platform.md`](../trust/trust-platform.md); corpus index [`../trust/README.md`](../trust/README.md). Not an AI/prompt/model layer — AI is one possible reasoning implementation. Trust Runtime V1 shipped August 2026: `supabase/migrations/20260802090000_trust_runtime_v1_foundation.sql`, `20260803230000_*`, `20260804210000_trust_lifecycle_observation_kinds.sql`, `20260807210000_trust_provider_telemetry.sql`; library at `web/lib/trust/`; certification pack `certification/trust-runtime-v1/` |

## AI / BOS

| Capability | Status | Description | Notes |
|------------|--------|-------------|-------|
| BOS foundation | **Complete** | Orchestrator, Task Assist, Workflow Assist | Human-in-the-loop |
| BOS actionable interface (Create Lead) | **Complete** (local) | Command session: Conversation + Form → registered `create_lead` | Placement over Operational Command Runtime; Processing identity gate preserved; slash/briefing deferred |
| Needs-attention enrich | **Complete** | Gated enrichment | |
| Config/Layout Assist foundation | **Complete** | Proposals table | Apply catalog partial |
| Autonomous agents | **Future** | Explicitly not roadmap execution | Paused — distinct from human-confirmed BOS command sessions |
| BOS identity system | **Complete** | Visual doctrine frozen | |

## Security & governance

| Capability | Status | Description | Notes |
|------------|--------|-------------|-------|
| Org-scoped RLS | **Complete** | Majority of tenant tables | See schema policies doc |
| RBAC permission keys | **Complete** | role_permission_grants union | |
| CRM dept/site scope | **Complete** | user_access_profiles | |
| workflow_events SELECT-only JWT | **Complete** | Migration shipped | |
| Legacy messages RLS | **In Progress** | Compatibility risk | Retirement planned |

## Scheduling & enrollment ops

| Capability | Status | Description | Notes |
|------------|--------|-------------|-------|
| Tour scheduling V1 | **Complete** | Booking + drawer integration | |
| Tour Band A comms | **Complete** | Reminders, calendar links | |
| Tour Band B+ | **Planned** | Calendar sync, public hardening | |
| Waitlist V2 candidate rows | **Complete** | Ranking validation scripts | |
| move_to_waitlist mutator | **In Progress** | Catalog seeded; activation open | |
| Operational enrollment V1 (agreements/placements/schedules) | **In Progress** | Flag-gated post-approval layer | `child_enrollment_agreements`, effective-dated `child_placements` / `schedule_assignments`; approve-handoff + operator edit flows (Batches 1–5.5) |
| Reporting V1 | **Planned** | Beyond KPI strips | |

## Billing

| Capability | Status | Description | Notes |
|------------|--------|-------------|-------|
| Payments — provider collection (Stripe Connect) | **Complete** | Merchant registration, collection attempts (card + ACH), provider events, refunds, provider-initiated reversal, rail readiness, canonical posting | Shipped September 2026: `supabase/migrations/20260909160000_payment_provider_merchant.sql` … `20260909270000_collection_attempt_action_type.sql`. Webhook handler `web/app/api/stripe/webhook/route.ts` (HMAC-verified, event-id idempotency, tenancy via merchant binding). Not built: autopay, dunning, card chargebacks. Detail: [`../modules/billing-financials-platform.md`](../modules/billing-financials-platform.md) |
| Financials — posting, periods, responsibility, subsidy | **Complete** | Charge templates and correction lineage, financial periods + journal, reduction applications, financial responsibility (incl. split shares), subsidy claims | Shipped September 2026: `20260902130000_financial_spine_actor_and_household_parity.sql`, `20260904180000_financial_periods_and_journal.sql`, `20260908120000_financial_responsibility.sql`, `20260909120000_financial_subsidy.sql` and siblings; certification packs under `certification/financials/` |
| Attendance | **Complete** | Attendance capture, kiosk producers and person codes, operational consumption of attendance | Shipped September 2026: `20260909220000_attendance_capture_hardening.sql`, `20260909230000_attendance_capability.sql`, `20260910120000_attendance_kiosk_producers.sql`, `20260910130000_kiosk_person_codes.sql`. **Permission-gated** (`attendance.record` / `attendance.read`), not flag-gated. Surfaces: `AttendanceWorkspace`, `web/app/kiosk/`. Doctrine: [`../modules/attendance-system.md`](../modules/attendance-system.md) |
| Employment / staffing foundation | **Complete** | Employment records, staff assignment eligibility, staff presence facts | Shipped August 2026: `20260811120000_employment_foundation_v1.sql`, `20260811120100_staff_assignment_eligibility_employment_v1.sql`, `20260812090000_staff_presence_facts_v1.sql`; `web/lib/employment/`, `web/lib/staffPresence/`. No shift model exists — staff supply is `schedule_assignments` with `subject_type='staff'` |

---

## How to use this document

- **Product / leadership:** Scan status columns for maturity picture.
- **Engineering:** Follow Notes links to doctrine and sprints for detail.
- **AI agents:** Treat **Complete** as safe to assume in prompts; verify **In Progress** against code.

**Update trigger:** Any capability moves status or ships materially — update in same PR as code when behavior changes.
