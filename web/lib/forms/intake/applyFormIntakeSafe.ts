import type { SupabaseClient } from "@supabase/supabase-js";
import type { FormPayload } from "@/lib/forms/validateSubmission";

export type ApplyFormIntakeSafeInput = {
    orgId: string;
    linkMetadata: Record<string, unknown> | undefined;
    defaultVerticalId?: string | null;
    defaultOpportunityStatusKey?: string | null;
    payload: FormPayload;
    existingPersonId?: string | null;
    existingCustomerId?: string | null;
    existingCustomerMemberId?: string | null;
    existingOpportunityId?: string | null;
};

export type ApplyFormIntakeSafeResult = {
    person_id: string | null;
    customer_id: string | null;
    customer_member_id: string | null;
    opportunity_id: string | null;
    outcomeMeta: Record<string, unknown>;
};

/**
 * Retired public-form direct-write authority (E1).
 * Active routes use `ingestPublicFormThroughProcessing` only.
 */
export async function applyFormIntakeSafe(
    _supabase: SupabaseClient,
    _input: ApplyFormIntakeSafeInput,
): Promise<ApplyFormIntakeSafeResult> {
    throw new Error(
        "applyFormIntakeSafe direct-write authority retired (E1). Use ingestPublicFormThroughProcessing.",
    );
}
