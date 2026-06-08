# AI Agents V1 - Step 0 Audit

Status: audit only. Do not treat this as design approval.

## Sprint frame

AI Agents V1 starts with **Needs Attention Suggestion (Agent 1)**, **Task Assist V1 (Agent 2)**, and **Workflow Assist (Agent 3)** as **separate** product intents. **Task Assist** covers one-off transactional / scheduled operator actions (drafts, reminders, comms) with approval before send or schedule. **Workflow Assist** covers reusable workflow configuration (drafts, diagnostics, maintenance) with approval before save or apply — not the same agent. Agents are first-class platform capabilities, not standalone systems. The product north star is cross-industry: childcare is the first primary market, but platform behavior should stay flexible through shared records, queues, workflows, events, permissions, configuration, and vertical presets.

## Files Inspected

- `docs/README.md`
- `docs/execution/operating-doctrine.md`
- `docs/execution/roadmap-and-gaps.md`
- `docs/system/workspace-system.md`
- `docs/product/crm-system.md`
- `docs/system/actions-and-workflows.md`
- `docs/system/record-system.md`
- `docs/product/bos-foundation.md`
- `web/lib/opportunities/opportunityAttentionResolver.ts`
- `web/lib/opportunities/opportunityAttentionConfig.ts`
- `web/lib/opportunities/attentionPlatformCatalog.ts`
- `web/lib/opportunities/operationalAttentionExplain.ts`
- `web/lib/admin/operationalAttentionEntityAttachment.ts`
- `web/lib/admin/opportunityEntityRecord.ts`
- `web/lib/admin/activitySignals.ts`
- `web/lib/queues/QueueService.ts`
- `web/lib/workspace/buildOpportunityAttentionQueueItems.ts`
- `web/lib/workspace/buildWorkUnitScopedNeedsAttentionLaneBuckets.ts`
- `web/components/admin/drawer/OperationalAttentionHeaderStrip.tsx`
- `web/components/admin/drawer/OperationalAttentionDrawerPanel.tsx`
- `web/components/admin/AdminEntityDrawer.tsx`
- `web/app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx`
- `web/app/api/admin/workflows/**`
- `web/lib/workflowRun.ts`
- `web/lib/emitEvent.ts`
- `web/app/api/admin/agent/**`
- `web/lib/agent/**`
- `web/lib/admin/agentLab/**`
- `web/tests/agent/**`
- `web/tests/opportunities/**`
- `supabase/migrations/*agent*`
- `docs/supabase/reference/supabase_functions.csv`
- `docs/supabase/reference/supabase_tables.csv`

## Likely Blast Radius

- Opportunity attention resolver and its types.
- Opportunity entity GET payloads and AdminEntityDrawer header chrome.
- Queue preview enrichment if suggestions are also shown in lane rows.
- Activity signal enrichment from `workflow_events`.
- AI activity/audit tables or new suggestion audit tables if suggestions are persisted.
- Tests under `web/tests/opportunities`, `web/tests/queues`, `web/tests/agent`, and possibly drawer/UI tests.

## 1. Needs Attention: Current Computation

Needs Attention is already a resolver-backed operational overlay, not a separate pipeline.

Current core evaluator:

- `resolveOpportunityAttention` in `web/lib/opportunities/opportunityAttentionResolver.ts`
- Resolver version: `OPPORTUNITY_ATTENTION_RESOLVER_VERSION = 2`
- Inputs include opportunity row fields, status definitions, current time, optional config, optional activity signals, and optional row context.
- Output is structured:
  - `needs_attention`
  - `reasons`
  - `primary_reason`
  - `waiting`
  - `priority_score`
  - `priority_breakdown`
  - `auxiliary.activity_stale`
  - `resolver_version`
  - `computed_at_iso`

Reason sources:

- Queue lane codes:
  - `follow_up_date_passed`
  - `overdue_commitment`
  - `tour_date_passed`
  - `high_value_stale`
  - `mid_funnel_stale`
  - `missing_identity`
- Legacy/lifecycle attention reason from `computeOpportunityAttentionReason`.
- Wait bucket reasons from `metadata.enrollment_operational.wait_bucket`.

Platform-owned taxonomy:

- `web/lib/opportunities/attentionPlatformCatalog.ts`
- Canonical reason codes are stable snake_case platform codes.
- Default severity and primary reason order are platform-owned.

Config:

- `resolveOpportunityAttentionConfigFromMetadata` reads `metadata.opportunity_attention_rules`.
- Supported knobs include thresholds, stale windows, reason overrides, wait bucket SLA hours, priority order, priority score weights, and auxiliary signal enablement.
- Buckets/lenses are config-owned and can be seeded per vertical.
- No arbitrary expressions are supported today.

Cross-industry note:

- Some names still carry enrollment/childcare concepts, especially wait bucket helpers and seeded bucket labels.
- The implementation pattern is reusable, but future V1 wording should avoid baking childcare-specific language into shared agent structures.

## 2. Needs Attention: Stored vs Derived

Needs Attention membership is derived, not stored as canonical state.

Derived locations:

- QueueService enriches opportunity rows with `_needs_attention`, `_attention_reason`, `_attention_reason_label`, `_attention_reasons_detail`, and related preview fields.
- Opportunity entity GET attaches `_operational_attention` via `computeOperationalAttentionAttachment`.
- Department/work-unit attention bucket counts are derived with resolver parity.

Configuration storage:

- Attention buckets and rule tuning live in metadata, especially `metadata.opportunity_attention_rules`.
- Childcare demo bucket presets are seeded separately and are not global platform fallbacks.

No current storage found for:

- `next_action`
- structured AI/agent suggestion object
- suggestion acceptance
- suggestion generated event
- suggestion-specific proposal/audit table

## 3. Needs Attention: UI Rendering

Queue/workspace surfaces:

- Work-unit queue rows receive attention preview fields from QueueService.
- Admin V2 work-unit page maps those into compact row view models.
- Queue rows can display:
  - attention reason
  - operational next hint
  - stale activity line
  - needs attention styling

Drawer surfaces:

- Opportunity entity GET computes `_operational_attention`.
- `OperationalAttentionHeaderStrip` renders compact header chrome.
- `OperationalAttentionDrawerPanel` renders a fuller explainability panel.
- Current copy uses `nextStepGuidance` from `web/lib/opportunities/operationalAttentionExplain.ts`.

Important finding:

- The current "Next" line is deterministic presentation copy, not a structured suggestion object.
- It is not persisted or audited.
- It is not surfaced as an accepted/declined operator action.

## 4. Opportunity + Activity Data Available

Opportunity data available to resolver:

- `id`
- `status_key`
- `created_at`
- `updated_at`
- `metadata`
- `customer_id`
- `primary_person_id`
- `primary_contact_id`
- quote/value fields

Operational metadata:

- `metadata.enrollment_operational.wait_bucket`
- `metadata.enrollment_operational.wait_since`
- commitment/follow-up/tour fields used by resolver

Activity data:

- `workflow_events` is the canonical activity spine.
- `web/lib/admin/activitySignals.ts` can fetch latest workflow event by opportunity id.
- It derives:
  - `last_activity_at`
  - `last_activity_type`
  - `last_activity_summary`
  - `stale_signal`
- Activity signal rules are config-driven via `metadata.activity_signal_rules`, read from work unit metadata first, then department metadata.

Important limitation:

- Queue enrichment currently uses latest workflow event per opportunity.
- Entity GET attention attachment passes `optionalSignals: null`, so drawer `_operational_attention.auxiliary.activity_stale` may not include the queue's stale signal unless separately integrated.

## 5. Timestamps + Actions

Timestamps currently used:

- Opportunity `created_at` / `updated_at`
- Follow-up metadata such as `next_follow_up_at`
- Commitment metadata such as `commitment_due_at`
- Tour date metadata mirror for compatibility
- Workflow event `occurred_at`
- Workflow run/action timestamps
- Agent proposal/apply audit timestamps for existing config agents

Actions:

- Admin action registry exists and is routed through `executeAdminAction`.
- Workflows can be executed manually through `/api/admin/workflows/[id]/run`.
- Opportunity drawer actions already dispatch updates and refresh workspace state.
- Current Needs Attention suggestions do not map to a concrete action contract yet.

## 6. Workflows: Current Definition

Workflow tables and APIs:

- `workflows`
- `workflow_conditions`
- `workflow_actions`
- `workflow_events`
- `workflow_runs`
- `workflow_action_runs`
- Admin APIs under `web/app/api/admin/workflows/**`

Workflow route behavior:

- `GET /api/admin/workflows` lists org workflows.
- `POST /api/admin/workflows` creates workflow rows, admin only.
- `PATCH/DELETE /api/admin/workflows/[id]` update/delete workflows, admin only.
- `GET/PUT /api/admin/workflows/[id]/actions` lists/replaces actions.
- `GET/PUT /api/admin/workflows/[id]/conditions` lists/replaces conditions.
- `POST /api/admin/workflows/[id]/run` runs a workflow, admin or ops, after org assertion.

Current validation:

- Routes enforce org context and basic shape.
- Conditions/actions are stored as structured DB rows.

**Agent alignment (documentation):** **Agent 3 (Workflow Assist)** is scoped to reusable workflow configuration; proposals should map to these APIs when implemented. **Agent 2 (Task Assist)** is scoped to one-off transactional / schedule intents and must **not** share proposal storage or contracts with workflow graphs. Neither agent has a dedicated preview/apply/audit path yet — today’s workflow routes are standard admin CRUD.

## 7. Events: Emitted and Consumed

Canonical event path:

- `emitEvent` inserts `workflow_events`.
- `executeWorkflowRun` loads matching workflows, evaluates conditions, records runs/action runs, and performs workflow actions.
- Status transitions commonly go through `emitStatusChangedEvent`.
- Action links and communications already emit events and fan out workflows.

Current event constraints:

- `workflow_events` is server-only for writes.
- RLS has been hardened to prevent direct client write.

No current agent suggestion events found:

- `suggestion_generated`
- `suggestion_accepted`
- `suggestion_dismissed`

These are future-ready names from the sprint outline, but not implemented today.

## 8. UI Surfaces for Suggestions

Low-risk surfaces:

- Opportunity drawer header, near existing `OperationalAttentionHeaderStrip`.
- Opportunity drawer attention panel, extending existing `OperationalAttentionDrawerPanel`.
- Work-unit queue row compact preview, as a read-only hint only.

Higher-risk surfaces:

- Inline queue-row action buttons, because queue rows are preview-only and cannot drive business logic directly.
- Workflow builder screens, because workflow creation mutates durable automation config.
- Dashboard/canvas mock AI surfaces, because parts of Admin V2 AI/manager UI are still mock/demo-like.

Brand/look-and-feel constraints:

- Existing drawer attention UI is compact, restrained, and operational.
- Suggested additions should feel like quiet operator guidance, not a large AI card or marketing-style chrome.
- Keep drawer body/layout behavior config-driven.

## Current Capabilities

- Deterministic attention resolver with structured reason outputs.
- Configurable attention tuning through metadata.
- Configurable attention buckets/lenses.
- Queue preview enrichment with attention reason, next hint, activity signal, and styling.
- Drawer header and panel rendering for attention explainability.
- Activity signal derivation from `workflow_events`.
- Workflow CRUD and run APIs.
- Existing agent config apply pattern:
  - structured override input
  - feature flag
  - admin/org guard
  - expected version stale check
  - SECURITY DEFINER RPC
  - proposal table
  - apply audit table
  - AI activity route

## Gaps

- No structured suggestion object attached to attention resolver output.
- Current "Next" guidance is display copy, not a first-class agent output.
- No suggestion persistence or generated/accepted/dismissed audit path.
- No suggestion-specific events.
- Drawer attention attachment does not currently include activity stale signal context.
- Workflow Assist lacks an agent proposal/preview/apply pattern; existing workflow APIs are standard admin CRUD.
- Existing AI activity route is currently scoped to agent v1 record overview layout applies only.
- Agent surfaces use version names around config agents (`v0`, `v1`, `v2`) that do not yet map cleanly to product-level "AI Agents V1".
- Some attention helper names and copy are enrollment-specific; shared agent structures should remain vertical-neutral.

## Reusable Components

- `resolveOpportunityAttention`
- `resolveOpportunityAttentionConfigFromMetadata`
- `attentionPlatformCatalog`
- `operationalAttentionExplain`
- `computeOperationalAttentionAttachment`
- `enrichOpportunityQueueRowsWithActivitySignals`
- `fetchLatestWorkflowEventByOpportunityId`
- `QueueService` attention enrichment paths
- `OperationalAttentionHeaderStrip`
- `OperationalAttentionDrawerPanel`
- Existing agent proposal/apply/audit/RPC route pattern
- Existing workflow CRUD/run APIs
- Existing workflow event spine

## Required Additions To Consider In Design

These are audit findings only, not approved design.

- A stable, structured `attention_suggestion` output shape.
- A deterministic suggestion evaluator that maps reason codes + activity state to next action suggestions.
- A vertical-neutral suggestion taxonomy, with childcare-specific copy/templates provided as config or presets.
- A decision on whether suggestions are purely derived in V1 or persisted to proposal/audit tables.
- A server path that hydrates authoritative opportunity state before generating suggestions.
- UI placement in the drawer attention surface, with queue rows remaining preview-only.
- Tests for resolver/suggestion behavior, drawer payload shape, and queue parity if queue hints are touched.
- A **Task Assist** proposal shape for transactional / schedule intents (separate from workflow graphs).
- A workflow assist template shape that reuses the same **four-layer agent pattern** without fully building either agent.

## Step 0 Conclusion

Agent 1 can start from existing Needs Attention infrastructure. The safest V1 direction is to extend the resolver-backed operational attention output with a deterministic, structured suggestion layer, displayed in the opportunity drawer and optionally previewed in queue rows.

**Agent 2 (Task Assist V1)** and **Agent 3 (Workflow Assist)** should remain **design/template only** for this sprint’s doc alignment unless a later card pack explicitly schedules implementation. Workflows already have structured DB/API foundations, but there is not yet a safe agent-specific workflow preview/apply/audit contract. Transactional task proposals must not be conflated with reusable automation configuration.

Do not design or build from this document alone. Use it as the Step 0 audit input for Step 1 design.
