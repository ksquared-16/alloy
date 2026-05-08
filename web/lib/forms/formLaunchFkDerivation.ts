import type { SupabaseClient } from "@supabase/supabase-js";

const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type LaunchFkStamp = {
    person_id: string | null;
    customer_id: string | null;
    customer_member_id: string | null;
    opportunity_id: string | null;
};

const EMPTY: LaunchFkStamp = {
    person_id: null,
    customer_id: null,
    customer_member_id: null,
    opportunity_id: null,
};

/** Draft insert: seed CRM FKs when link metadata targets an existing_record or packet launch with source entity. */
export async function deriveSubmissionFksFromLaunchMetadata(
    supabase: SupabaseClient,
    orgId: string,
    linkMetadata: Record<string, unknown>
): Promise<LaunchFkStamp> {
    const mode =
        typeof linkMetadata.form_context_mode === "string" ? linkMetadata.form_context_mode.trim() : "";
    if (mode !== "existing_record" && mode !== "packet") {
        return { ...EMPTY };
    }
    const type = typeof linkMetadata.source_entity_type === "string" ? linkMetadata.source_entity_type.trim() : "";
    const id = typeof linkMetadata.source_entity_id === "string" ? linkMetadata.source_entity_id.trim() : "";
    if (!type || !id || !UUID_RE.test(id)) {
        return { ...EMPTY };
    }

    switch (type) {
        case "person":
            return { ...EMPTY, person_id: id };
        case "customer":
            return { ...EMPTY, customer_id: id };
        case "customer_member": {
            const { data, error } = await supabase
                .from("customer_members")
                .select("customer_id")
                .eq("org_id", orgId)
                .eq("id", id)
                .maybeSingle();
            if (error) throw new Error(error.message);
            const cid = (data as { customer_id?: string } | null)?.customer_id ?? null;
            return { ...EMPTY, customer_member_id: id, customer_id: cid };
        }
        case "opportunity": {
            const { data, error } = await supabase
                .from("opportunities")
                .select("customer_id")
                .eq("org_id", orgId)
                .eq("id", id)
                .maybeSingle();
            if (error) throw new Error(error.message);
            const cid = (data as { customer_id?: string | null } | null)?.customer_id ?? null;
            return { ...EMPTY, opportunity_id: id, customer_id: cid };
        }
        default:
            return { ...EMPTY };
    }
}
