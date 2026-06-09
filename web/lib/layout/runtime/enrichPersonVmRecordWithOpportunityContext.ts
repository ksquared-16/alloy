/**
 * Person layout runtime — opportunity-context fallback when durable household links are sparse.
 *
 * Used only when person drawer is opened from a Lead/opportunity and VM household projection
 * is incomplete. Does not invent data — reads opportunity + OCM/household tables only.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { attachOpportunityInquiryChildrenShell } from "@/lib/admin/opportunityEntityRecord";
import type { PersonHouseholdChildLinkRow, PersonHouseholdContextRow } from "@/lib/admin/person/personDrawerVisibilityTypes";

function trimOrNull(v: unknown): string | null {
    if (v == null) return null;
    const s = String(v).trim();
    return s || null;
}

function householdNameFromVm(vmRecord: Record<string, unknown>): string | null {
    const ctx = vmRecord._household_context as PersonHouseholdContextRow[] | undefined;
    const fromCtx = ctx?.map((row) => trimOrNull(row.customer_name)).find(Boolean);
    if (fromCtx) return fromCtx ?? null;

    for (const row of (vmRecord._customer_persons as { _customer_name?: string | null }[] | undefined) ?? []) {
        const name = trimOrNull(row._customer_name);
        if (name) return name;
    }
    return trimOrNull(vmRecord._household_name) ?? trimOrNull(vmRecord.household_name);
}

function durableChildLinks(vmRecord: Record<string, unknown>): PersonHouseholdChildLinkRow[] {
    const links = vmRecord._household_child_links;
    return Array.isArray(links) ? (links as PersonHouseholdChildLinkRow[]) : [];
}

function formatAddress(row: {
    address_line1?: string | null;
    address_line2?: string | null;
    city?: string | null;
    state?: string | null;
    postal_code?: string | null;
}): string | null {
    const line1 = trimOrNull(row.address_line1);
    const city = trimOrNull(row.city);
    const state = trimOrNull(row.state);
    const postal = trimOrNull(row.postal_code);
    const cityState = [city, state].filter(Boolean).join(", ");
    const tail = [cityState, postal].filter(Boolean).join(" ");
    const parts = [line1, trimOrNull(row.address_line2), tail].filter(Boolean);
    return parts.length > 0 ? parts.join(" · ") : null;
}

/** Merge opportunity context onto person VM when durable household/children are missing. */
export async function enrichPersonVmRecordWithOpportunityContext(input: {
    supabase: SupabaseClient;
    orgId: string;
    personId: string;
    opportunityId: string | null | undefined;
    vmRecord: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
    const opportunityId = trimOrNull(input.opportunityId);
    if (!opportunityId) return input.vmRecord;

    const childLinks = durableChildLinks(input.vmRecord);
    const householdName = householdNameFromVm(input.vmRecord);
    if (childLinks.length > 0 && householdName) {
        return input.vmRecord;
    }

    const { data: oppRow, error: oppErr } = await input.supabase
        .from("opportunities")
        .select("id, customer_id, name, primary_person_id, program_type, schedule_type, metadata")
        .eq("org_id", input.orgId)
        .eq("id", opportunityId)
        .maybeSingle();
    if (oppErr || !oppRow) return input.vmRecord;

    const enriched: Record<string, unknown> = { ...input.vmRecord };
    enriched._person_opportunity_context_id = opportunityId;

    const customerId = trimOrNull((oppRow as { customer_id?: string | null }).customer_id);
    if (customerId && !householdName) {
        const { data: customerRow } = await input.supabase
            .from("customers")
            .select("id, name")
            .eq("org_id", input.orgId)
            .eq("id", customerId)
            .maybeSingle();
        const customerName = trimOrNull((customerRow as { name?: string | null } | null)?.name);
        if (customerName) {
            const ctx = (enriched._household_context as PersonHouseholdContextRow[] | undefined) ?? [];
            if (!ctx.some((row) => row.customer_id === customerId)) {
                enriched._household_context = [...ctx, { customer_id: customerId, customer_name: customerName }];
            }
            enriched.customer_id = customerId;
        }

        const { data: addressRows } = await input.supabase
            .from("locations")
            .select("id, customer_id, label, address1, address2, city, state, postal_code, is_primary")
            .eq("org_id", input.orgId)
            .eq("customer_id", customerId)
            .eq("location_type", "address")
            .eq("is_active", true)
            .order("is_primary", { ascending: false })
            .limit(1);
        const address = addressRows?.[0];
        if (address) {
            const formatted = formatAddress(address as Record<string, unknown>);
            if (formatted) {
                enriched._household_customer_addresses = [
                    {
                        customer_id: customerId,
                        location_id: String((address as { id: string }).id),
                        address_line1: trimOrNull((address as { address1?: string }).address1),
                        address_line2: trimOrNull((address as { address2?: string }).address2),
                        city: trimOrNull((address as { city?: string }).city),
                        state: trimOrNull((address as { state?: string }).state),
                        postal_code: trimOrNull((address as { postal_code?: string }).postal_code),
                        label: trimOrNull((address as { label?: string }).label),
                    },
                ];
                enriched._household_address = formatted;
            }
        }
    }

    const host: Record<string, unknown> = {
        id: opportunityId,
        customer_id: customerId,
        program_type: (oppRow as { program_type?: string | null }).program_type,
        schedule_type: (oppRow as { schedule_type?: string | null }).schedule_type,
        metadata: (oppRow as { metadata?: unknown }).metadata,
    };
    await attachOpportunityInquiryChildrenShell(input.supabase, input.orgId, host);
    if (Array.isArray(host._inquiry_children) && host._inquiry_children.length > 0) {
        enriched._inquiry_children = host._inquiry_children;
    }
    if (Array.isArray(host._household_children) && host._household_children.length > 0) {
        enriched._household_children = host._household_children;
    }

    if (childLinks.length === 0 && customerId) {
        const { data: memberRows } = await input.supabase
            .from("customer_members")
            .select("id, customer_id, display_name, relationship, person_id, dob")
            .eq("org_id", input.orgId)
            .eq("customer_id", customerId)
            .eq("relationship", "child")
            .eq("is_active", true)
            .limit(25);
        const fallbackLinks: PersonHouseholdChildLinkRow[] = (memberRows ?? []).map(
            (row: {
                id: string;
                customer_id: string;
                display_name?: string | null;
                person_id?: string | null;
                dob?: string | null;
            }) => ({
                customer_member_id: row.id,
                customer_id: row.customer_id,
                person_id: trimOrNull(row.person_id),
                display_name: trimOrNull(row.display_name),
                date_of_birth: row.dob != null ? String(row.dob).slice(0, 10) : null,
            }),
        );
        if (fallbackLinks.length > 0) {
            enriched._household_child_links = fallbackLinks;
            enriched._person_children_context_source = "opportunity_household_fallback";
        }
    }

    const primaryPersonId = trimOrNull((oppRow as { primary_person_id?: string | null }).primary_person_id);
    if (primaryPersonId === input.personId && !trimOrNull(enriched.relationship_type)) {
        enriched._primary_contact_on_opportunity = true;
        if (!trimOrNull(enriched["person.relationship"])) {
            enriched.relationship_type = "Primary contact";
        }
    }

    return enriched;
}
