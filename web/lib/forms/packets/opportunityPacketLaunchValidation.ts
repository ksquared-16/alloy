import type { SupabaseClient } from "@supabase/supabase-js";

const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type OpportunityEnrollmentSelectionInput = {
    customer_member_id?: string | null;
    recipient_person_id?: string | null;
    delivery_intent?: string | null;
};

export type OpportunityEnrollmentSelectionResolved = {
    selected_customer_member_id: string | null;
    recipient_person_id: string | null;
    delivery_intent: "copy_link" | "email_later";
};

/** Server-only validation for CRM packet launch from an opportunity (never trust raw client FKs). */
export async function resolveOpportunityEnrollmentSelection(
    supabase: SupabaseClient,
    orgId: string,
    opportunityId: string,
    raw: OpportunityEnrollmentSelectionInput | null | undefined
): Promise<{ ok: true; value: OpportunityEnrollmentSelectionResolved } | { ok: false; message: string }> {
    const { data: opp, error: oErr } = await supabase
        .from("opportunities")
        .select("id, customer_id, primary_person_id, primary_contact_id")
        .eq("org_id", orgId)
        .eq("id", opportunityId)
        .maybeSingle();
    if (oErr) return { ok: false, message: oErr.message };
    const oppRow = opp as {
        id?: string;
        customer_id?: string | null;
        primary_person_id?: string | null;
        primary_contact_id?: string | null;
    } | null;
    if (!oppRow?.id) return { ok: false, message: "Opportunity not found" };
    const customerId = typeof oppRow.customer_id === "string" && UUID_RE.test(oppRow.customer_id) ? oppRow.customer_id : null;

    let selectedMember: string | null = null;
    const midRaw = typeof raw?.customer_member_id === "string" ? raw.customer_member_id.trim() : "";
    if (midRaw && UUID_RE.test(midRaw)) {
        if (!customerId) {
            return { ok: false, message: "Opportunity has no customer account — cannot attach a member" };
        }
        const { data: mem, error: mErr } = await supabase
            .from("customer_members")
            .select("id, customer_id")
            .eq("org_id", orgId)
            .eq("id", midRaw)
            .maybeSingle();
        if (mErr) return { ok: false, message: mErr.message };
        const mc = (mem as { customer_id?: string } | null)?.customer_id;
        if (!mem || mc !== customerId) {
            return { ok: false, message: "Selected member is not part of this opportunity's customer account" };
        }
        selectedMember = midRaw;
    }

    let defaultPerson: string | null = null;
    const pp = oppRow.primary_person_id;
    if (typeof pp === "string" && UUID_RE.test(pp)) defaultPerson = pp;
    if (!defaultPerson && typeof oppRow.primary_contact_id === "string" && UUID_RE.test(oppRow.primary_contact_id)) {
        const { data: con, error: cErr } = await supabase
            .from("contacts")
            .select("person_id")
            .eq("org_id", orgId)
            .eq("id", oppRow.primary_contact_id)
            .maybeSingle();
        if (cErr) return { ok: false, message: cErr.message };
        const pid = (con as { person_id?: string | null } | null)?.person_id ?? null;
        if (typeof pid === "string" && UUID_RE.test(pid)) defaultPerson = pid;
    }

    let recipientPerson: string | null = null;
    const rpRaw = typeof raw?.recipient_person_id === "string" ? raw.recipient_person_id.trim() : "";
    if (rpRaw && UUID_RE.test(rpRaw)) {
        const { data: person, error: pErr } = await supabase
            .from("persons")
            .select("id")
            .eq("org_id", orgId)
            .eq("id", rpRaw)
            .maybeSingle();
        if (pErr) return { ok: false, message: pErr.message };
        if (!person) return { ok: false, message: "Recipient person not found in this organization" };

        const allowed = new Set<string>();
        if (defaultPerson) allowed.add(defaultPerson);
        if (selectedMember) {
            const { data: memP, error: mpErr } = await supabase
                .from("customer_members")
                .select("person_id")
                .eq("org_id", orgId)
                .eq("id", selectedMember)
                .maybeSingle();
            if (mpErr) return { ok: false, message: mpErr.message };
            const mpid = (memP as { person_id?: string | null } | null)?.person_id ?? null;
            if (typeof mpid === "string" && UUID_RE.test(mpid)) allowed.add(mpid);
        }
        if (customerId) {
            const { data: cust } = await supabase
                .from("customers")
                .select("primary_contact_id")
                .eq("org_id", orgId)
                .eq("id", customerId)
                .maybeSingle();
            const pcid = (cust as { primary_contact_id?: string | null } | null)?.primary_contact_id ?? null;
            if (typeof pcid === "string" && UUID_RE.test(pcid)) {
                const { data: con2 } = await supabase
                    .from("contacts")
                    .select("person_id")
                    .eq("org_id", orgId)
                    .eq("id", pcid)
                    .maybeSingle();
                const pid2 = (con2 as { person_id?: string | null } | null)?.person_id ?? null;
                if (typeof pid2 === "string" && UUID_RE.test(pid2)) allowed.add(pid2);
            }
        }

        if (!allowed.has(rpRaw)) {
            return {
                ok: false,
                message: "Recipient must be the opportunity primary person, customer primary contact person, or the selected member's linked person",
            };
        }
        recipientPerson = rpRaw;
    }

    const di = typeof raw?.delivery_intent === "string" ? raw.delivery_intent.trim().toLowerCase() : "";
    const delivery_intent: "copy_link" | "email_later" = di === "email_later" ? "email_later" : "copy_link";

    return {
        ok: true,
        value: {
            selected_customer_member_id: selectedMember,
            recipient_person_id: recipientPerson,
            delivery_intent,
        },
    };
}
