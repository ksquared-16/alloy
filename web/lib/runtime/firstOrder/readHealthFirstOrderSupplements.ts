import type { SupabaseClient } from "@supabase/supabase-js";

import { DOCUMENT_BACKED_REQUIREMENTS } from "@/lib/adminV2/runtime/focusPanel/healthSafety/buildHealthSafetyCardVM";

/**
 * THE TWO HEALTH FACTS THE FIRST-ORDER FACE STATES THAT THE PROFILE READ DOES NOT ANSWER.
 *
 * A′ already reads the child's configured profile fields. The collapsed Health & Safety face also
 * states how many document-backed requirements are satisfied, and how many emergency contacts are
 * on file. Both come from `buildHealthSafetyCardVM`'s own reads; neither needs the rest of that VM
 * (health facts, medications, severity ordering), so this fetches exactly those two and no more.
 *
 * THE REQUIREMENT RULE IS NOT REDEFINED HERE. `DOCUMENT_BACKED_REQUIREMENTS` is imported from the
 * card VM that owns it, and satisfaction is the same test the card makes: a document of the
 * matching `doc_type` exists for this child. Copying the list would create a second answer to
 * "what is a requirement".
 *
 * WHY THE CONTACT NAMES ARE NOT HERE. `buildHealthSafetyCardVM` resolves contact names with a
 * SECOND hop into `persons`. The first-order face states a COUNT, and the count is complete at hop
 * one. Buying a name with a dependent round trip on the critical path is not a first-order trade —
 * Stage 2 may add the names, which is precisely what Stage 2 is for.
 *
 * AUTHORIZATION IS THE CALLER'S. This module does not decide who may see health information; it is
 * not reached unless the caller's gate has already said yes. Putting the decision here would make
 * a second health authority out of a reader.
 */

export type HealthFirstOrderSupplements = {
    requirementsSatisfied: number;
    requirementsTotal: number;
    emergencyContactCount: number;
};

export async function readHealthFirstOrderSupplements(params: {
    supabase: SupabaseClient;
    orgId: string;
    customerMemberId: string;
}): Promise<HealthFirstOrderSupplements> {
    const [documentsResult, contactsResult] = await Promise.all([
        params.supabase
            .from("documents")
            .select("doc_type")
            .eq("org_id", params.orgId)
            .eq("entity_type", "customer_member")
            .eq("entity_id", params.customerMemberId),
        params.supabase
            .from("person_child_relationships")
            .select("person_id")
            .eq("org_id", params.orgId)
            .eq("customer_member_id", params.customerMemberId)
            .eq("status", "active"),
    ]);

    // A failed read THROWS, so the composer states UNAVAILABLE. Returning zero would tell an
    // operator this child has no immunization record on file because a query timed out.
    if (documentsResult.error) throw new Error(`health documents read failed: ${documentsResult.error.message}`);
    if (contactsResult.error) throw new Error(`emergency contacts read failed: ${contactsResult.error.message}`);

    const docTypes = new Set(
        ((documentsResult.data ?? []) as Array<{ doc_type?: unknown }>)
            .map((d) => (d.doc_type == null ? "" : String(d.doc_type).trim()))
            .filter(Boolean),
    );

    return {
        requirementsSatisfied: DOCUMENT_BACKED_REQUIREMENTS.filter((r) => docTypes.has(r.docType)).length,
        requirementsTotal: DOCUMENT_BACKED_REQUIREMENTS.length,
        emergencyContactCount: ((contactsResult.data ?? []) as unknown[]).length,
    };
}
