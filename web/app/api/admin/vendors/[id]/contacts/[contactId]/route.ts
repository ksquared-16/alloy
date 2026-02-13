import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminAuth, requireAdminOrOps, logAdminAudit } from "@/lib/adminAuth";

/** DELETE: unlink a contact from this vendor (remove from vendor_contacts). */
export async function DELETE(
    request: NextRequest,
    context: { params: Promise<{ id: string; contactId: string }> }
) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const { id: vendorId, contactId } = await context.params;
    if (!vendorId || !contactId) return NextResponse.json({ error: "Missing vendor or contact id" }, { status: 400 });

    try {
        const auth = await getAdminAuth();
        if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const supabase = createAdminClient();
        const { error } = await supabase
            .from("vendor_contacts")
            .delete()
            .eq("vendor_id", vendorId)
            .eq("contact_id", contactId);

        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        logAdminAudit({
            entity: "vendor_contacts",
            id: `${vendorId}:${contactId}`,
            changed_fields: ["deleted"],
            actor_user_id: auth.user.id,
            role: auth.role,
        });
        return NextResponse.json({ ok: true });
    } catch (e: unknown) {
        console.error("[ADMIN_VENDOR_REMOVE_CONTACT]", e);
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
