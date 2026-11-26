import type { ActionWorkspaceGatherField } from "@/lib/admin/actions/actionWorkspaceTypes";
import { createLeadParserSpec } from "@/lib/admin/actions/createLeadPlatformGather";
import {
    gatherFieldsFromActionIntakeSpec,
} from "@/lib/admin/actions/resolveCreateLeadRequiredFields";
import type { ActionIntakeSpec } from "@/lib/lifecycle/actionIntakeSpecTypes";
import type { IntakeSelectOption } from "@/lib/intake/types";
import {
    CONVERSATION_INTAKE_SUPPORTED_VALUE_KINDS,
    type EffectiveCreateLeadIntakeSpec,
} from "@/lib/bos/commandSession/conversationIntake/types";
import { createLeadConfigRequiredInputsFromIntakeSpec } from "@/lib/platform/commands/createLead/createLeadRequiredInputs";

function unsupportedPartition(fields: readonly ActionWorkspaceGatherField[]) {
    const supported = new Set<string>(CONVERSATION_INTAKE_SUPPORTED_VALUE_KINDS);
    return fields
        .filter((f) => !supported.has(f.value_kind))
        .map((f) => ({
            payloadKey: f.payload_key,
            label: f.field_label,
            valueKind: f.value_kind,
            reason: `Complete “${f.field_label}” in Form — conversation can’t fill this field type yet.`,
        }));
}

/**
 * Build the session-scoped effective intake contract from a resolved ActionIntakeSpec
 * (or platform fallback). Required keys come only from the intake spec (record_creation
 * + code-owned name floor already applied by resolveCreateLeadActionIntakeSpec).
 */
export function buildEffectiveCreateLeadIntakeSpec(input: {
    actionIntakeSpec?: ActionIntakeSpec | null;
    departmentId?: string | null;
    fieldOptions?: Partial<Record<string, readonly IntakeSelectOption[]>>;
    now?: string;
}): EffectiveCreateLeadIntakeSpec {
    const departmentId = input.departmentId?.trim() || "platform";
    const actionIntakeSpec =
        input.actionIntakeSpec ?? createLeadParserSpec(departmentId);
    const gatherFields = gatherFieldsFromActionIntakeSpec(actionIntakeSpec);
    const requiredPayloadKeys = [
        ...new Set(gatherFields.filter((f) => f.tier === "required").map((f) => f.payload_key)),
    ];
    const optionalPayloadKeys = gatherFields
        .filter((f) => f.tier === "optional")
        .map((f) => f.payload_key)
        .filter((key) => !requiredPayloadKeys.includes(key));

    return {
        actionKey: "create_lead",
        actionIntakeSpec,
        gatherFields,
        requiredPayloadKeys,
        optionalPayloadKeys,
        unsupportedForConversation: unsupportedPartition(gatherFields),
        configRequiredInputs: createLeadConfigRequiredInputsFromIntakeSpec(actionIntakeSpec),
        fieldOptions: input.fieldOptions ?? {},
        loadedAt: input.now ?? new Date().toISOString(),
    };
}

export function labelForEffectiveField(
    effective: EffectiveCreateLeadIntakeSpec,
    payloadKey: string
): string {
    const field = effective.gatherFields.find((f) => f.payload_key === payloadKey);
    if (field?.field_label) return field.field_label;
    return payloadKey.replace(/_/g, " ");
}
