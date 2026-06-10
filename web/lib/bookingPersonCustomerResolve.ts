/**
 * Person-native booking identity: persons + customer_persons + customers.
 * Does not create or require contacts for correctness.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureCustomerPersonsPrimaryLink } from "@/lib/bookingCustomerPersonLink";
import { findOrCreatePersonInOrg } from "@/lib/persons/findOrCreatePersonInOrg";

export type PersonCustomerBookingResult = {
    person_id: string;
    customer_id: string;
    resolution_path: string;
};

/**
 * Given a known person id, ensure a customer exists and customer_persons primary link (no contact).
 */
export async function ensureCustomerForPersonNative(
    supabase: SupabaseClient,
    personId: string,
    params: {
        /** Optional — customers.vertical_id is nullable; omit when org has no vertical configured. */
        vertical_id?: string | null;
        org_id: string | null;
        first_name?: string | null;
        last_name?: string | null;
        email?: string | null;
        phone?: string | null;
    }
): Promise<{ customer_id: string }> {
    const trimmed = personId.trim();
    if (!trimmed) throw new Error("person_id is required");

    const { data: person, error: personErr } = await supabase
        .from("persons")
        .select("id, first_name, last_name, email, phone, org_id")
        .eq("id", trimmed)
        .single();
    if (personErr || !person) throw new Error("Person not found");

    const p = person as {
        first_name?: string | null;
        last_name?: string | null;
        email?: string | null;
        phone?: string | null;
        org_id?: string | null;
    };
    const orgId = p.org_id ?? params.org_id;
    if (!orgId?.trim()) throw new Error("Missing org_id for customer (person and env)");

    const { data: cp } = await supabase
        .from("customer_persons")
        .select("customer_id")
        .eq("person_id", trimmed)
        .limit(1)
        .maybeSingle();

    if (cp?.customer_id) {
        const customerId = (cp as { customer_id: string }).customer_id;
        await ensureCustomerPersonsPrimaryLink(supabase, { customerId, personId: trimmed, orgId });
        return { customer_id: customerId };
    }

    const name =
        [params.first_name ?? p.first_name, params.last_name ?? p.last_name].filter(Boolean).join(" ").trim()
        || (params.email ?? p.email)
        || (params.phone ?? p.phone)
        || "New Customer";

    const payload: Record<string, unknown> = {
        name,
        status: "active",
        metadata: {
            source: "book-v2-person-native",
            email: params.email ?? p.email ?? undefined,
            phone: params.phone ?? p.phone ?? undefined,
        },
        org_id: orgId,
    };
    const verticalId = params.vertical_id?.trim() || null;
    if (verticalId) payload.vertical_id = verticalId;

    const { data: newCustomer, error: insErr } = await supabase.from("customers").insert(payload).select("id").single();
    if (insErr || !newCustomer) {
        if (insErr?.code === "23505") {
            const { data: again } = await supabase
                .from("customer_persons")
                .select("customer_id")
                .eq("person_id", trimmed)
                .limit(1)
                .maybeSingle();
            if (again?.customer_id) {
                const customerId = (again as { customer_id: string }).customer_id;
                await ensureCustomerPersonsPrimaryLink(supabase, { customerId, personId: trimmed, orgId });
                return { customer_id: customerId };
            }
        }
        const msg = (insErr as { message?: string } | null)?.message ?? "unknown";
        throw new Error(`Customer insert failed: ${msg} (code: ${(insErr as { code?: string })?.code ?? "unknown"})`);
    }

    const customerId = (newCustomer as { id: string }).id;
    await ensureCustomerPersonsPrimaryLink(supabase, { customerId, personId: trimmed, orgId });
    return { customer_id: customerId };
}

/**
 * Resolve or create person (by id or email/phone), then ensure customer + customer_persons.
 * Used when confirm has no quote ids (email/phone path).
 */
export async function resolveOrCreatePersonCustomerForBooking(
    supabase: SupabaseClient,
    params: {
        org_id: string | null;
        vertical_id: string;
        booking_attempt_id?: string | null;
        person_id?: string | null;
        first_name?: string | null;
        last_name?: string | null;
        email: string;
        phone: string;
    }
): Promise<PersonCustomerBookingResult> {
    const orgId = params.org_id;
    if (!orgId?.trim()) {
        throw new Error("Missing org_id for booking resolution (ALLOY_PUBLIC_ORG_ID)");
    }

    const trimmedPerson = typeof params.person_id === "string" && params.person_id.trim() ? params.person_id.trim() : null;
    if (trimmedPerson) {
        const { customer_id } = await ensureCustomerForPersonNative(supabase, trimmedPerson, {
            vertical_id: params.vertical_id,
            org_id: orgId,
            first_name: params.first_name,
            last_name: params.last_name,
            email: params.email || null,
            phone: params.phone || null,
        });
        return { person_id: trimmedPerson, customer_id, resolution_path: "existing_person_id" };
    }

    const personId = await findOrCreatePersonInOrg(supabase, {
        email: params.email?.trim() || null,
        phone: params.phone?.trim() || null,
        first_name: params.first_name ?? null,
        last_name: params.last_name ?? null,
        org_id: orgId,
    });
    if (!personId) {
        throw new Error("Could not resolve or create person from email/phone");
    }

    const { customer_id } = await ensureCustomerForPersonNative(supabase, personId, {
        vertical_id: params.vertical_id,
        org_id: orgId,
        first_name: params.first_name,
        last_name: params.last_name,
        email: params.email || null,
        phone: params.phone || null,
    });

    return {
        person_id: personId,
        customer_id,
        resolution_path: "find_or_create_person",
    };
}
