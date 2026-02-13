import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { requireAdminOrOps } from "@/lib/adminAuth";

/** GET: contacts in the same org as this vendor that are not yet linked. Query: search (optional, matches email/name). */
export async function GET(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const { id: vendorId } = await context.params;
    if (!vendorId) return NextResponse.json({ error: "Missing vendor id" }, { status: 400 });

    try {
        const supabase = createAdminClient();
        const vendor = await supabase.from("vendors").select("org_id").eq("id", vendorId).single();
        if (vendor.error || !vendor.data?.org_id) {
            return NextResponse.json({ error: "Vendor or org not found" }, { status: 404 });
        }
        const orgId = (vendor.data as { org_id: string }).org_id;

        const { data: linked } = await supabase.from("vendor_contacts").select("contact_id").eq("vendor_id", vendorId);
        const linkedIds = (linked ?? []).map((r: { contact_id: string }) => r.contact_id);

        let query = supabase
            .from("contacts")
            .select("id, first_name, last_name, email, phone")
            .eq("org_id", orgId)
            .limit(50);
        if (linkedIds.length > 0) {
            query = query.not("id", "in", `("${linkedIds.join('","')}")`);
        }
        const search = request.nextUrl.searchParams.get("search")?.trim();
        if (search) {
            query = query.or(`email.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%`);
        }
        const { data, error } = await query.order("email");
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        return NextResponse.json({ contacts: data ?? [] });
    } catch (e: unknown) {
        console.error("[ADMIN_VENDOR_AVAILABLE_CONTACTS]", e);
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
