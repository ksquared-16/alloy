# AI / BOS API

**Domain size:** ~23 route handlers. Full list: [`api-index.md` → AI / BOS](api-index.md#ai--bos).

The Business Operating System (BOS) assist surface: Task Assist, Workflow Assist, Config/Layout Assist, attention enrichment, and the legacy `admin/agent` config-commit routes. All BOS capabilities must speak through these documented HTTP boundaries — **no ad hoc DB access from assist paths**.

> Doctrine: `docs/platform/modules/ai-platform.md`; BOS registry/envelopes in `web/lib/bos/`. Human-in-the-loop is frozen doctrine: assist **proposes**, humans (or gated apply) **commit**.

---

## Auth & org scoping

- **Auth:** Capability-gated. Routes resolve a BOS/admin context and check the relevant capability + permission:
  - Task Assist → capability `task_assist`
  - Workflow Assist → capability `workflow_assist` (admin-gated mutations)
  - Config/Layout Assist → `loadConfigLayoutAssistAdminContext` + `forbidUnlessGeneratePermission` (capability `config_layout_assist`)
  - Attention enrich → capability `attention_enrich` (org `ai_policy` + RBAC)
- **Org `ai_policy`:** Capabilities respect org AI policy. Mutations require human-in-the-loop or explicit apply permission.
- **Flags:** Legacy agent routes are env-gated (`AGENT_V0_ENABLED`, `AGENT_V1_RECORD_LAYOUT_ENABLED`, `AGENT_V2_FIELD_VISIBILITY_ENABLED`).

---

## Route groups

### Task Assist

| Path | Methods | Purpose |
|------|---------|---------|
| `/api/admin/ai/task-assist/propose` | POST | Generate task proposal |
| `/api/admin/ai/task-assist/apply` | POST | Apply approved proposal |
| `/api/admin/ai/task-assist/entity-search` | GET | Entity search for assist |
| `/api/admin/ai/task-assist/proposals` , `/[id]/approve` , `/[id]/reject` | GET POST | Proposal lifecycle (durable) |

### Workflow Assist

`/api/admin/ai/workflow-assist/{propose,apply,explain,capabilities}`. `propose`/`explain` are read/generate; `apply` is admin-gated and commits workflow changes through the workflow paths.

### Config / Layout Assist

| Path | Methods | Purpose |
|------|---------|---------|
| `/api/admin/ai/config-layout-assist/propose` | POST | Deterministic config/layout proposal (proposal-only) |
| `/api/admin/ai/config-layout-assist/capabilities` | GET | Capability descriptor |
| `/api/admin/ai/config-layout-assist/field-setup` , `/confirm` | POST | Field setup flow |
| `/api/admin/config-layout-assist/proposals` , `/[id]` , `/[id]/state` , `/[id]/apply` | GET POST PATCH | Durable proposal store + partial apply catalog (experimental) |

Proposals are durable and org-scoped; `apply` performs a DEFINER-RPC-style commit with proposal audit — it does not edit config directly outside the documented apply path.

### Attention enrich & legacy agent

| Path | Methods | Purpose |
|------|---------|---------|
| `/api/admin/ai/enrich-attention-suggestion` | POST | BOS attention enrichment (stub/OpenAI) |
| `/api/admin/agent/v0/queue-definition` | * | Legacy queue-definition commit (env-gated) |
| `/api/admin/agent/v1/record-overview-layout` , `/activity` | * | Legacy record-layout commit + activity (env-gated) |
| `/api/admin/agent/v2/field-visibility` | * | Legacy field-visibility commit (env-gated) |

The `admin/agent/v0|v1|v2` routes are **legacy BOS config-commit** endpoints kept behind flags. Stability `experimental`; candidates for consolidation into the assist routes (see [audit](api-documentation-audit.md)).

---

## Validation, envelopes & side effects

- **Validation:** Body parsed with `400` on bad JSON; assist inputs validated (commands, entity types). Config/Layout Assist uses deterministic builders.
- **Envelopes:** `{ ok: true, … }` / `{ ok: false, error }` (e.g. `{ ok:false, error:"BAD_JSON" }`). Reasonably consistent within BOS.
- **Side effects:** `apply`/`approve` paths commit through documented config/workflow paths with proposal audit. Generation calls may hit OpenAI (subject to org `ai_policy`); secrets stay server-side.

Source root: `web/app/api/admin/ai/*`, `web/app/api/admin/config-layout-assist/*`, `web/app/api/admin/agent/*`.
