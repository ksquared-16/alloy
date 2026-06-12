# Platform capabilities

**Status:** Canonical inventory (June 2026 rebaseline). Answers: *What has Alloy actually built?*

Statuses: **Complete** · **In Progress** · **Planned** · **Future**

---

## Operator workspace

| Capability | Status | Description | Notes |
|------------|--------|-------------|-------|
| Business process landing | **Complete** | `/workspace` lifecycle/process tiles + KPI strip | Operator label: Business Process |
| Stage queue execution | **Complete** | Work-unit slug routes, multi-lane queues | Internal: work units |
| Site filter context | **Complete** | Sticky site scope on workspace fetches | Session + URL param |
| Atomic reveal (Pass 3) | **Complete** | Coordinated above-fold reveal | Locked doctrine |
| Global search | **Complete** | Header search → drawer swap | V1 shipped May 2026 |
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
| Opportunity drawer VM | **Complete** | Composed payload, warm navigation | Canonical |
| Person drawer VM | **In Progress** | Layout runtime v1 shipped; VM flag OFF default | Cutover sprint |
| Child drawer VM | **In Progress** | Transitional | Same cutover |
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
| Comms V2 architecture | **Planned** | Design freeze in sprint assets | |

## Documents & forms

| Capability | Status | Description | Notes |
|------------|--------|-------------|-------|
| Forms engine foundation | **Complete** | Definitions, versions, public links | |
| Forms MVP productization | **Complete** | Operator templates, share UX | |
| Enrollment packet Phase 1 | **Complete** | E2E intake | |
| Packet review MVP (P2-1–4) | **Complete** | Review rollup console | |
| DCP / UX hardening | **In Progress** | Phase 2 remainder | |

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
| Settings four-plane V1 | **Complete** | Fields, grouping, layouts, actions | May 2026 |
| Field policy enforcement | **Complete** | Opportunity/job subset | Forms parity open |
| Record Experience Builder | **Planned** | Deferred from parity sprint | |
| Placement priority (waitlist) | **Complete** | Opt-in ordering layer | Off by default |

## AI / BOS

| Capability | Status | Description | Notes |
|------------|--------|-------------|-------|
| BOS foundation | **Complete** | Orchestrator, Task Assist, Workflow Assist | Human-in-the-loop |
| Needs-attention enrich | **Complete** | Gated enrichment | |
| Config/Layout Assist foundation | **Complete** | Proposals table | Apply catalog partial |
| Autonomous agents | **Future** | Explicitly not roadmap execution | Paused |
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
| Reporting V1 | **Planned** | Beyond KPI strips | |

## Billing

| Capability | Status | Description | Notes |
|------------|--------|-------------|-------|
| Stripe integration | **In Progress** | Webhook truth needs verification | See billing supplement |

---

## How to use this document

- **Product / leadership:** Scan status columns for maturity picture.
- **Engineering:** Follow Notes links to doctrine and sprints for detail.
- **AI agents:** Treat **Complete** as safe to assume in prompts; verify **In Progress** against code.

**Update trigger:** Any capability moves status or ships materially — update in same PR as code when behavior changes.
