# AI agent — field visibility slice v2 (`update_field_visibility`)

**Purpose:** Narrow, auditable mutations of **`field_definitions`** visibility flags (where a field appears: form, drawer, table, public booking) — same governance pattern as [ai-agent-implementation-slice-v0](./ai-agent-implementation-slice-v0.md) (queue) and [ai-agent-record-layout-slice-v1](./ai-agent-record-layout-slice-v1.md) (record overview layout).

**Source of truth:** [ai-agent-foundation.md](../architecture/ai-agent-foundation.md) · [ai-agent-system-contract.md](../architecture/ai-agent-system-contract.md) · [configuration-doctrine.md](../architecture/configuration-doctrine.md) · [config-api-contract.md](../architecture/config-api-contract.md) · [record-rendering-system-spec.md](../architecture/record-rendering-system-spec.md) · [overview-layout-doctrine.md](../architecture/overview-layout-doctrine.md)

---

## 1. Repo reality (audit)

| Area | State |
|------|--------|
| **Table** | `field_definitions` — org-scoped; columns `is_visible_in_form`, `is_visible_in_drawer`, `is_visible_in_table`, `is_visible_in_public_booking`; optional `section_key` / `sort_order` for placement (separate concern). |
| **Existing admin API** | `GET/POST /api/admin/field-definitions`, `PATCH/DELETE /api/admin/field-definitions/[id]` — PATCH allows visibility flags; **no** `expected_*` optimistic lock on that route. |
| **Sections** | `field_section_definitions` + `field_definitions.section_key` — reordering sections or moving fields between sections is a **larger** change set; deferred. |
| **System fields** | `is_system` rows: immutable identity in PATCH; **visibility flags remain patchable** (same as admin UI). |

---

## 2. Narrow slice chosen

**Intent:** `update_field_visibility`

**Artifact:** Single row in **`field_definitions`** by `id` (org-scoped).

**Mutations:** Only the four boolean visibility columns (partial merge). **Not** `is_active`, **not** `section_key` / `sort_order` in v2.

**Concurrency:** **`expected_updated_at`** must match **`coalesce(updated_at, created_at)`** at commit time (same pattern as optimistic locking without a version column).

**Out of v2:** Section reorder (`field_section_definitions.sort_order`), moving a field to another section (`section_key`), creating/deleting definitions.

---

## 3. Strict config shape (`FieldVisibilityPatchV0`)

- `version`: **1** (integer).
- At least one of: `is_visible_in_form`, `is_visible_in_drawer`, `is_visible_in_table`, `is_visible_in_public_booking`.
- Unknown keys rejected.

Merged server-side with current row values for any omitted flag.

---

## 4. HTTP surfaces

| Method | Path | Role | Notes |
|--------|------|------|--------|
| **GET** | `/api/admin/field-definitions/[id]` | admin/ops | Full row for grounding (added for this slice). |
| **GET** | `/api/admin/field-definitions?entity_type=…` | admin/ops | Existing list for picker. |
| **PUT** | `/api/admin/config/field-definition-visibility` | admin | Body: `field_definition_id`, `expected_updated_at`, `visibility_patch`. Uses RPC + audit. |
| **POST** | `/api/admin/agent/v2/field-visibility` | admin | `AGENT_V2_FIELD_VISIBILITY_ENABLED`; `structured_override` only. |

---

## 5. Agent envelope

| Field | Value |
|-------|--------|
| `intent_type` | `"update_field_visibility"` |
| `intent_version` | `1` |
| `slots.target_kind` | `"field_definition_visibility"` |
| `slots.field_definition_id` | UUID |
| `slots.expected_updated_at` | ISO string (lock) |
| `slots.visibility_patch` | strict v0 object |

---

## 6. Audit + atomicity

- **RPC:** `agent_v2_commit_field_visibility_apply` (Postgres, `service_role` only).
- **Tables:** `agent_v2_field_visibility_proposals`, `agent_v2_field_visibility_apply_audit`.
- **Hashes:** SHA-256 of JSON of the four visibility booleans before/after.

---

## 7. Agent Config Lab

Third tab (after backend proven): load field list → load row → prefill `structured_override` → POST agent v2.

---

## 8. Risks / doctrine notes

- **Timestamp lock:** Clients must send the **exact** `updated_at` (or `created_at` fallback) string returned from GET; subsecond or timezone drift can cause **409**.
- **No LLM:** Validation is deterministic (strict patch + lock).
- **Not record truth:** Does not touch `field_values` or entity tables.
