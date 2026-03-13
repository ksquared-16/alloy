import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serverServiceClient";

type Supabase = ReturnType<typeof createServiceRoleClient>;

function compatContactInsertError(
    contactErr: unknown,
    payload: { org_id?: unknown; person_id?: unknown; customer_id?: unknown; first_name?: unknown; last_name?: unknown; email?: unknown; phone?: unknown; status?: unknown }
): Error {
    const e = contactErr as { message?: string; code?: string; details?: string; hint?: string } | null;
    const msg = e?.message ?? "unknown";
    const code = e?.code ?? "unknown";
    console.error("[BOOK_V2_ENSURE_CUSTOMER] Compatibility contact insert failed", {
        error_message: e?.message,
        error_code: e?.code,
        error_details: e?.details,
        error_hint: e?.hint,
        payload,
    });
    return new Error(`Compatibility contact insert failed: ${msg} (code: ${code})`);
}

/**
 * Ensure person has a customer and a compatibility contact (for payment/Stripe).
 * Returns contact_id and customer_id so the payment flow can use them for SetupIntent.
 * Pass A: call this when we have person_id but no contact_id/customer_id (e.g. before payment).
 */
async function ensureCustomerForPerson(
    supabase: Supabase,
    personId: string,
    params: { vertical_id: string; org_id: string | null }
): Promise<{ customerId: string; contactId: string | null }> {
    const { data: person } = await supabase
        .from("persons")
        .select("id, first_name, last_name, email, phone, org_id")
        .eq("id", personId)
        .single();
    if (!person) throw new Error("Person not found");
    const p = person as { first_name?: string | null; last_name?: string | null; email?: string | null; phone?: string | null; org_id?: string | null };
    const contactOrgId = p.org_id ?? params.org_id;
    if (!contactOrgId) throw new Error("Missing org_id for contact (person and env)");

    const { data: cp } = await supabase
        .from("customer_persons")
        .select("customer_id")
        .eq("person_id", personId)
        .limit(1)
        .maybeSingle();
    if (cp?.customer_id) {
        const customerId = (cp as { customer_id: string }).customer_id;
        const { data: cust } = await supabase.from("customers").select("primary_contact_id").eq("id", customerId).single();
        const primaryContactId = (cust as { primary_contact_id?: string | null } | null)?.primary_contact_id ?? null;
        if (primaryContactId) return { customerId, contactId: primaryContactId };
        // Customer exists but no contact: create compat contact and set as primary for payment/Stripe
        const contactInsert: Record<string, unknown> = {
            org_id: contactOrgId,
            first_name: p.first_name,
            last_name: p.last_name,
            email: p.email ?? null,
            phone: p.phone ?? null,
            person_id: personId,
            contact_type: "lead",
            status: "active",
        };
        const { data: newContact, error: contactErr } = await supabase
            .from("contacts")
            .insert(contactInsert)
            .select("id")
            .single();
        if (contactErr || !newContact) {
            throw compatContactInsertError(contactErr ?? null, {
                org_id: contactOrgId,
                person_id: personId,
                customer_id: customerId,
                first_name: p.first_name,
                last_name: p.last_name,
                email: p.email ?? null,
                phone: p.phone ?? null,
                status: "active",
            });
        }
        const contactId = (newContact as { id: string }).id;
        await supabase.from("contacts").update({ customer_id: customerId }).eq("id", contactId);
        await supabase.from("customers").update({ primary_contact_id: contactId }).eq("id", customerId);
        return { customerId, contactId };
    }

    const name = [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || p.email || p.phone || "New Customer";
    const contactInsert: Record<string, unknown> = {
        org_id: contactOrgId,
        first_name: p.first_name,
        last_name: p.last_name,
        email: p.email ?? null,
        phone: p.phone ?? null,
        person_id: personId,
        contact_type: "lead",
        status: "active",
    };
    const { data: newContact, error: contactErr } = await supabase
        .from("contacts")
        .insert(contactInsert)
        .select("id")
        .single();
    if (contactErr || !newContact) {
        throw compatContactInsertError(contactErr ?? null, {
            org_id: contactOrgId,
            person_id: personId,
            first_name: p.first_name,
            last_name: p.last_name,
            email: p.email ?? null,
            phone: p.phone ?? null,
            status: "active",
        });
    }
    const contactId = (newContact as { id: string }).id;

    const payload: Record<string, unknown> = {
        name,
        status: "active",
        vertical_id: params.vertical_id,
        primary_contact_id: contactId,
        metadata: { source: "book-v2-ensure-customer" },
    };
    payload.org_id = contactOrgId;

    const { data: newCustomer, error: insErr } = await supabase
        .from("customers")
        .insert(payload)
        .select("id")
        .single();
    if (insErr || !newCustomer) {
        if (insErr?.code === "23505") {
            const { data: existing } = await supabase.from("customers").select("id").eq("primary_contact_id", contactId).limit(1).maybeSingle();
            if (existing?.id) {
                await supabase.from("contacts").update({ customer_id: existing.id }).eq("id", contactId);
                const { data: existingCp } = await supabase.from("customer_persons").select("id").eq("customer_id", existing.id).eq("person_id", personId).maybeSingle();
                if (!existingCp) {
                    await supabase.from("customer_persons").insert({
                        customer_id: existing.id,
                        person_id: personId,
                        org_id: contactOrgId,
                    });
                }
                return { customerId: (existing as { id: string }).id, contactId };
            }
        }
        throw new Error(insErr?.message ?? "Failed to create customer");
    }
    const customerId = (newCustomer as { id: string }).id;
    await supabase.from("contacts").update({ customer_id: customerId }).eq("id", contactId);
    await supabase.from("customer_persons").insert({
        customer_id: customerId,
        person_id: personId,
        org_id: contactOrgId,
    });
    return { customerId, contactId };
}

/**
 * POST /api/book-v2/ensure-customer
 * Body: { person_id: string }
 * Returns: { ok: true, contact_id: string, customer_id: string } for payment/Stripe use.
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json().catch(() => ({}));
        const person_id = body.person_id;
        if (!person_id || typeof person_id !== "string" || !person_id.trim()) {
            return NextResponse.json({ ok: false, message: "person_id is required" }, { status: 400 });
        }
        const supabase = createServiceRoleClient();
        const vertical = await supabase.from("verticals").select("id").eq("slug", "cleaning").eq("is_active", true).limit(1).maybeSingle();
        const verticalId = vertical.data?.id ?? null;
        if (!verticalId) {
            return NextResponse.json({ ok: false, message: "Vertical not found" }, { status: 500 });
        }
        const orgId = process.env.ALLOY_PUBLIC_ORG_ID ?? null;
        const { customerId, contactId } = await ensureCustomerForPerson(supabase, person_id.trim(), { vertical_id: verticalId, org_id: orgId });
        return NextResponse.json({
            ok: true,
            contact_id: contactId,
            customer_id: customerId,
        });
    } catch (err) {
        console.error("[BOOK_V2_ENSURE_CUSTOMER]", err);
        return NextResponse.json(
            { ok: false, message: err instanceof Error ? err.message : "Ensure customer failed" },
            { status: 500 }
        );
    }
}
