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

---

## Expanded glossary

Additional terms (placement priority, packet rollup, etc.): `../../core/glossary.md` (transitional — merge on next pass).

---

## When to update

New platform terms or canonical renames.
