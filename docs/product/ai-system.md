# AI system

## Purpose

Document **actual** admin/agent HTTP routes and env gates in `web/` — not future AI platform plans.

## Current state

- **Agent APIs (Implemented):** All under **`web/app/api/admin/agent/`**:
  - **`.../v0/queue-definition`** — queue definition updates (tests reference this family).
  - **`.../v1/record-overview-layout`**, **`.../v1/activity`**.
  - **`.../v2/field-visibility`** — structured apply path; **disabled unless** **`AGENT_V2_FIELD_VISIBILITY_ENABLED`** is `true`/`1`/`yes` (see `web/app/api/admin/agent/v2/field-visibility/route.ts`).
- **Admin V2 UI** may surface AI/command UX under **`web/app/adminV2/`** (search `ai`, `agent` in subtree).
- **AI enrichment (stub + OpenAI-compatible + telemetry):** **`POST /api/admin/ai/enrich-attention-suggestion`** — **`getAdminContextCached`** + **`getAdminAccessContextCached`** (org scope + `permissionKeys`); legacy **admin-only** unless **`AI_ENRICHMENT_USE_PERMISSION_REQUIRED`** + grant **`ai.enrichment.use`** (key seeded by **`supabase/migrations/20260520100000_ai_enrichment_permission_keys_seed.sql`**); org policy pre-check (`enabled`, **`provider`** `stub` or **`openai`**, `draft_enrichment`); stub path also requires **`AI_ENRICHMENT_STUB_ENABLED`**; OpenAI path requires strict permission mode + **`OPENAI_API_KEY`** / **`OPENAI_MODEL`** (optional **`OPENAI_BASE_URL`**). Request body parsing: **`web/lib/ai/enrichAttentionSuggestionRouteValidation.ts`**; route tests **`web/tests/ai/enrichAttentionSuggestionRoute.test.ts`**. Telemetry: **`AI_ENRICHMENT_TELEMETRY_ENABLED`** + verbose org logging → **`ai_enrichment_usage_v1`**. See sprint doc §16–§Phase 2.5.
- **Operational summaries (Phase 2 — derived):** Opportunity GET still attaches **`_operational_summary`** (`OperationalSummaryV1`) via **`attachOpportunityAttentionSuggestionBundle`** (payload for APIs / future use). **Drawer chrome** uses a single premium surface — **`OperationalAttentionHeaderStrip`** (“Recommended by Alloy”) — without duplicating operational summary narrative copy there. Work-unit queue rows may include **`_operational_summary_preview`** (headline + risk hint) — **`data-queue-preview-slot="operational_summary"`**; **no** extra per-row activity fetches. See sprint doc **§17**.

## How it works

- Callers must use normal **admin auth** paths (`getAdminContextCached` / related) as implemented per route.
- Agent commits that touch config (e.g. field visibility) go through validation helpers in **`web/lib/agent/**`** — do not bypass DB invariants.

### SECURITY DEFINER RPCs (config mutations)

Canonical applies are **`SECURITY DEFINER`** functions in **`public`** (see **`docs/supabase/reference/supabase_functions.csv`**):

| Function | Config target | Safety pattern (DB-enforced) |
|----------|----------------|-------------------------------|
| **`agent_v0_commit_queue_definition_apply`** | **`work_units.queue_definition`** | **`FOR UPDATE`** row lock; **`p_expected_version`** vs stored version → raises **`agent_v0:stale_queue_definition_version`** on mismatch; **`agent_v0_proposals`** + **`agent_v0_apply_audit`** rows on success. |
| **`agent_v1_commit_record_overview_layout_apply`** | Record overview layout JSON | Same class of **expected version** check (**`agent_v1:stale_record_overview_layout_version`**); proposals + apply audit tables. |
| **`agent_v2_commit_field_visibility_apply`** | **`field_definitions`** visibility flags | **`p_expected_updated_at`** stale check (**`agent_v2:stale_field_definition`**); proposals + apply audit tables. |

Definitions use **`SET search_path TO 'public'`** in live exports — keep aligned with general DEFINER hardening doctrine.

**Boundary:** AI (or any caller) must **not** write these config tables around the RPCs; use the same **`proposal_id` / `request_id` / `correlation_id` / `result_id`** tracing pattern the routes implement. Human admins should hit the same RPCs or equivalent server-validated paths, not ad hoc SQL.

## Source of truth / key files

| Concern | Location |
|---------|-----------|
| Agent routes | `web/app/api/admin/agent/**` |
| Agent tests | `web/tests/agent/` |
| Field visibility v2 | `web/lib/agent/v2/*`, `web/app/api/admin/agent/v2/field-visibility/route.ts` |
| **AI enrichment foundation (Phase 1–2)** | **`web/lib/ai/**`**, **`enrichAttentionSuggestionRouteValidation.ts`**, **`supabase/migrations/20260520100000_ai_enrichment_permission_keys_seed.sql`** (`ai.enrichment.use`), **`POST /api/admin/ai/enrich-attention-suggestion`**, **`_operational_summary`** attach; tests **`web/tests/ai/**`**; **`docs/sprints/05_2026/ai_enrichment_and_agent_actions_v1.md`**. |
| Perf/debug globals | `web/lib/perf/alloyPerfGlobal.ts` |

## Guardrails

- **No direct client DB secrets.**
- **Do not** train or prompt against production PII without policy.
- **Configuration updates** made by AI must use the same validation paths as human-submitted JSON (e.g. queue definition schema) and the **DEFINER RPC + stale-check + audit insert** pattern above — not raw table patches.
- **Do not** bypass `executeAdminAction` / events when an operation is standardized there.

## Known gaps / risks

- Model provider(s), logging/redaction policy, and kill switches **beyond** the `AGENT_V2_*` env pattern — partially addressed by **`web/lib/ai`** (metadata policy + redaction + **stub** and **gated OpenAI-compatible** enrichment + telemetry). Live traffic remains **opt-in** per org policy + env + RBAC.
- **Partially implemented:** Broad “AI command center” product may be **mostly UI/mock** in places — inspect `adminV2` components before treating as production automation.

## Manual staging validation checklist

Use this before declaring AI enrichment / drawer attention work verified on **staging** (read-only SQL; no production writes beyond your normal change process).

### Permission catalog (two related tables)

**`permission_definitions`** — rows used by the Admin roles UI (`key`, `group_key`, `label`, …; there is **no** `name` column):

```sql
select key, group_key, label, is_active
from public.permission_definitions
where key like 'ai.%'
order by key;
```

**`permission_keys`** — canonical keys referenced by **`role_permission_grants.permission_key`** (FK):

```sql
select key, label, group_key, is_active
from public.permission_keys
where key like 'ai.%'
order by key;
```

### Role grants (`org_id`, `role_key`, `permission_key`, `allowed`)

```sql
select org_id, role_key, permission_key, allowed
from public.role_permission_grants
where permission_key = 'ai.enrichment.use'
order by org_id, role_key;
```

### Org AI policy (`org_settings.metadata`)

**Read** `ai_policy` for a single org (example pilot org):

```sql
select org_id, metadata->'ai_policy' as ai_policy
from public.org_settings
where org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid;
```

**Example merge** (run only when intentionally changing policy — replaces the whole `ai_policy` object under `metadata`):

```sql
update public.org_settings
set metadata = jsonb_set(
    coalesce(metadata, '{}'::jsonb),
    '{ai_policy}',
    jsonb_build_object(
        'enabled', true,
        'provider', 'stub',
        'allowed_features', jsonb_build_array('draft_enrichment'),
        'logging_mode', 'minimal'
    ),
    true
)
where org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid;
```

Confirm JSON includes at least: **`enabled`**, **`provider`** (`stub` or `openai`), **`allowed_features`** containing **`draft_enrichment`**. For OpenAI pilot set **`provider`** to **`openai`** and configure Vercel **`OPENAI_*`** env vars.

### Vercel / runtime env (server-only)

Confirm in the Vercel project (or `.env.local` for local parity), **never** as `NEXT_PUBLIC_*`:

| Variable | When needed |
|----------|----------------|
| **`AI_ENRICHMENT_USE_PERMISSION_REQUIRED`** | `true` to require **`ai.enrichment.use`** for enrichment routes (recommended before live OpenAI). |
| **`AI_ENRICHMENT_STUB_ENABLED`** | `true` when org policy uses **`provider: stub`**. |
| **`OPENAI_API_KEY`**, **`OPENAI_MODEL`** | When org policy uses **`provider: openai`** (optional **`OPENAI_BASE_URL`**). |
| **`AI_ENRICHMENT_TELEMETRY_ENABLED`** | Optional; with org **`logging_mode: verbose`** emits **`ai_enrichment_usage_v1`** events. |

### Drawer UI (record overview)

- Open an opportunity that **needs attention** with a deterministic **`_attention_suggestion`**.
- Confirm **one** compact **“Recommended by Alloy”** block: attention headline, inline **Next ·** label, **Why ·** summary, collapsed **Draft · not sent** when a draft exists, dashed placeholder referencing **`next_action.action_family`** (future configurable actions — **no** execution, send, or apply today).
- **`AttentionSuggestionV1.next_action.action_family`** is reserved to map later onto existing configurable queue/record action buttons (same catalog as lane quick actions). **No** wiring or autonomous execution in this build.
- Expand **Operational detail** in the body for factors / timing; **`_operational_summary`** remains on the API payload for previews / future use — **not** rendered as a separate “Operational read” card above Recommended by Alloy.

### Enrichment route (`POST /api/admin/ai/enrich-attention-suggestion`)

- With **Postman/curl** and a valid admin session (or CI), send a minimal body: **`correlation_id`**, **`deterministic_suggestion`** (`AttentionSuggestionV1`).
- Expect **`403`** when portal RBAC denies; **`403`** when org policy denies; **`403`** stub path when **`AI_ENRICHMENT_STUB_ENABLED`** is off; **`200`** with **`envelope`** when gates pass. Response must **not** echo **`OPENAI_API_KEY`**; **`console`** must not log the key on success paths; outbound provider calls use **redacted** context only (see **`web/tests/ai/enrichAttentionSuggestionRoute.test.ts`**).

---

## When this doc must be updated

New agent routes, env gate names, **`web/lib/ai` contracts**, or when agent behavior becomes customer-facing.
