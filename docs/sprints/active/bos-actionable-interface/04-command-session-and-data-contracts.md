---
owner: platform
status: active-sprint
last_reviewed: 2026-07-27
---

# 04 — Command Session and Data Contracts

Planning artifacts only. Not implemented yet.

Legend for each field: **Owner** · **Source** · **Persistence** · **Mutability** · **Auth vs projection** · **Security scope** · **Lifecycle**

---

## Enumerations

```ts
type BosCommandMode = "conversation" | "form";

type BosCommandSessionPhase =
  | "acknowledged"
  | "gathering"
  | "resolving"
  | "preview"
  | "confirming"
  | "executing"
  | "processing_review" // Create Lead after execute
  | "completed"
  | "failed"
  | "discarded";

type BosInputValueState =
  | "confirmed"
  | "operator_entered"
  | "parsed_from_source"
  | "inferred"
  | "unresolved"
  | "ambiguous"
  | "conflicting"
  | "invalid"
  | "missing_optional"
  | "missing_required";

type BosCommandExecutionKind =
  | "processing_intake"
  | "direct_registered_execute"
  | "assist_proposal";
```

---

## BosCommandSession

```ts
type BosCommandSession = {
  sessionId: string;
  invocation: BosCommandInvocation;
  mode: BosCommandMode;
  phase: BosCommandSessionPhase;
  draft: BosCommandDraft;
  messages: BosCommandConversationMessage[];
  resolution: BosCommandResolutionState;
  preview: BosCommandPreview | null;
  confirmation: BosCommandConfirmation | null;
  execution: BosCommandExecutionResult | null;
  recovery: BosCommandRecoveryState | null;
  processingCaseId: string | null;
  requestSeq: number;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
};
```

| Field | Owner | Source | Persist | Mut | Auth? | Scope | Lifecycle |
|---|---|---|---|---|---|---|---|
| sessionId | BOS client | ulid | sessionStorage | immutable | projection | org via actor session | create→discard/complete |
| invocation | BOS client | Actions/slash/briefing | sessionStorage | immutable | projection | org+RBAC | fixed at start |
| mode | Operator | toggle | sessionStorage | mutable | projection | — | until execute |
| phase | Session controller | transitions | sessionStorage | mutable | projection | — | full lifecycle |
| draft | Session | parser/form/operator | sessionStorage | mutable | **provisional** | org | until execute payload built |
| messages | Session | UI turns | sessionStorage | append/truncate | projection | no secrets beyond needed | |
| preview | Command model | derive* | memory/session | replace | projection of eligibility | | gather→confirm |
| processingCaseId | Server | execute result | sessionStorage | set once | mirrors server | org | after execute |
| requestSeq | Client | increment | memory | mutable | stale guard | | |

---

## BosCommandInvocation

```ts
type BosCommandInvocation = {
  actionKey: string;           // never show raw in UI copy
  displayLabel: string;        // "Create Lead"
  placement:
    | "work_unit_actions"
    | "workspace_actions_menu"
    | "bos_recommendations"
    | "bos_slash"
    | "bos_briefing";
  contextResolution: "bos_proposal";
  workspace: {
    departmentId: string | null;
    workUnitId: string | null;
    surface: string;
  };
  capabilityKey?: string;      // future BOS registry key if registered
};
```

---

## BosCommandDraft

```ts
type BosCommandDraft = {
  values: BosCommandInputValue[];
  sourceTexts: Array<{ id: string; text: string; capturedAt: string }>;
  household: unknown | null; // CreateLeadCommitSelection-compatible shape
  unmappedText: string | null;
  schemaVersion: 1;
};
```

Single source for Conversation and Form.

---

## BosCommandInputValue

```ts
type BosCommandInputValue = {
  fieldKey: string;            // internal; map to operator label via intake spec
  value: unknown;
  state: BosInputValueState;
  evidence: BosInputEvidence[];
  optionResolved: boolean;     // canonical option id resolved
};
```

| Field | Owner | Persist | Auth? |
|---|---|---|---|
| value | draft | sessionStorage | provisional until execute |
| state | draft rules | sessionStorage | projection |
| evidence | parser/operator | sessionStorage | audit hint at execute |

---

## BosInputEvidence

```ts
type BosInputEvidence = {
  kind: "source_span" | "operator_edit" | "option_match" | "system_default";
  sourceTextId?: string;
  excerpt?: string;
  note?: string;               // operator-facing, calm
  at: string;
};
```

---

## BosCommandConversationMessage

```ts
type BosCommandConversationMessage = {
  id: string;
  role: "system" | "operator" | "assistant";
  kind:
    | "ack"
    | "user_source"
    | "follow_up"
    | "summary"
    | "preview"
    | "error"
    | "success"
    | "mode_switch";
  body: string;                // operator language only
  createdAt: string;
};
```

---

## BosCommandResolutionState

```ts
type BosCommandResolutionState = {
  missingRequired: string[];   // field keys
  missingOptional: string[];
  invalid: string[];
  ambiguous: string[];
  blockers: Array<{ code: string; message: string }>; // operator messages
  readyForPreview: boolean;
  readyToExecute: boolean;
};
```

Derived from existing `buildCreateLeadEligibility` / command model — not a parallel rules engine.

---

## BosCommandPreview

```ts
type BosCommandPreview = {
  title: string;
  summaryLines: string[];
  householdSummary: string | null;
  warnings: string[];
  sideEffects: string[];       // includes Processing review notice for create_lead
  destination: { workUnitLabel?: string; stageLabel?: string };
  generatedAt: string;
  draftFingerprint: string;    // stale guard
};
```

---

## BosCommandConfirmation

```ts
type BosCommandConfirmation = {
  confirmedAt: string | null;
  confirmedByOperator: boolean;
  previewFingerprint: string;  // must match preview at execute
};
```

---

## BosCommandExecutionResult

```ts
type BosCommandExecutionResult =
  | {
      ok: true;
      executionKind: BosCommandExecutionKind;
      processingCaseId?: string;
      opportunityId?: string;
      success: unknown; // CreateLeadSuccess shape when applicable
    }
  | {
      ok: false;
      errorMessage: string;
      retryable: boolean;
      recoveryHints: string[];
    };
```

---

## BosCommandRecoveryState

```ts
type BosCommandRecoveryState = {
  reason:
    | "parser_failure"
    | "validation"
    | "unauthorized"
    | "stale_preview"
    | "network"
    | "server"
    | "duplicate"
    | "config"
    | "processing_stale";
  preserveDraft: boolean;
  operatorMessage: string;
};
```

---

## BosSlashCommandDescriptor (Horizon 2)

```ts
type BosSlashCommandDescriptor = {
  token: string;               // "create lead"
  actionKey: string;
  displayLabel: string;
  description: string;
  eligible: boolean;
  ineligibleReason?: string;
  placementContextRequired: boolean;
};
```

---

## BosOperationalBriefingMessage (Horizon 3)

```ts
type BosOperationalBriefingMessage = {
  id: string;
  generatedAt: string;
  scope: { orgId: string; operatorId: string; timezone: string };
  items: Array<{
    id: string;
    title: string;
    whyItMatters: string;      // from canonical projection explanation, not free LLM truth
    metricRefs: string[];      // MetricEngine/OIP ids only
    recommendedActionKey: string | null;
    dismissed: boolean;
    readAt: string | null;
  }>;
  frequencyKey: "daily_morning";
};
```

---

## Adapter contract (generic extension)

```ts
interface BosCommandAdapter {
  actionKey: string;
  executionKind: BosCommandExecutionKind;
  parseSourceText(text: string, draft: BosCommandDraft, ctx: unknown): Promise<BosCommandDraft>;
  revalidate(draft: BosCommandDraft, ctx: unknown): BosCommandResolutionState;
  buildPreview(draft: BosCommandDraft, ctx: unknown): BosCommandPreview;
  toExecutePayload(draft: BosCommandDraft, ctx: unknown): Record<string, unknown>;
  execute(payload: Record<string, unknown>, ctx: unknown): Promise<BosCommandExecutionResult>;
  mapSuccess(result: BosCommandExecutionResult, draft: BosCommandDraft): unknown;
}
```

Create Lead adapter wraps existing modules; does not reimplement them.

---

## Security notes on contracts

- Never put service-role keys or raw DB rows in session.
- Truncate `sourceTexts` (size cap, e.g. 32KB) before persist.
- Redact secrets in logs; allow phone/email in draft as operational PII under org scope.
- Operator-facing copy uses `displayLabel` / intake field labels — never `actionKey`, schema names, or enums.
