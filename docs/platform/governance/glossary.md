# Glossary

**Status:** Canonical shared vocabulary (June 2026 rebaseline).

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

## Operational intelligence

| Term | Meaning |
|------|---------|
| **Operational Answer** | Semantic output of an Operational Calculation — question, state, value, answer text, evidence, trend, freshness, drill target. Not a number; an answer. |
| **Operational Calculation** | Registry-defined resolver that transforms Operational Facts into an Operational Answer. Owns all business logic including state thresholds and answer language. |
| **Operational Instrument** | Runtime Presentation that renders an Operational Answer in Workspace Header, Work Unit Header, or Operational Intelligence panel. |
| **Runtime Presentation** | Reusable renderer keyed by presentation type (`compact-instrument`, `expanded-instrument`, `tabular`, `badge`, `ai-narrative`). Selected by Surface Builder placement. |
| **Operational Intelligence** | The operator surface for expanded signal review — not "analytics" or "dashboards". |
| **Focus Panel** | Record detail surface. Previously called drawer. Not "drawer" in any operator-facing context. |

Full doctrine: `../modules/operational-answers.md`.

---

## Expanded glossary

Additional terms (packet rollup, queue selection, etc.): `../../core/glossary.md` (transitional — vertical-specific detail).

---

## When to update

New platform terms or canonical renames.
