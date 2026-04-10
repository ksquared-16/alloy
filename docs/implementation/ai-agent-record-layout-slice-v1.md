# AI agent — record layout slice v1 (`update_record_layout`)

**Purpose:** Define the **smallest** backend/config slice for **`update_record_layout`** so AI (and admin UI later) can mutate **layout-oriented** config through the same **validated, org-scoped, auditable** patterns as [ai-agent-implementation-slice-v0](./ai-agent-implementation-slice-v0.md) — **without** chat UI, LLM, or operational actions.

**Source of truth:** [ai-agent-system-contract.md](../architecture/ai-agent-system-contract.md) · [ai-agent-foundation.md](../architecture/ai-agent-foundation.md) · [configuration-doctrine.md](../architecture/configuration-doctrine.md) · [config-api-contract.md](../architecture/config-api-contract.md) · [overview-layout-doctrine.md](../architecture/overview-layout-doctrine.md) · [record-rendering-system-spec.md](../architecture/record-rendering-system-spec.md) · [implementation-gap-audit.md](../architecture/implementation-gap-audit.md)

---

## 1. Exact scope (narrow)

### 1.1 What we mutate first (config artifact)

| Choice | Artifact | Why this row |
|--------|-----------|----------------|
| **Selected** | **`record_overview_layouts`** — one logical row per org for **`entity_type = 'job'`** and **`surface = 'overview'`** | **Org-scoped** (tenant-safe), **RLS already defined**, consumed by RRS overview via [`loadRecordOverviewLayoutRow`](../../web/lib/rrs/overview/overviewLayoutV0.ts). Aligns with gap audit “overview config v0” ([implementation-gap-audit.md](../architecture/implementation-gap-audit.md) §4). |
| **Not in v1** | Global **`record_layouts`** (`overview_section_order`, schedule `overview_rows` / `layout_blocks`) | **No `org_id`** — a write affects **all tenants** unless governance is platform-admin-only ([config-model-spec.md](../architecture/config-model-spec.md), [ai-agent-foundation.md](../architecture/ai-agent-foundation.md) §C.3). Defer API writes until org-scoped templates or explicit policy exists. |
| **Not in v1** | **`record_overview_layouts`** for **`schedule`** or non-`overview` surfaces | Schedule chrome still leans on **`record_layouts`** + different `config_json` shape ([recordChrome/types.ts](../../web/lib/recordChrome/types.ts)) — second phase. |

### 1.2 Allowed mutations (first slice)

Only operations that fit **fixed templates** ([overview-layout-doctrine.md](../architecture/overview-layout-doctrine.md)) and the existing **v0 overview config** shape ([overviewLayoutV0.ts](../../web/lib/rrs/overview/overviewLayoutV0.ts)):

| Operation | Example |
|-----------|---------|
| **Reorder** | Order of **bands** in `config.bands` (array order). |
| **Toggle visibility** | `band.enabled` true/false. |
| **Reorder items within a band** | Order of entries in `band.items` (same `band_key`). |
| **Header keys order** | `header_keys` array order (subset of allowed keys). |
| **Relationship group filter** | `relationship_group_keys` optional list — must match **registered** group keys for the entity (resolver/RRS semantics unchanged). |

**Out of v1:** Inventing new `band_key` values, new item `kind` strings, arbitrary nested JSON, or editing **`record_layouts`** drawer section order (`overview_section_order`) — those are separate intents or a later slice.

### 1.3 Persistence / versioning

- **Column:** `record_overview_layouts.config` (jsonb).
- **Concurrency:** Add **`version`** (integer) **inside** `config` (same pattern as `queue_definition` / `record_layouts.config_json`) — **`expected_config_version`** on write; missing version treated as **0** when reading.
- **Template key:** v1 writes assume a row exists or is upserted for `(org_id, entity_type, surface)` — see §6.

---

## 2. Current repo reality (audit)

### 2.1 `record_layouts` (global)

| Aspect | State |
|--------|--------|
| **Table** | `entity_type`, `key`, `config_json`, `is_active` — **no org** ([migration](../../supabase/migrations/20260409140000_record_layouts_and_record_actions.sql)). |
| **API** | **`GET /api/admin/record-layouts`** only ([route](../../web/app/api/admin/record-layouts/route.ts)) — **no POST/PATCH** in app routes. |
| **Writes** | Seeds / migrations only ([config-api-contract.md](../architecture/config-api-contract.md) §2). |
| **Types** | [`RecordLayoutConfigJson`](../../web/lib/recordChrome/types.ts) — `overview_section_order`, schedule `overview_rows`, `layout_blocks`. |

### 2.2 `record_overview_layouts` (org-scoped)

| Aspect | State |
|--------|--------|
| **Table** | `org_id`, `entity_type`, `surface`, `template_key`, `config` jsonb, `is_active` ([migration](../../supabase/migrations/20260408140100_record_overview_layouts.sql)). |
| **API** | **No** dedicated admin HTTP route in `web/app/api` (grep empty). |
| **Consumption** | Server-side **`loadRecordOverviewLayoutRow`** / **`loadEffectiveOverviewLayoutConfig`** ([overviewLayoutV0.ts](../../web/lib/rrs/overview/overviewLayoutV0.ts)). |
| **RLS** | Org + role policies (owner/admin/ops) — consistent with tenant settings. |
| **Parse** | **`parseOverviewLayoutConfig`** is **lenient** (fills defaults) — v1 **writes** need a **strict** sibling (`parseOverviewLayoutConfigStrict` or Zod). |

### 2.3 Doctrine alignment

- **Overview** = structured summary, not a page builder ([overview-layout-doctrine.md](../architecture/overview-layout-doctrine.md)).
- **RRS** supplies data; config chooses **which** bands/fields appear ([record-rendering-system-spec.md](../architecture/record-rendering-system-spec.md)).
- **AI** configures meaning within guardrails ([configuration-doctrine.md](../architecture/configuration-doctrine.md)).

---

## 3. Request envelope (agent v1 — mirror v0 shape)

Reuse the same **chat envelope** pattern as slice v0 ([ai-agent-implementation-slice-v0](./ai-agent-implementation-slice-v0.md) §3):

| Field | Notes |
|-------|--------|
| `request_id`, `correlation_id`, `message` | Same as v0. |
| `structured_override` | Typed intent until LLM exists. |
| **Intent type** | `"update_record_layout"` (narrow: **`target_kind`: `"record_overview_layout"`**, `entity_type`: `"job"`, `surface`: `"overview"`). |

**Slots (v1 narrow):**

| Slot | Type | Description |
|------|------|-------------|
| `target_kind` | `"record_overview_layout"` | Extensible later for global `record_layouts`. |
| `entity_type` | `"job"` | v1 fixed. |
| `surface` | `"overview"` | v1 fixed. |
| `config` | object | Full replacement `config` document after strict parse, **including `version`**. |
| `expected_config_version` | integer | Optimistic lock vs `config.version` (missing → 0). |

---

## 4. Grounding requirements

**Reads (admin context, same org):**

1. Resolve **`record_overview_layouts`** row: `org_id = ctx.orgId`, `entity_type = 'job'`, `surface = 'overview'`, `is_active = true` (or the row to be updated).
2. If **no row**, creation path must be explicit (upsert with defaults + first version) — **policy decision** in implementation (see §6).
3. Optional: **`GET`** resolver/entity for sanity — **not** required for config-only slice; do not use for writes.

**New admin read route (prerequisite):**

- **`GET /api/admin/record-overview-layouts`** (query: `entity_type`, `surface`) — returns **effective** row for org or 404 — **minimal** for grounding and humans.

---

## 5. Proposal shape

Mirror v0 proposal semantics ([ai-agent-system-contract.md](../architecture/ai-agent-system-contract.md) §3):

- **`proposal_id`**, **`before_hash` / `after_hash`** (SHA-256 of canonical `config` json text — same approach as queue RPC or TS helper).
- **`intent_json`**: full structured override.
- **`planned_operations`**: logical `PUT /api/admin/config/record-overview-layout` (or PATCH by id).

---

## 6. Validation path (three layers)

| Layer | Checks |
|-------|--------|
| **Intent** | `target_kind`, `entity_type`, `surface` allowed; `config` present; `expected_config_version` integer. |
| **Policy** | Admin-only (match v0: **`role === 'admin'`** for mutating global-sensitive config — align with work-units PATCH); org id from session; feature flag e.g. `AGENT_V1_RECORD_LAYOUT_ENABLED`. |
| **Config / API** | **Strict** `OverviewLayoutConfigV0` + **`version`** required; **unknown keys rejected**; `band_key` ∈ allowed set; item kinds ∈ allowed; **no** arbitrary bands; optional **relationship_group_keys** ⊆ registry for job (code-curated list). |

---

## 7. Persistence / audit needs

| Item | v1 recommendation |
|------|-------------------|
| **Audit tables** | **`agent_v1_record_layout_proposals`** + **`agent_v1_record_layout_apply_audit`** (or generic **`agent_config_apply_audit`** later) — same pattern as v0 (`proposal_id`, `org_id`, `user_id`, `before_hash`, `after_hash`, `terminal_status`). |
| **Atomicity** | **Postgres RPC** (single transaction: **update/upsert** `record_overview_layouts` + audit inserts), following **`agent_v0_commit_queue_definition_apply`** precedent. |
| **RLS** | Table writes via **service role** in Next route; RLS protects **direct** client access — mirror v0 doc patterns. |

---

## 8. Write route design

### 8.1 Recommended primary route

**`PUT /api/admin/config/record-overview-layout`** (or **`PATCH /api/admin/record-overview-layouts`** with id)

**Body (example):**

```json
{
  "entity_type": "job",
  "surface": "overview",
  "config": { "version": 1, "bands": [], "header_keys": [] },
  "expected_config_version": 0
}
```

- **Validate** with shared **strict** parser module used by agent orchestration and admin UI.
- **403** if not admin; **409** if stale version.

### 8.2 vs extending an existing route

| Option | Verdict |
|--------|---------|
| **Extend `GET /api/admin/record-layouts`** | Wrong table — that is **global** `record_layouts`; conflates two products. **Do not** use for org overview v0. |
| **New unified name** | **`PUT /api/admin/config/record-overview-layout`** keeps parity with [config-api-contract.md](../architecture/config-api-contract.md) §3 (“small explicit endpoints”). |
| **Global `PUT /api/admin/config/record-layout`** | Defer — requires **platform** governance for `(entity_type, key)`; document as **slice v2** if product needs AI to tune Alloy defaults. |

---

## 9. Failure modes

| Failure | HTTP | Notes |
|---------|------|--------|
| Strict validation | 400 | Unknown keys, invalid band_key, bad item shape. |
| Stale `expected_config_version` | 409 | Same semantics as queue v0. |
| Row missing and upsert not allowed | 404 / 400 | Policy: either **create-on-first-write** or **require seed row**. |
| Feature disabled | 403 | Env flag. |
| Audit/RPC partial failure | — | **Prevented** by transactional RPC (same lesson as queue v0). |

---

## 10. Build order (practical)

1. **Strict validator** — `overviewLayoutConfigStrictSchema` (or Zod) colocated with [`overviewLayoutV0.ts`](../../web/lib/rrs/overview/overviewLayoutV0.ts) types; unit tests.
2. **Admin GET** — `GET /api/admin/record-overview-layouts` for grounding.
3. **Admin PUT/PATCH** — single write path with `expected_config_version`.
4. **Migration** — ensure `config` documents carry `version`; add audit tables + RPC `agent_v1_commit_record_overview_layout_apply` (naming TBD).
5. **Agent orchestration route** — `POST /api/admin/agent/v1/record-overview-layout` (or extend v0 handler with intent router — **deferred** until multi-intent product decision; separate route keeps scope clear).
6. **Tests** — validator, route, orchestration `structured_override`, stale version.

---

## 11. Risks / doctrine checks

| Risk | Mitigation |
|------|------------|
| **Two layout systems** (`record_layouts` vs `record_overview_layouts`) | Document in product; v1 **only** touches org overview table; drawer section order remains **`record_layouts`** until a later slice explicitly scopes global writes. |
| **Lenient read parser vs strict write** | Reads may still default-fill; **writes** must be strict — same pattern as queue v0. |
| **Ops role** | Match **record_overview_layouts** RLS: **insert/update** typically **admin/owner**; **ops** read-only — align agent route with **admin-only** for mutations (tune if product wants ops). |

---

## 12. Relationship to system contract intent name

The platform intent is still **`update_record_layout`** ([ai-agent-system-contract.md](../architecture/ai-agent-system-contract.md) §4). This slice **implements** that intent for the **org overview** artifact first, with explicit **`target_kind: "record_overview_layout"`** in structured payloads so future **`target_kind: "record_layouts_global"`** does not collide.

---

**See also:** [ai-agent-v0-smoke-test.md](./ai-agent-v0-smoke-test.md) (patterns to copy) · [config-model-spec.md](../architecture/config-model-spec.md) §4 (record_layouts inventory)
