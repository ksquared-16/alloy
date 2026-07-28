/**
 * BOS command-session types — planning contracts realized for V1.
 * @see docs/sprints/active/bos-actionable-interface/04-command-session-and-data-contracts.md
 */

export type BosCommandMode = "conversation" | "form";

export type BosCommandSessionPhase =
    | "acknowledged"
    | "gathering"
    | "resolving"
    | "preview"
    | "confirming"
    | "executing"
    | "processing_review"
    | "completed"
    | "failed"
    | "discarded";

export type BosInputValueState =
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

export type BosCommandExecutionKind =
    | "processing_intake"
    | "direct_registered_execute"
    /** Facade-backed Commands that are not RegisteredActions (mutation / relationship / tour). */
    | "direct_runtime_execute"
    | "assist_proposal";

export type BosCommandPlacement =
    | "work_unit_actions"
    | "workspace_actions_menu"
    | "bos_recommendations"
    | "bos_slash"
    | "bos_briefing";

export type BosCommandInvocation = {
    actionKey: string;
    displayLabel: string;
    placement: BosCommandPlacement;
    contextResolution: "bos_proposal";
    workspace: {
        departmentId: string | null;
        workUnitId: string | null;
        surface: string;
    };
    capabilityKey?: string;
};

export type BosInputEvidence = {
    kind: "source_span" | "operator_edit" | "option_match" | "system_default";
    sourceTextId?: string;
    excerpt?: string;
    note?: string;
    at: string;
};

export type BosCommandInputValue = {
    fieldKey: string;
    value: unknown;
    state: BosInputValueState;
    evidence: BosInputEvidence[];
    optionResolved: boolean;
};

export type BosCommandDraft = {
    values: BosCommandInputValue[];
    sourceTexts: Array<{ id: string; text: string; capturedAt: string }>;
    household: unknown | null;
    unmappedText: string | null;
    schemaVersion: 1;
};

export type BosCommandConversationMessage = {
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
    body: string;
    createdAt: string;
};

export type BosCommandResolutionState = {
    missingRequired: string[];
    missingOptional: string[];
    invalid: string[];
    ambiguous: string[];
    blockers: Array<{ code: string; message: string }>;
    readyForPreview: boolean;
    readyToExecute: boolean;
};

export type BosCommandPreview = {
    title: string;
    summaryLines: string[];
    householdSummary: string | null;
    warnings: string[];
    sideEffects: string[];
    destination: { workUnitLabel?: string; stageLabel?: string };
    generatedAt: string;
    draftFingerprint: string;
    /** Destructive preview correlation token (e.g. cancel_tour). */
    previewToken?: string;
};

export type BosCommandConfirmation = {
    confirmedAt: string | null;
    confirmedByOperator: boolean;
    previewFingerprint: string;
};

export type BosCommandExecutionResult =
    | {
          ok: true;
          executionKind: BosCommandExecutionKind;
          processingCaseId?: string;
          opportunityId?: string;
          success: unknown;
      }
    | {
          ok: false;
          errorMessage: string;
          retryable: boolean;
          recoveryHints: string[];
      };

export type BosCommandRecoveryState = {
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

export type BosCommandSession = {
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

export type BosSlashCommandDescriptor = {
    token: string;
    actionKey: string;
    displayLabel: string;
    description: string;
    eligible: boolean;
    ineligibleReason?: string;
    placementContextRequired: boolean;
};

export type BosOperationalBriefingMessage = {
    id: string;
    generatedAt: string;
    scope: { orgId: string; operatorId: string; timezone: string };
    items: Array<{
        id: string;
        title: string;
        whyItMatters: string;
        metricRefs: string[];
        recommendedActionKey: string | null;
        dismissed: boolean;
        readAt: string | null;
    }>;
    frequencyKey: "daily_morning";
};

export type BosCommandAdapter = {
    actionKey: string;
    executionKind: BosCommandExecutionKind;
    parseSourceText(
        text: string,
        draft: BosCommandDraft,
        ctx: unknown
    ): Promise<BosCommandDraft> | BosCommandDraft;
    revalidate(draft: BosCommandDraft, ctx: unknown): BosCommandResolutionState;
    buildPreview(draft: BosCommandDraft, ctx: unknown): BosCommandPreview;
    toExecutePayload(draft: BosCommandDraft, ctx: unknown): Record<string, unknown>;
    execute(
        payload: Record<string, unknown>,
        ctx: unknown
    ): Promise<BosCommandExecutionResult>;
    mapSuccess(result: BosCommandExecutionResult, draft: BosCommandDraft): unknown;
};
