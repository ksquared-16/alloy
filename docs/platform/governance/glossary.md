# Glossary

**Status:** Canonical shared vocabulary (June 2026 rebaseline).

---

## Operational Mutation Platform

| Term | Meaning |
|------|---------|
| **Operational Decision** | Atomic unit of operator work — always recorded. May or may not produce a mutation. |
| **DecisionIntent** | Typed input to the Mutation Runtime — command, subject, domain, target state, context payload. |
| **Mutation Runtime** | Shared four-phase execution engine (Resolve → Evaluate → Preview → Commit) for all operational mutations. |
| **Mutation Result** | Synchronous output of the runtime — committed \| blocked \| previewed. Drives optimistic UI update. |
| **Status Domain** | A typed namespace for status values + allowed transition graph. `lead_status`, `enrollment_status`, etc. There is no generic status. |
| **Outbox** | Atomic write alongside state change; processed async to emit canonical mutation events. |
| **Canonical Mutation Event** | The single event emitted per committed mutation. All projections subscribe to this. |
| **Required Information** | Fields owned by a **transition** (not a command) that must be satisfied before commit. |
| **Readiness** | Subject's operational fitness for a transition — evaluated pre-mutation as a gate and post-mutation to refresh Needs Attention. |
| **Process Gate** | Cross-domain condition in business process config that blocks or warns on a transition. |

---

## Platform terms

| Term | Meaning |
|------|---------|
| **Business Process** | Operator-facing configurable process (e.g. Enrollment Process). Settings UI label; internal tables may still say lifecycle. |
| **Stage** | Step in a business process — queue membership + expected work. Operator primary lens on execution surface. |
| **Record** | Authoritative entity detail in drawer (opportunity, person, child context). |
| **Work Unit** | **Implementation construct** — hosts `queue_definition` and slug route. Not the operator's primary noun. |
| **Queue** | Preview list for a stage lens — not authoritative record store. |
| **Org / tenant** | Row scoping via `org_id`. |

---

## Interaction model

Canonical spine: **Workspace → Perspective → Queue → Row → Drawer → Context Frame → Mode → Card → Section → Field** (see `../operator/canonical-interaction-model.md`).

| Term | Meaning |
|------|---------|
| **Perspective** | Operating lens over the same records — a saved filter/sort/grouping (e.g. Today's Tours, Failed Payments). Changes the lens, not reality. |
| **Row** | A single preview of one record in a queue; selecting it opens the drawer in place. |
| **Drawer** | The **one universal** record surface — no per-entity drawer products. |
| **Context Frame** | *Why* a drawer was opened right now — the entry intent (Tour, Billing, Attendance, …) that decides which mode/cards lead. |
| **Mission** | Operator-facing name for the **Context Frame** — *why* the operator is here (e.g. Today's Tour). |
| **Subject** | Operator-facing name for the **Record of Attention** — *who/what* the operator is working on (e.g. Wright Family). |
| **Mode** | Primary lens within a drawer: **Summary** (ambient understanding), **Work** (active work cards), **Activity** (history). Canonical runtime vocabulary; earlier drafts said Overview / Operations / Activity. |
| **Card** | Reusable business primitive answering a business question (Enrollment Readiness, Tour, Billing Setup, …) — not a raw field group. Composes from record truth across drawer/queue/analytics/BOS. |
| **Record of Truth** | The authoritative database/domain entity behind a drawer. |
| **Record of Attention** | What the operator is currently working on (may be narrower than the Record of Truth). |

---

## Identity

| Term | Meaning |
|------|---------|
| **Person** | `persons` — canonical human identity. |
| **Customer person** | `customer_persons` — person ↔ customer link. |
| **Contact** | Legacy compatibility — not forward CRM identity. |
| **Customer** | Household/account shell. |

---

## Status grains

| Term | Meaning |
|------|---------|
| **Case lifecycle** | `opportunities.status_key` — household coordination. |
| **Child enrollment lifecycle** | `opportunity_customer_members.outcome_status_key` — per-child SoT. |

---

## Automation

| Term | Meaning |
|------|---------|
| **Event** | `workflow_events` append-oriented fact. |
| **Workflow** | DB automation on event + entity type. |
| **Action** | Admin operation via `executeAdminAction`. |
| **RRS** | Record resolution system for flat job payloads. |

---

## Access

| Term | Meaning |
|------|---------|
| **Permission key** | Capability grant via `role_permission_grants`. |
| **Access profile** | Dept/site visibility — separate from permissions. |
| **BOS** | Business Orchestration System — assist layer, human-in-the-loop. |
| **Placement priority** | Generalized opt-in ordered cohort ranking (`placement_priority_v1` metadata). Childcare **waitlist** ordering is one vertical implementation — not global platform identity. |

---

## Expanded glossary

Additional terms (packet rollup, queue selection, etc.): `../../platform/governance/glossary.md` (transitional — vertical-specific detail).

---

---

## Work Items (July 2026)

| Term | Meaning |
|------|---------|
| **Work Item** | Operator-facing unit of cross-record operational execution in the Work Items workspace. |
| **Work Items** | Cross-record execution platform — Overview + Queue + detail; not a replacement for Current Work or domain products. |
| **Current Work** | Record-scoped active stage progression inside a Business Process — authoritative for BP stage work. |
| **Virtual projection** | Work Items queue row derived from authoritative domain state without an `operational_tasks` row (e.g. `processing:{caseId}`, `communications:{threadId}`). |
| **Source filter** | Queue provenance lens (Manual, Business Process, Processing, Communications) — describes origin, not duplicate ownership. |
| **Operational refresh** | Unified client contract to recompute merged Work Items projections after domain mutations. |


## When to update

New platform terms or canonical renames.
