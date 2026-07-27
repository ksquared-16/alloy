/**
 * Server-side Create Lead eligibility: code-owned minimum + resolved intake
 * `record_creation` requirements for the invocation department.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActionEligibility, ActionInvocation } from "@/lib/adminV2/actions/actionTypes";
import { loadOrgFieldDefinitionsForLifecycle } from "@/lib/lifecycle/loadOrgFieldDefinitionsForLifecycle";
import { resolveCreateLeadActionIntakeSpec } from "@/lib/lifecycle/resolveActionIntakeSpec";
import {
    buildCreateLeadEligibility,
    createLeadConfigRequiredInputsFromIntakeSpec,
} from "@/lib/platform/commands/createLead/createLeadRequiredInputs";

function asMetadata(value: unknown): Record<string, unknown> | null {
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
        return value as Record<string, unknown>;
    }
    return null;
}

/**
 * Resolve Create Lead eligibility for registered action preflight/execute.
 * Requires `invocation.context.department_id` to enforce config `record_creation` rules.
 * Without department context, only the code-owned minimum applies (documented gap for
 * callers that omit department — BOS and modal always supply it).
 */
export async function resolveCreateLeadEligibilityForInvocation(input: {
    supabase: SupabaseClient;
    orgId: string;
    invocation: ActionInvocation;
    payload: Record<string, unknown>;
}): Promise<ActionEligibility> {
    const departmentId = input.invocation.context?.department_id?.trim() || "";
    if (!departmentId) {
        return buildCreateLeadEligibility(input.payload);
    }

    const { data: dept, error } = await input.supabase
        .from("departments")
        .select("id, metadata")
        .eq("id", departmentId)
        .eq("org_id", input.orgId)
        .maybeSingle();

    if (error || !dept) {
        // Fail closed on config load failure when a department was explicitly supplied.
        const base = buildCreateLeadEligibility(input.payload);
        return {
            ...base,
            eligible: false,
            blockers: [
                ...base.blockers,
                {
                    code: "missing_required_input",
                    message:
                        error?.message?.trim() ||
                        "Create Lead requirements could not be loaded for this department.",
                    field: null,
                },
            ],
        };
    }

    const orgFields = await loadOrgFieldDefinitionsForLifecycle(input.supabase, input.orgId);
    // Technical stage key remains `lead` until a command-owned resolver replaces this.
    const spec = resolveCreateLeadActionIntakeSpec({
        department_id: departmentId,
        process_id: input.invocation.context?.process_key ?? null,
        operator_stage: "lead",
        builder_stage_key: "lead",
        department_metadata: asMetadata(dept.metadata),
        org_field_definitions: orgFields,
    });

    const configRequired = createLeadConfigRequiredInputsFromIntakeSpec(spec);
    return buildCreateLeadEligibility(input.payload, configRequired);
}
