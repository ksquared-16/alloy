# AI agent — implementation slice v0

**Purpose:** Define the **thinnest end-to-end** implementation slice that proves an AI-assisted config change can run **safely** inside Alloy’s existing **org-scoped, admin-context, config-validated** architecture — without building the full agent product, operational actions, autonomy, or a finished chat UI.

**Doctrine / contracts (source of truth):** [Alloy System Overview](./ALLOY_SYSTEM_OVERVIEW.md) · [Events & Triggers](./EVENTS_AND_TRIGGERS.md) · [Entity Model](../audits/ENTITY_MODEL.md) · [Workspace / work unit / scope](../architecture/workspace-work-unit-scope-doctrine.md) · [Record Rendering System](../architecture/record-rendering-system-spec.md) · [Overview layout](../architecture/overview-layout-doctrine.md) · [Configuration doctrine](../architecture/configuration-doctrine.md) · [Config API contract](../architecture/config-api-contract.md) · [AI agent foundation](../architecture/ai-agent-foundation.md) · [AI agent system contract](../architecture/ai-agent-system-contract.md) · [Foundation implementation plan](./foundation-implementation-plan.md) · [Implementation gap audit](../architecture/implementation-gap-audit.md)

**Primary v0 intent:** `update_queue_definition` (typed end-to-end: message → proposal → validated write → audit).

**Secondary (explicitly not v0):** `update_record_layout` — noted in §7 as the next slice; blocked today by **read-only** record-layout admin routes in reviewed code ([config API contract](../architecture/config-api-contract.md) §2).

---

## 1. Scope of v0

### 1.1 In scope (exactly)

| Item | Notes |
|------|--------|
| **Single intent** | `update_queue_definition` only — no intent router beyond this one type + reject-unknown. |
| **Orchestration on the server** | One **BFF-style** admin route (or small server module invoked only from admin API) that runs: parse → ground → intent → proposal → validate → **one** PATCH plan → result + audit. |
| **Grounding reads** | `GET /api/admin/work-units` (list/filter) and **`GET /api/admin/work-units/[id]`** for current `queue_definition` + `updated_at` / version — same patterns as existing admin ([config API contract](../architecture/config-api-contract.md) §1). |
| **Config write** | **Only** `work_units.queue_definition` update for a row already in the caller’s org — via **validated** path (§7). |
| **Validation stack** | Intent → policy → **shared** queue JSON schema validation (§6) — **server authoritative**. |
| **Persistence minimum** | `proposal_id`, correlation id, **before/after** snapshot or hash for `queue_definition`, `user_id`, `org_id`, timestamps, terminal status (§5). |
| **Access** | **Admin** session only (`getAdminContext()`), same as [`PATCH` work-units](../../web/app/api/admin/work-units/[id]/route.ts) today (`role === "admin"`). |
| **Feature flag** | Gate the **new** orchestration entry point + any persistence; safe fallback when off (§10). |

### 1.2 Out of scope (exactly)

| Item | Why out |
|------|---------|
| Full **AgentIdentity** registry, capability profiles UI, multi-intent taxonomy | v0 proves **one** safe pipe; registry comes later ([system contract](../architecture/ai-agent-system-contract.md) §1). |
| **LLM** in production path | v0 may use **stubbed** or **manual** structured payload in dev to prove orchestration; optional LLM behind flag is **not** required to close the slice. |
| **Chat UI**, threads, streaming | No final UX; at most a **developer/admin** JSON or internal form posting the **request envelope** (§3). |
| **Operational** writes (jobs, schedules, etc.) | Forbidden by doctrine ([AI agent foundation](../architecture/ai-agent-foundation.md) §C). |
| **Workflow / event execution** for business facts | Agent does not emit `payment_posted`-style events or bypass workflows ([Events & Triggers](./EVENTS_AND_TRIGGERS.md)). |
| **Autonomous** apply, scheduled agents, retries without idempotency rules | v0 is **on-demand**, single proposal, explicit result. |
| **`update_record_layout`** | Requires layout **write** path + overview registry validation — **slice v1** candidate (§7). |

### 1.3 Why this is the right first proof

1. **Workspace doctrine** centers **work units** and **queues** as execution surfaces ([workspace doctrine](../architecture/workspace-work-unit-scope-doctrine.md)); `queue_definition` is the natural **config** lever for “how this lane behaves” without touching **record truth**.
2. **Foundation plan** explicitly calls for **`queue_definition` v1** + validator ([foundation plan](./foundation-implementation-plan.md) B.2 / prioritization).
3. **Gap audit** flags `queue_definition` as **unversioned / ad hoc** today ([gap audit](../architecture/implementation-gap-audit.md) §3) — v0 **closes** a real integrity gap while proving the agent **pipe**.
4. **Single write target** — one row, one JSON column — minimizes **partial apply** surface (still handled in §9).

**Decisive statement:** v0 is valid if we can show a **delegated admin** action producing a **typed proposal** and a **single server-validated** `queue_definition` write with **audit** — not if we ship a chat product.

---

## 2. User flow (concrete)

End-to-end sequence (aligned with [system contract](../architecture/ai-agent-system-contract.md) §3.3):

```
1. User message          → raw text + optional structured hints (dev-only).
2. Agent request envelope → authenticated POST with org implied by session (§3).
3. Grounding reads       → GET work-units list + GET work unit by id (current JSON).
4. Typed intent          → { intent_type: "update_queue_definition", slots, intent_version }.
5. Proposal              → proposal_id, diff (before/after), planned single PATCH.
6. Validation            → intent + policy + schema + version gate (§6).
7. Execution plan        → exactly one step: PATCH .../work-units/[id].
8. Config API write      → server applies update through existing admin Supabase path with NEW validation layer (§7).
9. Audit / result        → persisted applied record + HTTP response to caller (§5–6).
```

**Invariant:** Steps 6–8 run **only on the server**; the browser never holds service role or composes raw SQL.

---

## 3. Request/response envelopes (v0 contract shapes)

Field names are **prescriptive** for the slice so implementations do not fork ad hoc JSON.

### 3.1 `AgentV0ChatRequest` — chat submission / agent invocation

Used for the **single** admin entry point (§4).

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `request_id` | string (uuid) | yes | Client-generated idempotency key for this submission. |
| `correlation_id` | string (uuid) | yes | Traces one user goal across logs/audit. |
| `org_id` | string (uuid) | optional | **Must** match session org if sent; server uses `getAdminContext().orgId` as source of truth ([Entity Model](../audits/ENTITY_MODEL.md)). |
| `message` | string | yes | Natural-language goal (may be ignored if `structured_override` present in dev). |
| `structured_override` | object | no | **Dev-only:** bypass NL parse; must match `AgentV0ParsedIntent` shape when flag enabled. |
| `work_unit_id` | string (uuid) | no | Hint for grounding; server still verifies org ownership. |

**Response wrapper (always):** `{ ok: boolean, correlation_id, request_id, error?: AgentV0Error }` plus payload below on success.

### 3.2 `AgentV0GroundingBundle`

| Field | Type | Description |
|-------|------|-------------|
| `context_id` | string (uuid) | Id for this bundle. |
| `fetched_at` | string (ISO-8601) | Server time. |
| `work_units_snapshot` | object | Minimal: `{ id, name, key, department_id, queue_definition, updated_at }` for target row (+ list summary if needed). |
| `source_routes` | string[] | e.g. `["GET /api/admin/work-units", "GET /api/admin/work-units/:id"]` for audit transparency. |

### 3.3 `AgentV0ParsedIntent`

| Field | Type | Description |
|-------|------|-------------|
| `intent_id` | string (uuid) | New id per parse. |
| `intent_version` | literal `1` | Lock v0. |
| `intent_type` | literal `"update_queue_definition"` | Only value accepted in v0. |
| `slots` | `AgentV0UpdateQueueDefinitionSlots` | See §3.4. |

### 3.4 `AgentV0UpdateQueueDefinitionSlots`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `work_unit_id` | uuid | yes | Target row. |
| `queue_definition` | object | yes | **Full replacement** document for the column (not a patch merge) — must include `version` per §6. |
| `expected_queue_definition_version` | number | yes | Optimistic concurrency: must equal current `queue_definition.version` on server **after** v0 schema defines versioning (default initial `0` if migrating legacy empty `{}`). |

### 3.5 `AgentV0ProposalRecord`

| Field | Type | Description |
|-------|------|-------------|
| `proposal_id` | string (uuid) | Stable id for audit + idempotency. |
| `intent_id` | string | |
| `org_id` | uuid | From admin context. |
| `status` | enum | `validated` \| `rejected` (v0 does not need `draft` if synchronous pipeline). |
| `diff` | object | `{ field: "queue_definition", before_hash, after_hash }` — hashes SHA-256 of canonical JSON strings. |
| `planned_operations` | array | One element: `{ op: "PATCH", path: "/api/admin/work-units/{id}", body_ref: "inline" }`. |

### 3.6 `AgentV0ExecutionPlan`

| Field | Type | Description |
|-------|------|-------------|
| `plan_id` | string (uuid) | |
| `proposal_id` | string | |
| `steps` | array | **Exactly one** step: `{ step_index: 0, method: "PATCH", path: "/api/admin/work-units/{work_unit_id}", body: { queue_definition, expected_queue_definition_version } }`. |

**Note:** Internal execution may call a **shared TypeScript function** rather than HTTP loopback to avoid double auth; the **logical** plan still matches this shape for audit ([system contract](../architecture/ai-agent-system-contract.md) §3.2).

### 3.7 `AgentV0ExecutionResult`

| Field | Type | Description |
|-------|------|-------------|
| `result_id` | string (uuid) | |
| `plan_id` | string | |
| `terminal_status` | enum | `success` \| `failed` (v0: no partial — single step). |
| `per_step` | array | `{ step_index, http_status_or_internal, work_unit_id, applied_queue_definition_version }`. |
| `applied_snapshot` | object | Server-returned work unit row **after** write (subset: `id`, `queue_definition`, `updated_at`). |

### 3.8 `AgentV0Error` — error result

| Field | Type | Description |
|-------|------|-------------|
| `error_code` | enum | See §9 (`PARSE_FAILED`, `SCOPE_DENIED`, `STALE_VERSION`, `VALIDATION_FAILED`, `POLICY_DENIED`, `APPLY_FAILED`, `FEATURE_DISABLED`). |
| `message` | string | Safe for admin UI / logs (no secrets). |
| `details` | object | Optional: validator paths, `{ field, reason }`. |

---

## 4. Runtime boundary

| Rule | v0 decision |
|------|-------------|
| **Where orchestration runs** | **Server-only**: new handler e.g. `POST /api/admin/agent/v0/queue-definition-proposal` (exact path TBD) under `web/app/api/admin/`, using **`getAdminContext()`** — same as [work-units route](../../web/app/api/admin/work-units/[id]/route.ts). |
| **Not in the client** | Browser sends **one** request; no multi-step PATCH orchestration from React. |
| **Not model-to-database** | No LLM receives DB credentials; no Edge function that skips admin validation. |
| **No raw SQL** | All writes via existing Supabase admin client patterns inside API routes ([Alloy System Overview](./ALLOY_SYSTEM_OVERVIEW.md) multi-tenant boundary). |
| **Org scoping** | Every read/write filtered by **`ctx.orgId`**; work unit id must belong to org (reuse `assertRowOrg` / same checks as PATCH). |

**Tie-in:** This preserves **RLS + admin context** as the trust anchor ([Entity Model](../audits/ENTITY_MODEL.md)), consistent with [config API contract](../architecture/config-api-contract.md).

---

## 5. Persistence / audit plan (minimum)

| Artifact | Persist? | Storage approach (implementation choice) |
|----------|----------|----------------------------------------|
| **Proposal** | **Yes** | One row or JSON blob: `proposal_id`, `request_id`, `correlation_id`, `org_id`, `user_id`, `work_unit_id`, `intent_json`, `status`, `before_hash`, `after_hash`, `created_at`. |
| **Applied audit** | **Yes** | Append-only: `result_id`, `proposal_id`, `applied_queue_definition_version`, `updated_at`, optional full `queue_definition` snapshot **or** hash-only if storage-sensitive. |
| **Correlation / proposal ids** | **Required** | `correlation_id` links logs + audit; `proposal_id` idempotency: **reject duplicate apply** with same `proposal_id` + success (§9). |
| **Chat thread history** | **Deferred** | v0 does **not** require `AgentChatMessage` storage; optional log of `message` text for debugging behind flag. Doctrine: chat is **intent capture** ([system contract](../architecture/ai-agent-system-contract.md) §3.1) — persist **structured** outcomes first. |

**RLS:** If tables land in Supabase, they must be **org-scoped** with policies matching **`org_id`** from the delegating user — same principle as [Entity Model](../audits/ENTITY_MODEL.md).

---

## 6. Validation path

### 6.1 Intent validation

- `intent_type === "update_queue_definition"` only.
- `slots.work_unit_id` uuid; `slots.queue_definition` object; `slots.expected_queue_definition_version` number.
- Reject unknown keys at `intent_version` 1 (strict).

### 6.2 Policy validation

- Admin **`role === "admin"`** (match existing PATCH).
- `work_unit_id` resolves to a row with **`org_id === ctx.orgId`**.
- Optional: feature flag `agent_v0_enabled` for org or env.
- **Max ops:** exactly **1** write — enforced.

### 6.3 Config / API validation (queue_definition v1)

- Introduce **shared** `queueDefinitionV1Schema` (Zod or JSON Schema) in **`web/lib/`** (exact path in implementation) — used by:
  - the **orchestration** path, and
  - the **work unit PATCH** path when `queue_definition` is present.

**Minimum v1 contents (align with gap audit + foundation plan):**

| Rule | Purpose |
|------|---------|
| `version` required integer | Enables optimistic concurrency ([config model spec](../architecture/config-model-spec.md) §5). |
| Allowed keys only (e.g. `entity_type`, `filters`, `sort`, `limit`) | Prevents ad hoc JSON explosion ([gap audit](../architecture/implementation-gap-audit.md) §3). |
| Reject extra keys OR explicit `additionalProperties: false` | **Decisive** for v0 — strict schema. |

### 6.4 Optimistic concurrency

- **Read** current `queue_definition` in the same handler before write.
- Compare `slots.expected_queue_definition_version` to `current.queue_definition.version` (treat missing version as **`0`**).
- Mismatch → **`409 STALE_VERSION`** with `AgentV0Error` — no partial write.

**Doctrine tie-in:** Same spirit as [config API contract](../architecture/config-api-contract.md) **forbidden** unvalidated jsonb writes.

---

## 7. API execution bridge

### 7.1 Current state (evidence)

- **`PATCH /api/admin/work-units/[id]`** accepts `queue_definition` as a **JSON object** with **no** schema validation and **no** version check ([route implementation](../../web/app/api/admin/work-units/[id]/route.ts) — `parseQueueDefinition` only checks object-ness).

**Conclusion:** v0 **cannot** ship “as-is” for AI-only safety without **tightening** the write path — humans benefit too.

### 7.2 v0 decision (choose one path — both valid)

| Option | Description | Ship v0? |
|--------|-------------|----------|
| **A (recommended)** | **Enhance** `PATCH /api/admin/work-units/[id]``: when `queue_definition` is supplied, run **`queueDefinitionV1Schema.parse`**, enforce **`expected_queue_definition_version`** in body (new field), then update. | **Yes** — single write route for humans + agent. |
| **B** | Add **`PUT /api/admin/config/work-unit-queue`** per [config API contract](../architecture/config-api-contract.md) §3; orchestration calls only this route. | **Yes** — clearer “config” surface; PATCH left loose longer (not ideal). |

**Recommendation:** **Option A** for v0 — **one** write surface, shared validator, fewer divergent behaviors ([configuration doctrine](../architecture/configuration-doctrine.md): same validation for UI and AI).

### 7.3 Internal execution

- Orchestration **may** call a shared `applyWorkUnitQueueDefinition({ ctx, workUnitId, queueDefinition, expectedVersion })` used by PATCH — **no** HTTP self-call required.
- **Logical** `AgentV0ExecutionPlan` still generated for audit.

### 7.4 Secondary future slice: `update_record_layout`

- **Blocked** until **`PUT /api/admin/config/record-layout`** (or PATCH on org-scoped layout rows) exists with shared schema ([config API contract](../architecture/config-api-contract.md) §2–3).
- **Maps** to [overview layout doctrine](../architecture/overview-layout-doctrine.md) + [RRS](../architecture/record-rendering-system-spec.md) registry validation — **slice v1** candidate.

---

## 8. Events / observability

### 8.1 Business `workflow_events`

- **Do not** emit fake business events (`job_updated`, etc.) for config-only changes ([Events & Triggers](./EVENTS_AND_TRIGGERS.md) — events are **business facts**).

### 8.2 Agent governance events

- **v0:** **Audit persistence + structured server logs** (correlation id, proposal id, user id, org id, outcome) are **sufficient** to prove traceability ([system contract](../architecture/ai-agent-system-contract.md) §6).
- **Optional stretch:** insert **`agent_config_change_applied`** into a **governance** store or `workflow_events` with `entity_type: "config_proposal"` **only if** payload schema is agreed — **not** a v0 gate.

**Rule:** Avoid polluting the **business** event stream with high-volume parse attempts; log parse failures at **info/warn**, not as `workflow_events` ([Events & Triggers](./EVENTS_AND_TRIGGERS.md) §4 — no validation failures as events).

---

## 9. Failure modes

| Failure | Behavior | HTTP | `error_code` |
|---------|----------|------|----------------|
| **Parse failure** | NL → intent fails; no DB write | `400` | `PARSE_FAILED` |
| **Invalid scope** | Work unit not in org / not admin | `403`/`404` | `SCOPE_DENIED` |
| **Stale config version** | Expected version ≠ stored | `409` | `STALE_VERSION` |
| **Validation rejection** | Schema / policy | `400` | `VALIDATION_FAILED` |
| **Policy denial** | Flag off, rate limit (future) | `403` | `POLICY_DENIED` |
| **Apply failure** | DB error after validation | `500` or `400` | `APPLY_FAILED` |
| **Partial apply** | N/A for v0 (single step) | — | If multi-step later: `PARTIAL` + per-step in result |

### 9.1 Retry / idempotency posture

- **Same `proposal_id` + successful apply:** return **200** with **same** `result_id` reference (idempotent read of outcome) or **409** duplicate — **pick one** in implementation and document.
- **Same `request_id`:** reject duplicate in-flight or coalesce — **server-side** dedupe window (e.g. 24h) optional.

**Aligns with:** [AI agent foundation](../architecture/ai-agent-foundation.md) §E.2 (no anonymous writes; attributable ids).

---

## 10. Release strategy

| Control | v0 expectation |
|---------|----------------|
| **Feature flag** | e.g. `AGENT_V0_QUEUE_DEFINITION` env or org metadata — **default off** in production until QA signoff. |
| **Org scoping** | Only orgs explicitly allowlisted **or** global enable in staging. |
| **Admin-only** | Same as PATCH — **admin** role; no operator/field roles for v0. |
| **Fallback if disabled** | Route returns **`403` / `FEATURE_DISABLED`**; no partial routes exposed to users. |

**Architecture tie-in:** Config changes affect **all users in org** ([config surfaces](../architecture/config-surfaces-spec.md)) — conservative rollout matches [configuration doctrine](../architecture/configuration-doctrine.md).

---

## 11. Build order (practical sequence)

1. **Shared validator** — `queueDefinitionV1Schema` + unit tests (fixtures: `{}` → version `0` migration story).
2. **PATCH enhancement** — wire validator + `expected_queue_definition_version` into **`PATCH /api/admin/work-units/[id]`** (Option A, §7).
3. **Persistence** — minimal `agent_v0_proposals` / `agent_v0_apply_audit` tables **or** JSON audit log table — **org_id** + RLS.
4. **Orchestration route** — `POST` admin handler: ground → intent (stub) → validate → call shared apply → write audit.
5. **Test path** — integration test: admin context → PATCH with v1 JSON → read back; agent route → success + audit row; stale version → 409.

**No UI** in this sequence; use **curl** or internal script invoking the POST envelope.

---

## 12. What we should build immediately after this doc

1. **Implement `queueDefinitionV1Schema` + PATCH wiring** — unblocks both **manual** admin safety and **agent** v0 ([foundation plan](./foundation-implementation-plan.md)).
2. **Add minimal audit tables** (or agreed alternative) for **`proposal_id` / `result_id`** correlation.
3. **Ship orchestration POST** behind flag — stub intent from `structured_override` first, NL parse later.
4. **Plan slice v1:** `update_record_layout` once **record layout write** API + overview key registry validation exist ([gap audit](../architecture/implementation-gap-audit.md) §4 item 2).

---

**Canonical cross-links:** [AI agent system contract](../architecture/ai-agent-system-contract.md) (`update_queue_definition` intent table) · [Config API contract](../architecture/config-api-contract.md) §3.
