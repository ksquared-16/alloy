# AI agent v0 — local smoke verification

**Scope:** Deterministic rail only (`update_queue_definition` via admin APIs). No LLM, no chat UI.

**Related:** [ai-agent-implementation-slice-v0.md](./ai-agent-implementation-slice-v0.md) · [ai-agent-foundation.md](../architecture/ai-agent-foundation.md) · [ai-agent-system-contract.md](../architecture/ai-agent-system-contract.md)

---

## Prerequisites

1. **Migrations applied** (in order):
   - `20260412100000_agent_v0_audit.sql` — `agent_v0_proposals`, `agent_v0_apply_audit`, RLS.
   - `20260412200000_agent_v0_atomic_commit_rpc.sql` — `agent_v0_commit_queue_definition_apply` RPC + `REVOKE` on audit tables for `anon`.

2. **Environment (web)**  
   - `AGENT_V0_ENABLED=true` (or `1` / `yes`) for orchestration route.  
   - Normal Supabase env vars for `createAdminClient` (service role) so the RPC and RLS-bypassing writes work from Next.js.

3. **Auth**  
   - Cookie/session for an **`admin`** org user (same as other `/api/admin/*` routes). **`ops`** alone cannot call the agent route or PATCH work units for queue changes.

---

## Atomicity (what to expect)

- **Orchestration** (`POST /api/admin/agent/v0/queue-definition`) applies **`work_units.queue_definition` update + proposal row + apply_audit row** in **one Postgres transaction** via `agent_v0_commit_queue_definition_apply`.
- **Admin PATCH** (`PATCH /api/admin/work-units/[id]`) remains a **single-row update** only (no audit); that is intentional—audit is agent-specific.
- **Proposal hashes** (`before_hash` / `after_hash`) are **SHA-256 (hex) of the jsonb text** as computed **inside** the RPC (`extensions.digest`), not the former Node `hashQueueDefinitionForAudit` helper (removed). Rows written before this stabilization may differ in hash format.

---

## RLS and service role (quick reference)

| Surface | Who writes agent tables | RLS |
|--------|-------------------------|-----|
| Next.js `createAdminClient()` (service role) | Bypasses RLS | All inserts/updates used by v0 |
| Supabase client as **`authenticated`** (browser) | RLS applies | **SELECT**: owner / admin / **ops** (read-only on proposals/audit). **INSERT**: owner / **admin** only (not ops). **No UPDATE/DELETE** policies — mutations only via service role today. |
| **`anon`** | — | **`REVOKE ALL`** on both tables (second migration). |

This matches doctrine: **agent orchestration is admin-only** in code; **ops** may **read** audit for support, not **create** proposals.

---

## 1. PATCH work unit — success

**`PATCH /api/admin/work-units/:workUnitId`**

Headers: `Content-Type: application/json`, session cookie for admin.

**Body** (upgrade from empty `{}` to strict v1 — use `expected_queue_definition_version: 0` when stored row has no `version`):

```json
{
  "queue_definition": {
    "version": 1,
    "entity_type": "job",
    "sort": { "by": "updated_at", "direction": "desc" },
    "limit": 50
  },
  "expected_queue_definition_version": 0
}
```

**Expect:** `200`, JSON body includes updated `queue_definition` with `version: 1`.

---

## 2. PATCH — stale version

Repeat the same request **without** changing `expected_queue_definition_version` (still `0`) after the row now has `version: 1`.

**Expect:** `409`, error about version mismatch.

---

## 3. POST agent orchestration — success (`structured_override`)

**`POST /api/admin/agent/v0/queue-definition`**

Requires `AGENT_V0_ENABLED=true`.

**Body:**

```json
{
  "request_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  "correlation_id": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  "message": "smoke test",
  "structured_override": {
    "intent_id": "cccccccc-cccc-cccc-cccc-cccccccccccc",
    "intent_version": 1,
    "intent_type": "update_queue_definition",
    "slots": {
      "work_unit_id": "<same-uuid-as-PATCH>",
      "queue_definition": {
        "version": 1,
        "entity_type": "job",
        "sort": { "by": "updated_at", "direction": "asc" },
        "limit": 25
      },
      "expected_queue_definition_version": 1
    }
  }
}
```

**Expect:** `200`, `ok: true`, `execution.terminal_status === "success"`.

**DB (SQL or Table Editor):**

- One row in **`agent_v0_proposals`** with matching `proposal_id`, `org_id`, `work_unit_id`, `user_id`, `before_hash` / `after_hash`.
- One row in **`agent_v0_apply_audit`** with matching `proposal_id`, `terminal_status = 'success'`, `applied_queue_definition_version = 1`.

---

## 4. Agent route — feature disabled

Unset `AGENT_V0_ENABLED` or set to `false`. Repeat the POST above.

**Expect:** `403`, `error_code: FEATURE_DISABLED`.

---

## 5. Agent route — validation failure

With flag on, send `structured_override.slots.queue_definition` with an extra top-level key (e.g. `"extra": 1`).

**Expect:** `400`, `VALIDATION_FAILED`; **no** new audit rows.

---

## 6. POST create work unit — aligned validation

**`POST /api/admin/work-units`** with a **non-empty** `queue_definition` must be **strict v1** (same as PATCH). Example valid body fragment:

```json
"queue_definition": {
  "version": 1,
  "entity_type": "job",
  "sort": { "by": "created_at", "direction": "asc" },
  "limit": 20
}
```

**`{}` or omitted** still creates with `{}` in DB.

---

## Manual test order (recommended)

1. Apply migrations (local Supabase or linked project).  
2. `cd web && npx vitest run tests/rrs/queueDefinitionV1.test.ts tests/agent/`  
3. PATCH success → PATCH stale.  
4. Enable `AGENT_V0_ENABLED`, POST orchestration success → inspect DB.  
5. Feature-disabled and validation-failure checks.  
6. Optional: create work unit with valid v1 `queue_definition` via POST.

---

## Findings & stabilization summary (v0)

| Topic | Result |
|-------|--------|
| **Config/audit divergence** | Addressed for **orchestration** via transactional RPC; PATCH remains single-step (no audit). |
| **POST vs PATCH drift** | **POST create** now uses `normalizeQueueDefinitionForCreate`: `{}`/omit → `{}`; non-empty must pass **strict v1** (aligned with PATCH semantics). |
| **RLS** | Reviewed: org-scoped read; insert admin/owner only; ops read-only; anon revoked on audit tables; service role used by API (bypasses RLS by design). |
| **RPC privileges** | **`agent_v0_commit_queue_definition_apply`** granted **only** to **`service_role`** — not `authenticated`, so PostgREST clients cannot invoke it without the service key. |

---

## Doctrine alignment

- **Org-scoped** writes; no cross-tenant access in route handlers.  
- **Config-validated** JSON for `queue_definition` v1.  
- **Business `workflow_events`** unchanged; governance data lives in agent audit tables + RPC.  
- **Admin-context** matches `getAdminContext()` (agent route: **admin** only, same as PATCH for these mutations).
