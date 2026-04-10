# AI agent foundation — doctrine, capabilities, boundaries, and API model

**Purpose:** Define how **AI will safely interact with Alloy through configuration** in a future implementation phase. This document is **contracts and structure only** — no AI runtime, no new UI, no autonomous execution of business operations.

**Phase:** **AI Agent Foundation** — follows Workspace V2, Needs Attention work unit, visual context, and the configuration stack (doctrine, model, surfaces, [config API contract](./config-api-contract.md)).

**Principle:** AI **configures meaning and presentation within guardrails**; the **platform** owns truth, authorization, workflows, and ledger semantics. Aligns with [configuration-doctrine.md](./configuration-doctrine.md), [workspace-work-unit-scope-doctrine.md](./workspace-work-unit-scope-doctrine.md#future-ai-compatibility-not-implementation-now), and §4 of [config-api-contract.md](./config-api-contract.md).

---

## A. AI agent doctrine

### A.1 Role: configuration, not execution

| Responsibility | AI **does** | AI **does not** |
|----------------|-------------|-----------------|
| **Primary** | Propose or apply **validated configuration** (fields, statuses, hierarchy, record chrome, queue metadata) **within the caller’s org** through the **same APIs** humans use. | Execute **`event_key`** handlers, workflows, payments, messaging, or any side-effecting “do the thing” path. |
| **Problem space** | Reduce time to **tune** layouts, lanes, labels, ordering, and work-unit structure; translate natural-language intent into **structured config deltas** subject to review policy. | Replace **resolver** composition, **RLS**, or **business rules** encoded in code until explicitly externalized with a validated DSL and governance. |
| **Authority** | **Non-authoritative by default** — outputs are **candidates**; org policy decides whether a human must approve before persist. | **Silent production changes** without audit, validation, or policy (see §E). |

**One-line doctrine:** *The AI agent is a **configuration assistant** that speaks only through **versioned, server-validated admin APIs**; it never becomes a parallel write path to the database or to operational truth.*

### A.2 Problems this design solves

1. **Safe acceleration** — Admins describe intent in natural language; the system maps that to **known config shapes** instead of hand-editing JSON.
2. **Consistency** — AI and UI share **one validation module** and **one HTTP surface** — no “AI-only” shortcuts.
3. **Auditability** — Every persisted change is attributable to **user + optional AI correlation id**, same as human-driven settings.
4. **Bounded creativity** — Layout suggestions, queue ordering hints, and lane toggles stay inside **registered keys**, **allowed status keys**, and **schema-versioned** blobs.

### A.3 Non-goals (this foundation phase)

- Building **models**, **prompts**, or **agent runtimes**.
- **Autonomous** loop: observe production → mutate config without human gate (unless product policy later explicitly allows scoped auto-apply).
- **New** business capabilities (invoices, assignments, SLAs) via config alone — those require **code** and migrations.

---

## B. Agent capability map

Capabilities are **read** vs **write**, scoped by **org** (and global template reads where applicable). **Effective** config resolution (org row vs industry vs global default) follows existing admin GET behavior.

### B.1 Read capabilities (allowed)

| Config domain | Read scope | Notes |
|---------------|------------|--------|
| **Field registry** | `field_definitions`, `field_section_definitions`, `field_values` patterns | Same as admin list/detail; `entity_type` and org context required where the API requires it. |
| **Status vocabulary** | `status_definitions`, `status-options` | Effective merge (org + industry) as implemented. |
| **Work hierarchy** | `departments`, `work_units` | Includes `queue_definition`, `metadata` for **hints** (e.g. visual context keys **registered in code**). |
| **Record chrome** | `record_layouts`, `record_actions` | **Global** rows today; future org-scoped templates when schema/APIs exist. |
| **Documents** | `document_field_definitions` | Per `doc_type` as required. |
| **Operational context (consume-only)** | Jobs/schedules lists, entity resolver payloads | For **grounding** proposals (“what does this queue show today?”) — **not** for mutating operational rows via AI in this doctrine. |

**Forbidden reads:** Cross-org data, service-role **bypass** of RLS, raw SQL, or any path that **exports secrets** (tokens, keys) not exposed to the interactive admin user.

### B.2 Write capabilities (allowed when API + validation exist)

Writes are always **HTTP admin routes** with **schema-validated bodies** — see [config-api-contract.md](./config-api-contract.md) §2–3.

| Config domain | Mutation types | Preconditions |
|---------------|------------------|---------------|
| **Custom fields & sections** | CRUD on field definitions, sections, visibility | Dependency checks (e.g. existing `field_values`) as today; destructive ops may require **explicit human confirmation** in product policy. |
| **Status definitions** | CRUD within **allowed keys** | Must respect enums / lifecycle checks the code enforces. |
| **Departments & work units** | CRUD; update `sort_order`, `is_active`, **`metadata`**, **`queue_definition`** | **`queue_definition`** only when a **versioned schema** and shared validator exist; otherwise **no** unvalidated JSON. |
| **Record layouts** | Create/update layout **`config_json`** | Validated against **registered** overview/section keys per entity (see [config-model-spec.md](./config-model-spec.md)); **version** field in JSON. |
| **Record actions** | Create/update rows (labels, placement, **`event_key` reference**) | **`event_key`** must reference **known handlers in code** — AI **selects among** catalogued keys; it does **not** invent new server behavior. |

### B.3 Create semantics (what “create” means)

| Artifact | AI may **create** | AI may **not** create |
|----------|-------------------|------------------------|
| **Exception types / lanes** | **Config hooks** that **select** among **code-registered** exception filters or future **DSL** lanes — **ordering**, **labels**, **enablement** within schema. | New **predicate semantics** or **SQL** without a shipped, reviewed DSL + migration. |
| **Queues** | **Projections** via **`queue_definition`** (versioned) and work-unit rows — **not** new entity types. | Bypassing **`work_units`** / org scope or inventing **ad hoc** filters outside the contract. |
| **Layouts** | New **`record_layouts`** rows (or org copies) **validated** against template/registry rules. | Arbitrary **`config_json`** keys that the **server** does not accept. |
| **Actions** | New **`record_actions`** rows pointing at **existing** `event_key` values. | New **`event_key`** strings **without** a code handler and release process. |

---

## C. Agent boundary rules

### C.1 Hard prohibitions (system-enforced)

| Boundary | Rule |
|----------|------|
| **Data plane** | **No** direct database writes, **no** Supabase service role in client/agent, **no** raw SQL. |
| **Operational records** | **No** AI-driven PATCH to **jobs, schedules, invoices, ledger entries, payments**, or other **authoritative operational** entities **except** through normal **product workflows** invoked by **users** (not by the config agent). |
| **Ledger & money truth** | **No** mutations that change **financial** or **compliance** state as a side effect of “config” — those are **workflow** concerns. |
| **Authorization** | **No** changing **`user_roles`**, RLS policies, or secrets **except** via existing **admin identity/settings** APIs if and when exposed with the same checks as human admins. |
| **Workflow execution** | **No** bypassing **state machines**, approvals, or **event** pipelines — config may **expose** a button (`event_key`); **pressing** it is a **user** action. |
| **Semantics** | **No** new **resolver** fields, **relationship groups**, or **visual context families** without **code** registration ([configuration-doctrine.md](./configuration-doctrine.md) §3). |

### C.2 System-controlled (must remain platform-owned)

Mirror of [configuration-doctrine.md](./configuration-doctrine.md) §3, emphasized for agents:

- Resolver output shape, **edit ownership**, and **record truth**.
- **Auth / org context** and tenant isolation.
- **Implementation** of **`event_key`** and workflow **effects**.
- **Catalogs:** `VisualContextKey`, visual families, allowed overview keys — **selection** from catalog only.
- **Exception predicates** — until a **validated DSL** ships, **code** owns predicate definitions ([deferred-decisions.md](./deferred-decisions.md)); config may **reference** and **order**, not **arbitrary code**.

### C.3 Soft boundaries (policy, not just code)

- **Rate and blast radius** — batch size limits, max fields touched per session, “dry run” default for new orgs.
- **Approval** — production apply may require **four-eyes** or **change window** per org policy.
- **Global templates** — mutating **global** `record_layouts` / `record_actions` may be **platform-admin only**; tenant AI is **org-scoped** rows or **copy-on-write** from template.

---

## D. Agent API interaction model

### D.1 Input path: natural language → structured intent

1. **User or system** sends a **goal** (e.g. “Prioritize payment exceptions in Needs Attention and hide dormant lanes”).
2. **Agent layer** (future) produces a **`ConfigIntent`** — a **typed, versioned** structure: target **resources** (work unit ids, layout keys), **operation** (reorder, toggle, update JSON path), and **constraints** (must not delete fields in use).
3. **Grounding** — optional **read** calls to assemble **current state** (`GET` admin APIs) so the intent is **diffed** against **truth**, not assumptions.
4. **Output for review** — a **`ConfigProposal`**: list of **HTTP operations** (method, path, body) or a **semantic diff** that **maps 1:1** to those operations.

**Stability:** Intent schemas are **versioned** (`intent_version`); breaking changes require a **bump** and coexistence period for clients.

### D.2 Mapping intent to config changes

| Step | Responsibility |
|------|----------------|
| **Normalize** | Map NL slots to **known resource types** (work unit, layout, field def) and **ids** from GET responses. |
| **Validate locally** | Optional client/agent validation using the **same Zod/JSON Schema** as the server **before** submit (reduces round-trips). |
| **Produce minimal writes** | Prefer **PATCH** with changed fields; avoid wholesale replace when unnecessary. |
| **Conflict handling** | Send **`If-Match` / version** on resources that support optimistic concurrency (or **`queue_definition` version** field) — **reject stale** applies with a clear error for rebase. |

### D.3 Calling APIs

- **Same hosts and routes** as interactive admin — e.g. `GET/POST/PATCH/DELETE` under `/api/admin/...` per [config-api-contract.md](./config-api-contract.md).
- **Credentials** — **User-delegated** session (cookie/JWT) or **backend-for-frontend** that injects **`getAdminContext()`** — **not** embedding service keys in an untrusted client.
- **Headers (future)** — optional `X-Config-Write-Source: ai` for analytics; **actor** still resolved to a **real user** unless a dedicated **service principal** model is added with explicit audit requirements.
- **Idempotency** — retries use **idempotent** keys where routes support them; otherwise **read-after-write** to confirm.

### D.4 Human vs automated apply

| Mode | Behavior |
|------|----------|
| **Suggest** | Return **`ConfigProposal`** only; **no** POST/PATCH until user confirms in **settings UI** (or API **approve** endpoint if added). |
| **Apply** | Execute the **same** POST/PATCH sequence; each response **must** be **2xx** with **validated** body persisted server-side. |
| **Auto-apply (future policy)** | Only for **low-risk** flags (e.g. reorder within allowlist) — **explicit** product and legal review; **not** assumed in this foundation doc. |

---

## E. Safety, validation, audit, rollback

### E.1 Validation before write

1. **Server is authoritative** — Every write passes **shared** validation (Zod/JSON Schema) in the API route; **no** trust in model output.
2. **Schema version** — `config_json`, `queue_definition`, and similar **jsonb** carry **`version`**; unknown versions **reject** with a **clear** error ([config-model-spec.md](./config-model-spec.md) §5).
3. **Referential integrity** — Foreign keys, org match (`work_units.org_id` vs `jobs.org_id` patterns), and **“in use”** checks mirror human admin.
4. **Size limits** — Max JSON depth/size for AI-originated payloads to prevent **DoS** and pathological prompts.

### E.2 Audit trail

| Field | Requirement |
|-------|-------------|
| **Who** | Authenticated **user** id; optional **`ai_agent_id` / `proposal_id`** in **metadata** or dedicated audit table row. |
| **What** | Resource type, id, **before/after** snapshot or **semantic diff** hash. |
| **When** | Server timestamp; correlate with **request id** for support. |
| **Source** | `user` vs `ai` (header or body flag on proposal execution). |

**Forbidden:** Anonymous or unattributed config writes.

### E.3 Rollback and versioning

| Mechanism | Use |
|-----------|-----|
| **Optimistic concurrency** | Version fields on mutable JSON (`queue_definition.version`, layout `config_json.version`) — **stale write fails** fast. |
| **History table (target)** | Store **append-only** config history for critical resources (work unit, layout) — **restore** = new write with previous payload + bumped version. |
| **GitOps / export (optional)** | Export **effective config** as JSON for **offline** diff and **re-import** through the same APIs — supports **disaster rollback** without DB access. |
| **Feature flags** | Large migrations may be **gated** behind flags so AI-suggested bulk changes roll out **incrementally**. |

**Doctrine:** Prefer **forward fix** (new validated write) over **raw** DB rollback; **break-glass** is **platform** access, not agent access.

---

## F. Related documents

| Document | Relationship |
|----------|----------------|
| [configuration-doctrine.md](./configuration-doctrine.md) | Config vs system-controlled; AI guardrails summary. |
| [config-api-contract.md](./config-api-contract.md) | Read/write tables; future unified PUTs; AI contract summary. |
| [config-model-spec.md](./config-model-spec.md) | Entities, DB vs code, versioning. |
| [config-surfaces-spec.md](./config-surfaces-spec.md) | Where humans (and later AI) touch config in product. |
| [workspace-work-unit-scope-doctrine.md](./workspace-work-unit-scope-doctrine.md) | Workspace semantics; future AI compatibility. |
| [glossary.md](./glossary.md) | **Exception type**, **queue**, **work unit**, **action**, **resolver**. |
| [implementation/workspace-v2/API_CONTRACTS.md](../implementation/workspace-v2/API_CONTRACTS.md) | Jobs/schedules **read** patterns for grounding — not config writes. |

---

**Deliverable index:** **A** — §A; **B** — §B; **C** — §C; **D** — §D; safety cross-cutting — §E.
