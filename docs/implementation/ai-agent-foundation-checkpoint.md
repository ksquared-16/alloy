# AI agent foundation — checkpoint (v0 / v1 / v2 + lab)

**Purpose:** Single place to see what the **proven** agent-compatible config rails do, how they are invoked, and what remains out of scope before a thicker assistant product.

**Related:** [ai-agent-foundation.md](../architecture/ai-agent-foundation.md) · [ai-agent-system-contract.md](../architecture/ai-agent-system-contract.md) · [configuration-doctrine.md](../architecture/configuration-doctrine.md)

---

## 1. What each slice mutates

| Slice | Intent (concept) | Artifact | What changes |
|-------|------------------|----------|----------------|
| **v0** | `update_queue_definition` | `work_units.queue_definition` (jsonb) | Queue sort, limit, filters, `version` inside JSON. |
| **v1** | `update_record_layout` | `record_overview_layouts.config` (org, `entity_type`=`jobs`, `surface`=`overview`) | Overview bands, `header_keys`, optional `relationship_group_keys`; `version` inside `config`. |
| **v2** | `update_field_visibility` | `field_definitions` (four visibility booleans) | `is_visible_in_form`, `is_visible_in_drawer`, `is_visible_in_table`, `is_visible_in_public_booking` only. |

**Not mutated by these rails:** global `record_layouts`, `field_values` / entity record truth, `field_section_definitions` order (separate future slice), operational actions.

---

## 2. Current HTTP routes (admin)

| Method | Path | Notes |
|--------|------|--------|
| GET | `/api/admin/work-units` | List work units. |
| GET | `/api/admin/work-units/[id]` | Single work unit + `queue_definition`. |
| POST | `/api/admin/agent/v0/queue-definition` | Agent v0 apply (RPC + audit). |
| GET | `/api/admin/record-overview-layouts?entity_type=job&surface=overview` | Org overview layout row. |
| PUT | `/api/admin/config/record-overview-layout` | Manual put (no agent audit RPC). |
| POST | `/api/admin/agent/v1/record-overview-layout` | Agent v1 apply (RPC + audit). |
| GET | `/api/admin/field-definitions?entity_type=…` | Field defs list. |
| GET | `/api/admin/field-definitions/[id]` | Single field def. |
| PUT | `/api/admin/config/field-definition-visibility` | Manual put (RPC + audit). |
| POST | `/api/admin/agent/v2/field-visibility` | Agent v2 apply (RPC + audit). |

---

## 3. Audit tables / RPCs

| RPC | Tables |
|-----|--------|
| `agent_v0_commit_queue_definition_apply` | `agent_v0_proposals`, `agent_v0_apply_audit` |
| `agent_v1_commit_record_overview_layout_apply` | `agent_v1_record_layout_proposals`, `agent_v1_record_layout_apply_audit` |
| `agent_v2_commit_field_visibility_apply` | `agent_v2_field_visibility_proposals`, `agent_v2_field_visibility_apply_audit` |

All RPCs: **`service_role` only**; app routes use admin Supabase client.

---

## 4. Feature flags (server env)

| Env | Effect |
|-----|--------|
| `AGENT_CONFIG_LAB_ENABLED` | Enables `/admin/agent-lab` (admin-only page). |
| `AGENT_V0_ENABLED` | Agent POST queue-definition. |
| `AGENT_V1_RECORD_LAYOUT_ENABLED` | Agent POST record-overview-layout. |
| `AGENT_V2_FIELD_VISIBILITY_ENABLED` | Agent POST field-visibility. |
| `NEXT_PUBLIC_AGENT_LAB_ASSISTANT_ENABLED` | Optional: hide deterministic assistant panel in lab when `false` / `0`. |

---

## 5. Agent Config Lab (`/admin/agent-lab`)

**Requires:** `AGENT_CONFIG_LAB_ENABLED`, **admin** role (not ops).

**Tabs:**

- **A — Queue (v0):** load work units → load row → prefill `structured_override` → POST v0.
- **B — Record overview layout (v1):** load overview layout → prefill → POST v1.
- **C — Field visibility (v2):** pick entity type + field → load row → prefill → POST v2.

**Assistant panel (thin internal layer):** deterministic command → preview `structured_override` → edit → apply via same POST routes (no new mutation rails).

---

## 6. Still out of scope (this checkpoint)

- OpenAI / LLM / streaming chat product.
- New config domains (sections reorder, `field_section_definitions`, global `record_layouts`, etc.).
- Operational actions (assign, message, delete entities).
- End-user (non-admin) assistant.

---

## 7. Recommended next build sequence

1. **Harden assistant** — richer deterministic grammar, validation messages, telemetry hooks (still no LLM).
2. **Intent registry** — single envelope router when multiple intents share one route (optional).
3. **LLM last** — slot-fill only after deterministic fallbacks and policy gates are stable.
4. **Product assistant shell** — separate from lab; reuse POST contracts only.
