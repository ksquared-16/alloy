# AI system

## Purpose

Document **actual** admin/agent HTTP routes and env gates in `web/` — not future AI platform plans.

## Current state

- **Agent APIs (Implemented):** All under **`web/app/api/admin/agent/`**:
  - **`.../v0/queue-definition`** — queue definition updates (tests reference this family).
  - **`.../v1/record-overview-layout`**, **`.../v1/activity`**.
  - **`.../v2/field-visibility`** — structured apply path; **disabled unless** **`AGENT_V2_FIELD_VISIBILITY_ENABLED`** is `true`/`1`/`yes` (see `web/app/api/admin/agent/v2/field-visibility/route.ts`).
- **Admin V2 UI** may surface AI/command UX under **`web/app/adminV2/`** (search `ai`, `agent` in subtree).
- **AI enrichment (Phase 1 — stub + telemetry):** **`POST /api/admin/ai/enrich-attention-suggestion`** — **`getAdminContextCached`** + **`getAdminAccessContextCached`** (org scope + `permissionKeys`); legacy **admin-only** unless **`AI_ENRICHMENT_USE_PERMISSION_REQUIRED`** + grant **`ai.enrichment.use`** (key seeded by **`supabase/migrations/20260520100000_ai_enrichment_permission_keys_seed.sql`**); org policy pre-check (`enabled`, stub, `draft_enrichment`); **`AI_ENRICHMENT_STUB_ENABLED`**. Telemetry: **`AI_ENRICHMENT_TELEMETRY_ENABLED`** + verbose org logging → **`ai_enrichment_usage_v1`**. See sprint doc §16–§Phase 2.5.
- **Operational summaries (Phase 2 — derived):** Opportunity GET attaches **`_operational_summary`** (`OperationalSummaryV1`) via **`attachOpportunityAttentionSuggestionBundle`**; drawer shows **`OperationalSummaryNarrativeBlock`**. Work-unit queue rows may include **`_operational_summary_preview`** (headline + risk hint) when attention enrichment runs — **`data-queue-preview-slot="operational_summary"`**; **no** extra per-row activity fetches. See sprint doc **§17**.

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
| **AI enrichment foundation (Phase 1–2)** | **`web/lib/ai/**`**, **`supabase/migrations/20260520100000_ai_enrichment_permission_keys_seed.sql`** (`ai.enrichment.use`), **`POST /api/admin/ai/enrich-attention-suggestion`**, **`_operational_summary`** attach; tests **`web/tests/ai/**`**; **`docs/sprints/05_2026/ai_enrichment_and_agent_actions_v1.md`**. |
| Perf/debug globals | `web/lib/perf/alloyPerfGlobal.ts` |

## Guardrails

- **No direct client DB secrets.**
- **Do not** train or prompt against production PII without policy.
- **Configuration updates** made by AI must use the same validation paths as human-submitted JSON (e.g. queue definition schema) and the **DEFINER RPC + stale-check + audit insert** pattern above — not raw table patches.
- **Do not** bypass `executeAdminAction` / events when an operation is standardized there.

## Known gaps / risks

- Model provider(s), logging/redaction policy, and kill switches **beyond** the `AGENT_V2_*` env pattern — partially addressed by **`web/lib/ai`** (Phase 1: metadata policy + redaction + **stub-only** enrichment + gated telemetry); **no** live provider calls until explicitly approved.
- **Partially implemented:** Broad “AI command center” product may be **mostly UI/mock** in places — inspect `adminV2` components before treating as production automation.

## When this doc must be updated

New agent routes, env gate names, **`web/lib/ai` contracts**, or when agent behavior becomes customer-facing.
