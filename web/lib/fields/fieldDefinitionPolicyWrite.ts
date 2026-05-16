/**
 * Shared merge helpers for field_definitions policy columns on admin write.
 */

import {
    normalizeFieldDefinitionRequirementWrite,
    type FieldRequirementPolicyV1,
} from "@/lib/fields/fieldRequirementPolicy";
import {
    normalizeFieldDefinitionInteractionWrite,
    type FieldInteractionPolicyV1,
} from "@/lib/fields/fieldInteractionPolicy";

export type FieldDefinitionPolicyPatchInput = {
    is_required?: boolean;
    requirement_policy?: unknown | null;
    interaction_policy?: unknown | null;
};

export type FieldDefinitionPolicyPatchResult =
    | {
          ok: true;
          requirement_policy?: FieldRequirementPolicyV1;
          is_required?: boolean;
          interaction_policy?: FieldInteractionPolicyV1;
      }
    | { ok: false; error: string };

/**
 * Parse policy fields from admin POST/PATCH body. Unspecified keys are omitted from result.
 */
export function mergeFieldDefinitionPoliciesFromBody(
    body: FieldDefinitionPolicyPatchInput,
    options?: { existing_is_required?: boolean }
): FieldDefinitionPolicyPatchResult {
    const hasReq = body.is_required !== undefined || body.requirement_policy !== undefined;
    const hasInteraction = body.interaction_policy !== undefined;

    let requirement_policy: FieldRequirementPolicyV1 | undefined;
    let is_required: boolean | undefined;
    let interaction_policy: FieldInteractionPolicyV1 | undefined;

    if (hasReq) {
        const norm = normalizeFieldDefinitionRequirementWrite({
            is_required: body.is_required ?? options?.existing_is_required,
            requirement_policy: body.requirement_policy,
        });
        if ("error" in norm) return { ok: false, error: norm.error };
        requirement_policy = norm.requirement_policy;
        is_required = norm.is_required;
    }

    if (hasInteraction) {
        if (body.interaction_policy === undefined || body.interaction_policy === null) {
            return { ok: false, error: "interaction_policy cannot be null; omit key to leave unchanged" };
        }
        const norm = normalizeFieldDefinitionInteractionWrite(body.interaction_policy);
        if ("error" in norm) return { ok: false, error: norm.error };
        interaction_policy = norm.interaction_policy;
    }

    return {
        ok: true,
        ...(requirement_policy !== undefined ? { requirement_policy, is_required } : {}),
        ...(interaction_policy !== undefined ? { interaction_policy } : {}),
    };
}
