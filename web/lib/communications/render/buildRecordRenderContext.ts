import type { SupabaseClient } from "@supabase/supabase-js";

import type { RenderContext } from "@/lib/communications/render/renderOutboundMessage";
import { formatLocationAddress } from "@/lib/locations/locationWorkspaceModel";

/**
 * THE VALUES A TEMPLATE'S TOKENS RESOLVE TO, for one recipient on one record.
 *
 * The canonical renderer (`renderOutboundMessage`) reads tokens only from owner-scoped buckets, and
 * refuses a message whose catalogued tokens it cannot fill. No caller ever built those buckets, so every
 * Template Library message with a `{{token}}` was refused at enqueue (TOKEN_UNRESOLVED) — the composer's
 * "Template ▾" filled the draft with tokens nobody could resolve, and nothing was sent.
 *
 * Read from canonical rows only — the recipient person, the household, the lead, its location, the
 * organization — never by walking a caller-supplied payload. Internal ids (`*.id`) are deliberately NOT
 * provided: a template that names one stays refused rather than putting a database id in a parent's
 * message. A value that cannot be resolved is left absent, and the renderer names it to the operator.
 */
export type RecordRenderSubject = {
    /** The recipient — a canonical person. */
    personId: string;
    customerId?: string | null;
    opportunityId?: string | null;
};

type Values = NonNullable<RenderContext["values"]>;

function clean(v: unknown): string | null {
    return typeof v === "string" && v.trim() ? v.trim() : null;
}

export async function buildRecordRenderContext(
    supabase: SupabaseClient,
    orgId: string,
    subject: RecordRenderSubject,
): Promise<Values> {
    const [personRes, customerRes, oppRes, orgRes] = await Promise.all([
        supabase.from("persons").select("first_name, last_name, email, phone").eq("org_id", orgId).eq("id", subject.personId).maybeSingle(),
        subject.customerId
            ? supabase.from("customers").select("name").eq("org_id", orgId).eq("id", subject.customerId).maybeSingle()
            : Promise.resolve({ data: null }),
        subject.opportunityId
            ? supabase.from("opportunities").select("name, location_id").eq("org_id", orgId).eq("id", subject.opportunityId).maybeSingle()
            : Promise.resolve({ data: null }),
        supabase.from("orgs").select("name").eq("id", orgId).maybeSingle(),
    ]);

    const person = (personRes.data ?? null) as { first_name?: string | null; last_name?: string | null; email?: string | null; phone?: string | null } | null;
    const customer = (customerRes.data ?? null) as { name?: string | null } | null;
    const opp = (oppRes.data ?? null) as { name?: string | null; location_id?: string | null } | null;
    const orgName = clean((orgRes.data as { name?: string | null } | null)?.name);

    const locationId = clean(opp?.location_id);
    const { data: locationRow } = locationId
        ? await supabase.from("locations").select("label, address1, city, state, postal_code").eq("org_id", orgId).eq("id", locationId).maybeSingle()
        : { data: null };
    const location = (locationRow ?? null) as Record<string, unknown> | null;
    const locationName = clean(location?.label);
    const locationAddress = location
        ? clean(formatLocationAddress(location as Parameters<typeof formatLocationAddress>[0]))
        : null;

    // The CHILD tokens are only meaningful when the lead names exactly one child; with several, a single
    // "child first name" would be a guess, so it stays unresolved and the renderer says so.
    let childFirst: string | null = null;
    let childFull: string | null = null;
    if (subject.opportunityId) {
        const { data: links } = await supabase
            .from("opportunity_customer_members")
            .select("customer_member_id")
            .eq("org_id", orgId)
            .eq("opportunity_id", subject.opportunityId);
        const memberIds = [...new Set(((links ?? []) as Array<{ customer_member_id: string }>).map((l) => l.customer_member_id))];
        if (memberIds.length === 1) {
            const { data: child } = await supabase
                .from("customer_members")
                .select("first_name, last_name, display_name")
                .eq("org_id", orgId)
                .eq("id", memberIds[0]!)
                .maybeSingle();
            const c = child as { first_name?: string | null; last_name?: string | null; display_name?: string | null } | null;
            childFirst = clean(c?.first_name);
            childFull = clean(c?.display_name) ?? ([clean(c?.first_name), clean(c?.last_name)].filter(Boolean).join(" ") || null);
        }
    }

    const parentFirst = clean(person?.first_name);
    return {
        recipient: {
            "contact.first_name": parentFirst,
            "contact.last_name": clean(person?.last_name),
            "contact.email": clean(person?.email),
            "contact.phone": clean(person?.phone),
            parent_name: parentFirst,
        },
        household: { "customer.name": clean(customer?.name) },
        child: { "person.first_name": childFirst, "person.name": childFull },
        record: { "opportunity.name": clean(opp?.name) },
        location: {
            location_name: locationName,
            "location.name": locationName,
            location_address: locationAddress,
            site_line: [locationName, locationAddress].filter(Boolean).join(" — ") || null,
        },
        organization: { org_name: orgName, organization_name: orgName, "org.name": orgName },
    };
}
