# AI system

## Purpose

Document **actual** admin/agent HTTP routes and env gates in `web/` — not future AI platform plans.

## Current state

- **Agent APIs (Implemented):** All under **`web/app/api/admin/agent/`**:
  - **`.../v0/queue-definition`** — queue definition updates (tests reference this family).
  - **`.../v1/record-overview-layout`**, **`.../v1/activity`**.
  - **`.../v2/field-visibility`** — structured apply path; **disabled unless** **`AGENT_V2_FIELD_VISIBILITY_ENABLED`** is `true`/`1`/`yes` (see `web/app/api/admin/agent/v2/field-visibility/route.ts`).
- **Admin V2 UI** may surface AI/command UX under **`web/app/adminV2/`** (search `ai`, `agent` in subtree).
- **AI enrichment (stub + OpenAI-compatible + telemetry):** **`POST /api/admin/ai/enrich-attention-suggestion`** — **`getAdminContextCached`** + **`getAdminAccessContextCached`** (org scope + `permissionKeys`); legacy **admin-only** unless **`AI_ENRICHMENT_USE_PERMISSION_REQUIRED`** + grant **`ai.enrichment.use`** (key seeded by **`supabase/migrations/20260520100000_ai_enrichment_permission_keys_seed.sql`**); org policy pre-check (`enabled`, **`provider`** `stub` or **`openai`**, `draft_enrichment`); stub path also requires **`AI_ENRICHMENT_STUB_ENABLED`**; OpenAI path requires strict permission mode + **`OPENAI_API_KEY`** / **`OPENAI_MODEL`** (optional **`OPENAI_BASE_URL`**). Request body parsing: **`web/lib/ai/enrichAttentionSuggestionRouteValidation.ts`**; route tests **`web/tests/ai/enrichAttentionSuggestionRoute.test.ts`**. Telemetry: **`AI_ENRICHMENT_TELEMETRY_ENABLED`** + verbose org logging → **`ai_enrichment_usage_v1`**. **Drawer:** **`OperationalAttentionEnhanceDraft`** calls this route for **“Enhance draft”** (copy-only preview) when a deterministic draft exists — no send/apply/persistence. See sprint doc §16–§Phase 2.5.
- **Task Assist V1 (Agent 2 — narrow ship):** **`POST /api/admin/ai/task-assist/propose`** and **`POST /api/admin/ai/task-assist/apply`** — **opportunities-only** SMS/email draft + operator-approved send. **Apply** calls **`executeCommunicationsSend`** (same canonical enqueue as **`POST /api/admin/communications/send`**; no legacy **`public.messages`** / **`messages_outbox`** in Task Assist code). **Drawer UI:** **`TaskAssistV1OpportunityPanel`**, parent-gated by **`NEXT_PUBLIC_TASK_ASSIST_V1_ENABLED`** (`web/lib/agent/taskAssist/taskAssistV1UiGate.ts`). **Org policy:** feature **`task_assist_draft`** in **`metadata.ai_policy.allowed_features`**, plus the same portal / stub / OpenAI permission pattern as enrichment where applicable (see propose route). Tests: **`web/tests/agent/taskAssist/**`**. Spec: **`docs/sprints/05_2026/task_assist_v1.md`**.
- **Task Assist V1.1 (durable layer + drawer):** **`POST`/`GET /api/admin/ai/task-assist/proposals`**, **`POST …/proposals/[id]/approve`**, **`POST …/proposals/[id]/reject`**; **`GET`/`POST /api/admin/communication-scheduled-sends`**, **`PATCH …/communication-scheduled-sends/[id]`** (cancel **`pending`**), **`POST …/communication-scheduled-sends/process-due`** (cron: **`x-cron-token`** = **`INTERNAL_CRON_TOKEN`** for cross-org runs); **`GET`/`POST`/`PATCH /api/admin/operational-tasks`**. UI uses **`taskAssistV11OpportunityApi.ts`** for fetch wrappers (e.g. **`postTaskAssistProposalApprove`** / **`postTaskAssistProposalReject`** — not exported with the same names as DB helpers in **`taskAssistProposalPersistence`**). **Propose** remains **deterministic** (no live OpenAI call on that route today — see **`web/app/api/admin/ai/task-assist/propose/route.ts`**). Sprint: **`docs/sprints/05_2026/task_assist_v1_1.md`** (§10 env/policy, §12 routes, §13 manual QA).
- **Operational summaries (Phase 2 — derived):** Opportunity GET still attaches **`_operational_summary`** (`OperationalSummaryV1`) via **`attachOpportunityAttentionSuggestionBundle`** (payload for APIs / future use). **Drawer chrome** uses a single premium surface — **`OperationalAttentionHeaderStrip`** (“Recommended by Alloy”) — without duplicating operational summary narrative copy there. Work-unit queue rows may include **`_operational_summary_preview`** (headline + risk hint) — **`data-queue-preview-slot="operational_summary"`**; **no** extra per-row activity fetches. **Needs-attention list order** is **deterministic** (resolver `priority_score`, SLA tiers, severity, waiting facet, then queue-definition sort / `updated_at`) — applied in **`loadOpportunityNeedsAttentionRows`** after membership filter; **AI does not reorder queues**. See sprint doc **§17** and **§AI operational experience V1.1**.

### Agent #1 — Needs attention suggestion + Enhance draft (usable V1)

- **Deterministic suggestion + drafts:** **`buildNeedsAttentionSuggestion`** + **`suggestedContentTemplates.ts`** (concise, human copy; no user-facing record IDs in bodies). Drawer: **`OperationalAttentionHeaderStrip`** + **`OperationalAttentionEnhanceDraft`**.
- **Token / live model:** **`resolveStructuredAiProviderForPolicy`** / outbound OpenAI (or stub) runs **only** on explicit **Enhance draft** or **Regenerate** → **`POST /api/admin/ai/enrich-attention-suggestion`**. **No** model tokens on drawer open, opportunity GET / attach, or queue load (attach path remains deterministic + optional non-network stub summary overlay in **`buildOperationalSummary`**).
- **Safeguards:** Calm operator errors via **`userFacingEnrichAttentionError`** (**`enrichAttentionDraftMessages.ts`**) — no raw provider payloads. After success, primary control shows **Enhanced**; only **Regenerate** issues another POST.

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
| **AI enrichment foundation (Phase 1–2)** | **`web/lib/ai/**`**, **`openAiModelCapabilities.ts`** (model sampling rules), **`enrichAttentionSuggestionRouteValidation.ts`**, **`supabase/migrations/20260520100000_ai_enrichment_permission_keys_seed.sql`** (`ai.enrichment.use`), **`POST /api/admin/ai/enrich-attention-suggestion`**, **`_operational_summary`** attach; tests **`web/tests/ai/**`**; **`docs/sprints/05_2026/ai_enrichment_and_agent_actions_v1.md`**. |
| **Task Assist V1 + V1.1** | V1 **`POST …/task-assist/propose`**, **`POST …/task-assist/apply`**; V1.1 **`/api/admin/ai/task-assist/proposals`**, **`/api/admin/communication-scheduled-sends`** (incl. **`process-due`**), **`/api/admin/operational-tasks`**; **`web/lib/agent/taskAssist/**`**, **`executeCommunicationsSend`**; **`taskAssistV1UiGate.ts`**; tests **`web/tests/agent/taskAssist/**`**; **`docs/sprints/05_2026/task_assist_v1.md`**, **`docs/sprints/05_2026/task_assist_v1_1.md`**. |
| Perf/debug globals | `web/lib/perf/alloyPerfGlobal.ts` |

## Guardrails

- **No direct client DB secrets.**
- **Do not** train or prompt against production PII without policy.
- **Configuration updates** made by AI must use the same validation paths as human-submitted JSON (e.g. queue definition schema) and the **DEFINER RPC + stale-check + audit insert** pattern above — not raw table patches.
- **Do not** bypass `executeAdminAction` / events when an operation is standardized there.
- **OpenAI Chat Completions:** Some models (e.g. **gpt-5** family, many **o-series** ids) **reject or ignore** non-default **`temperature`**; the structured enrichment client **omits** that field unless the model is allow-listed for custom sampling (**`web/lib/ai/openAiModelCapabilities.ts`**). Prefer **deterministic prompts**, **`response_format: json_object`**, and **response schema validation** over aggressive temperature tuning. Unknown deployment names default to **omission** (safest).

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

Confirm in the Vercel project (or `.env.local` for local parity). **Never** put **`OPENAI_API_KEY`** (or other model secrets) in **`NEXT_PUBLIC_*`**.

| Variable | When needed |
|----------|----------------|
| **`AI_ENRICHMENT_USE_PERMISSION_REQUIRED`** | `true` to require **`ai.enrichment.use`** for enrichment routes (recommended before live OpenAI). |
| **`AI_ENRICHMENT_STUB_ENABLED`** | `true` when org policy uses **`provider: stub`**. |
| **`OPENAI_API_KEY`**, **`OPENAI_MODEL`** | When org policy uses **`provider: openai`** (optional **`OPENAI_BASE_URL`**). |
| **`OPENAI_CHAT_TEMPERATURE`** | Optional `0`–`2` float; used only when **`OPENAI_MODEL`** supports custom **`temperature`** (ignored for **gpt-5**-style models — see **`supportsCustomTemperature`** in **`web/lib/ai/openAiModelCapabilities.ts`**). |
| **`OPENAI_REQUEST_TIMEOUT_MS`** | Optional integer ms for Chat Completions used by structured enrichment; **default `20000`**; clamped **`1000`–`30000`** (see **`getOpenAiStructuredRequestTimeoutMs`** in **`web/lib/ai/aiEnrichmentEnv.ts`**). |
| **`AI_ENRICHMENT_TELEMETRY_ENABLED`** | Optional; with org **`logging_mode: verbose`** emits **`ai_enrichment_usage_v1`** events. |

### Drawer UI (record overview)

- Open an opportunity that **needs attention** with a deterministic **`_attention_suggestion`**.
- Confirm **one** compact **“Recommended by Alloy”** block: attention headline, inline **Next ·** label, **Why ·** summary, collapsed **Draft · not sent** when a draft exists, dashed placeholder referencing **`next_action.action_family`** (future configurable actions — **no** execution, send, or apply today).
- When a draft body exists, confirm **“Enhance draft”** appears ( **`OperationalAttentionEnhanceDraft`** ): optional **POST** to **`/api/admin/ai/enrich-attention-suggestion`**; on success an **“Enhanced draft · preview”** details block with **copy only**; deterministic draft remains in **Draft · not sent** above. **No** send/apply/persistence from this control.
- **`AttentionSuggestionV1.next_action.action_family`** is reserved to map later onto existing configurable queue/record action buttons (same catalog as lane quick actions). **No** wiring or autonomous execution in this build.
- Expand **Operational detail** in the body for factors / timing; **`_operational_summary`** remains on the API payload for previews / future use — **not** rendered as a separate “Operational read” card above Recommended by Alloy.

### Enrichment route (`POST /api/admin/ai/enrich-attention-suggestion`)

- With **Postman/curl** and a valid admin session (or CI), send a minimal body: **`correlation_id`**, **`deterministic_suggestion`** (`AttentionSuggestionV1`).
- Expect **`403`** when portal RBAC denies; **`403`** when org policy denies; **`403`** stub path when **`AI_ENRICHMENT_STUB_ENABLED`** is off; **`200`** with **`envelope`** when gates pass. Successful **`200`** bodies also include safe **`enrichment_telemetry`** (`provider_key`, `outcome`) and **`provider_error_code`** (nullable) for lightweight clients — **no** prompt text, **no** raw redacted payload dump, **no** API key. Response must **not** echo **`OPENAI_API_KEY`**; **`console`** must not log the key on success paths; outbound provider calls use **redacted** context only (see **`web/tests/ai/enrichAttentionSuggestionRoute.test.ts`**).

### Local OpenAI path smoke check (developer workstation)

**Purpose:** one developer machine calls the **same** server enrichment helper as the route (**`enrichAttentionSuggestionStubEnvelope`**: redact → structured provider → telemetry shape), using a built-in **`AttentionSuggestionV1`** fixture — **no** browser UI.

**Run** (from **`web/`**), with secrets only in **`web/.env.local`** (never committed):

```bash
cd web
npm run -s validate:ai-openai-local
```

**Requires:** `NODE_ENV` must **not** be `production`; **`AI_ENRICHMENT_USE_PERMISSION_REQUIRED=true`**; **`OPENAI_API_KEY`** + **`OPENAI_MODEL`** (optional **`OPENAI_BASE_URL`**, optional **`OPENAI_REQUEST_TIMEOUT_MS`** — same defaults/clamps as production provider). The script prints **one** JSON line: **`provider_key`**, **`outcome`**, **`has_enrichment`**, **`schema_ok`**, **`redaction_steps`**, **`error_code`** (when failed), and on failures **`http_status`**, **`openai_error_type`**, **`openai_error_code`**, **`openai_error_message`** (from the vendor JSON when present), plus **`model`** and **`base_url_host`** (host only). No prompt, draft, full HTTP body, or API key.

This script is the **supported** local parity check for the OpenAI-compatible enrichment path; keep it alongside route tests.

---

## When this doc must be updated

New agent routes, env gate names, **`web/lib/ai` contracts**, Task Assist **V1.1** admin routes or policy gates, or when agent behavior becomes customer-facing.
