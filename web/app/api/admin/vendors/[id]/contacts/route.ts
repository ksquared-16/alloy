import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { assertRowOrg } from "@/lib/admin/assertRowOrg";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAuthCached, requireAdminOrOps, logAdminAudit } from "@/lib/adminAuth";

/** POST: link a contact to this vendor (add to vendor_contacts). Body: { contact_id, role? } */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    const { id: vendorId } = await context.params;
    if (!vendorId) return NextResponse.json({ error: "Missing vendor id" }, { status: 400 });

    try {
        const auth = await getAdminAuthCached();
        if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const body = await request.json();
        const contactId = body?.contact_id;
        if (!contactId || typeof contactId !== "string") {
            return NextResponse.json({ error: "contact_id required" }, { status: 400 });
        }
        const role = body?.role != null ? String(body.role) : null;

        const supabase = createAdminClient();
        if (!(await assertRowOrg(supabase, "vendors", vendorId, ctx.orgId)).ok) {
            return NextResponse.json({ error: "Not found" }, { status: 404 });
        }
        if (!(await assertRowOrg(supabase, "contacts", contactId, ctx.orgId)).ok) {
            return NextResponse.json({ error: "Contact not found" }, { status: 404 });
        }

        const { data, error } = await supabase
            .from("vendor_contacts")
            .upsert({ vendor_id: vendorId, contact_id: contactId, role }, { onConflict: "vendor_id,contact_id" })
            .select()
            .single();

        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        logAdminAudit({
            entity: "vendor_contacts",
            id: data.id,
            changed_fields: ["vendor_id", "contact_id", "role"],
            actor_user_id: auth.user.id,
            role: auth.role,
        });
        return NextResponse.json(data);
    } catch (e: unknown) {
        console.error("[ADMIN_VENDOR_ADD_CONTACT]", e);
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
