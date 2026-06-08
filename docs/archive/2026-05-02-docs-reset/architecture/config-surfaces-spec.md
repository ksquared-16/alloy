# Configuration surfaces — spec

**Purpose:** Where configuration **lives in product** and how **humans** (and later **AI**) interact with it — **without** designing specific screens in this doc.

**Principles:** Align with [configuration-doctrine.md](./configuration-doctrine.md) · Keep **resolver truth** separate from **chrome** · **Org scope** must be obvious for tenant data.

---

## 1. Surface map (conceptual)

| Surface | Audience | Typical config |
|---------|----------|----------------|
| **Org / system settings** (`/admin/system/*` and siblings) | Admins | Departments, work units, custom fields, sections, status definitions, document field defs, (future) org-scoped layouts. |
| **Entity admin lists** | Ops | CRUD on records — not “configuration” except inline when allowed. |
| **Workspace V2** | Ops | **Consumes** config (lanes, labels from work units, visual hints); **does not** author layout JSON except through future explicit “edit lane” flows. |
| **Record / drawer** | Ops | **Consumes** `record_layouts` order + `record_actions`; editing those belongs in **settings**, not in the drawer long-term. |

**Rule:** Anything that **changes behavior for all users in an org** belongs under **settings** (or a dedicated **Configuration** area), not hidden in dev-only tools.

---

## 2. What should live under `/admin/settings` (target)

Today the repo uses **`/admin/system/`** for many controls. **Target information architecture** (names flexible):

- **Organization** — org profile, timezone defaults (if productized).
- **People & access** — roles, invitations (as implemented).
- **Data model** — custom fields, sections, status definitions, pipelines (if applicable).
- **Operations structure** — departments, work units, **queue_definition** editors (when DSL ships).
- **Record experience** — org-scoped **record layout** templates, **record actions** (labels/order/active), constrained to **registered** section keys and **known** `event_key` handlers.
- **Integrations** — webhooks, external IDs (existing patterns).

**Global templates** (`record_layouts` / `record_actions` without org): surface as **“Alloy defaults”** with **copy to org** when org-scoped rows exist.

---

## 3. How users interact (interaction model)

1. **Read path:** User opens settings → server loads **effective config** (org row || template fallback).
2. **Change path:** User edits form → **validation** client-side → **PATCH/POST** to admin API → optimistic UI or refresh.
3. **Scope:** Every write is **org-scoped** (except platform super-admin global template tools, if ever introduced).
4. **Safety:** Destructive actions (delete field definition) require **confirm** and **dependency hints** (existing field_values count).
5. **Preview (future):** Optional read-only **preview** of record drawer with staged config before save — not required for phase 1.

---

## 4. How config affects workspace, work units, records

| Layer | Effect of config |
|-------|-------------------|
| **Workspace / department** | Department `key` / `metadata` → **default visual context** hints; nav order from `sort_order`. |
| **Work unit / queue** | `work_units` name, key, **`queue_definition`** (when active) → which rows appear in lane; **Needs Attention** until DSL ships also uses **code** predicates + URL `exception=` (see [workspace-v2 API](../implementation/workspace-v2/API_CONTRACTS.md)). |
| **Record** | `field_definitions` → which custom fields appear; **`record_layouts`** → section order / overview rows / blocks; **`record_actions`** → which buttons and **placement**; resolver still supplies **values**. |

---

## 5. What we are not building in this phase

- **No new settings pages** — this document defines **target IA** and **contracts** for when they are built.
- **No AI** — surfaces must remain **human-legible**; future AI uses the same APIs ([config-api-contract.md](./config-api-contract.md)).

---

**See:** [config-model-spec.md](./config-model-spec.md) · [config-api-contract.md](./config-api-contract.md)
