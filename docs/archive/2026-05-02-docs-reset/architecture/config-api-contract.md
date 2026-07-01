# Configuration API — contract

**Purpose:** How configuration is **read**, **written**, and how **future AI** will interact — **contracts only**, not every route in the repo.

**Principles:** Org-scoped writes · **Service role** for admin mutations with `getAdminContext()` · Validate JSON config **server-side** before persist · **Idempotent** reads.

---

## 1. Read patterns (today)

| Resource | HTTP | Query / notes |
|----------|------|----------------|
| Field definitions | `GET /api/admin/field-definitions` | `entity_type` required for list. |
| Field definition | `GET /api/admin/field-definitions/[id]` | Single row, org-checked. |
| Field sections | `GET /api/admin/field-sections` | Org + `entity_type`. |
| Status definitions | `GET /api/admin/status-definitions` | Effective org + industry merge. |
| Status options | `GET /api/admin/status-options` | For dropdowns. |
| Record layouts | `GET /api/admin/record-layouts` | `entity_type=job\|schedule` — **global** rows today. |
| Record actions | `GET /api/admin/record-actions` | `entity_type=job\|schedule` — **global** rows. |
| Departments | `GET /api/admin/departments` | Org-scoped list. |
| Work units | `GET /api/admin/work-units` | Org-scoped; filter by department as implemented. |
| Document field defs | `GET /api/admin/document-field-definitions` | `doc_type` required. |

**Resolver / record truth:** `GET /api/admin/entity/[type]/[id]` — **not** “configuration” but consumes config-backed field registry when attaching defs.

---

## 2. Write patterns (today)

| Resource | HTTP | Notes |
|----------|------|------|
| Field definitions | `POST`, `PATCH`, `DELETE` | Under `field-definitions` and `[id]` — org enforced. |
| Field sections | `POST`, `PATCH`, `DELETE` | Section metadata; may bulk-touch defs. |
| Status definitions | `POST`, `PATCH`, `DELETE` | Org rows; see route for constraints. |
| Departments / work units | `POST`, `PATCH`, `DELETE` | Per existing admin routes — **queue_definition** updates must pass validation when validator exists. |
| Record layouts / actions | **Read-only routes** in reviewed code | **Writes** today via **migrations/seeds** or service-role scripts — **gap** for self-serve admin. |

---

## 3. Target unified config write contract (future)

When settings UI and AI land, prefer **small, explicit** endpoints over mega-payloads:

- **`PUT /api/admin/config/record-layout`** — body: `{ entity_type, key, org_id?: null, config_json }` with schema validation.
- **`PUT /api/admin/config/work-unit-queue`** — body: `{ work_unit_id, queue_definition, version }`.
- Or **resource-scoped** `PATCH` matching existing REST style — **key requirement** is **shared validation module** used by UI and AI.

**Forbidden:** AI or clients sending **unvalidated** JSON into `jsonb` columns without schema version checks.

---

## 4. AI contract (future)

| Capability | Allowed | Not allowed |
|------------|---------|-------------|
| Read effective config | Same GETs as admin, with **user’s org** | Cross-org reads |
| Propose changes | Return a **diff** against current config (human approves) | Auto-apply to prod without approval (until policy changes) |
| Apply changes | `PATCH`/`POST` through **same routes** as humans with **schema-validated body** | Raw SQL, service-role keys in client, new event_keys without code |
| Audit | Log **who** (user or `ai_agent_id` in metadata) | Anonymous writes |

**Header convention (future):** `X-Config-Write-Source: user | ai` for analytics — optional.

**See:** [ai-agent-foundation.md](./ai-agent-foundation.md) — **AI Agent Foundation** doctrine (role, capabilities, boundaries, API model, rollback/audit). [ai-agent-system-contract.md](./ai-agent-system-contract.md) — typed **AgentIdentity**, chat/intent/proposal lifecycle, Phase 1 intent taxonomy, validation layers, governance events.

---

## 5. Needs Attention & queues (reference)

- **No dedicated “Needs Attention API”** — behavior uses **`GET /api/admin/jobs`** with documented query params and **client** exception filter; see [API_CONTRACTS.md](../implementation/workspace-v2/API_CONTRACTS.md).
- **Future:** `queue_definition` v1 **validated** server-side; server could filter exception lanes without duplicating predicates in client.

---

## 6. Expected response shapes (stability)

- List endpoints return **arrays** named by resource: `{ field_definitions }`, `{ layouts }`, `{ actions }`, `{ items }` — **do not rename** without version bump of API consumer.
- Config JSON columns return **objects**; clients must tolerate **unknown keys** (forward compatibility).

---

**See:** [config-model-spec.md](./config-model-spec.md) · [configuration-doctrine.md](./configuration-doctrine.md)
