# AI Agents V1 - Step 1 Design

Status: design draft for review. Do not build until this is accepted or revised.

## Product Intent

AI Agents V1 should make Alloy feel more intelligent without introducing a separate agent system. The first agent extends existing operational attention into clear, structured next-step suggestions. The second agent is a template for future workflow assistance, not a full build in this sprint.

All design decisions must preserve Alloy's broader north star: a flexible, configurable operating system that can sell across industries. Childcare is the first source market, but shared agent contracts should be vertical-neutral.

## Non-Negotiables

- Agents operate on existing records, workflows, events, queues, permissions, and configuration.
- Agents produce structured JSON, not freeform blobs.
- V1 suggestions are deterministic and explainable.
- Queue rows remain preview-only.
- Operational truth stays in entity APIs, resolvers, workflow/action paths, and audited server routes.
- No autonomous actions in V1.
- No standalone agent framework.
- No new lifecycle system for needs attention.

## Reusable Agent Pattern

Every agent should follow the same four-layer pattern:

1. **Input Layer**: authoritative system state, loaded server-side.
2. **Evaluation Layer**: deterministic rules first, with optional light AI later behind gates.
3. **Output Layer**: versioned structured JSON.
4. **Surface Layer**: UI presentation that never becomes the source of truth.

For V1, the pattern should be implemented as plain modules and typed outputs, not as a broad framework.

## Agent 1: Needs Attention Suggestion Agent

### Purpose

Convert existing operational attention reasons into actionable next steps while keeping the underlying attention resolver as the canonical exception evaluator.

### Current Source Inputs

Use existing server-derived data:

- `OpportunityAttentionResult` from `resolveOpportunityAttention`
- opportunity entity fields from authoritative entity GET / server row
- latest activity signal where available
- work unit / department metadata config
- current viewer/org context for scope

Do not use queue row snapshots to generate authoritative suggestions.

### Suggested Output Shape

Add a versioned, structured suggestion object alongside operational attention output.

```ts
type AttentionSuggestionV1 = {
  version: 1;
  agent_key: "needs_attention_suggestion";
  suggestion_id: string;
  target: {
    entity_type: "opportunities";
    entity_id: string;
  };
  source: {
    resolver: "opportunity_attention";
    resolver_version: number;
    primary_reason_code: string | null;
    reason_codes: string[];
    activity_signal_key?: string | null;
  };
  next_action: {
    key: string;
    label: string;
    action_family: "follow_up" | "review" | "update_record" | "send_message" | "schedule" | "workflow" | "none";
    confidence: "deterministic";
  };
  reasoning: {
    summary: string;
    factors: Array<{
      code: string;
      label: string;
      severity?: string;
      sla_tier?: string;
    }>;
  };
  suggested_content?: {
    channel: "sms" | "email" | "note";
    template_key: string;
    body: string;
    variables: Record<string, string>;
  } | null;
  generated_at_iso: string;
};
```

Design notes:

- `suggestion_id` should be deterministic for derived suggestions in V1, for example a stable hash of entity id, primary reason code, resolver version, and computed date bucket. This avoids pretending there is persisted state when there is not.
- `next_action.key` should be stable snake_case.
- `suggested_content.body` is optional. It should start with deterministic templates, not model-generated text.
- `suggested_content.variables` should expose what was substituted for explainability and future review.
- `action_family` is advisory in V1. It does not execute anything.

### Initial Next Action Mapping

Use platform reason codes as inputs and map them to vertical-neutral action families.

| Reason code | Suggested action key | Action family | Default label |
|-------------|----------------------|---------------|---------------|
| `follow_up_date_passed` | `complete_follow_up` | `follow_up` | Follow up |
| `tour_date_passed` | `complete_scheduled_event_follow_up` | `follow_up` | Follow up after scheduled event |
| `overdue_commitment` | `resolve_commitment` | `review` | Resolve overdue commitment |
| `missing_quote_after_execution` | `prepare_offer_or_quote` | `update_record` | Prepare offer or quote |
| `stale_quote_followup` | `check_pending_decision` | `follow_up` | Check on pending decision |
| `missing_identity` | `link_primary_person_or_account` | `update_record` | Link primary person or account |
| `high_value_stale` | `reengage_priority_record` | `follow_up` | Re-engage priority record |
| `mid_funnel_stale` | `advance_or_pause_record` | `review` | Advance or pause record |
| `stale_new_inquiry` | `respond_to_new_request` | `follow_up` | Respond to new request |
| `stale_qualified` | `move_qualified_record_forward` | `review` | Move qualified record forward |
| `waiting_on_family` | `request_external_response` | `follow_up` | Request external response |
| `waiting_on_staff` | `complete_internal_action` | `review` | Complete internal action |
| `waiting_on_documents` | `request_documents` | `send_message` | Request documents |
| `waiting_on_payment` | `confirm_payment_status` | `send_message` | Confirm payment status |
| `blocked_internal` | `resolve_internal_blocker` | `review` | Resolve internal blocker |
| `blocked_external` | `track_external_dependency` | `review` | Track external dependency |

Labels can be overridden later through config/presets. Shared defaults should avoid childcare-specific wording.

### Suggested Content

V1 should only generate content for safe follow-up/message-style actions. It should not write or send messages automatically.

Suggested content should be:

- deterministic template-based
- short
- editable by the operator
- scoped to the current opportunity/entity context
- clearly presented as a draft

Initial template candidates:

- `generic_follow_up_short`
- `pending_decision_check_in`
- `documents_request_short`
- `payment_status_check`
- `scheduled_event_follow_up`

Childcare-specific text should be a vertical preset later, not embedded in the shared suggestion engine.

### Logic Layer

Create a small deterministic module, likely under:

`web/lib/agent/needsAttentionSuggestion/`

Candidate files:

- `types.ts`
- `buildNeedsAttentionSuggestion.ts`
- `suggestionActionMap.ts`
- `suggestedContentTemplates.ts`

Primary function:

```ts
buildNeedsAttentionSuggestion(input: {
  opportunity: { id: string; status_key?: string | null; metadata?: Record<string, unknown> | null };
  attention: OpportunityAttentionResult | null;
  activity?: ActivitySignalResult | null;
  nowIso?: string;
}): AttentionSuggestionV1 | null
```

Rules:

- Return `null` when `attention.needs_attention` is false or no primary reason exists.
- Use `primary_reason.code` as the main action driver.
- Include all resolver reasons as reasoning factors.
- Include activity signal only as supporting context in V1.
- Never mutate records.
- Never call workflows or communications directly.

### Integration Point

Recommended V1 integration:

- Attach suggestion to opportunity entity GET payload near `_operational_attention`.
- Suggested field: `_attention_suggestion`.
- Display only in opportunity drawer attention/header surfaces.

Reasoning:

- Entity GET is authoritative for drawer behavior.
- Queue rows can stay lightweight and preview-only.
- The drawer is where an operator can inspect reasoning before acting.

Optional later enhancement:

- Queue rows may show a short preview derived from the same suggestion output, but must still open the drawer for authoritative review/action.

### UI Surface

Use existing operational attention UI instead of adding a big AI card.

Recommended placement:

- Keep `OperationalAttentionHeaderStrip` compact.
- Add the structured suggestion in `OperationalAttentionDrawerPanel`, below the current "Next" section or replacing the current unstructured next line.
- Label should feel operational, not theatrical. Suggested copy:
  - "Suggested next step"
  - "Draft message"
  - "Why this is suggested"

Avoid:

- oversized AI chrome
- animated/chat-like surfaces
- claiming autonomous behavior
- hiding deterministic reasoning behind "AI magic"

### Persistence And Audit

Recommendation for this sprint:

- Keep suggestion generation derived and non-persistent for Card 1-5.
- Do not create suggestion audit tables until there is an operator action such as accept, dismiss, or apply.

Future-ready event names:

- `agent_suggestion_generated`
- `agent_suggestion_accepted`
- `agent_suggestion_dismissed`

Do not emit `agent_suggestion_generated` on every drawer open in V1; that would create audit noise. Emit later only when suggestions become durable proposals or operator-reviewed actions.

### Permissions And Scope

- Suggestions are read-only and should follow the same entity GET permissions/scope.
- No client-side privileged writes.
- Any future accept/apply action must route through a server API that rehydrates the entity and re-evaluates the suggestion before acting.

### Tests

Minimum tests for Agent 1 build:

- Pure unit tests for reason-code to suggestion mapping.
- Unit tests for no-suggestion cases.
- Unit tests for suggested content templates.
- Entity payload test proving `_attention_suggestion` attaches when `_operational_attention` has a primary reason.
- Regression tests to ensure queue rows remain preview-only if touched.

## Agent 2: Workflow Assist Agent Template

### Purpose

Create a reusable design pattern for assisting workflow creation and monitoring without fully building the workflow agent in this sprint.

### V1 Template Output Shape

```ts
type WorkflowAssistSuggestionV1 = {
  version: 1;
  agent_key: "workflow_assist";
  suggestion_id: string;
  mode: "template_suggestion" | "activity_summary" | "workflow_config_draft";
  target: {
    entity_type?: string | null;
    workflow_id?: string | null;
  };
  intent: {
    raw_text?: string | null;
    normalized_key: string;
  };
  proposed_workflow?: {
    name: string;
    description?: string | null;
    event_type: string;
    entity_type: string;
    conditions: Array<{
      target_entity?: string | null;
      field_path: string;
      operator: string;
      value: unknown;
    }>;
    actions: Array<{
      action_type: string;
      target_entity?: string | null;
      payload: Record<string, unknown>;
    }>;
  } | null;
  reasoning: {
    summary: string;
    warnings: string[];
  };
};
```

### Workflow Assist Boundaries

For this sprint:

- Design the template.
- Document how it maps to existing workflow APIs.
- Do not implement workflow creation from natural language.
- Do not apply workflow config automatically.
- Do not create a new workflow DSL.

Future workflow apply path should mirror existing agent config routes:

- structured intent
- server validation
- org/admin permission
- expected version/stale checks where relevant
- proposal row
- apply audit row
- service-role-only RPC or equivalent transaction

### Monitoring Summary

Workflow activity summary can use:

- `workflow_runs`
- `workflow_action_runs`
- `workflow_events`
- existing `/api/admin/workflows/summary` if sufficient

Summary output should be read-only in this sprint.

## Card Breakdown

### Card 0 - Audit Validation

Confirm Step 0 with product review. Decide if suggestions are derived-only in V1. Recommended: yes.

### Card 1 - Suggestion Data Model

Add TypeScript types for `AttentionSuggestionV1` and tests for shape.

### Card 2 - Suggestion Logic Engine

Implement deterministic mapping from `OpportunityAttentionResult` to structured suggestion.

### Card 3 - Needs Attention Integration

Attach `_attention_suggestion` in opportunity entity GET after `_operational_attention` is computed.

### Card 4 - UI Rendering

Render suggestion in the opportunity drawer attention surface, matching current Admin V2 look and feel.

### Card 5 - Suggested Message Generation

Add deterministic draft message templates for safe action families only. Do not send.

### Card 6 - Workflow Agent Design Template

Create sprint/design documentation only for Workflow Assist. No runtime implementation unless explicitly approved.

### Card 7 - Testing + Validation

Run targeted tests, typecheck, and update docs if behavior changes.

## Open Questions For Review

1. Should Card 1-5 keep suggestions derived-only, or do we want a durable proposal table immediately?
2. Should queue rows show any suggestion preview in V1, or should all suggestion detail live in the drawer?
3. Which first suggested-content templates are allowed for childcare pilots without becoming childcare-hardcoded platform copy?
4. Should `_attention_suggestion` be included only on `surface=full`, or also on `drawer_visible` for fast header rendering?

## Recommendation

Proceed with derived-only Agent 1 suggestions attached to opportunity entity GET and rendered in the drawer. Keep queue rows as they are unless later review says a compact preview is worth the extra surface area. Keep Agent 2 as design/template only for this sprint.
