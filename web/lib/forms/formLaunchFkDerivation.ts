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

/** Apply trusted packet-link metadata for opportunity launches (validated at link mint; re-checked here). */
export async function applyOpportunityPacketLinkFkExtras(
    supabase: SupabaseClient,
    orgId: string,
    base: LaunchFkStamp,
    linkMetadata: Record<string, unknown>
): Promise<LaunchFkStamp> {
    const midRaw = typeof linkMetadata.selected_customer_member_id === "string" ? linkMetadata.selected_customer_member_id.trim() : "";
    const rpRaw = typeof linkMetadata.recipient_person_id === "string" ? linkMetadata.recipient_person_id.trim() : "";
    let out: LaunchFkStamp = { ...base };
    if (midRaw && UUID_RE.test(midRaw) && base.customer_id) {
        const { data: mem, error } = await supabase
            .from("customer_members")
            .select("id, customer_id")
            .eq("org_id", orgId)
            .eq("id", midRaw)
            .maybeSingle();
        if (error) throw new Error(error.message);
        const mc = (mem as { customer_id?: string } | null)?.customer_id;
        if (mem && mc === base.customer_id) {
            out = { ...out, customer_member_id: midRaw };
        }
    }
    if (rpRaw && UUID_RE.test(rpRaw)) {
        const { data: person, error: pErr } = await supabase
            .from("persons")
            .select("id")
            .eq("org_id", orgId)
            .eq("id", rpRaw)
            .maybeSingle();
        if (pErr) throw new Error(pErr.message);
        if (person && typeof (person as { id?: string }).id === "string") {
            out = { ...out, person_id: rpRaw };
        }
    }
    return out;
}

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
                .select("customer_id, primary_person_id, primary_contact_id")
                .eq("org_id", orgId)
                .eq("id", id)
                .maybeSingle();
            if (error) throw new Error(error.message);
            const row = data as {
                customer_id?: string | null;
                primary_person_id?: string | null;
                primary_contact_id?: string | null;
            } | null;
            const cid = row?.customer_id ?? null;
            let personId: string | null =
                typeof row?.primary_person_id === "string" && UUID_RE.test(row.primary_person_id)
                    ? row.primary_person_id
                    : null;
            if (!personId && typeof row?.primary_contact_id === "string" && UUID_RE.test(row.primary_contact_id)) {
                const { data: con, error: cErr } = await supabase
                    .from("contacts")
                    .select("person_id")
                    .eq("org_id", orgId)
                    .eq("id", row.primary_contact_id)
                    .maybeSingle();
                if (cErr) throw new Error(cErr.message);
                const pid = (con as { person_id?: string | null } | null)?.person_id ?? null;
                if (typeof pid === "string" && UUID_RE.test(pid)) personId = pid;
            }
            const base = { ...EMPTY, opportunity_id: id, customer_id: cid, person_id: personId };
            return await applyOpportunityPacketLinkFkExtras(supabase, orgId, base, linkMetadata);
        }
        default:
            return { ...EMPTY };
    }
}
