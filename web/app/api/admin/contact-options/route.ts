import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";

/** GET: list contacts for a customer (org-scoped). Query param customer_id required. Used for job primary contact dropdown. */
export async function GET(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json(
            { error: ctx.status === 401 ? "Unauthorized" : "Forbidden" },
            { status: ctx.status }
        );
    }

    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get("customer_id")?.trim() || null;
    if (!customerId) {
        return NextResponse.json({ error: "customer_id is required" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: rows, error } = await supabase
        .from("contacts")
/*
         * `person_id` travels with the contact because a contact is a ROLE a person holds on
         * an account, and the canonical identity other domains key on is the person. Financial
         * responsibility is recorded against `persons`, so a picker built from contacts alone
         * could name the right human and still be unable to say who they are.
         */
        .select("id, person_id, first_name, last_name, email, phone, company_name")
        .eq("org_id", ctx.orgId)
        .eq("customer_id", customerId)
        .order("last_name", { ascending: true, nullsFirst: false })
        .order("first_name", { ascending: true, nullsFirst: false });

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const contacts = (rows ?? []).map((r) => {
        const first = (r as { first_name?: string | null }).first_name ?? "";
        const last = (r as { last_name?: string | null }).last_name ?? "";
        const company = (r as { company_name?: string | null }).company_name ?? "";
        const email = (r as { email?: string | null }).email ?? "";
        const phone = (r as { phone?: string | null }).phone ?? "";
        const label = [first, last].filter(Boolean).join(" ") || company || email || phone || (r as { id: string }).id;
        return {
            id: (r as { id: string }).id,
            label: label.trim() || (r as { id: string }).id,
        };
    });

    return NextResponse.json({ contacts });
}
