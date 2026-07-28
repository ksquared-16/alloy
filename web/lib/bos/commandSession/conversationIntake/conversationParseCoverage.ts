/**
 * Round 2 bounded conversation parse coverage.
 * Fields outside this set remain visible in Form with honest guidance.
 */
import type { ActionWorkspaceGatherField } from "@/lib/admin/actions/actionWorkspaceTypes";
import {
    CONVERSATION_INTAKE_SUPPORTED_VALUE_KINDS,
    type EffectiveCreateLeadIntakeSpec,
} from "@/lib/bos/commandSession/conversationIntake/types";

export function isConversationParseSupportedKind(
    kind: ActionWorkspaceGatherField["value_kind"]
): boolean {
    return (CONVERSATION_INTAKE_SUPPORTED_VALUE_KINDS as readonly string[]).includes(kind);
}

export function describeConversationParseCoverage(
    effective: EffectiveCreateLeadIntakeSpec
): {
    parseablePayloadKeys: string[];
    formOnlyPayloadKeys: string[];
    guidance: string;
} {
    const parseablePayloadKeys = effective.gatherFields
        .filter((f) => isConversationParseSupportedKind(f.value_kind))
        .map((f) => f.payload_key);
    const formOnlyPayloadKeys = effective.unsupportedForConversation.map((u) => u.payloadKey);
    return {
        parseablePayloadKeys,
        formOnlyPayloadKeys,
        guidance:
            formOnlyPayloadKeys.length === 0
                ? "Conversation can attempt every field on this Create Lead form."
                : "Some Create Lead fields must be completed in Form — conversation will not invent values for unsupported types.",
    };
}
