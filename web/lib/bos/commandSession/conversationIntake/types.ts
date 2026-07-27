/**
 * Conversation Intake Adapter — Round 2 boundary.
 *
 * BOS Command Session hosts this adapter. Create Lead ships a bounded
 * implementation; Processing Conversation Runtime may later replace it
 * without rewriting the session shell.
 *
 * @see docs/sprints/active/bos-actionable-interface/round-2/README.md
 */

import type { ActionWorkspaceGatherField } from "@/lib/admin/actions/actionWorkspaceTypes";
import type { ActionIntakeSpec } from "@/lib/lifecycle/actionIntakeSpecTypes";
import type { ActionRequiredInput } from "@/lib/adminV2/actions/actionTypes";
import type { IntakeSelectOption } from "@/lib/intake/types";
import type {
    BosCommandDraft,
    BosCommandPreview,
    BosCommandResolutionState,
} from "@/lib/bos/commandSession/types";

/** Bounded value kinds Conversation can attempt to parse in Round 2. */
export const CONVERSATION_INTAKE_SUPPORTED_VALUE_KINDS = [
    "text",
    "email",
    "phone",
    "date",
    "select",
] as const;

export type ConversationIntakeSupportedValueKind =
    (typeof CONVERSATION_INTAKE_SUPPORTED_VALUE_KINDS)[number];

/**
 * Effective Create Lead intake contract for one session:
 * platform floor + configured record_creation + optional fields.
 */
export type EffectiveCreateLeadIntakeSpec = {
    actionKey: "create_lead";
    actionIntakeSpec: ActionIntakeSpec;
    gatherFields: ActionWorkspaceGatherField[];
    requiredPayloadKeys: string[];
    optionalPayloadKeys: string[];
    /** Fields present in Form but not yet conversation-parseable. */
    unsupportedForConversation: Array<{
        payloadKey: string;
        label: string;
        valueKind: string;
        reason: string;
    }>;
    configRequiredInputs: ActionRequiredInput[];
    fieldOptions: Partial<Record<string, readonly IntakeSelectOption[]>>;
    loadedAt: string;
};

export type ConversationUnderstandingSummary = {
    lines: string[];
    evidenceNotes: Array<{ fieldKey: string; label: string; note: string; value: string }>;
    unmappedPreserved: boolean;
};

export type ConversationClarification = {
    /** Operator-facing question cluster (one at a time). */
    prompt: string;
    missingRequiredKeys: string[];
    /** Prefer Form for these (unsupported parse types). */
    formGuidance: string | null;
};

export type ConversationIntakeWorkspace = {
    departmentId?: string | null;
    workUnitId?: string | null;
    surface?: string;
};

/**
 * Interpretation-only adapter. Execution stays on BosCommandAdapter /
 * executeCreateLeadCommand.
 */
export type ConversationIntakeAdapter = {
    actionKey: string;

    loadEffectiveSpec(input: {
        departmentId: string | null;
        fieldOptions?: Partial<Record<string, readonly IntakeSelectOption[]>>;
        /** When provided, skip network — tests and warm cache. */
        actionIntakeSpec?: ActionIntakeSpec | null;
    }): Promise<EffectiveCreateLeadIntakeSpec> | EffectiveCreateLeadIntakeSpec;

    parseOperatorTurn(input: {
        text: string;
        draft: BosCommandDraft;
        effectiveSpec: EffectiveCreateLeadIntakeSpec;
        now?: string;
    }): BosCommandDraft;

    buildUnderstandingSummary(input: {
        draft: BosCommandDraft;
        effectiveSpec: EffectiveCreateLeadIntakeSpec;
    }): ConversationUnderstandingSummary;

    nextClarification(input: {
        draft: BosCommandDraft;
        effectiveSpec: EffectiveCreateLeadIntakeSpec;
        workspace: ConversationIntakeWorkspace;
    }): ConversationClarification | null;

    syncDraftResolution(input: {
        draft: BosCommandDraft;
        effectiveSpec: EffectiveCreateLeadIntakeSpec;
        workspace: ConversationIntakeWorkspace;
    }): BosCommandResolutionState;

    buildReview(input: {
        draft: BosCommandDraft;
        effectiveSpec: EffectiveCreateLeadIntakeSpec;
        workspace: ConversationIntakeWorkspace;
    }): BosCommandPreview;
};
